'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./helpers/load');

const g = loadGame();
const DT = 1 / 60;

function makeCar(opts = {}) {
  const car = new g.Car({ name: 'T', body: '#000000', stripe: '#ffffff', ...opts });
  car.place(0, 0, 0); // facing +x
  return car;
}

function drive(car, seconds, input = {}) {
  Object.assign(car.input, { throttle: 0, brake: 0, steer: 0 }, input);
  for (let i = Math.round(seconds / DT); i > 0; i--) car.update(DT);
}

test('holding W reaches the single cruising speed almost instantly and never exceeds it', () => {
  const car = makeCar();
  drive(car, 0.25, { throttle: 1 });
  assert.ok(Math.abs(car.forwardSpeed - g.CAR_SPEED) < 0.5, `speed after 0.25s: ${car.forwardSpeed}`);
  for (let i = 0; i < 120; i++) {
    car.update(DT);
    assert.ok(car.forwardSpeed <= g.CAR_SPEED + 1e-6);
  }
});

test('letting go coasts down gently', () => {
  const car = makeCar();
  drive(car, 1, { throttle: 1 });
  drive(car, 1);
  assert.ok(Math.abs(car.forwardSpeed - (g.CAR_SPEED - g.CAR_COAST)) < 5, `speed ${car.forwardSpeed}`);
});

test('S brakes to a stop, then reverses at a capped speed', () => {
  const car = makeCar();
  drive(car, 1, { throttle: 1 });
  drive(car, g.CAR_SPEED / g.CAR_BRAKE + 0.02, { brake: 1 });
  assert.ok(Math.abs(car.forwardSpeed) < 10, `speed after braking: ${car.forwardSpeed}`);
  drive(car, 2, { brake: 1 });
  assert.ok(car.forwardSpeed < -g.CAR_REVERSE_MAX + 5 && car.forwardSpeed >= -g.CAR_REVERSE_MAX - 1e-6);
});

test('grass eases the car down to GRASS_SPEED instead of stopping it', () => {
  const car = makeCar();
  drive(car, 1, { throttle: 1 });
  car.surface = 'grass';
  drive(car, 3, { throttle: 1 });
  assert.ok(Math.abs(car.forwardSpeed - g.CAR_SPEED * g.GRASS_SPEED) < 3, `grass speed ${car.forwardSpeed}`);
  // Staying on the road has to be clearly worth it, but grass must not bog the car down.
  assert.ok(car.forwardSpeed < g.CAR_SPEED * 0.75 && car.forwardSpeed > g.CAR_SPEED * 0.4, 'grass is noticeably slower');
  car.surface = 'road';
  drive(car, 0.25, { throttle: 1 });
  assert.ok(Math.abs(car.forwardSpeed - g.CAR_SPEED) < 0.5, 'full speed again back on the road');
});

test('a boost lifts the top speed for a while, then bleeds back off', () => {
  const car = makeCar();
  drive(car, 1, { throttle: 1 });
  car.boostTimer = g.CAR_BOOST_TIME;
  drive(car, 0.5, { throttle: 1 });
  assert.ok(car.forwardSpeed > g.CAR_SPEED * 1.2, `boosted speed ${car.forwardSpeed}`);
  drive(car, g.CAR_BOOST_TIME + 2, { throttle: 1 });
  assert.equal(car.boostTimer, 0);
  assert.ok(car.forwardSpeed < g.CAR_SPEED + 2);
});

test('steering turns at a constant rate at speed and not at all when stopped', () => {
  const car = makeCar();
  drive(car, 0.5, { steer: 1 });
  assert.equal(car.angle, 0, 'no turning on the spot');

  drive(car, 1, { throttle: 1 });
  const before = car.angle;
  drive(car, 0.1, { throttle: 1, steer: 1 }); // D: positive angle is clockwise on screen (right)
  const rate = g.wrapAngle(car.angle - before) / 0.1;
  assert.ok(Math.abs(rate - g.CAR_STEER_RATE) < 0.4, `turn rate ${rate}`);
});

test('a spin-out ignores the driver until it ends', () => {
  const car = makeCar();
  drive(car, 1, { throttle: 1 });
  const speed = car.speed;
  car.spinOut(0.5, 5);
  const startAngle = car.angle;
  drive(car, 0.3, { throttle: 1, steer: -1 });
  assert.ok(car.spinTimer > 0);
  assert.ok(g.wrapAngle(car.angle - startAngle) > 0.5, 'rotates with the spin, not the steering');
  assert.ok(car.speed < speed, 'throttle does nothing while spinning');
  drive(car, 0.5, { throttle: 1 });
  assert.ok(car.spinTimer <= 0);
  drive(car, 0.5, { throttle: 1 });
  assert.ok(Math.abs(car.forwardSpeed - g.CAR_SPEED) < 1, 'control comes back');
});

test('the player recovers from spins faster and is heavier than the AI', () => {
  const ai = makeCar(), player = makeCar({ isPlayer: true });
  ai.spinOut(0.5, 5);
  player.spinOut(0.5, 5);
  assert.ok(Math.abs(player.spinTimer - 0.35) < 1e-9);
  assert.equal(ai.spinTimer, 0.5);
  assert.ok(player.mass > ai.mass);
});

test('a banana slip spins the body one full turn while the car slides on along its trajectory', () => {
  const car = makeCar();
  drive(car, 1, { throttle: 1 });
  const heading = Math.atan2(car.vy, car.vx), speed = car.speed, angle = car.angle;
  car.slipOut(1);
  assert.ok(car.slipping);
  let turned = 0, last = car.angle;
  for (let i = 0; i < 30; i++) {
    car.input.steer = -1; // ignored while slipping
    car.update(DT);
    turned += g.wrapAngle(car.angle - last);
    last = car.angle;
    assert.ok(Math.abs(g.wrapAngle(Math.atan2(car.vy, car.vx) - heading)) < 1e-9, 'trajectory unchanged');
  }
  assert.ok(turned > 1, 'the body spins');
  assert.ok(car.speed < speed, 'loses some speed');
  drive(car, g.SLIP_TIME, {});
  assert.equal(car.slipping, false);
  assert.ok(Math.abs(g.wrapAngle(car.angle - angle)) < 0.1, 'ends facing the way it was going');
});

test('BIG lasts BIG_TIME, grows to BIG_SCALE and shrinks back', () => {
  const car = makeCar();
  assert.equal(car.scale, 1);
  car.bigTimer = g.BIG_TIME;
  assert.ok(car.isBig);
  drive(car, g.BIG_GROW + 0.05, {});
  assert.equal(car.scale, g.BIG_SCALE);
  drive(car, g.BIG_TIME - g.BIG_GROW - 0.2, {});
  assert.ok(car.isBig && car.scale < g.BIG_SCALE && car.scale > 1, 'shrinking at the end');
  drive(car, 0.2, {});
  assert.equal(car.isBig, false);
  assert.equal(car.scale, 1);
});

test('place resets motion, spin and boost', () => {
  const car = makeCar();
  drive(car, 1, { throttle: 1 });
  car.spinOut(1, 3);
  car.boostTimer = 1;
  car.place(10, 20, 1);
  assert.equal(car.x, 10);
  assert.equal(car.y, 20);
  assert.equal(car.angle, 1);
  assert.equal(car.speed, 0);
  assert.equal(car.spinTimer, 0);
  assert.equal(car.boostTimer, 0);
});
