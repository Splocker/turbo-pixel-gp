'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { bootPage } = require('./helpers/fakeDom');

// Boots the real page, then walks the menus into a race so every draw path runs at least once.
test('the whole game boots and draws the title, setup, race and pause screens without errors', () => {
  const page = bootPage();
  page.frames(30);
  assert.equal(page.game().state, 'title');

  page.tap('Enter');
  assert.equal(page.game().state, 'setup');
  page.tap('KeyD');

  page.tap('Enter');
  assert.equal(page.game().state, 'race');
  page.keyDown('KeyW');
  page.frames(60 * 5);
  assert.ok(page.game().race.running, 'the lights went green');
  assert.ok(page.game().race.player.totalDist > 0, 'the player drove forwards');

  page.tap('Escape');
  assert.equal(page.game().state, 'paused');
  page.frames(5);
  page.tap('Enter');
  assert.equal(page.game().state, 'race');
});

// Each item is handed to the player and fired with Space, so the item slot, pickups, bananas,
// a double-size Big car, its countdown bar and the swap flash are all drawn.
test('powerups are used with Space and draw in the world and on the HUD without errors', () => {
  const page = bootPage();
  page.tap('Enter');
  page.tap('Enter');
  page.keyDown('KeyW');
  page.frames(60 * 4);
  const game = page.game(), race = game.race, player = race.player;
  assert.ok(race.pickups.length > 0, 'pickups are on the track');

  player.heldItem = 'banana';
  page.frames(2);
  page.tap('Space');
  assert.equal(player.heldItem, null);
  assert.equal(race.bananas.length, 1, 'banana dropped');

  player.heldItem = 'big';
  page.tap('Space');
  assert.ok(player.isBig);
  page.frames(30);

  for (const car of race.cars) if (car !== player) car.totalDist = player.totalDist - 500;
  race.cars.find((c) => c !== player).totalDist = player.totalDist + 500;
  player.heldItem = 'swap';
  page.frames(1);
  page.tap('Space');
  page.frames(1);
  assert.equal(player.position, 1, 'swapped into the lead');
  assert.equal(game.flash.text, 'SWAP!');
  page.frames(30);
});

// Finishing is forced so the result, name-entry and high-score screens are drawn too.
test('the finish, results, name entry and high score screens draw without errors', () => {
  const page = bootPage();
  page.tap('Enter');
  page.tap('Enter');
  page.frames(60 * 4);
  const game = page.game();
  const player = game.race.player;
  player.totalDist = game.race.track.length * 3 + 1;
  page.frames(2);
  assert.equal(game.state, 'finished');
  page.frames(60 * 2);
  page.tap('Enter');
  assert.equal(game.state, 'results');
  page.frames(60 * 3);
  page.tap('Enter');
  assert.ok(['nameEntry', 'scores'].includes(game.state));
  page.tap('KeyA', 'a');
  page.tap('Enter');
  page.frames(5);
  assert.equal(game.state, 'scores');
});
