'use strict';

const RACE_LAPS = 3;
const COUNTDOWN_TIME = 3;
const MAX_OPPONENTS = 20;
const DEFAULT_OPPONENTS = 4;

// Arcade scoring. Every race pays out something; bumping and grabbing stuff pays the most.
const POINTS = { bump: 25, bigBump: 75, coin: 10, boost: 5, cone: 5, bumper: 10 };
const BIG_BUMP_IMPACT = 90;
const MIN_BUMP_IMPACT = 20;
const COMBO_WINDOW = 2;
const COMBO_MAX = 3;
const PLACE_BONUS = [1000, 700, 500, 350, 200];
const PLACE_BONUS_MIN = 100;
const FIELD_BONUS = 40;       // per car beaten
const TIME_BONUS = 50;        // per second under par
const PAR_SLACK = 1.5;        // par is a flat-out race time plus this margin

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

    for (const car of this.cars) {
      if (car.ai) car.ai.update(dt, this);
    }
    for (const car of this.cars) car.update(dt);
    resolveCarCollisions(this.cars, (hit) => {
      this.sparks(hit.x, hit.y, hit.impact);
      this.scoreBump(hit);
    });
    for (const car of this.cars) {
      for (const hit of this.obstacles.collide(car)) this.onObstacleHit(car, hit);
      if (bounceOffWalls(car, track, 4) > 60) this.sparks(car.x, car.y, 40);
      this.updateProgress(car, dt);
      this.emitEffects(car);
    }
    this.updatePositions();
    this.updateParticles(dt);
  }

  // ---------- scoring ----------

  get playerScoring() {
    return this.player && !this.player.finished;
  }

  addPoints(kind, pts, x, y, color = PAL.yellow) {
    this.score[kind] += pts;
    this.popups.push({ x, y, text: '+' + pts, color, life: 0.9 });
  }

  scoreBump(hit) {
    const p = this.player;
    if (!this.playerScoring || (hit.a !== p && hit.b !== p)) return;
    if (hit.impact < MIN_BUMP_IMPACT || this.bumpCooldown > 0) return;
    this.bumpCooldown = 0.3;
    this.combo = this.comboTimer > 0 ? Math.min(COMBO_MAX, this.combo + 1) : 1;
    this.comboTimer = COMBO_WINDOW;
    const big = hit.impact >= BIG_BUMP_IMPACT;
    this.addPoints('bumps', (big ? POINTS.bigBump : POINTS.bump) * this.combo, hit.x, hit.y - 6, big ? PAL.orange : PAL.yellow);
    if (this.combo > 1) this.popups.push({ x: hit.x, y: hit.y - 16, text: 'COMBO X' + this.combo + '!', color: PAL.lime, life: 1.1 });
    this.events.push({ type: 'bump', big });
  }

  onObstacleHit(car, hit) {
    if (hit.type === 'bumper') this.sparks(hit.x, hit.y, 80, [PAL.lime, PAL.purpleLight, PAL.white]);
    if (hit.type === 'cone') this.sparks(hit.x, hit.y, 40, [PAL.orange, PAL.white]);
    if (hit.type === 'coin') this.sparks(hit.x, hit.y, 50, [PAL.yellow, PAL.white]);
    if (car !== this.player || !this.playerScoring || !POINTS[hit.type]) return;
    const color = hit.type === 'coin' ? PAL.yellow : hit.type === 'boost' ? PAL.orange : PAL.lime;
    this.addPoints('pickups', POINTS[hit.type], hit.x, hit.y - 6, color);
  }

  awardFinish(car) {
    const place = car.finishOrder;
    this.score.place = PLACE_BONUS[place - 1] || PLACE_BONUS_MIN;
    this.score.field = (this.cars.length - place) * FIELD_BONUS;
    this.score.time = Math.max(0, Math.round((this.parTime - car.finishTime) * TIME_BONUS));
    this.confetti(car.x, car.y);
  }

  sparks(x, y, impact, colors = [PAL.orange, PAL.yellow, PAL.white]) {
    const n = Math.min(10, 2 + Math.floor(impact / 25));
    for (let i = 0; i < n; i++) {
      const a = this.rng() * TAU, s = 30 + this.rng() * impact;
      const color = colors[Math.floor(this.rng() * colors.length)];
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + this.rng() * 0.3, color });
    }
  }

  confetti(x, y) {
    const colors = [PAL.orange, PAL.lime, PAL.purpleLight, PAL.yellow, PAL.white, PAL.cyan];
    for (let i = 0; i < 70; i++) {
      const a = this.rng() * TAU, s = 60 + this.rng() * 160;
      const color = colors[Math.floor(this.rng() * colors.length)];
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.8 + this.rng() * 0.9, color });
    }
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
        if (car.isPlayer) this.awardFinish(car);
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

  // Put a car back on the road at its last valid progress point, in a lane clear of obstacles.
  resetCar(car) {
    const t = this.track, i = car.idx, lat = t.aiLaneL[i];
    car.place(t.x[i] + t.nx[i] * lat, t.y[i] + t.ny[i] * lat, Math.atan2(t.ty[i], t.tx[i]));
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
    if (car.boostTimer > 0 && this.rng() < 0.6) {
      this.particles.push({
        x: car.x - Math.cos(car.angle) * 8, y: car.y - Math.sin(car.angle) * 8,
        vx: (this.rng() - 0.5) * 30, vy: (this.rng() - 0.5) * 30,
        life: 0.2 + this.rng() * 0.2, color: this.rng() < 0.5 ? PAL.orange : PAL.yellow,
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
    for (const p of this.popups) {
      p.y -= 22 * dt;
      p.life -= dt;
    }
    this.popups = this.popups.filter((p) => p.life > 0);
  }
}
