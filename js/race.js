'use strict';

const RACE_LAPS = 3;
const COUNTDOWN_TIME = 3;
const MAX_OPPONENTS = 20;
const DEFAULT_OPPONENTS = 4;

const AI_NAMES = [
  'ACE', 'BOLT', 'ZIP', 'NOVA', 'DASH', 'FLUX', 'VIPER', 'BLITZ', 'TURBO', 'NEON',
  'RAZOR', 'COMET', 'GHOST', 'JINX', 'ROCKET', 'SURGE', 'ORBIT', 'STORM', 'BYTE', 'VOLT',
];

// Body / stripe pairs. Orange is reserved for the player's car.
const AI_LIVERIES = [
  [PAL.purple, PAL.lime], [PAL.lime, PAL.purple], ['#2ec4b6', PAL.white], [PAL.red, PAL.white],
  ['#5fa8ff', PAL.orange], ['#ff6fb5', PAL.purple], [PAL.yellow, PAL.black], [PAL.white, PAL.purple],
  ['#3a4cc0', PAL.lime], ['#2fa84f', PAL.white], ['#b3007a', PAL.orange], [PAL.purpleLight, PAL.white],
  ['#8a5a2b', PAL.orange], ['#8a8aa0', PAL.red], ['#2b2b3b', PAL.lime], ['#7ee0a8', PAL.purple],
  ['#ff8a65', PAL.white], ['#3fd0e0', PAL.black], ['#6b7d1a', PAL.yellow], ['#a01830', PAL.yellow],
];
const PLAYER_LIVERY = [PAL.orange, PAL.purple];
const PLAYER_MAX_SLOT = 7;

class Race {
  constructor(track, { opponents, withPlayer = true, seed = Date.now() }) {
    this.track = track;
    this.rng = makeRng(seed);
    this.cars = [];
    this.player = null;
    this.time = 0;
    this.countdown = COUNTDOWN_TIME;
    this.running = false;
    this.finishCount = 0;
    this.particles = [];
    this.skids = [];
    this.events = [];
    this.popups = [];
    this.obstacles = new Obstacles(track);
    this.pickups = [];   // powerups waiting on the track (powerups.js)
    this.bananas = [];   // dropped bananas (banana.js)
    this.score = { bumps: 0, pickups: 0, place: 0, field: 0, time: 0 };
    this.combo = 0;
    this.comboTimer = 0;
    this.bumpCooldown = 0;

    const order = AI_NAMES.map((_, i) => i).sort(() => this.rng() - 0.5).slice(0, opponents);
    // The player starts at the back of a small field, but never further back than the fourth row.
    const playerSlot = withPlayer ? Math.min(opponents, PLAYER_MAX_SLOT) : -1;
    order.forEach((li, k) => {
      const slot = k >= playerSlot && playerSlot >= 0 ? k + 1 : k;
      const car = new Car({ name: AI_NAMES[li], body: AI_LIVERIES[li][0], stripe: AI_LIVERIES[li][1] });
      // One difficulty: a little slower than the player, so a clean run always gets through.
      car.ai = new AIDriver(car, track, this.rng, { speedFactor: 0.88 + this.rng() * 0.06 });
      this.addAtSlot(car, slot);
    });
    if (withPlayer) {
      this.player = new Car({ name: 'YOU', body: PLAYER_LIVERY[0], stripe: PLAYER_LIVERY[1], isPlayer: true });
      this.addAtSlot(this.player, playerSlot);
    }
    this.updatePositions();
    maintainPickupCount(this);
  }

  addAtSlot(car, slot) {
    const pose = this.track.gridPose(slot);
    car.place(pose.x, pose.y, pose.angle);
    car.idx = pose.idx;
    car.totalDist = pose.idx * this.track.spacing - this.track.length;
    this.cars.push(car);
  }

  get allFinished() {
    return this.cars.every((c) => c.finished);
  }

  get scoreTotal() {
    const s = this.score;
    return s.bumps + s.pickups + s.place + s.field + s.time;
  }

  get parTime() {
    return (RACE_LAPS * this.track.length / CAR_SPEED) * PAR_SLACK;
  }

  update(dt) {
    if (!this.running) {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.running = true;
        this.events.push({ type: 'go' });
      }
      this.updateParticles(dt);
      return;
    }
    this.time += dt;
    const track = this.track;
    this.comboTimer -= dt;
    this.bumpCooldown -= dt;
    this.obstacles.update(dt);
    updateBananas(this, dt);

    for (const car of this.cars) {
      if (car.ai) car.ai.update(dt, this);
    }
    for (const car of this.cars) {
      car.surface = track.surfaceAt(car.x, car.y, car.idx);
      car.update(dt);
      if (car === this.player && !car.ai) this.assistToRoad(car, dt);
    }
    resolveCarCollisions(this.cars, (hit) => {
      this.sparks(hit.x, hit.y, hit.impact);
      this.scoreBump(hit);
    });
    for (const car of this.cars) {
      for (const hit of this.obstacles.collide(car)) this.onObstacleHit(car, hit);
      collideScenery(car, track);
      collectPickups(this, car);
      hitBananas(this, car);
      this.updateProgress(car, dt);
      this.emitEffects(car);
    }
    this.updatePositions();
    this.updateParticles(dt);
  }

  get playerScoring() {
    return this.player && !this.player.finished;
  }
}

Object.assign(Race.prototype, RACE_PROGRESS_METHODS, RACE_SCORING_METHODS, RACE_EFFECTS_METHODS);
