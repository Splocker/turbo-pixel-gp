'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./helpers/load');

const g = loadGame();
const track = new g.Track();
const DT = 1 / 60;
const STRAIGHT = track.indexAt(track.length - 400); // on the start/finish straight

function startedRace(opponents = 3, seed = 1) {
  const race = new g.Race(track, { opponents, seed });
  race.countdown = 0;
  race.running = true;
  race.pickups.length = 0; // keep pickups out of the way
  return race;
}

// Puts a car on the straight at an offset along the lap, driving forward at full speed.
function placeOnStraight(car, ahead = 0) {
  const i = track.wrap(STRAIGHT + ahead);
  car.place(track.x[i], track.y[i], Math.atan2(track.ty[i], track.tx[i]));
  car.idx = i;
  car.vx = track.tx[i] * g.CAR_SPEED;
  car.vy = track.ty[i] * g.CAR_SPEED;
  return car;
}

// Puts a car right on top of a banana.
function onBanana(car, banana) {
  car.x = banana.x;
  car.y = banana.y;
  return car;
}

// Deploying drops the banana right behind the car, not in front of it.
test('a dropped banana lands just behind the car', () => {
  const race = startedRace();
  const car = placeOnStraight(race.player);
  const banana = g.dropBanana(race, car);
  assert.ok(race.bananas.includes(banana));
  const dx = banana.x - car.x, dy = banana.y - car.y;
  assert.ok(dx * Math.cos(car.angle) + dy * Math.sin(car.angle) < 0, 'behind the car');
  assert.ok(Math.hypot(dx, dy) < 20, 'close behind');
});

// The dropper gets a short grace period so they don't spin on their own banana at once.
test('the car that dropped a banana is safe from it for a moment, then it can be hit', () => {
  const race = startedRace();
  const car = placeOnStraight(race.player);
  const banana = g.dropBanana(race, car);
  onBanana(car, banana);
  assert.equal(g.hitBananas(race, car).length, 0, 'safe while the grace lasts');
  g.updateBananas(race, g.BANANA_OWNER_GRACE + 0.01);
  assert.equal(g.hitBananas(race, car).length, 1, 'own banana counts after the grace');
});

// A banana spin keeps the car sliding along its path while it rotates out of control.
test('hitting a banana spins the car out while it keeps sliding the way it was going', () => {
  const race = startedRace();
  const dropper = placeOnStraight(race.cars[0], 20);
  const victim = placeOnStraight(race.cars[1]);
  const banana = g.dropBanana(race, dropper);
  onBanana(victim, banana);
  const heading = Math.atan2(victim.vy, victim.vx), speed = victim.speed, angle = victim.angle;
  assert.equal(g.hitBananas(race, victim).length, 1);
  assert.ok(Math.abs(victim.spinTimer - g.BANANA_SPIN_TIME) < 1e-9);

  victim.input.steer = 1; // steering is ignored while spinning
  for (let t = 0; t < 0.6; t += DT) victim.update(DT);
  assert.ok(Math.abs(g.wrapAngle(Math.atan2(victim.vy, victim.vx) - heading)) < 1e-6, 'same direction of travel');
  assert.ok(victim.speed > speed * 0.75, `still sliding fast (${victim.speed.toFixed(0)} of ${speed.toFixed(0)})`);
  assert.ok(Math.abs(g.wrapAngle(victim.angle - angle)) > 1, 'the car spun round');
});

// One hit only: the banana is used up.
test('a banana works once and is removed when hit', () => {
  const race = startedRace();
  const dropper = placeOnStraight(race.cars[0], 20);
  const banana = g.dropBanana(race, dropper);
  onBanana(placeOnStraight(race.cars[1]), banana);
  g.hitBananas(race, race.cars[1]);
  assert.ok(!race.bananas.includes(banana));
  onBanana(placeOnStraight(race.cars[2]), banana);
  assert.equal(g.hitBananas(race, race.cars[2]).length, 0);
  assert.equal(race.cars[2].spinTimer, 0);
});

// Big cars are invincible: they flatten bananas without spinning.
test('a Big car squashes bananas and keeps driving', () => {
  const race = startedRace();
  const banana = g.dropBanana(race, placeOnStraight(race.cars[0], 20));
  const big = onBanana(placeOnStraight(race.cars[1]), banana);
  g.activateBig(big);
  assert.equal(g.hitBananas(race, big).length, 1);
  assert.equal(big.spinTimer, 0);
  assert.ok(!race.bananas.includes(banana), 'squashed');
});

// Landing a banana on a rival pays the player like a bump does.
test('the player scores when their banana spins out a rival, but not for their own spin', () => {
  const race = startedRace();
  const player = placeOnStraight(race.player, 20);
  const rival = race.cars.find((c) => !c.isPlayer);
  onBanana(placeOnStraight(rival), g.dropBanana(race, player));
  g.hitBananas(race, rival);
  assert.equal(race.score.bumps, g.POINTS.bananaHit);

  const own = g.dropBanana(race, player);
  g.updateBananas(race, 1);
  onBanana(player, own);
  g.hitBananas(race, player);
  assert.equal(race.score.bumps, g.POINTS.bananaHit, 'no points for slipping on your own');
});

// Bananas have no timer and no cap.
test('bananas stay on the track until someone hits them', () => {
  const race = startedRace();
  const car = placeOnStraight(race.player);
  for (let k = 0; k < 30; k++) g.dropBanana(race, car);
  g.updateBananas(race, 600);
  assert.equal(race.bananas.length, 30);
});
