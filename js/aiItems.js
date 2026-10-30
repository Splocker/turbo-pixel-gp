'use strict';

// How AI drivers play the powerup game: steer for pickups near their line, dodge bananas, and
// decide when to fire what they hold. Called from AIDriver.update (see ai.js).

const AI_PICKUP_AHEAD_MIN = 4;    // samples ahead: closer than this it's too late to steer for
const AI_PICKUP_AHEAD_MAX = 25;
const AI_PICKUP_DETOUR = 28;      // furthest (px) an AI leaves its line for a pickup
const AI_BANANA_AHEAD_MAX = 15;   // samples ahead within which a banana is dodged
const AI_BANANA_DODGE = 14;       // px sideways
const AI_BANANA_BEHIND = 70;      // px: a rival this close behind gets a banana dropped on it
const AI_BANANA_HOLD = 8;         // seconds: drop the banana anyway after holding it this long

// Lateral shift (px) from the AI's lane toward the nearest reachable pickup ahead, or 0.
// Pickups off the road are ignored, so the AI never takes the swap lure onto the grass.
function aiPickupOffset(ai, race, lane) {
  const car = ai.car, track = ai.track;
  if (car.heldItem || car.finished) return 0;
  const limit = TRACK_HALF_WIDTH - 6;
  let best = null, bestAhead = Infinity;
  for (const p of race.pickups) {
    const ahead = track.wrap(p.idx - car.idx);
    if (ahead < AI_PICKUP_AHEAD_MIN || ahead > AI_PICKUP_AHEAD_MAX) continue;
    if (Math.abs(p.lateral) > limit || Math.abs(p.lateral - lane) > AI_PICKUP_DETOUR) continue;
    if (ahead < bestAhead) {
      best = p;
      bestAhead = ahead;
    }
  }
  return best ? best.lateral - lane : 0;
}

// Lateral shift (px) away from a banana lying on the AI's line just ahead, or 0.
function aiBananaDodge(ai, race, lane) {
  const car = ai.car, track = ai.track;
  if (car.isBig) return 0; // Big cars squash them, no need to swerve
  for (const b of race.bananas) {
    const ahead = track.wrap(b.idx - car.idx);
    if (ahead < 1 || ahead > AI_BANANA_AHEAD_MAX) continue;
    const diff = lane - b.lateral;
    if (Math.abs(diff) < AI_BANANA_DODGE) return (diff >= 0 ? 1 : -1) * (AI_BANANA_DODGE - Math.abs(diff));
  }
  return 0;
}

// Is another racer right behind this car, close to its line?
function rivalCloseBehind(car, cars) {
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  return cars.some((o) => {
    if (o === car || o.finished) return false;
    const dx = o.x - car.x, dy = o.y - car.y;
    const ahead = dx * fx + dy * fy, side = -dx * fy + dy * fx;
    return ahead < -8 && ahead > -AI_BANANA_BEHIND && Math.abs(side) < 16;
  });
}

function aiWantsToUseItem(ai, race) {
  const car = ai.car;
  switch (car.heldItem) {
    case 'big': return true;
    case 'swap': return findSwapTarget(race) !== car;
    case 'banana': return ai.itemHeldTime > AI_BANANA_HOLD || rivalCloseBehind(car, race.cars);
    default: return false;
  }
}

function aiUseItem(ai, race, dt) {
  if (!ai.car.heldItem) {
    ai.itemHeldTime = 0;
    return;
  }
  ai.itemHeldTime += dt;
  if (aiWantsToUseItem(ai, race)) useHeldItem(race, ai.car);
}
