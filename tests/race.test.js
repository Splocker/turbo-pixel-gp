'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, runRace } = require('./helpers/load');

const g = loadGame();
const track = new g.Track();

// A race with the player driven by the AI at full player speed (a stand-in for a decent human).
function autopilotRace(opponents, seed) {
  const race = new g.Race(track, { opponents, withPlayer: true, seed });
  race.player.ai = new g.AIDriver(race.player, track, g.makeRng(seed + 1), { speedFactor: 1 });
  return race;
}

function runUntilDone(race, limit = 150) {
  for (let t = 0; t < limit && !race.allFinished; t += 1) runRace(race, 1);
}

test('the race waits for the countdown, then announces GO', () => {
  const race = new g.Race(track, { opponents: 4, seed: 1 });
  const start = race.player.x;
  runRace(race, g.COUNTDOWN_TIME - 0.1);
  assert.equal(race.running, false);
  assert.equal(race.player.x, start, 'nobody moves before the lights');
  runRace(race, 0.2);
  assert.equal(race.running, true);
  assert.ok(race.events.some((e) => e.type === 'go'));
});

test('the grid: player at the back of a small field, never further back than the fourth row', () => {
  const small = new g.Race(track, { opponents: 3, seed: 2 });
  assert.equal(small.cars.length, 4);
  assert.equal(small.player.position, 4);

  const big = new g.Race(track, { opponents: g.MAX_OPPONENTS, seed: 2 });
  assert.equal(big.cars.length, g.MAX_OPPONENTS + 1);
  assert.equal(big.player.position, g.PLAYER_MAX_SLOT + 1);
  const names = new Set(big.cars.map((c) => c.name));
  assert.equal(names.size, big.cars.length, 'every driver has a different name');
});

test('a full race counts three laps, finishes and pays out every bonus', () => {
  const race = autopilotRace(0, 3);
  runUntilDone(race);
  const p = race.player;
  assert.ok(p.finished);
  assert.equal(p.lapTimes.length, g.RACE_LAPS);
  assert.equal(race.events.filter((e) => e.type === 'finish').length, 1);
  assert.ok(p.finishTime < race.parTime, `finish ${p.finishTime.toFixed(1)}s vs par ${race.parTime.toFixed(1)}s`);
  assert.equal(race.score.place, g.PLACE_BONUS[0]);
  assert.equal(race.score.field, 0);
  assert.ok(race.score.time > 0);
  assert.ok(race.score.pickups > 0, 'drove through coins or boosts');
  assert.equal(race.scoreTotal, race.score.bumps + race.score.pickups + race.score.place + race.score.field + race.score.time);
});

test('progress can only creep forward: cutting across the infield earns nothing', () => {
  const race = new g.Race(track, { opponents: 0, seed: 4 });
  const p = race.player;
  const before = p.totalDist, idx = p.idx;
  const far = track.wrap(idx + Math.floor(track.n / 2));
  p.place(track.x[far], track.y[far], 0);
  race.updateProgress(p, 1 / 60);
  assert.ok(p.totalDist - before <= 20 * track.spacing, 'no jump to the far side of the lap');
  assert.ok(p.lostTimer > 0);
  race.updateProgress(p, 3.1);
  assert.equal(p.lostTimer, 0, 'reset after being lost');
  assert.ok(Math.hypot(p.x - track.x[p.idx], p.y - track.y[p.idx]) <= g.TRACK_HALF_WIDTH, 'back on the road');
});

test('bumping scores for the player, with combos and a short cooldown', () => {
  const race = new g.Race(track, { opponents: 2, seed: 5 });
  const [ai1, ai2] = race.cars.filter((c) => !c.isPlayer);
  const p = race.player;
  const bump = (a, b, impact) => race.scoreBump({ a, b, impact, x: 0, y: 0 });

  bump(ai1, ai2, 200);
  assert.equal(race.score.bumps, 0, 'AI-on-AI bumps score nothing');
  bump(p, ai1, g.MIN_BUMP_IMPACT - 1);
  assert.equal(race.score.bumps, 0, 'too gentle to count');

  bump(p, ai1, 50);
  assert.equal(race.score.bumps, g.POINTS.bump);
  bump(ai2, p, 50);
  assert.equal(race.score.bumps, g.POINTS.bump, 'cooldown blocks instant repeats');

  race.bumpCooldown = 0;
  bump(ai2, p, 50);
  assert.equal(race.score.bumps, g.POINTS.bump * 3, 'second bump in the window is x2');
  race.bumpCooldown = 0;
  bump(p, ai1, g.BIG_BUMP_IMPACT);
  assert.equal(race.score.bumps, g.POINTS.bump * 3 + g.POINTS.bigBump * 3, 'big hit at x3');
  race.bumpCooldown = 0;
  bump(p, ai1, 50);
  assert.equal(race.combo, g.COMBO_MAX, 'combo is capped');
  assert.ok(race.popups.some((q) => q.text === 'COMBO X3!'));
});

test('pickups score only for the player and only before the finish', () => {
  const race = new g.Race(track, { opponents: 1, seed: 6 });
  const ai = race.cars.find((c) => !c.isPlayer);
  race.onObstacleHit(ai, { type: 'coin', x: 0, y: 0 });
  assert.equal(race.score.pickups, 0);
  race.onObstacleHit(race.player, { type: 'coin', x: 0, y: 0 });
  race.onObstacleHit(race.player, { type: 'oil', x: 0, y: 0 });
  assert.equal(race.score.pickups, g.POINTS.coin, 'oil is not a pickup');
  race.player.finished = true;
  race.onObstacleHit(race.player, { type: 'boost', x: 0, y: 0 });
  assert.equal(race.score.pickups, g.POINTS.coin);
});

test('finish bonuses: place, rivals beaten and time under par', () => {
  const race = new g.Race(track, { opponents: 4, seed: 7 });
  const p = race.player;
  p.finishOrder = 2;
  p.finishTime = race.parTime - 10;
  race.awardFinish(p);
  assert.equal(race.score.place, g.PLACE_BONUS[1]);
  assert.equal(race.score.field, 3 * g.FIELD_BONUS);
  assert.equal(race.score.time, 10 * g.TIME_BONUS);

  p.finishOrder = 5;
  p.finishTime = race.parTime + 5;
  race.awardFinish(p);
  assert.equal(race.score.place, g.PLACE_BONUS[4]);
  assert.equal(race.score.time, 0, 'no negative time bonus');
  p.finishOrder = 9;
  race.awardFinish(p);
  assert.equal(race.score.place, g.PLACE_BONUS_MIN, 'every finish pays something');
});

test('edge assist turns the player back toward the road only when heading off it', () => {
  const race = new g.Race(track, { opponents: 0, seed: 8 });
  const p = race.player, i = track.indexAt(1000);
  const heading = Math.atan2(track.ty[i], track.tx[i]);
  const edge = g.TRACK_HALF_WIDTH - 2;
  const setup = (angle) => {
    p.place(track.x[i] + track.nx[i] * edge, track.y[i] + track.ny[i] * edge, angle);
    p.idx = i;
    p.vx = Math.cos(angle) * g.CAR_SPEED;
    p.vy = Math.sin(angle) * g.CAR_SPEED;
  };
  setup(heading + 0.4); // on the right edge, pointing further right
  race.assistToRoad(p, 0.1);
  assert.ok(Math.abs(g.wrapAngle(p.angle - (heading + 0.4)) + g.EDGE_ASSIST_RATE * 0.1) < 1e-9, 'nudged back');
  setup(heading - 0.4); // on the right edge, already heading back in
  race.assistToRoad(p, 0.1);
  assert.equal(p.angle, g.wrapAngle(heading - 0.4), 'left alone');
});

test('the same seed replays the same race', () => {
  const a = new g.Race(track, { opponents: 6, withPlayer: false, seed: 99 });
  const b = new g.Race(track, { opponents: 6, withPlayer: false, seed: 99 });
  runRace(a, 20);
  runRace(b, 20);
  assert.deepEqual(a.standings.map((c) => c.name), b.standings.map((c) => c.name));
  assert.deepEqual(a.cars.map((c) => c.x), b.cars.map((c) => c.x));
});

for (const opponents of [1, 4, 20]) {
  test(`AI-only race with ${opponents} cars: everyone finishes and stays on the road`, () => {
    const race = new g.Race(track, { opponents, withPlayer: false, seed: 1234 });
    let samples = 0, onGrass = 0;
    for (let t = 0; t < 150 && !race.allFinished; t += 1) {
      runRace(race, 1);
      for (const c of race.cars) {
        samples++;
        if (c.surface === 'grass') onGrass++;
        assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y), `${c.name} position is not a number`);
      }
    }
    assert.ok(race.allFinished, `still racing after ${race.time.toFixed(0)}s`);
    assert.ok(race.time < 120);
    assert.ok(onGrass / samples < 0.1, `AI on grass ${(100 * onGrass / samples).toFixed(1)}% of the time`);
    const orders = race.cars.map((c) => c.finishOrder).sort((x, y) => x - y);
    assert.deepEqual(orders, race.cars.map((_, k) => k + 1), 'finish order is 1..N');
  });
}

test('difficulty: a clean driver at player speed nearly always makes the podium', () => {
  const places = [];
  for (const seed of [11, 22, 33, 44, 55]) {
    const race = autopilotRace(4, seed);
    runUntilDone(race);
    assert.ok(race.player.finished);
    places.push(race.player.finishOrder);
  }
  const podiums = places.filter((p) => p <= 3).length;
  assert.ok(podiums >= 4, `places ${places.join(', ')}`);
  assert.ok(places.includes(1), 'wins at least one');
});
