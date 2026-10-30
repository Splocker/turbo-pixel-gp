'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./helpers/load');

const g = loadGame();
const track = new g.Track();

function carAt(x, y, angle, vx, vy, opts = {}) {
  const car = new g.Car({ name: 'T', body: '#000000', stripe: '#ffffff', ...opts });
  car.place(x, y, angle);
  car.vx = vx;
  car.vy = vy;
  return car;
}

// Smallest distance between the two collision circles of each car.
function gap(a, b) {
  let best = Infinity;
  for (const p of g.carCircles(a)) for (const q of g.carCircles(b)) best = Math.min(best, Math.hypot(q[0] - p[0], q[1] - p[1]));
  return best - g.CAR_RADIUS * 2;
}

test('cars that are not touching do not collide', () => {
  const a = carAt(0, 0, 0, 100, 0), b = carAt(30, 0, 0, -100, 0);
  assert.equal(g.collideCars(a, b), null);
  assert.equal(a.vx, 100);
});

test('a head-on hit separates the cars, bounces them apart and conserves momentum', () => {
  const a = carAt(0, 0, 0, 100, 0), b = carAt(12, 0, 0, -100, 0);
  const hit = g.collideCars(a, b);
  assert.ok(hit, 'collision reported');
  assert.equal(hit.impact, 200);
  assert.ok(hit.a === a && hit.b === b);
  assert.ok(gap(a, b) > -1e-6, 'no longer overlapping');
  assert.ok(b.vx - a.vx > 0, 'moving apart');
  assert.ok(Math.abs(a.mass * a.vx + b.mass * b.vx) < 1e-6, 'momentum conserved');
});

test('hard hits spin both cars out; light nudges only push', () => {
  const a = carAt(0, 0, 0, 100, 0), b = carAt(12, 0, 0, -100, 0);
  assert.equal(g.collideCars(a, b).spun, true);
  assert.ok(a.spinTimer > 0 && b.spinTimer > 0);
  assert.ok(a.spinTimer <= 0.5, 'spins stay short');

  const c = carAt(0, 0, 0, 10, 0), d = carAt(12, 0, 0, -10, 0);
  const nudge = g.collideCars(c, d);
  assert.equal(nudge.spun, false);
  assert.equal(c.spinTimer, 0);
  // Closing at 20 px/s; the minimum impulse changes the relative speed by at least MIN_BUMP_IMPULSE.
  assert.ok(d.vx - c.vx + 20 >= g.MIN_BUMP_IMPULSE - 1e-6, 'even a nudge bounces the cars apart');
});

test('the heavier player shoves an AI car further than it gets shoved', () => {
  const player = carAt(0, 0, 0, 100, 0, { isPlayer: true });
  const ai = carAt(12, 0, 0, -100, 0);
  g.collideCars(player, ai);
  const dvPlayer = Math.abs(player.vx - 100), dvAi = Math.abs(ai.vx + 100);
  assert.ok(Math.abs(dvAi / dvPlayer - player.mass / ai.mass) < 1e-6);
});

test('cars already moving apart are only separated, not bounced', () => {
  const a = carAt(0, 0, 0, -50, 0), b = carAt(12, 0, 0, 50, 0);
  assert.equal(g.collideCars(a, b), null);
  assert.ok(gap(a, b) > -1e-6);
  assert.equal(a.vx, -50);
});

function big(car) {
  car.bigTimer = g.BIG_TIME - g.BIG_GROW; // fully grown
  return car;
}

test('a big car does not move when hit, and knocks a normal car twice as far', () => {
  // The same hit twice: once between normal cars, once with b big.
  const a1 = carAt(0, 0, 0, 100, 0), b1 = carAt(12, 0, 0, 0, 0);
  g.collideCars(a1, b1);
  const a2 = carAt(0, 0, 0, 100, 0), b2 = big(carAt(12 + g.CAR_RADIUS * (g.BIG_SCALE - 1), 0, 0, 0, 0));
  const bx = b2.x;
  const hit = g.collideCars(a2, b2);
  assert.ok(hit && hit.spun);
  assert.equal(b2.x, bx, 'big car is not pushed');
  assert.equal(b2.vx, 0, 'big car keeps its speed');
  assert.equal(b2.spinTimer, 0, 'big car is not spun');
  assert.ok(Math.abs((a2.vx - 100) / (a1.vx - 100) - g.BIG_KNOCK) < 1e-9, 'knocked twice as hard');
  assert.ok(a2.spinTimer > 0);
});

test('two big cars bump each other like two normal cars', () => {
  const a = big(carAt(0, 0, 0, 100, 0)), b = big(carAt(12 * g.BIG_SCALE, 0, 0, -100, 0));
  const hit = g.collideCars(a, b);
  assert.ok(hit, 'big cars collide at their bigger size');
  assert.ok(Math.abs(a.vx + b.vx) < 1e-6, 'momentum conserved');
  assert.ok(a.vx < 100 && b.vx > -100, 'both get bounced');
  assert.ok(a.spinTimer > 0 && b.spinTimer > 0);
});

test('resolveCarCollisions reports every touching pair once', () => {
  const cars = [carAt(0, 0, 0, 100, 0), carAt(12, 0, 0, -100, 0), carAt(500, 500, 0, 0, 0)];
  const hits = [];
  g.resolveCarCollisions(cars, (h) => hits.push(h));
  assert.equal(hits.length, 1);
});

test('trees, the grandstand and the world edge push cars back out', () => {
  const tree = track.trees[0];
  const a = carAt(tree.x + 1, tree.y, 0, -100, 0);
  g.collideScenery(a, track);
  assert.ok(Math.hypot(a.x - tree.x, a.y - tree.y) >= tree.r + 5 - 1e-6);
  assert.ok(a.vx > 0, 'bounced off the tree');

  const gs = track.grandstand;
  const b = carAt(gs.x + gs.w / 2, gs.y + gs.h + 2, 0, 0, -100);
  g.collideScenery(b, track);
  assert.ok(b.y >= gs.y + gs.h + 6 - 1e-6);

  const c = carAt(-20, track.worldH + 20, 0, -100, 100);
  g.collideScenery(c, track);
  assert.ok(c.x >= 10 && c.y <= track.worldH - 10);
  assert.ok(c.vx > 0 && c.vy < 0);
});
