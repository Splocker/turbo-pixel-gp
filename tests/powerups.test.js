'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, runRace } = require('./helpers/load');

const g = loadGame();
const track = new g.Track();
const HW = g.TRACK_HALF_WIDTH;

function carOnPickup(pickup, opts = {}) {
  const car = new g.Car({ name: 'T', body: '#000000', stripe: '#ffffff', ...opts });
  car.place(pickup.x, pickup.y, 0);
  return car;
}

// The minimum pickup count is half the number of cars, rounded up.
test('minimumPickupCount is half the field, rounded up', () => {
  assert.equal(g.minimumPickupCount(1), 1);
  assert.equal(g.minimumPickupCount(5), 3);
  assert.equal(g.minimumPickupCount(21), 11);
});

// From the start and throughout a busy race, there are always at least half as many pickups as cars.
test('there are always at least half as many pickups on the track as cars', () => {
  for (const opponents of [1, 4, 20]) {
    const race = new g.Race(track, { opponents, withPlayer: true, seed: 50 + opponents });
    const wanted = Math.ceil(race.cars.length / 2);
    assert.ok(race.powerups.pickups.length >= wanted, 'enough pickups before the start');
    race.player.ai = new g.AIDriver(race.player, track, g.makeRng(1), { speedFactor: 1 });
    for (let t = 0; t < 30; t++) {
      runRace(race, 1);
      assert.ok(race.powerups.pickups.length >= wanted, `only ${race.powerups.pickups.length} pickups at ${race.time.toFixed(0)}s`);
    }
  }
});

// Banana and Big pickups sit fully on the road; Swap can sit a small margin past the edge.
test('pickups spawn on the road, except swap which can sit just off it', () => {
  const field = new g.PowerupField(track, g.makeRng(7), new g.Obstacles(track));
  let offTrackSwaps = 0;
  for (let k = 0; k < 400; k++) {
    field.pickups.length = 0;
    field.spawnPickup([]);
    const p = field.pickups[0];
    if (p.kind === 'swap') {
      assert.ok(Math.abs(p.lat) <= HW + g.SWAP_OFF_TRACK_MARGIN, `swap at lat ${p.lat}`);
      if (Math.abs(p.lat) > HW) offTrackSwaps++;
    } else {
      assert.ok(Math.abs(p.lat) + g.POWERUP_RADIUS <= HW, `${p.kind} at lat ${p.lat} pokes off the road`);
    }
  }
  assert.ok(offTrackSwaps > 0, 'some swaps spawned off the track');
});

// Every kind of powerup turns up when enough are spawned.
test('all three powerup kinds spawn', () => {
  const field = new g.PowerupField(track, g.makeRng(3), new g.Obstacles(track));
  const kinds = new Set();
  for (let k = 0; k < 100; k++) kinds.add(field.randomKind());
  assert.deepEqual([...kinds].sort(), ['banana', 'big', 'swap']);
});

// New pickups don't appear right under a car.
test('pickups do not spawn on top of a car', () => {
  const race = new g.Race(track, { opponents: 10, seed: 9 });
  for (const p of race.powerups.pickups) {
    for (const c of race.cars) assert.ok(Math.hypot(p.x - c.x, p.y - c.y) >= g.PICKUP_CAR_CLEARANCE);
  }
});

// Driving over a pickup puts it in the car's one item slot; a second pickup is ignored while one is held.
test('a car holds only one item at a time', () => {
  const field = new g.PowerupField(track, g.makeRng(4), new g.Obstacles(track));
  field.pickups.push({ kind: 'big', x: 500, y: 500 }, { kind: 'banana', x: 500, y: 500 });
  const car = carOnPickup({ x: 500, y: 500 });
  const hits = field.collide(car);
  assert.equal(hits.length, 1);
  assert.equal(car.heldPowerup, 'big');
  assert.equal(field.pickups.length, 1, 'the second pickup stays on the track');
  field.collide(car);
  assert.equal(car.heldPowerup, 'big', 'still holding the first item');
});

// Cars that have crossed the finish line don't take pickups away from those still racing.
test('finished cars cannot collect pickups', () => {
  const field = new g.PowerupField(track, g.makeRng(4), new g.Obstacles(track));
  field.pickups.push({ kind: 'big', x: 500, y: 500 });
  const car = carOnPickup({ x: 500, y: 500 });
  car.finished = true;
  assert.equal(field.collide(car).length, 0);
  assert.equal(car.heldPowerup, null);
});

// The player gets a few points for grabbing an item.
test('the player scores for picking up an item', () => {
  const race = new g.Race(track, { opponents: 1, seed: 12 });
  race.onPowerupHit(race.player, { type: 'powerup', kind: 'big', x: 0, y: 0 });
  assert.equal(race.score.pickups, g.POINTS.powerup);
});

// Two races with the same seed put the same pickups in the same places.
test('pickup spawns are the same for the same seed', () => {
  const a = new g.Race(track, { opponents: 6, withPlayer: false, seed: 77 });
  const b = new g.Race(track, { opponents: 6, withPlayer: false, seed: 77 });
  runRace(a, 15);
  runRace(b, 15);
  assert.deepEqual(a.powerups.pickups.map((p) => [p.kind, p.x, p.y]), b.powerups.pickups.map((p) => [p.kind, p.x, p.y]));
});
