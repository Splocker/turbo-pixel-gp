'use strict';

const AI_BANANA_BEHIND = 60;      // drop a banana when a car is this close behind
const AI_BANANA_MAX_HOLD = 6;     // ...or after holding it this long
const AI_BIG_AHEAD = 70;          // grow when a car is this close ahead
const AI_BIG_MAX_HOLD = 2;        // ...or after holding it this long
const AI_SWAP_MIN_POSITION = 3;   // only swap from 3rd or further back
const AI_SWAP_DELAY = 1;

// Simple rules for when an AI driver fires the item it is holding.
function aiWantsToUsePowerup(car, race) {
  const held = car.heldPowerupTime;
  switch (car.heldPowerup) {
    case 'banana': return held > AI_BANANA_MAX_HOLD || carInLine(car, race.cars, -AI_BANANA_BEHIND, -4);
    case 'big': return held > AI_BIG_MAX_HOLD || carInLine(car, race.cars, 4, AI_BIG_AHEAD);
    case 'swap': return held > AI_SWAP_DELAY && car.position >= AI_SWAP_MIN_POSITION;
    default: return false;
  }
}

// Is another car roughly in line with us, between these distances along our heading
// (negative is behind)?
function carInLine(car, cars, from, to) {
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  return cars.some((other) => {
    if (other === car) return false;
    const dx = other.x - car.x, dy = other.y - car.y;
    const along = dx * fx + dy * fy;
    const across = Math.abs(-dx * fy + dy * fx);
    return along >= from && along <= to && across < 24;
  });
}
