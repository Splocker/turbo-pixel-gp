'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, runRace } = require('./helpers/load');

const g = loadGame();
const track = new g.Track();
const HW = g.TRACK_HALF_WIDTH;
const DT = 1 / 60;

// A race already past the countdown.
function liveRace(opponents, seed = 1) {
  const race = new g.Race(track, { opponents, withPlayer: true, seed });
  runRace(race, g.COUNTDOWN_TIME + DT);
  assert.ok(race.running);
  return race;
}

// Puts a car on the centerline at distance d, at full speed along the road.
function driveAt(car, d, lat = 0) {
  const i = track.indexAt(d);
  car.place(track.x[i] + track.nx[i] * lat, track.y[i] + track.ny[i] * lat, Math.atan2(track.ty[i], track.tx[i]));
  car.idx = i;
  car.vx = track.tx[i] * g.CAR_SPEED;
  car.vy = track.ty[i] * g.CAR_SPEED;
}

// Moves a pickup of the given kind under the car.
function pickupUnder(race, car, kind) {
  const p = race.powerups.items[0];
  p.kind = kind;
  p.x = car.x;
  p.y = car.y;
  return p;
}

test('there are always at least half as many powerups on the track as cars', () => {
  for (const opponents of [1, 4, 9, 20]) {
    const race = new g.Race(track, { opponents, withPlayer: true, seed: opponents });
    const need = Math.ceil(race.cars.length / 2);
    race.player.ai = new g.AIDriver(race.player, track, g.makeRng(7), { speedFactor: 1 });
    let taken = 0;
    race.events.length = 0;
    for (let t = 0; t < 60; t += DT) {
      race.update(DT);
      taken += race.events.filter((e) => e.type === 'powerup').length;
      race.events.length = 0;
      assert.ok(race.powerups.items.length >= need, `${race.powerups.items.length} out with ${race.cars.length} cars`);
    }
    assert.ok(taken > 0, `nobody picked anything up in a minute with ${race.cars.length} cars`);
  }
});

test('powerups spawn anywhere around the lap; only swaps sit off the road, and only just', () => {
  const race = new g.Race(track, { opponents: 4, seed: 3 });
  const pw = race.powerups;
  const seen = [];
  for (let k = 0; k < 600; k++) {
    pw.items.length = 0;
    pw.spawn(race.cars);
    seen.push(pw.items[0]);
  }
  const kinds = new Set(seen.map((p) => p.kind));
  assert.deepEqual([...kinds].sort(), ['banana', 'big', 'swap']);

  const quarters = new Set(seen.map((p) => Math.floor((4 * p.idx) / track.n)));
  assert.equal(quarters.size, 4, 'every part of the lap gets powerups');

  let offRoad = 0;
  for (const p of seen) {
    const lat = Math.abs(track.lateral(p.x, p.y, p.idx));
    if (p.kind !== 'swap') {
      assert.ok(lat + p.r <= HW, `${p.kind} pokes off the road`);
    } else if (lat > HW) {
      offRoad++;
      assert.ok(lat <= HW + g.SWAP_OFF_ROAD_MARGIN, `swap ${lat - HW}px off the road`);
      assert.notEqual(track.surfaceAt(p.x, p.y, p.idx), 'road');
    }
  }
  assert.ok(offRoad > 0, 'some swaps land off the road');
});

test('a banana is held, dropped right behind with SPACE, and spins out the next car to hit it', () => {
  const race = liveRace(2);
  const p = race.player;
  const [ai, other] = race.cars.filter((c) => !c.isPlayer);
  driveAt(p, 1000);
  driveAt(other, 2000);
  pickupUnder(race, p, 'banana');
  race.collectPowerups(p);
  assert.equal(p.item, 'banana');

  // Holding one already: a second banana is left on the track for someone else.
  const second = pickupUnder(race, p, 'banana');
  race.collectPowerups(p);
  assert.ok(race.powerups.items.includes(second));
  second.x = second.y = -1000;

  assert.equal(race.useItem(p), true);
  assert.equal(p.item, null);
  assert.equal(race.useItem(p), false, 'nothing left to use');
  const b = race.powerups.bananas[0];
  const behind = (b.x - p.x) * Math.cos(p.angle) + (b.y - p.y) * Math.sin(p.angle);
  assert.ok(behind < -8 && behind > -20, `dropped ${-behind}px behind`);

  race.collectPowerups(p); // the dropper doesn't slip on it straight away
  assert.equal(race.powerups.bananas.length, 1);

  driveAt(ai, 1000);
  ai.x = b.x;
  ai.y = b.y;
  const heading = Math.atan2(ai.vy, ai.vx);
  race.collectPowerups(ai);
  assert.equal(race.powerups.bananas.length, 0, 'used up by the first car to hit it');
  assert.ok(ai.slipping && ai.spinTimer > 0);
  ai.update(0.2);
  assert.ok(Math.abs(g.wrapAngle(Math.atan2(ai.vy, ai.vx) - heading)) < 1e-9, 'keeps its trajectory');
  assert.equal(race.score.bumps, g.POINTS.banana, 'the player scores for a rival on their banana');
});

test('a big car squashes bananas without slipping', () => {
  const race = liveRace(1);
  const [ai] = race.cars.filter((c) => !c.isPlayer);
  driveAt(race.player, 1000);
  race.player.item = 'banana';
  race.useItem(race.player);
  driveAt(ai, 1000);
  pickupUnder(race, ai, 'big');
  race.collectPowerups(ai);
  assert.equal(ai.bigTimer, g.BIG_TIME);
  const b = race.powerups.bananas[0];
  ai.x = b.x;
  ai.y = b.y;
  race.collectPowerups(ai);
  assert.equal(race.powerups.bananas.length, 0);
  assert.equal(ai.slipping, false);
  assert.equal(ai.spinTimer, 0);
});

test('BIG lasts seven seconds; another BIG tops it up without shrinking', () => {
  const race = liveRace(1);
  const p = race.player;
  driveAt(p, 1000);
  pickupUnder(race, p, 'big');
  race.collectPowerups(p);
  assert.equal(g.BIG_TIME, 7);
  assert.equal(p.bigTimer, 7);
  for (let t = 0; t < 3; t += DT) p.update(DT);
  const scale = p.scale;
  pickupUnder(race, p, 'big');
  race.collectPowerups(p);
  assert.equal(p.scale, scale, 'no shrink-and-regrow');
  assert.ok(p.bigTimer > 6);
});

test('swap with 1st trades places with the leader, keeping speed and heading on the road', () => {
  const race = liveRace(4);
  const p = race.player;
  const leader = race.standings[0];
  assert.notEqual(leader, p);
  driveAt(leader, 2200, 10);
  leader.totalDist = 2200;
  leader.lapsCompleted = 0;
  driveAt(p, 400, -20);
  p.totalDist = 400;
  p.vx *= 0.5;
  p.vy *= 0.5;
  p.angle += 0.3; // a bit crossed up relative to the road
  const relAngle = (car) => g.wrapAngle(car.angle - Math.atan2(track.ty[car.idx], track.tx[car.idx]));
  const before = {
    p: { x: p.x, y: p.y, speed: p.speed, rel: relAngle(p), dist: p.totalDist },
    l: { x: leader.x, y: leader.y, speed: leader.speed, rel: relAngle(leader), dist: leader.totalDist },
  };
  race.updatePositions();

  pickupUnder(race, p, 'swap');
  race.collectPowerups(p);
  assert.equal(p.position, 1);
  assert.equal(race.standings[0], p);
  assert.equal(p.x, before.l.x);
  assert.equal(p.y, before.l.y);
  assert.equal(leader.x, before.p.x);
  assert.equal(p.totalDist, before.l.dist);
  assert.equal(leader.totalDist, before.p.dist);
  assert.ok(Math.abs(p.speed - before.p.speed) < 1e-6, 'keeps its own speed');
  assert.ok(Math.abs(leader.speed - before.l.speed) < 1e-6);
  assert.ok(Math.abs(g.wrapAngle(relAngle(p) - before.p.rel)) < 1e-4, 'same heading relative to the road');
  assert.ok(Math.abs(g.wrapAngle(relAngle(leader) - before.l.rel)) < 1e-4);
  // The car was pointing 0.3 rad off its direction of travel, and still is.
  assert.ok(Math.abs(g.wrapAngle(Math.atan2(p.vy, p.vx) - p.angle) + 0.3) < 1e-4, 'same trajectory');
});

test('the leader leaves swaps on the track, and finished cars pick nothing up', () => {
  const race = liveRace(2);
  const leader = race.standings[0];
  const p = pickupUnder(race, leader, 'swap');
  race.collectPowerups(leader);
  assert.ok(race.powerups.items.includes(p));
  assert.equal(leader.position, 1);

  const done = race.standings[1];
  done.finished = true;
  pickupUnder(race, done, 'big');
  race.collectPowerups(done);
  assert.equal(done.isBig, false);
});

test('AI drivers drop a held banana on a car close behind', () => {
  const race = liveRace(1);
  const [ai] = race.cars.filter((c) => !c.isPlayer);
  driveAt(ai, 1000);
  driveAt(race.player, 1000 - 40);
  ai.item = 'banana';
  ai.ai.update(DT, race);
  assert.equal(ai.item, null);
  assert.equal(race.powerups.bananas.length, 1);
  assert.equal(race.powerups.bananas[0].owner, ai);
});

test('nothing can be used before the lights go green', () => {
  const race = new g.Race(track, { opponents: 1, seed: 1 });
  race.player.item = 'banana';
  assert.equal(race.useItem(race.player), false);
  assert.equal(race.player.item, 'banana');
  assert.ok(race.powerups.items.length >= g.POWERUP_MIN, 'pickups are out on the grid already');
});
