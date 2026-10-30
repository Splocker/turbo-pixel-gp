'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, runRace } = require('./helpers/load');

const g = loadGame();
const track = new g.Track();
const DT = 1 / 60;
const STRAIGHT = track.indexAt(300);

function startedRace(opponents = 3, seed = 1) {
  const race = new g.Race(track, { opponents, withPlayer: false, seed });
  race.countdown = 0;
  race.running = true;
  race.pickups.length = 0;
  return race;
}

// Puts a car on the straight at an offset (in samples) along the lap and a lateral offset.
function setAt(car, ahead, lat = 0, totalDist = 0) {
  const i = track.wrap(STRAIGHT + ahead);
  car.place(track.x[i] + track.nx[i] * lat, track.y[i] + track.ny[i] * lat, Math.atan2(track.ty[i], track.tx[i]));
  car.idx = i;
  car.totalDist = totalDist;
  car.vx = track.tx[i] * 200;
  car.vy = track.ty[i] * 200;
}

// Spreads every car out so nobody is near anybody else.
function spreadOut(race) {
  race.cars.forEach((c, k) => setAt(c, k * 60, 0, -k * 360));
  race.updatePositions();
}

// Big has no downside, so the AI fires it as soon as it has it.
test('an AI car holding Big uses it straight away', () => {
  const race = startedRace();
  spreadOut(race);
  const car = race.cars[1];
  car.heldItem = 'big';
  car.ai.update(DT, race);
  assert.equal(car.heldItem, null);
  assert.ok(car.isBig);
});

// A banana is saved for a rival right behind.
test('an AI car keeps its banana until a rival is close behind, then drops it', () => {
  const race = startedRace();
  spreadOut(race);
  const car = race.cars[1];
  car.heldItem = 'banana';
  car.ai.update(DT, race);
  assert.equal(car.heldItem, 'banana', 'nobody behind yet');
  setAt(race.cars[2], track.wrap(car.idx - STRAIGHT - 6), 2);
  car.ai.update(DT, race);
  assert.equal(car.heldItem, null);
  assert.equal(race.bananas.length, 1);
});

// Swap is worth using from anywhere but first place.
test('an AI car uses swap when behind, but the leader holds on to it', () => {
  const race = startedRace();
  spreadOut(race);
  const leader = race.standings[0], chaser = race.standings[2];
  leader.heldItem = 'swap';
  chaser.heldItem = 'swap';
  leader.ai.update(DT, race);
  assert.equal(leader.heldItem, 'swap', 'the leader keeps it');
  chaser.ai.update(DT, race);
  assert.equal(chaser.heldItem, null);
  assert.equal(chaser.position, 1, 'the chaser swapped into the lead');
});

// AI cars go after pickups just ahead and close to their line, but never off the road.
test('AI cars steer towards a pickup just ahead, but not one off the road', () => {
  const race = startedRace();
  spreadOut(race);
  const car = race.cars[0];
  const pickupAt = (lat) => {
    const i = track.wrap(car.idx + 12);
    race.pickups = [{ type: 'big', idx: i, lateral: lat, x: track.x[i] + track.nx[i] * lat, y: track.y[i] + track.ny[i] * lat }];
  };
  const lane = car.ai.lanes[track.wrap(car.idx + 12)];
  pickupAt(lane + 15);
  assert.ok(g.aiPickupOffset(car.ai, race, lane) > 10, 'heads for it');
  pickupAt(g.TRACK_HALF_WIDTH + g.KERB_WIDTH + 8);
  assert.equal(g.aiPickupOffset(car.ai, race, lane), 0, 'ignores the off-road lure');
});

// With every car using items, AI races still reach the flag.
test('an AI race with powerups still finishes', () => {
  const race = new g.Race(track, { opponents: 8, withPlayer: false, seed: 77 });
  let used = 0;
  for (let t = 0; t < 150 && !race.allFinished; t++) {
    runRace(race, 1);
    used += race.events.filter((e) => e.type === 'item').length;
    race.events.length = 0;
  }
  assert.ok(race.allFinished, `still racing after ${race.time.toFixed(0)}s`);
  assert.ok(used > 0, 'items were used');
});
