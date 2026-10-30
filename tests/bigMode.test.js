'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./helpers/load');

const g = loadGame();
const track = new g.Track();
const DT = 1 / 60;

function carAt(x, y, angle, vx, vy, opts = {}) {
  const car = new g.Car({ name: 'T', body: '#000000', stripe: '#ffffff', ...opts });
  car.place(x, y, angle);
  car.vx = vx;
  car.vy = vy;
  return car;
}

// Two cars driving head-on into each other, just touching. Either one can be made Big first.
// Two Big cars start further apart because they are twice the size.
function headOn({ bigA = false, bigB = false, gap = 12 } = {}) {
  const a = carAt(0, 0, 0, 100, 0), b = carAt(gap, 0, 0, -100, 0);
  if (bigA) g.activateBig(a);
  if (bigB) g.activateBig(b);
  return { a, b, hit: g.collideCars(a, b) };
}

// The timer runs for seven seconds of driving, then the car is back to normal.
test('Big lasts seven seconds, then the car shrinks back', () => {
  const car = carAt(0, 0, 0, 0, 0);
  g.activateBig(car);
  assert.ok(car.isBig);
  assert.equal(car.sizeScale, 2);
  for (let t = 0; t < g.BIG_TIME - 0.1; t += DT) car.update(DT);
  assert.ok(car.isBig, 'still big just before seven seconds');
  for (let t = 0; t < 0.2; t += DT) car.update(DT);
  assert.ok(!car.isBig);
  assert.equal(car.sizeScale, 1);
});

// Big is a size change only: the car is no faster.
test('a Big car keeps the same top speed', () => {
  const car = carAt(0, 0, 0, 0, 0);
  const normal = car.topSpeed;
  g.activateBig(car);
  assert.equal(car.topSpeed, normal);
});

// Invincible means immovable: a lone Big car takes none of the knockback, and the other car
// is knocked away twice as hard as it would be by a normal car.
test('a Big car is not moved by a hit, and knocks the other car twice as far as normal', () => {
  const normal = headOn();
  const normalKnock = normal.b.vx - -100;
  const big = headOn({ bigA: true });
  assert.ok(big.hit, 'collision reported');
  assert.equal(big.a.vx, 100, 'big car keeps its speed');
  assert.equal(big.a.x, 0, 'big car is not pushed back');
  assert.ok(Math.abs((big.b.vx - -100) - 2 * normalKnock) < 1e-9, 'other car gets double the knockback');
});

// The story: two Big cars interact like two normal cars.
test('two Big cars collide like normal cars', () => {
  const normal = headOn();
  const both = headOn({ bigA: true, bigB: true, gap: 24 });
  assert.ok(Math.abs(both.a.vx - normal.a.vx) < 1e-9);
  assert.ok(Math.abs(both.b.vx - normal.b.vx) < 1e-9);
  assert.ok(both.a.spinTimer > 0 && both.b.spinTimer > 0, 'both spin, as normal cars would');
});

// Bump spins don't affect a Big car, but the car it hits still spins.
test('a Big car never spins out from a bump, but the car it hits does', () => {
  const { a, b } = headOn({ bigB: true });
  assert.ok(a.spinTimer > 0, 'normal car spins');
  assert.equal(b.spinTimer, 0, 'big car does not');
});

// Tyre stacks normally act as walls, but a Big car shoves them aside. They return home later.
test('a Big car shoves tyre stacks out of the way, and they return home later', () => {
  const obs = new g.Obstacles(track);
  const tyre = obs.tyres[0];
  const home = { x: tyre.x, y: tyre.y };
  const i = tyre.idx;
  const car = carAt(tyre.x - track.tx[i] * 10, tyre.y - track.ty[i] * 10, Math.atan2(track.ty[i], track.tx[i]),
    track.tx[i] * g.CAR_SPEED, track.ty[i] * g.CAR_SPEED);
  g.activateBig(car);
  const before = { x: car.x, y: car.y, vx: car.vx, vy: car.vy };
  obs.collide(car);
  assert.deepEqual({ x: car.x, y: car.y, vx: car.vx, vy: car.vy }, before, 'big car is not bounced or slowed');
  obs.update(0.5);
  assert.ok(Math.hypot(tyre.x - home.x, tyre.y - home.y) > 15, 'tyre stack slid away');
  for (let t = 0; t < g.TYRE_RESET; t += DT) obs.update(DT);
  assert.equal(tyre.x, home.x);
  assert.equal(tyre.y, home.y);
});

// Normal cars still bounce off a tyre stack, even one a Big car has shoved somewhere new.
test('a shoved tyre stack is still a solid wall for normal cars', () => {
  const obs = new g.Obstacles(track);
  const tyre = obs.tyres[0], i = tyre.idx;
  g.shoveTyre(tyre, track.nx[i] * 300, track.ny[i] * 300); // sideways, clear of the rest of the island
  obs.update(0.5);
  const car = carAt(tyre.x - 10, tyre.y, 0, g.CAR_SPEED, 0);
  obs.collide(car);
  assert.ok(car.vx < 0, 'bounced backwards');
});
