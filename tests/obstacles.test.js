'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./helpers/load');

const g = loadGame();
const track = new g.Track();
const layout = g.obstacleLayout(track);
const HW = g.TRACK_HALF_WIDTH;
const DT = 1 / 60;

function carOn(o, opts = {}) {
  const car = new g.Car({ name: 'T', body: '#000000', stripe: '#ffffff', ...opts });
  car.place(o.x, o.y, Math.atan2(track.ty[o.idx], track.tx[o.idx]));
  car.idx = o.idx;
  car.vx = track.tx[o.idx] * g.CAR_SPEED;
  car.vy = track.ty[o.idx] * g.CAR_SPEED;
  return car;
}

const first = (obs, type) => obs.items.find((o) => o.type === type);

// The layout only uses the known obstacle types, and every type actually appears on the course.
test('the course has no pinball bumpers or sliding blocks, only the friendly obstacle types', () => {
  // placeObstacles skips types it doesn't know, so check the hand-written layout itself too:
  // a typo or a removed type would otherwise vanish silently.
  const layoutTypes = new Set(['coins', 'cones', 'island', 'boost']);
  for (const e of g.OBSTACLE_LAYOUT) assert.ok(layoutTypes.has(e.type), `unknown layout entry type ${e.type}`);
  for (const e of g.OBSTACLE_LAYOUT) {
    const i = track.indexAt(e.d);
    assert.ok(layout.some((o) => Math.abs(track.wrap(o.idx - i + 20) - 20) <= 20), `layout entry at d=${e.d} produced nothing`);
  }

  const allowed = new Set(['tyre', 'boost', 'cone', 'coin']);
  for (const o of layout) assert.ok(allowed.has(o.type), `unexpected obstacle type ${o.type}`);
  for (const type of allowed) assert.ok(layout.some((o) => o.type === type), `no ${type} on the course`);
});

// The oil slicks were removed: the banana powerup is the only slippery thing left.
test('there is no oil anywhere on the course', () => {
  assert.ok(!g.OBSTACLE_LAYOUT.some((e) => e.type === 'oil'));
  assert.ok(!layout.some((o) => o.type === 'oil'));
});

// No obstacle hangs off the edge of the road.
test('every obstacle sits fully on the road', () => {
  for (const o of layout) {
    assert.ok(Math.abs(o.lat) + o.r <= HW, `${o.type} at lat ${o.lat} pokes off the road`);
    assert.equal(track.surfaceAt(o.x, o.y, o.idx), 'road');
  }
});

// Nothing is placed on the grid boxes where cars start.
test('the starting grid is kept clear', () => {
  for (let slot = 0; slot <= g.MAX_OPPONENTS; slot++) {
    const p = track.gridPose(slot);
    for (const o of layout) {
      assert.ok(Math.hypot(p.x - o.x, p.y - o.y) > o.r + 20, `${o.type} on grid slot ${slot}`);
    }
  }
});

// The two AI driving lines never leave the road and pass every hazard with room to spare.
test('both AI lanes stay on the road and steer clear of every hazard', () => {
  for (const lanes of [track.aiLaneL, track.aiLaneR]) {
    assert.equal(lanes.length, track.n);
    for (let i = 0; i < track.n; i++) assert.ok(Math.abs(lanes[i]) <= HW - 8, `lane off the road at ${i}`);
    for (const o of layout) {
      if (o.type !== 'tyre' && o.type !== 'cone') continue;
      const clearance = Math.abs(lanes[o.idx] - o.lat) - o.r - g.CAR_BODY_RADIUS;
      assert.ok(clearance >= 0, `${o.type} at sample ${o.idx}: lane ${lanes[o.idx].toFixed(1)}, lat ${o.lat}`);
    }
  }
});

// One AI line goes left of a tyre island and the other goes right.
test('the two AI lanes split around tyre islands', () => {
  const tyre = layout.find((o) => o.type === 'tyre');
  assert.ok(track.aiLaneL[tyre.idx] < tyre.lat && track.aiLaneR[tyre.idx] > tyre.lat);
});

// Only the player can collect coins, and a collected coin reappears after COIN_RESPAWN seconds.
test('coins are for the player only, and come back after a while', () => {
  const obs = new g.Obstacles(track);
  const coin = first(obs, 'coin');
  assert.equal(obs.collide(carOn(coin)).length, 0, 'AI cars cannot take coins');
  const hits = obs.collide(carOn(coin, { isPlayer: true }));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].type, 'coin');
  assert.equal(obs.collide(carOn(coin, { isPlayer: true })).length, 0, 'already taken');
  for (let t = 0; t < g.COIN_RESPAWN + 0.1; t += DT) obs.update(DT);
  assert.equal(obs.collide(carOn(coin, { isPlayer: true })).length, 1, 'respawned');
});

// Driving over a boost pad gives a timed boost that can't be re-triggered straight away.
test('boost pads give a timed boost', () => {
  const obs = new g.Obstacles(track);
  const pad = first(obs, 'boost');
  const car = carOn(pad);
  assert.equal(obs.collide(car)[0].type, 'boost');
  assert.equal(car.boostTimer, g.CAR_BOOST_TIME);
  assert.equal(obs.collide(car).length, 0, 'no re-trigger while already boosted');
});

// Hitting a cone knocks it flying, costs a little speed, and the cone goes back home later.
test('cones get knocked flying and return home later', () => {
  const obs = new g.Obstacles(track);
  const cone = first(obs, 'cone');
  const home = { x: cone.x, y: cone.y };
  const car = carOn(cone);
  const hits = obs.collide(car);
  assert.ok(hits.some((h) => h.type === 'cone'));
  assert.ok(car.speed < g.CAR_SPEED, 'hitting a cone costs a little speed');
  obs.update(0.5);
  assert.ok(Math.hypot(cone.x - home.x, cone.y - home.y) > 20, 'cone went flying');
  for (let t = 0; t < g.CONE_RESET; t += DT) obs.update(DT);
  assert.equal(cone.x, home.x);
  assert.equal(cone.y, home.y);
  assert.equal(cone.timer, 0);
});

// A normal car can't drive through a tyre stack: it is pushed out and bounces back.
test('tyre stacks are solid: the car is pushed out and bounced', () => {
  const obs = new g.Obstacles(track);
  const tyre = first(obs, 'tyre');
  const car = carOn(tyre);
  car.x -= track.tx[tyre.idx] * 4; // just touching from behind, driving into it
  car.y -= track.ty[tyre.idx] * 4;
  obs.collide(car);
  assert.ok(Math.hypot(car.x - tyre.x, car.y - tyre.y) >= tyre.r + g.CAR_BODY_RADIUS - 1e-6);
  assert.ok(car.forwardSpeed < 0, 'bounced backwards');
});

// A big car pushes the tyre stack out of its way without bouncing, and the stack slides back home later.
test('a big car shoves tyre stacks aside, and they return home', () => {
  const obs = new g.Obstacles(track);
  const tyre = first(obs, 'tyre');
  const home = { x: tyre.x, y: tyre.y };
  const car = carOn(tyre);
  car.bigTimer = g.BIG_TIME;
  car.x -= track.tx[tyre.idx] * 10;
  car.y -= track.ty[tyre.idx] * 10;
  const speedBefore = car.forwardSpeed;
  obs.collide(car);
  assert.equal(car.forwardSpeed, speedBefore, 'the big car is not slowed or bounced');
  obs.update(0.3);
  assert.ok(Math.hypot(tyre.x - home.x, tyre.y - home.y) > 10, 'tyre stack was shoved');
  for (let t = 0; t < g.TYRE_RESET; t += DT) obs.update(DT);
  assert.equal(tyre.x, home.x);
  assert.equal(tyre.y, home.y);
});

// Two races never share coin, cone or tyre state.
test('each race gets its own obstacle state', () => {
  const a = new g.Obstacles(track), b = new g.Obstacles(track);
  const coin = first(a, 'coin');
  a.collide(carOn(coin, { isPlayer: true }));
  assert.ok(coin.timer > 0);
  assert.equal(first(b, 'coin').timer, 0);
});
