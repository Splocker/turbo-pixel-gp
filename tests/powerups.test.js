'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, runRace } = require('./helpers/load');

const g = loadGame();
const track = new g.Track();
const HW = g.TRACK_HALF_WIDTH;

// A race whose countdown is already over, so items can be used straight away.
function startedRace(opponents, seed = 1) {
  const race = new g.Race(track, { opponents, seed });
  race.countdown = 0;
  race.running = true;
  return race;
}

function driveOnto(car, pickup) {
  car.place(pickup.x, pickup.y, Math.atan2(track.ty[pickup.idx], track.tx[pickup.idx]));
  car.idx = pickup.idx;
}

// The story's rule: at least half as many powerups on the track as racers, at all times.
test('there are always half as many pickups as cars on the track, rounded up', () => {
  for (const opponents of [1, 4, 9, 20]) {
    const race = new g.Race(track, { opponents, withPlayer: false, seed: 5 });
    const wanted = Math.ceil(race.cars.length / 2);
    assert.equal(race.pickups.length, wanted, `${race.cars.length} cars at the start`);
    for (let t = 0; t < 25; t++) {
      runRace(race, 1);
      assert.equal(race.pickups.length, wanted, `${race.cars.length} cars after ${t + 1}s`);
    }
  }
});

// Collecting puts the item in the car's single slot and a replacement appears at once.
test('collecting a pickup fills the item slot and a new pickup spawns straight away', () => {
  const race = startedRace(4);
  const car = race.player, pickup = race.pickups[0];
  driveOnto(car, pickup);
  assert.equal(g.collectPickups(race, car), pickup);
  assert.equal(car.heldItem, pickup.type);
  assert.ok(!race.pickups.includes(pickup), 'the collected pickup is gone');
  assert.equal(race.pickups.length, Math.ceil(race.cars.length / 2), 'replaced right away');
});

// One item at a time: a full slot means the pickup is left for someone else.
test('a car that already holds an item drives straight through pickups', () => {
  const race = startedRace(4);
  const car = race.player, pickup = race.pickups[0];
  car.heldItem = 'banana';
  driveOnto(car, pickup);
  assert.equal(g.collectPickups(race, car), null);
  assert.equal(car.heldItem, 'banana');
  assert.ok(race.pickups.includes(pickup));
});

// Finished cars, including the player on autopilot, are out of the item game.
test('a car that has finished no longer collects pickups', () => {
  const race = startedRace(4);
  const car = race.player, pickup = race.pickups[0];
  car.finished = true;
  driveOnto(car, pickup);
  assert.equal(g.collectPickups(race, car), null);
  assert.equal(car.heldItem, null);
});

// Normal pickups land anywhere on the road. Swap pickups are sometimes a lure just off it.
test('pickups spawn on the road, except swap pickups which sometimes sit just past the kerb', () => {
  const race = startedRace(20, 8);
  const counts = { banana: 0, big: 0, swap: 0 };
  let swapsOffRoad = 0;
  for (let k = 0; k < 600; k++) {
    const p = g.spawnPickup(race);
    race.pickups.pop();
    counts[p.type]++;
    const lat = Math.abs(track.lateral(p.x, p.y, p.idx));
    if (p.type === 'swap') {
      assert.ok(lat <= HW + g.KERB_WIDTH + g.SWAP_OFF_TRACK_MARGIN + 1e-3, `swap pickup ${lat.toFixed(1)}px out`);
      if (lat > HW + g.KERB_WIDTH) swapsOffRoad++;
    } else {
      assert.ok(lat <= HW - g.PICKUP_ROAD_MARGIN + 1e-3, `${p.type} pickup off the road at ${lat.toFixed(1)}px`);
    }
  }
  assert.ok(swapsOffRoad > 0 && swapsOffRoad < counts.swap, 'some, but not all, swap pickups are off the road');
  assert.ok(counts.banana > counts.big && counts.big > counts.swap, `weights: ${JSON.stringify(counts)}`);
});

// Pickups come from the race's own random numbers, so a seed replays them exactly.
test('the same seed places the same pickups', () => {
  const a = new g.Race(track, { opponents: 6, seed: 42 });
  const b = new g.Race(track, { opponents: 6, seed: 42 });
  assert.deepEqual(a.pickups.map((p) => [p.type, p.x, p.y]), b.pickups.map((p) => [p.type, p.x, p.y]));
});

// Using an item spends it; with an empty slot, or before the lights go green, nothing happens.
test('using an item empties the slot, and nothing happens without one or before the start', () => {
  const race = startedRace(4);
  const car = race.player;
  assert.equal(g.useHeldItem(race, car), false, 'nothing held');
  car.heldItem = 'big';
  assert.equal(g.useHeldItem(race, car), true);
  assert.equal(car.heldItem, null);
  assert.ok(car.isBig);

  const waiting = new g.Race(track, { opponents: 4, seed: 2 });
  waiting.player.heldItem = 'banana';
  assert.equal(g.useHeldItem(waiting, waiting.player), false, 'still on the grid');
  assert.equal(waiting.player.heldItem, 'banana');
});
