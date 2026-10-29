'use strict';

const RACE_LAPS = 3;
const COUNTDOWN_TIME = 3;
const MAX_OPPONENTS = 20;
const DEFAULT_OPPONENTS = 4;

const EDGE_ASSIST_ZONE = 10;  // px inside the road edge where the player's steering assist starts
const EDGE_ASSIST_RATE = 0.8; // rad/s

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
    this.powerups = new PowerupField(track, this.rng, this.obstacles);
    this.powerups.topUp(this.cars);
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
    this.powerups.update(dt);

    for (const car of this.cars) {
      if (car.ai) car.ai.update(dt, this);
    }
    for (const car of this.cars) {
      if (car.input.usePowerup) usePowerup(car, this);
      car.input.usePowerup = false;
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
      for (const hit of this.powerups.collide(car)) this.onPowerupHit(car, hit);
      collideScenery(car, track);
      this.updateProgress(car, dt);
      this.emitEffects(car);
    }
    this.powerups.topUp(this.cars);
    this.updatePositions();
    this.updateParticles(dt);
  }

  // Near the edge and pointing off the road, the player's car eases back toward the track
  // direction. It is gentle enough that steering off on purpose still works.
  assistToRoad(car, dt) {
    if (car.spinTimer > 0 || car.forwardSpeed < 40) return;
    const t = this.track, i = car.idx;
    const lat = t.lateral(car.x, car.y, i);
    if (Math.abs(lat) < TRACK_HALF_WIDTH - EDGE_ASSIST_ZONE) return;
    const diff = wrapAngle(Math.atan2(t.ty[i], t.tx[i]) - car.angle);
    if (Math.abs(diff) > Math.PI / 2) return; // facing backwards: leave it alone
    const outward = Math.sign(lat) * Math.sin(-diff) > 0;
    if (!outward) return;
    car.angle = wrapAngle(car.angle + clamp(diff, -EDGE_ASSIST_RATE * dt, EDGE_ASSIST_RATE * dt));
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
}

mixInto(Race, RaceScoringMethods);
mixInto(Race, RaceEffectsMethods);
