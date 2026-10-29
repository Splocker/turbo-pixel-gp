'use strict';

const POWERUP_WEIGHTS = { banana: 0.45, big: 0.4, swap: 0.15 }; // spawn chance of each kind
const POWERUP_RADIUS = 7;
const BANANA_RADIUS = 5;
const BANANA_DROP_DISTANCE = 14;   // how far behind the car a banana lands
const BANANA_OWNER_GRACE = 0.6;    // seconds the dropper can't slip on their own banana
const BANANA_SPIN_TIME = 1.1;
const BANANA_SPIN_RATE = 9;
const MAX_BANANAS = 24;            // oldest bananas are cleared past this
const SWAP_OFF_TRACK_CHANCE = 0.35;
const SWAP_OFF_TRACK_MARGIN = 12;  // swap pickups can sit up to this far past the road edge
const PICKUP_CAR_CLEARANCE = 60;   // new pickups don't appear right on top of a car
const PICKUP_SPACING = 30;
const SPAWN_STRICT_ATTEMPTS = 100; // after this many tries, take any spot so the count never drops

// There are always at least half as many pickups on the track as there are cars.
function minimumPickupCount(carCount) {
  return Math.ceil(carCount / 2);
}

function touching(car, item, distance) {
  const dx = car.x - item.x, dy = car.y - item.y;
  return dx * dx + dy * dy <= distance * distance;
}

// Per-race powerups: the pickups waiting on the track and the bananas cars have dropped.
class PowerupField {
  constructor(track, rng, obstacles) {
    this.track = track;
    this.rng = rng;
    this.obstacles = obstacles;
    this.pickups = [];
    this.bananas = [];
    this.time = 0;
  }

  // Spawns pickups until the minimum for this many cars is on the track.
  topUp(cars) {
    const wanted = minimumPickupCount(cars.length);
    while (this.pickups.length < wanted) this.spawnPickup(cars);
  }

  spawnPickup(cars) {
    const kind = this.randomKind();
    for (let attempt = 0; ; attempt++) {
      const spot = this.randomSpot(kind);
      if (attempt < SPAWN_STRICT_ATTEMPTS && !this.spotIsFree(spot, cars)) continue;
      this.pickups.push({ kind, ...spot });
      return;
    }
  }

  randomKind() {
    let roll = this.rng();
    for (const [kind, weight] of Object.entries(POWERUP_WEIGHTS)) {
      roll -= weight;
      if (roll < 0) return kind;
    }
    return 'banana';
  }

  // Anywhere on the road. Swap pickups sometimes sit just past the road edge.
  randomSpot(kind) {
    const t = this.track, rng = this.rng;
    const idx = Math.floor(rng() * t.n);
    const offTrack = kind === 'swap' && rng() < SWAP_OFF_TRACK_CHANCE;
    const side = rng() < 0.5 ? -1 : 1;
    const lat = offTrack
      ? side * (TRACK_HALF_WIDTH + rng() * SWAP_OFF_TRACK_MARGIN)
      : (rng() * 2 - 1) * (TRACK_HALF_WIDTH - POWERUP_RADIUS);
    return { idx, lat, x: t.x[idx] + t.nx[idx] * lat, y: t.y[idx] + t.ny[idx] * lat };
  }

  // Not inside a tyre stack, not crowding another pickup, and not right under a car.
  spotIsFree(spot, cars) {
    const near = (x, y, gap) => Math.hypot(x - spot.x, y - spot.y) < gap;
    if (this.obstacles.tyres.some((o) => near(o.homeX, o.homeY, TYRE_RADIUS + POWERUP_RADIUS + 4))) return false;
    if (this.pickups.some((p) => near(p.x, p.y, PICKUP_SPACING))) return false;
    return !cars.some((c) => near(c.x, c.y, PICKUP_CAR_CLEARANCE));
  }

  dropBanana(car) {
    const back = BANANA_DROP_DISTANCE * car.sizeScale;
    this.bananas.push({
      x: car.x - Math.cos(car.angle) * back,
      y: car.y - Math.sin(car.angle) * back,
      ownerCar: car,
      age: 0,
    });
    if (this.bananas.length > MAX_BANANAS) this.bananas.shift();
  }

  update(dt) {
    this.time += dt;
    for (const b of this.bananas) b.age += dt;
  }

  // Picks up an item if the car's slot is empty, and slips the car on any banana it runs over.
  // Returns what happened, for scoring and effects.
  collide(car) {
    const hits = [];
    const body = CAR_BODY_RADIUS * car.sizeScale;
    if (!car.heldPowerup && !car.finished) {
      const i = this.pickups.findIndex((p) => touching(car, p, POWERUP_RADIUS + body));
      if (i >= 0) {
        const [pickup] = this.pickups.splice(i, 1);
        car.heldPowerup = pickup.kind;
        car.heldPowerupTime = 0;
        hits.push({ type: 'powerup', kind: pickup.kind, x: pickup.x, y: pickup.y });
      }
    }
    for (let i = this.bananas.length - 1; i >= 0; i--) {
      const banana = this.bananas[i];
      if (banana.ownerCar === car && banana.age < BANANA_OWNER_GRACE) continue;
      if (!touching(car, banana, BANANA_RADIUS + body)) continue;
      this.bananas.splice(i, 1);
      // A big car squashes the banana and carries on.
      if (!car.isBig) {
        const slide = -car.vx * Math.sin(car.angle) + car.vy * Math.cos(car.angle);
        car.spinOut(BANANA_SPIN_TIME, (slide >= 0 ? 1 : -1) * BANANA_SPIN_RATE, { keepTrajectory: true });
      }
      hits.push({ type: car.isBig ? 'bananaSquash' : 'banana', ownerCar: banana.ownerCar, x: banana.x, y: banana.y });
    }
    return hits;
  }
}
