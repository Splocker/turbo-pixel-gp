'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./helpers/load');

const g = loadGame();
const track = new g.Track();
const DT = 1 / 60;
const STRAIGHT = track.indexAt(track.length - 400); // on the start/finish straight
const CORNER = track.indexAt(1200); // the track runs in a clearly different direction here

function startedRace(opponents = 3, seed = 1) {
  const race = new g.Race(track, { opponents, seed });
  race.countdown = 0;
  race.running = true;
  race.pickups.length = 0;
  return race;
}

const tangent = (i) => Math.atan2(track.ty[i], track.tx[i]);

// Sets a car at a sample index with its lap progress, a heading offset from the road, and a
// velocity at its own offset from the road.
function setAt(car, i, totalDist, headingOffset = 0, velocityOffset = 0, speed = 200) {
  car.place(track.x[i], track.y[i], tangent(i) + headingOffset);
  car.idx = i;
  car.totalDist = totalDist;
  car.lapsCompleted = Math.max(0, Math.floor(totalDist / track.length));
  car.lapTimes = Array.from({ length: car.lapsCompleted }, () => 30);
  car.vx = Math.cos(tangent(i) + velocityOffset) * speed;
  car.vy = Math.sin(tangent(i) + velocityOffset) * speed;
}

// Puts the player at the back and one rival clearly in the lead.
function playerBehindLeader(race) {
  const leader = race.cars.find((c) => !c.isPlayer);
  for (const c of race.cars) if (c !== leader && c !== race.player) setAt(c, STRAIGHT, 0);
  setAt(race.player, STRAIGHT, 400 - track.length);
  setAt(leader, CORNER, 1200 + track.length * 2);
  race.updatePositions();
  return { player: race.player, leader };
}

// The core of the powerup: positions and lap progress are traded, so places swap too.
test('swap trades track position and race progress with the leader, so the standings flip', () => {
  const race = startedRace();
  const { player, leader } = playerBehindLeader(race);
  const mine = { x: player.x, y: player.y, totalDist: player.totalDist, laps: player.lapsCompleted };
  const theirs = { x: leader.x, y: leader.y, totalDist: leader.totalDist, laps: leader.lapsCompleted };
  assert.equal(g.findSwapTarget(race, player), leader);
  assert.equal(g.swapWithLeader(race, player), true);
  assert.deepEqual([player.x, player.y, player.totalDist, player.lapsCompleted], [theirs.x, theirs.y, theirs.totalDist, theirs.laps]);
  assert.deepEqual([leader.x, leader.y, leader.totalDist, leader.lapsCompleted], [mine.x, mine.y, mine.totalDist, mine.laps]);
  assert.equal(player.position, 1);
  assert.equal(race.standings[0], player);
});

// "Preserving trajectory and velocity": speed is kept, and so are the heading and the drift
// angle relative to the road, so the car doesn't arrive pointing into a wall.
test('swap keeps each car\'s speed and its heading relative to the road', () => {
  const race = startedRace();
  const { player, leader } = playerBehindLeader(race);
  setAt(player, STRAIGHT, player.totalDist, 0.2, 0.3, 180);
  setAt(leader, CORNER, leader.totalDist, -0.1, 0.05, 240);
  g.swapWithLeader(race, player);
  const near = (a, b) => Math.abs(g.wrapAngle(a - b)) < 1e-4;
  assert.ok(near(player.angle - tangent(CORNER), 0.2), 'player heading vs road kept');
  assert.ok(near(Math.atan2(player.vy, player.vx) - tangent(CORNER), 0.3), 'player drift vs road kept');
  assert.ok(Math.abs(player.speed - 180) < 1e-3, 'player speed kept');
  assert.ok(near(leader.angle - tangent(STRAIGHT), -0.1), 'leader heading vs road kept');
  assert.ok(Math.abs(leader.speed - 240) < 1e-3, 'leader speed kept');
});

// Only position and progress move. Everything else stays with its own car.
test('swap leaves items, Big and spins with their own cars', () => {
  const race = startedRace();
  const { player, leader } = playerBehindLeader(race);
  g.activateBig(leader);
  player.heldItem = 'banana';
  g.swapWithLeader(race, player);
  assert.ok(leader.isBig && !player.isBig);
  assert.equal(player.heldItem, 'banana');
});

// The leader can't swap with themselves: the item is simply wasted.
test('using swap in first place does nothing, but the item is used up', () => {
  const race = startedRace();
  const { leader } = playerBehindLeader(race);
  const where = { x: leader.x, y: leader.y };
  leader.heldItem = 'swap';
  assert.equal(g.useHeldItem(race, leader), true);
  assert.equal(leader.heldItem, null);
  assert.deepEqual({ x: leader.x, y: leader.y }, where);
});

// A finished car is out of the race, so swap targets the best car still racing.
test('swap skips a leader who has already finished', () => {
  const race = startedRace();
  const { player, leader } = playerBehindLeader(race);
  leader.finished = true;
  leader.finishOrder = 1;
  race.updatePositions();
  const target = g.findSwapTarget(race, player);
  assert.notEqual(target, leader);
  assert.ok(!target.finished);
});

// Jumping two laps ahead by swapping is not the same as driving them: no lap announcements.
test('swapping onto a later lap does not announce extra laps', () => {
  const race = startedRace();
  const { player } = playerBehindLeader(race);
  race.events.length = 0;
  g.swapWithLeader(race, player);
  race.updateProgress(player, DT);
  assert.equal(race.events.filter((e) => e.type === 'lap').length, 0);
  assert.equal(player.lapTimes.length, player.lapsCompleted, 'lap times still match laps done');
});
