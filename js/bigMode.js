'use strict';

// The Big powerup: for BIG_TIME seconds the car is twice the size and immovable. Car-to-car
// knockback lives in physics.js, tyre stacks in obstacles.js, bananas in banana.js.

const BIG_TIME = 7;
const BIG_SCALE = 2;        // sprite and collision circles
const BIG_KNOCKBACK = 2;    // a normal car hit by a Big car gets this many times the usual impulse
const TYRE_RESET = 8;       // seconds until a shoved tyre stack is back in place
const TYRE_SHOVE = 80;      // px/s added to a tyre stack, away from the Big car

function activateBig(car) {
  car.bigTimer = BIG_TIME;
}

// When exactly one of two touching cars is Big, that car wins the contact. Two Big cars (or two
// normal cars) collide normally, so this returns null for them.
function loneBigCar(a, b) {
  if (a.isBig === b.isBig) return null;
  return a.isBig ? a : b;
}

// Sends a tyre stack sliding with the given velocity. Obstacles.update slides it to a stop and
// puts it back home after TYRE_RESET seconds.
function shoveTyre(tyre, vx, vy) {
  tyre.vx = vx;
  tyre.vy = vy;
  tyre.timer = TYRE_RESET;
}
