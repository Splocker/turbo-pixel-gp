'use strict';

// The Banana powerup: dropped right behind the car, it spins out the next car to touch it.
// Bananas never expire and there is no cap; each one works once.

const BANANA_RADIUS = 4;
const BANANA_OWNER_GRACE = 0.75; // seconds before the car that dropped it can slip on it
const BANANA_SPIN_TIME = 1.2;
const BANANA_SPIN_RATE = 8;      // rad/s

function dropBanana(race, car) {
  const track = race.track;
  const back = CAR_BODY_RADIUS * car.sizeScale + BANANA_RADIUS + 2;
  const x = car.x - Math.cos(car.angle) * back;
  const y = car.y - Math.sin(car.angle) * back;
  const idx = track.nearestLocal(x, y, car.idx, 6, 6);
  const banana = { x, y, idx, lateral: track.lateral(x, y, idx), owner: car, age: 0 };
  race.bananas.push(banana);
  return banana;
}

function updateBananas(race, dt) {
  for (const banana of race.bananas) banana.age += dt;
}

// Checks one car against every banana. Returns the bananas it hit (and used up).
function hitBananas(race, car) {
  const reach = BANANA_RADIUS + CAR_BODY_RADIUS * car.sizeScale;
  const hits = [];
  for (const banana of race.bananas) {
    const dx = car.x - banana.x, dy = car.y - banana.y;
    if (dx * dx + dy * dy > reach * reach) continue;
    if (banana.owner === car && banana.age < BANANA_OWNER_GRACE) continue;
    hits.push(banana);
  }
  if (!hits.length) return hits;
  race.bananas = race.bananas.filter((banana) => !hits.includes(banana));
  for (const banana of hits) slipOnBanana(race, car, banana);
  return hits;
}

function slipOnBanana(race, car, banana) {
  race.sparks(banana.x, banana.y, 40, [PAL.yellow, PAL.white]);
  if (car.isBig) return; // squashed flat
  // Spin the way the car is already sliding, so it looks like the back end let go.
  const slide = -car.vx * Math.sin(car.angle) + car.vy * Math.cos(car.angle);
  car.glideSpin(BANANA_SPIN_TIME, (slide >= 0 ? 1 : -1) * BANANA_SPIN_RATE);
  race.events.push({ type: 'bananaHit', car, owner: banana.owner });
  if (banana.owner === race.player && car !== race.player && race.playerScoring) {
    race.addPoints('bumps', POINTS.bananaHit, car.x, car.y - 6, PAL.yellow);
  }
}
