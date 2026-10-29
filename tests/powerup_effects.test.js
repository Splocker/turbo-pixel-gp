'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, runRace } = require('./helpers/load');

const g = loadGame();
const track = new g.Track();
const DT = 1 / 60;

function carAt(x, y, angle, speed, opts = {}) {
  const car = new g.Car({ name: 'T', body: '#000000', stripe: '#ffffff', ...opts });
  car.place(x, y, angle);
  car.vx = Math.cos(angle) * speed;
  car.vy = Math.sin(angle) * speed;
  return car;
}

function emptyField() {
  return new g.PowerupField(track, g.makeRng(1), new g.Obstacles(track));
}

// A race that has started, with the player holding the given item.
function raceWithItem(kind, opponents = 3) {
  const race = new g.Race(track, { opponents, seed: 21 });
  runRace(race, g.COUNTDOWN_TIME + 0.1);
  race.player.heldPowerup = kind;
  return race;
}

// A dropped banana lands just behind the car that dropped it.
test('a banana drops right behind the car', () => {
  const field = emptyField();
  const car = carAt(500, 500, 0, 200);
  field.dropBanana(car);
  const banana = field.bananas[0];
  assert.ok(banana.x < car.x && Math.abs(banana.y - car.y) < 1e-6, 'behind a car facing +x');
  assert.equal(banana.ownerCar, car);
});

// The next car to hit the banana spins out but keeps sliding in the direction it was travelling.
test('hitting a banana spins the car out along its current trajectory', () => {
  const field = emptyField();
  field.bananas.push({ x: 500, y: 500, ownerCar: null, age: 5 });
  const car = carAt(500, 500, 0, 200);
  const hits = field.collide(car);
  assert.equal(hits[0].type, 'banana');
  assert.equal(field.bananas.length, 0, 'the banana is used up');
  assert.ok(car.spinTimer > 0 && car.spinKeepsTrajectory);
  for (let i = 0; i < 30; i++) car.update(DT);
  assert.ok(Math.abs(g.wrapAngle(car.angle)) > 1, 'the car body has rotated');
  assert.ok(Math.abs(car.vy) < 1e-6 && car.vx > 100, 'still sliding straight along +x');
});

// The car that dropped a banana doesn't slip on it as it lands, but can after the grace period.
test('the dropper is safe from their own banana only briefly', () => {
  const field = emptyField();
  const car = carAt(500, 500, 0, 0);
  field.bananas.push({ x: 500, y: 500, ownerCar: car, age: 0 });
  assert.equal(field.collide(car).length, 0, 'safe while it lands');
  field.update(g.BANANA_OWNER_GRACE + 0.1);
  assert.equal(field.collide(car)[0].type, 'banana', 'slips on it later');
});

// A big car runs over a banana, squashing it without spinning.
test('a big car squashes bananas unharmed', () => {
  const field = emptyField();
  field.bananas.push({ x: 500, y: 500, ownerCar: null, age: 5 });
  const car = carAt(500, 500, 0, 200);
  car.bigTimer = g.BIG_TIME;
  assert.equal(field.collide(car)[0].type, 'bananaSquash');
  assert.equal(car.spinTimer, 0);
  assert.equal(field.bananas.length, 0);
});

// Using Big makes the car twice the size for 7 seconds, then it shrinks back.
test('big lasts seven seconds', () => {
  const race = raceWithItem('big');
  const p = race.player;
  assert.ok(g.usePowerup(p, race));
  assert.equal(p.heldPowerup, null, 'item used up');
  assert.ok(p.isBig);
  assert.equal(p.sizeScale, 2);
  for (let t = 0; t < 6.9; t += DT) p.update(DT);
  assert.ok(p.isBig, 'still big just before 7s');
  for (let t = 0; t < 0.2; t += DT) p.update(DT);
  assert.ok(!p.isBig, 'normal size after 7s');
  assert.equal(p.sizeScale, 1);
});

// Swap trades race progress with the leader instantly; each car keeps its own heading and speed.
test('swap with 1st trades places but keeps each car moving the same way', () => {
  const race = raceWithItem('swap');
  const p = race.player;
  const leader = race.standings[0];
  assert.notEqual(leader, p);
  const before = { pX: p.x, pDist: p.totalDist, pVx: p.vx, pAngle: p.angle, lX: leader.x, lDist: leader.totalDist, lVx: leader.vx };
  assert.ok(g.usePowerup(p, race));
  assert.equal(p.position, 1, 'the player is now first');
  assert.equal(p.x, before.lX);
  assert.equal(p.totalDist, before.lDist);
  assert.equal(leader.x, before.pX);
  assert.equal(leader.totalDist, before.pDist);
  assert.equal(p.vx, before.pVx, 'player keeps its own velocity');
  assert.equal(p.angle, before.pAngle, 'player keeps its own heading');
  assert.equal(leader.vx, before.lVx, 'old leader keeps its own velocity');
  assert.ok(race.events.some((e) => e.type === 'swap' && e.car === p && e.leader === leader));
});

// Using Swap while already in first does nothing, and the item is kept for later.
test('swap from first place keeps the item', () => {
  const race = raceWithItem('swap');
  const p = race.player;
  p.totalDist += 10000;
  race.updatePositions();
  assert.equal(g.usePowerup(p, race), false);
  assert.equal(p.heldPowerup, 'swap');
  assert.ok(race.popups.some((q) => q.text === 'ALREADY 1ST!'));
});

// Pressing the use button during a race drops the held banana behind the player.
test('the race fires the item when the player asks for it', () => {
  const race = raceWithItem('banana');
  race.player.input.usePowerup = true;
  race.update(DT);
  assert.equal(race.player.heldPowerup, null);
  assert.equal(race.powerups.bananas.length, 1);
  assert.equal(race.player.input.usePowerup, false, 'the request is cleared once handled');
});

// The player scores when a rival slips on the player's banana, but not for slipping on their own.
test('rivals slipping on the player banana score points', () => {
  const race = raceWithItem('banana');
  const rival = race.cars.find((c) => !c.isPlayer);
  race.onPowerupHit(rival, { type: 'banana', ownerCar: race.player, x: 0, y: 0 });
  assert.equal(race.score.bumps, g.POINTS.bananaHit);
  race.onPowerupHit(race.player, { type: 'banana', ownerCar: race.player, x: 0, y: 0 });
  assert.equal(race.score.bumps, g.POINTS.bananaHit);
});

// AI drivers drop a banana on a car right behind them, and only swap when they are 3rd or worse.
test('AI item rules: banana on a tailgater, swap only from the back', () => {
  const race = raceWithItem('banana');
  const [ai, other] = race.cars.filter((c) => !c.isPlayer);
  Object.assign(ai, { x: 500, y: 500, angle: 0, heldPowerup: 'banana', heldPowerupTime: 0 });
  Object.assign(other, { x: 470, y: 500 });
  assert.ok(g.aiWantsToUsePowerup(ai, race), 'drops on the car behind');
  Object.assign(other, { x: 900, y: 900 });
  for (const c of race.cars) if (c !== ai) c.x += 2000;
  assert.ok(!g.aiWantsToUsePowerup(ai, race), 'holds it with nobody behind');

  Object.assign(ai, { heldPowerup: 'swap', heldPowerupTime: 5, position: 2 });
  assert.ok(!g.aiWantsToUsePowerup(ai, race), 'no swap from 2nd');
  ai.position = 3;
  assert.ok(g.aiWantsToUsePowerup(ai, race), 'swaps from 3rd');
});
