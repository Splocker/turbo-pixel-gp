'use strict';

const STEP = 1 / 60;
const ATTRACT_OPPONENTS = 7;
const ENTER = ['Enter', 'NumpadEnter'];
const TALLY_STEP = 0.3;   // results screen: one score line every TALLY_STEP seconds
const TALLY_TIME = 2.2;   // when the whole tally, including the total, has counted up
const BLOCKED_KEYS = new Set(['Space', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.track = new Track();
    this.renderer = new Renderer(this.ctx, this.track);
    this.scores = loadHighScores();
    this.settings = loadSettings();
    this.opponents = clamp(Math.round(this.settings.opponents) || DEFAULT_OPPONENTS, 1, MAX_OPPONENTS);

    this.held = new Set();
    this.pressed = [];
    this.typed = [];
    this.cam = { x: 0, y: 0 };
    this.acc = 0;
    this.last = null;
    this.now = 0;
    this.stateTime = 0;
    this.flash = null;
    this.result = null;
    this.highlight = -1;
    this.nameBuffer = '';
    this.resetCooldown = 0;
    this.shake = 0;

    this.bindInput();
    this.fit();
    window.addEventListener('resize', () => this.fit());
    this.startAttract();
    this.setState('title');
    requestAnimationFrame((ts) => this.loop(ts));
  }

  // ---------- setup ----------

  fit() {
    const s = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
    const scale = s >= 2 ? Math.floor(s) : s;
    this.canvas.style.width = Math.floor(VIEW_W * scale) + 'px';
    this.canvas.style.height = Math.floor(VIEW_H * scale) + 'px';
  }

  setState(state) {
    this.state = state;
    this.stateTime = 0;
  }

  startAttract() {
    this.race = new Race(this.track, { opponents: ATTRACT_OPPONENTS, withPlayer: false });
    this.race.countdown = 0;
    this.renderer.resetWorld();
    this.updateCamera(0, true);
  }

  startRace() {
    this.race = new Race(this.track, { opponents: this.opponents, withPlayer: true });
    this.renderer.resetWorld();
    this.result = null;
    this.flash = null;
    this.highlight = -1;
    this.updateCamera(0, true);
    this.setState('race');
  }

  // ---------- main loop ----------

  loop(ts) {
    const now = ts / 1000;
    const dt = Math.min(0.1, this.last === null ? 0 : now - this.last);
    this.last = now;
    this.now = now;

    this.handleInput();
    this.stateTime += dt;
    if (this.state !== 'paused') {
      this.acc += dt;
      while (this.acc >= STEP) {
        this.step(STEP);
        this.acc -= STEP;
      }
    }
    this.updateCamera(dt, false);
    this.shake = Math.max(0, this.shake - dt * 14);
    this.render();

    this.pressed.length = 0;
    this.typed.length = 0;
    requestAnimationFrame((t) => this.loop(t));
  }

  step(dt) {
    const race = this.race;
    if (this.state === 'title' || this.state === 'setup') {
      race.update(dt);
      race.events.length = 0;
      if (race.allFinished || race.time > 120) this.startAttract();
      return;
    }

    this.applyPlayerInput(dt);
    race.update(dt);
    this.resetCooldown -= dt;
    for (const e of race.events) {
      if (e.type === 'lap' && e.car.isPlayer) {
        const final = e.car.lapsCompleted === RACE_LAPS - 1;
        this.showFlash(final ? 'FINAL LAP!' : 'LAP ' + (e.car.lapsCompleted + 1), final ? PAL.orange : PAL.lime, 1.8,
          'LAST ' + formatTime(e.car.lapTimes[e.car.lapTimes.length - 1]));
      } else if (e.type === 'finish' && e.car.isPlayer) {
        this.onPlayerFinish(e.car);
      } else if (e.type === 'bump') {
        this.shake = Math.max(this.shake, e.big ? 4 : 2);
      } else if (e.type === 'swap' && (e.car.isPlayer || e.leader.isPlayer)) {
        const mine = e.car.isPlayer;
        this.showFlash(mine ? 'SWAP!' : 'SWAPPED!', PAL.cyan, 1.4, mine ? 'INTO THE LEAD' : e.car.name + ' TOOK YOUR PLACE');
      } else if (e.type === 'bananaHit' && e.car.isPlayer) {
        this.shake = Math.max(this.shake, 3);
      }
    }
    race.events.length = 0;

    if (this.state === 'finished' && this.stateTime > 6) this.setState('results');
  }

  applyPlayerInput(dt) {
    const p = this.race.player;
    if (!p || p.ai) return;
    const k = this.held;
    const racing = this.state === 'race';
    p.input.throttle = racing && k.has('KeyW') ? 1 : 0;
    p.input.brake = racing && k.has('KeyS') ? 1 : 0;
    const target = racing ? (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) : 0;
    const rate = (target === 0 ? 10 : 7) * dt;
    p.input.steer += clamp(target - p.input.steer, -rate, rate);
  }

  onPlayerFinish(player) {
    // The car keeps lapping on autopilot behind the result screens.
    player.ai = new AIDriver(player, this.track, Math.random, { speedFactor: 0.85 });
    this.result = {
      score: this.race.scoreTotal,
      breakdown: { ...this.race.score },
      time: player.finishTime,
      place: player.finishOrder,
      opponents: this.race.cars.length - 1,
    };
    this.result.qualifies = scoreQualifies(this.scores, this.result.score);
    this.shake = 0;
    this.flash = null;
    this.setState('finished');
  }

  showFlash(text, color, duration, sub = '') {
    this.flash = { text, color, sub, until: this.race.time + duration };
  }

  updateCamera(dt, snap) {
    const race = this.race;
    const target = race.player || race.standings[0];
    const tx = target.x + target.vx * 0.35 - VIEW_W / 2;
    const ty = target.y + target.vy * 0.35 - VIEW_H / 2;
    if (snap) {
      this.cam.x = tx;
      this.cam.y = ty;
    } else {
      const k = Math.min(1, 5 * dt);
      this.cam.x += (tx - this.cam.x) * k;
      this.cam.y += (ty - this.cam.y) * k;
    }
    this.cam.x = clamp(this.cam.x, 0, this.track.worldW - VIEW_W);
    this.cam.y = clamp(this.cam.y, 0, this.track.worldH - VIEW_H);
  }
}

Object.assign(Game.prototype, GAME_INPUT_METHODS, GAME_SCREEN_METHODS, GAME_OVERLAY_METHODS);

window.addEventListener('load', () => {
  window.game = new Game(document.getElementById('screen'));
});