'use strict';

const POWERUP_RADIUS = 6;
const POWERUP_WEIGHTS = [['banana', 0.45], ['big', 0.35], ['swap', 0.2]];
const POWERUP_MIN = 2;             // even a two-car race has something to fight over
const POWERUP_CLEARANCE = 24;      // kept this far from course furniture and other pickups
const POWERUP_CAR_CLEARANCE = 80;  // new pickups don't appear right under a car
const SWAP_OFF_ROAD_CHANCE = 0.5;  // swaps sometimes sit just off the road: a gamble to grab
const SWAP_OFF_ROAD_MARGIN = 16;   // furthest a swap sits past the road edge
const BANANA_RADIUS = 4;
const BANANA_ARM_TIME = 0.4;       // the car that dropped it can't slip on it straight away
const BANANA_LIFE = 30;
const BANANA_DROP_GAP = 3;         // behind the rear bumper

// Pickups out on the track at all times: at least one for every two cars.
function powerupTarget(carCount) {
  return Math.max(POWERUP_MIN, Math.ceil(carCount / 2));
}

// Per-race powerup state: the pickups waiting around the lap and the bananas cars have dropped.
class Powerups {
  constructor(track, rng, obstacles) {
    this.track = track;
    this.rng = rng;
    this.obstacles = obstacles;
    this.items = [];
    this.bananas = [];
    this.time = 0;
  }

  update(dt, cars) {
    this.time += dt;
    for (const b of this.bananas) {
      b.arm -= dt;
      b.life -= dt;
    }
    this.bananas = this.bananas.filter((b) => b.life > 0);
    this.fill(cars);
  }

  fill(cars) {
    const target = powerupTarget(cars.length);
    while (this.items.length < target) this.spawn(cars);
  }

  pickKind() {
    let roll = this.rng();
    for (const [kind, weight] of POWERUP_WEIGHTS) {
      roll -= weight;
      if (roll < 0) return kind;
    }
    return POWERUP_WEIGHTS[0][0];
  }

  // A random spot anywhere around the lap, clear of furniture, other pickups and cars. Swaps
  // sometimes land just off the road. If the track is crowded the last try is used regardless.
  spawn(cars) {
    const t = this.track, kind = this.pickKind();
    const near = (o, x, y, gap) => Math.abs(o.x - x) < gap && Math.abs(o.y - y) < gap && Math.hypot(o.x - x, o.y - y) < gap;
    const TRIES = 40;
    for (let k = 0; k < TRIES; k++) {
      const idx = Math.floor(this.rng() * t.n);
      let lat = (this.rng() * 2 - 1) * (TRACK_HALF_WIDTH - POWERUP_RADIUS);
      if (kind === 'swap' && this.rng() < SWAP_OFF_ROAD_CHANCE) {
        const past = KERB_WIDTH + this.rng() * (SWAP_OFF_ROAD_MARGIN - KERB_WIDTH);
        lat = (lat < 0 ? -1 : 1) * (TRACK_HALF_WIDTH + past);
      }
      const x = t.x[idx] + t.nx[idx] * lat, y = t.y[idx] + t.ny[idx] * lat;
      const last = k === TRIES - 1;
      if (!last && this.obstacles.items.some((o) => near(o, x, y, POWERUP_CLEARANCE + o.r))) continue;
      if (!last && this.items.some((o) => near(o, x, y, POWERUP_CLEARANCE))) continue;
      if (!last && cars.some((c) => near(c, x, y, POWERUP_CAR_CLEARANCE))) continue;
      this.items.push({ kind, x, y, idx, lat, r: POWERUP_RADIUS });
      return;
    }
  }

  // Pickups the car is driving over.
  touching(car) {
    const reach = POWERUP_RADIUS + CAR_BODY_RADIUS * car.scale;
    return this.items.filter((p) => (p.x - car.x) ** 2 + (p.y - car.y) ** 2 <= reach * reach);
  }

  // Removes a collected pickup; a new one appears somewhere else straight away.
  take(p, cars) {
    const i = this.items.indexOf(p);
    if (i >= 0) this.items.splice(i, 1);
    this.fill(cars);
  }

  // Drops a banana right behind the car.
  drop(car) {
    const back = (CAR_CIRCLE_OFFSET + CAR_RADIUS) * car.scale + BANANA_RADIUS + BANANA_DROP_GAP;
    this.bananas.push({
      x: car.x - Math.cos(car.angle) * back,
      y: car.y - Math.sin(car.angle) * back,
      r: BANANA_RADIUS, owner: car, arm: BANANA_ARM_TIME, life: BANANA_LIFE,
    });
  }

  // The banana the car has just run over, if any. A banana is used up by the first car to hit it.
  bananaUnder(car) {
    const reach = BANANA_RADIUS + CAR_BODY_RADIUS * car.scale;
    const i = this.bananas.findIndex((b) => {
      if (b.owner === car && b.arm > 0) return false;
      return (b.x - car.x) ** 2 + (b.y - car.y) ** 2 <= reach * reach;
    });
    return i < 0 ? null : this.bananas.splice(i, 1)[0];
  }
}
