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

    const order = AI_NAMES.map((_, i) => i).sort(() => this.rng() - 0.5).slice(0, opponents);
    order.forEach((li, slot) => {
      const car = new Car({ name: AI_NAMES[li], body: AI_LIVERIES[li][0], stripe: AI_LIVERIES[li][1] });
      // One difficulty: every AI is quick, with only small personal variation.
      car.ai = new AIDriver(car, track, this.rng, {
        speedFactor: 0.97 + this.rng() * 0.03,
        cornerFactor: 0.95 + this.rng() * 0.05,
      });
      this.addAtSlot(car, slot);
    });
    if (withPlayer) {
      this.player = new Car({ name: 'YOU', body: PLAYER_LIVERY[0], stripe: PLAYER_LIVERY[1], isPlayer: true });
      this.addAtSlot(this.player, opponents); // player starts at the back of the grid
    }
    this.updatePositions();
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

    for (const car of this.cars) {
      if (car.ai) car.ai.update(dt, this);
    }
    for (const car of this.cars) {
      car.surface = track.surfaceAt(car.x, car.y);
      car.update(dt);
    }
    resolveCarCollisions(this.cars, (hit) => {
      const n = Math.min(10, 2 + Math.floor(hit.impact / 25));
      for (let i = 0; i < n; i++) {
        const a = this.rng() * TAU, s = 30 + this.rng() * hit.impact;
        const color = [PAL.orange, PAL.yellow, PAL.white][Math.floor(this.rng() * 3)];
        this.particles.push({ x: hit.x, y: hit.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + this.rng() * 0.3, color });
      }
    });
    for (const car of this.cars) {
      collideScenery(car, track);
      this.updateProgress(car, dt);
      this.emitEffects(car);
    }
    this.updatePositions();
    this.updateParticles(dt);
  }

  updateProgress(car, dt) {
    const track = this.track;
    // Local search only: progress can't jump to another part of the circuit, so cutting doesn't pay.
    const i = track.nearestLocal(car.x, car.y, car.idx, 15, 20);
    const lat = track.lateral(car.x, car.y, i);
    if (Math.abs(lat) < TRACK_HALF_WIDTH + 90) {
      let ds = i - car.idx;
      if (ds > track.n / 2) ds -= track.n;
      if (ds < -track.n / 2) ds += track.n;
      car.totalDist += ds * track.spacing;
      car.idx = i;
      car.lostTimer = 0;
    } else {
      car.lostTimer += dt;
      if (car.lostTimer > 3) this.resetCar(car);
    }

    const done = Math.floor(car.totalDist / track.length);
    while (done > car.lapsCompleted) {
      car.lapsCompleted++;
      car.lapTimes.push(this.time - car.lapStart);
      car.lapStart = this.time;
      if (car.lapsCompleted >= RACE_LAPS && !car.finished) {
        car.finished = true;
        car.finishTime = this.time;
        car.finishOrder = ++this.finishCount;
        this.events.push({ type: 'finish', car });
      } else if (car.isPlayer) {
        this.events.push({ type: 'lap', car });
      }
    }

    if (car.isPlayer) {
      const dot = Math.cos(car.angle) * track.tx[car.idx] + Math.sin(car.angle) * track.ty[car.idx];
      if (dot < -0.3 && car.forwardSpeed > 20) car.wrongWayTimer += dt;
      else car.wrongWayTimer = 0;
    }
  }

  // Put a car back on the centerline at its last valid progress point.
  resetCar(car) {
    const t = this.track, i = car.idx;
    car.place(t.x[i], t.y[i], Math.atan2(t.ty[i], t.tx[i]));
    car.lostTimer = 0;
    if (car.ai) car.ai.reverseTimer = 0;
  }

  updatePositions() {
    const sorted = this.cars.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishOrder - b.finishOrder;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.totalDist - a.totalDist;
    });
    sorted.forEach((c, i) => { c.position = i + 1; });
    this.standings = sorted;
  }

  emitEffects(car) {
    if (car.skidding) {
      const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
      const rx = -fy, ry = fx;
      this.skids.push(
        { x: car.x - fx * 4 + rx * 3, y: car.y - fy * 4 + ry * 3 },
        { x: car.x - fx * 4 - rx * 3, y: car.y - fy * 4 - ry * 3 }
      );
      if (this.skids.length > 4000) this.skids.splice(0, this.skids.length - 4000);
    }
    if (car.surface === 'grass' && car.speed > 60 && this.rng() < 0.35) {
      this.particles.push({
        x: car.x - Math.cos(car.angle) * 6, y: car.y - Math.sin(car.angle) * 6,
        vx: (this.rng() - 0.5) * 30, vy: (this.rng() - 0.5) * 30,
        life: 0.4 + this.rng() * 0.3, color: this.rng() < 0.5 ? PAL.limeDeep : PAL.brown,
      });
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-4 * dt);
      p.vy *= Math.exp(-4 * dt);
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }
}
