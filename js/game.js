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

  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (BLOCKED_KEYS.has(e.code)) e.preventDefault();
      this.held.add(e.code);
      this.pressed.push(e.code);
      if (this.state === 'nameEntry') this.typed.push(e.key);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => {
      this.held.clear();
      if (this.state === 'race') this.setState('paused');
    });
  }

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

  isPressed(...codes) {
    return this.pressed.some((c) => codes.includes(c));
  }

  handleInput() {
    switch (this.state) {
      case 'title':
        if (this.isPressed(...ENTER)) this.setState('setup');
        break;

      case 'setup':
        if (this.isPressed('KeyA', 'KeyS')) this.changeOpponents(-1);
        if (this.isPressed('KeyD', 'KeyW')) this.changeOpponents(1);
        if (this.isPressed(...ENTER)) this.startRace();
        else if (this.isPressed('Escape')) this.setState('title');
        break;

      case 'race':
        if (this.isPressed('Escape')) this.setState('paused');
        if (this.isPressed('KeyR') && this.race.running && this.resetCooldown <= 0) {
          this.race.resetCar(this.race.player);
          this.resetCooldown = 1.5;
        }
        if (this.isPressed('Space')) this.race.useItem(this.race.player);
        break;

      case 'paused':
        if (this.isPressed('Escape', ...ENTER)) {
          this.state = 'race';
          this.held.clear();
        } else if (this.isPressed('KeyQ')) {
          this.startAttract();
          this.setState('title');
        }
        break;

      case 'finished':
        if (this.stateTime > 1.5 && this.isPressed(...ENTER)) this.setState('results');
        break;

      case 'results':
        if (this.isPressed(...ENTER) && this.stateTime < TALLY_TIME) {
          this.stateTime = TALLY_TIME; // skip the count-up
        } else if (this.stateTime > TALLY_TIME + 0.3 && this.isPressed(...ENTER)) {
          if (this.result.qualifies) {
            this.nameBuffer = (this.settings.lastName || '').slice(0, NAME_MAX);
            this.setState('nameEntry');
          } else {
            this.setState('scores');
          }
        }
        break;

      case 'nameEntry':
        for (const key of this.typed) {
          if (key === 'Backspace') this.nameBuffer = this.nameBuffer.slice(0, -1);
          else if (key.length === 1 && /[a-z0-9 ]/i.test(key) && this.nameBuffer.length < NAME_MAX) {
            if (key !== ' ' || this.nameBuffer.length) this.nameBuffer += key.toUpperCase();
          }
        }
        if (this.isPressed(...ENTER)) this.saveScore();
        break;

      case 'scores':
        if (this.isPressed(...ENTER)) this.startRace();
        else if (this.isPressed('Escape')) {
          this.startAttract();
          this.setState('title');
        }
        break;
    }
  }

  changeOpponents(delta) {
    this.opponents = clamp(this.opponents + delta, 1, MAX_OPPONENTS);
    this.settings.opponents = this.opponents;
    saveSettings(this.settings);
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
      } else if (e.type === 'powerup' && e.car.isPlayer && e.kind === 'swap') {
        this.shake = Math.max(this.shake, 3);
        this.showFlash('SWAP!', PAL.red, 1.2, 'UP TO ' + ordinal(e.car.position));
      } else if (e.type === 'slip' && e.car.isPlayer) {
        this.shake = Math.max(this.shake, 2);
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

  saveScore() {
    const name = this.nameBuffer.trim() || 'PLAYER';
    const r = this.result;
    const entry = { name, score: r.score, place: r.place, opponents: r.opponents, date: Date.now() };
    this.highlight = insertHighScore(this.scores, entry);
    saveHighScores(this.scores);
    this.settings.lastName = name;
    saveSettings(this.settings);
    this.setState('scores');
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

  // ---------- drawing ----------

  render() {
    const r = this.renderer;
    const sx = this.shake ? (Math.random() - 0.5) * 2 * this.shake : 0;
    const sy = this.shake ? (Math.random() - 0.5) * 2 * this.shake : 0;
    r.drawWorld(this.race, clamp(this.cam.x + sx, 0, this.track.worldW - VIEW_W), clamp(this.cam.y + sy, 0, this.track.worldH - VIEW_H));
    switch (this.state) {
      case 'title': r.dim(); this.drawTitle(); break;
      case 'setup': r.dim(); this.drawSetup(); break;
      case 'race': this.drawRaceOverlay(); break;
      case 'paused': this.drawRaceOverlay(); r.dim(); this.drawPaused(); break;
      case 'finished': r.drawHUD(this.race, this.now); this.drawFinished(); break;
      case 'results': r.dim(); this.drawResults(); break;
      case 'nameEntry': r.dim(); this.drawNameEntry(); break;
      case 'scores': r.dim(); this.drawScores(); break;
    }
  }

  blink(rate = 2) {
    return Math.floor(this.now * rate * 2) % 2 === 0;
  }

  drawChecker(x, y, w, size = 4, rows = 2) {
    const ctx = this.ctx;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c * size < w; c++) {
        ctx.fillStyle = (r + c) % 2 ? PAL.black : PAL.white;
        ctx.fillRect(x + c * size, y + r * size, Math.min(size, w - c * size), size);
      }
    }
  }

  drawLogo(y) {
    const ctx = this.ctx, cx = VIEW_W / 2;
    drawText(ctx, 'TURBO', cx + 4, y + 4, PAL.purpleDeep, 6, 'center');
    drawText(ctx, 'TURBO', cx + 2, y + 2, PAL.purple, 6, 'center');
    drawText(ctx, 'TURBO', cx, y, PAL.orange, 6, 'center');
    drawText(ctx, 'PIXEL GP', cx, y + 48, PAL.lime, 3, 'center', PAL.black);
    this.drawChecker(cx - 100, y + 74, 200);
  }

  drawTitle() {
    const ctx = this.ctx;
    this.drawLogo(12);
    if (this.blink()) drawText(ctx, 'PRESS ENTER TO START', VIEW_W / 2, 98, PAL.white, 1, 'center', PAL.black);
    this.drawScoreTable(100, 112, 280, -1);
    drawText(ctx, 'GRAB POWERUPS  BUMP RIVALS  HIT BOOSTS  DODGE BANANAS', VIEW_W / 2, VIEW_H - 24, PAL.lime, 1, 'center', PAL.black);
    drawText(ctx, 'W GAS  S BRAKE  A/D STEER  SPACE ITEM  R RESET  ESC PAUSE', VIEW_W / 2, VIEW_H - 12, PAL.purpleLight, 1, 'center', PAL.black);
  }

  drawScoreTable(x, y, w, highlight) {
    const ctx = this.ctx;
    const h = 22 + SCORE_LIMIT * 10;
    drawPanel(ctx, x, y, w, h);
    drawText(ctx, 'HIGH SCORES', x + w / 2, y + 4, PAL.orange, 1, 'center');
    const cols = [x + 6, x + 26, x + 100, x + 170];
    ['#', 'NAME', 'SCORE', 'PLACE'].forEach((t, k) => drawText(ctx, t, cols[k], y + 14, PAL.lime));
    if (!this.scores.length) {
      drawText(ctx, 'NO RECORDS YET - SET THE FIRST!', x + w / 2, y + 60, PAL.white, 1, 'center');
      return;
    }
    this.scores.forEach((s, k) => {
      const ry = y + 24 + k * 10;
      const hl = k === highlight;
      if (hl) {
        ctx.fillStyle = this.blink(3) ? PAL.purple : PAL.purpleDark;
        ctx.fillRect(x + 2, ry - 2, w - 4, 10);
      }
      const color = hl ? PAL.orange : k === 0 ? PAL.yellow : PAL.white;
      drawText(ctx, String(k + 1), cols[0], ry, color);
      drawText(ctx, s.name, cols[1], ry, color);
      drawText(ctx, String(s.score), cols[2], ry, color);
      drawText(ctx, ordinal(s.place || 1) + ' OF ' + ((s.opponents || 0) + 1), cols[3], ry, color);
    });
  }

  drawSetup() {
    const ctx = this.ctx, cx = VIEW_W / 2;
    const x = 80, y = 30, w = 320, h = 210;
    drawPanel(ctx, x, y, w, h);
    drawText(ctx, 'RACE SETUP', cx, y + 10, PAL.orange, 2, 'center', PAL.black);
    this.drawChecker(x + 10, y + 30, w - 20, 3, 1);

    drawText(ctx, 'OPPONENTS', cx, y + 42, PAL.lime, 1, 'center');
    const num = String(this.opponents).padStart(2, '0');
    drawText(ctx, num, cx, y + 56, PAL.orange, 4, 'center', PAL.black);
    const arrowColor = this.blink(1) ? PAL.white : PAL.purpleLight;
    if (this.opponents > 1) drawText(ctx, '<', cx - 50, y + 60, arrowColor, 3, 'center');
    if (this.opponents < MAX_OPPONENTS) drawText(ctx, '>', cx + 50, y + 60, arrowColor, 3, 'center');
    drawText(ctx, 'LAPS: ' + RACE_LAPS + '    MORE RIVALS = MORE POINTS', cx, y + 94, PAL.white, 1, 'center');

    // Grid preview: the player's car plus one icon per opponent.
    const icons = [PLAYER_LIVERY, ...AI_LIVERIES.slice(0, this.opponents)];
    const perRow = 11, gap = 24;
    icons.forEach((liv, k) => {
      const row = Math.floor(k / perRow), col = k % perRow;
      const count = Math.min(perRow, icons.length - row * perRow);
      const ix = cx - ((count - 1) * gap) / 2 + col * gap;
      this.renderer.drawCarIcon(liv[0], liv[1], ix, y + 122 + row * 26, -Math.PI / 2);
    });

    drawText(ctx, 'A/D CHANGE    ENTER START    ESC BACK', cx, y + h - 14, PAL.purpleLight, 1, 'center');
  }

  drawRaceOverlay() {
    const race = this.race, ctx = this.ctx;
    this.renderer.drawHUD(race, this.now);
    if (!race.running || race.time < 1) this.renderer.drawCountdown(race);
    if (this.flash && race.time < this.flash.until) {
      drawText(ctx, this.flash.text, VIEW_W / 2, 92, this.flash.color, 3, 'center', PAL.black);
      if (this.flash.sub) drawText(ctx, this.flash.sub, VIEW_W / 2, 118, PAL.white, 1, 'center', PAL.black);
    }
    if (this.state === 'race' && race.player.lostTimer > 1.2) {
      drawText(ctx, 'R TO RESET', VIEW_W / 2, 92, PAL.white, 1, 'center', PAL.black);
    }
  }

  drawPaused() {
    const ctx = this.ctx, cx = VIEW_W / 2;
    drawPanel(ctx, cx - 90, 90, 180, 80);
    drawText(ctx, 'PAUSED', cx, 102, PAL.orange, 3, 'center', PAL.black);
    drawText(ctx, 'ESC / ENTER  RESUME', cx, 136, PAL.white, 1, 'center');
    drawText(ctx, 'Q  QUIT TO MENU', cx, 150, PAL.lime, 1, 'center');
  }

  drawFinished() {
    const ctx = this.ctx, cx = VIEW_W / 2, r = this.result;
    const [headline, color] = r.place === 1 ? ['YOU WIN!', PAL.yellow] : r.place <= 3 ? ['PODIUM!', PAL.lime] : ['NICE DRIVING!', PAL.orange];
    drawPanel(ctx, cx - 130, 70, 260, 104, PAL.purpleDeep);
    this.drawChecker(cx - 126, 74, 252, 4, 2);
    drawText(ctx, headline, cx, 88, color, headline.length > 8 ? 3 : 4, 'center', PAL.black);
    drawText(ctx, ordinal(r.place) + ' OF ' + (r.opponents + 1), cx, 124, PAL.white, 2, 'center', PAL.black);
    drawText(ctx, 'SCORE ' + r.score + '   TIME ' + formatTime(r.time), cx, 144, PAL.orange, 1, 'center');
    this.drawChecker(cx - 126, 162, 252, 4, 2);
    if (this.stateTime > 1.5 && this.blink()) drawText(ctx, 'PRESS ENTER', cx, 182, PAL.white, 1, 'center', PAL.black);
  }

  // Standings on the left, the player's score counting up line by line on the right.
  drawResults() {
    const ctx = this.ctx, race = this.race, r = this.result;
    const rows = race.standings;
    const rh = rows.length > 12 ? 9 : 11;
    const h = Math.max(150, 30 + rows.length * rh + 6);
    const y = Math.max(4, Math.round((VIEW_H - h) / 2));
    const x = 16, w = 180;
    drawPanel(ctx, x, y, w, h);
    drawText(ctx, 'STANDINGS', x + w / 2, y + 6, PAL.orange, 1, 'center');
    rows.forEach((car, k) => {
      const ry = y + 22 + k * rh;
      const color = car.isPlayer ? PAL.orange : PAL.white;
      if (car.isPlayer) {
        ctx.fillStyle = PAL.purple;
        ctx.fillRect(x + 2, ry - 1, w - 4, rh);
      }
      drawText(ctx, ordinal(car.position), x + 6, ry, color);
      ctx.fillStyle = PAL.black;
      ctx.fillRect(x + 36, ry, 7, 7);
      ctx.fillStyle = car.body;
      ctx.fillRect(x + 37, ry + 1, 5, 5);
      drawText(ctx, car.name, x + 48, ry, color);
      const t = car.finished ? formatTime(car.finishTime) : 'LAP ' + Math.min(RACE_LAPS, car.lapsCompleted + 1);
      drawText(ctx, t, x + w - 6, ry, car.finished ? color : PAL.purpleLight, 1, 'right');
    });

    const tx = 210, tw = 254, ty = Math.round((VIEW_H - 196) / 2);
    drawPanel(ctx, tx, ty, tw, 196);
    drawText(ctx, 'YOUR SCORE', tx + tw / 2, ty + 8, PAL.orange, 2, 'center', PAL.black);
    const b = r.breakdown;
    const lines = [
      ['BUMPS', b.bumps],
      ['COINS + STUFF', b.pickups],
      [ordinal(r.place) + ' PLACE', b.place],
      ['BEAT ' + (r.opponents + 1 - r.place) + ' RIVALS', b.field],
      ['TIME BONUS', b.time],
    ];
    const t = this.stateTime;
    const count = (value, start) => Math.round(value * clamp((t - start) / TALLY_STEP, 0, 1));
    lines.forEach(([label, value], k) => {
      const start = TALLY_STEP * (k + 1);
      if (t < start) return;
      const ly = ty + 36 + k * 16;
      drawText(ctx, label, tx + 12, ly, PAL.lime);
      drawText(ctx, String(count(value, start)), tx + tw - 12, ly, PAL.white, 1, 'right');
    });
    const totalStart = TALLY_STEP * (lines.length + 1);
    if (t >= totalStart) {
      ctx.fillStyle = PAL.purple;
      ctx.fillRect(tx + 10, ty + 120, tw - 20, 1);
      drawText(ctx, 'TOTAL', tx + 12, ty + 130, PAL.orange, 2);
      drawText(ctx, String(count(r.score, totalStart)), tx + tw - 12, ty + 130, PAL.yellow, 2, 'right', PAL.black);
    }
    if (t >= TALLY_TIME) {
      if (r.qualifies && this.blink()) drawText(ctx, 'NEW HIGH SCORE!', tx + tw / 2, ty + 158, PAL.lime, 1, 'center');
      drawText(ctx, 'ENTER CONTINUE', tx + tw / 2, ty + 178, PAL.white, 1, 'center');
    }
  }

  drawNameEntry() {
    const ctx = this.ctx, cx = VIEW_W / 2, r = this.result;
    drawPanel(ctx, 70, 40, 340, 180);
    drawText(ctx, 'NEW HIGH SCORE!', cx, 52, PAL.orange, 2, 'center', PAL.black);
    const rank = this.scores.filter((s) => s.score >= r.score).length + 1;
    drawText(ctx, 'RANK #' + rank + '    SCORE ' + r.score + '    ' + ordinal(r.place) + ' PLACE', cx, 76, PAL.white, 1, 'center');
    drawText(ctx, 'ENTER YOUR NAME', cx, 100, PAL.lime, 1, 'center');

    const boxW = 24, total = NAME_MAX * boxW, bx = cx - total / 2;
    for (let k = 0; k < NAME_MAX; k++) {
      const x = bx + k * boxW;
      ctx.fillStyle = PAL.purpleDeep;
      ctx.fillRect(x + 2, 114, boxW - 4, 30);
      const ch = this.nameBuffer[k];
      if (ch) drawText(ctx, ch, x + boxW / 2, 120, PAL.orange, 3, 'center');
      if (k === this.nameBuffer.length && this.blink(2)) {
        ctx.fillStyle = PAL.lime;
        ctx.fillRect(x + 4, 146, boxW - 8, 3);
      }
    }
    drawText(ctx, 'TYPE A-Z 0-9    BACKSPACE DELETE    ENTER SAVE', cx, 196, PAL.purpleLight, 1, 'center');
  }

  drawScores() {
    const ctx = this.ctx, cx = VIEW_W / 2;
    drawText(ctx, 'HALL OF FAME', cx, 20, PAL.orange, 3, 'center', PAL.black);
    this.drawScoreTable(100, 56, 280, this.highlight);
    if (this.result && !this.result.qualifies) {
      drawText(ctx, 'YOU SCORED ' + this.result.score + ' - SO CLOSE! ONE MORE GO?', cx, 192, PAL.white, 1, 'center', PAL.black);
    }
    drawText(ctx, 'ENTER RACE AGAIN    ESC MENU', cx, VIEW_H - 24, PAL.white, 1, 'center', PAL.black);
  }
}

window.addEventListener('load', () => {
  window.game = new Game(document.getElementById('screen'));
});
