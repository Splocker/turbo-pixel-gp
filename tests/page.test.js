'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, LOGIC_SCRIPTS } = require('./helpers/load');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="js\/([\w-]+)\.js"><\/script>/g)].map((m) => m[1]);

test('index.html loads every script in js/, and nothing that is missing', () => {
  const files = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3));
  assert.deepEqual([...scripts].sort(), [...files].sort());
});

test('index.html loads the logic scripts in the order the tests load them', () => {
  const order = scripts.filter((s) => LOGIC_SCRIPTS.includes(s));
  assert.deepEqual(order, LOGIC_SCRIPTS);
  assert.equal(scripts[0], 'util', 'util.js defines the palette and helpers everything else uses');
  assert.equal(scripts[scripts.length - 1], 'game', 'game.js starts the game, so it must load last');
});

// Space fires the held powerup.
test('space uses the held item', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'game_input.js'), 'utf8');
  assert.match(src, /isPressed\('Space'\)\) this\.race\.player\.input\.usePowerup = true/);
});

test('the game has no sound', () => {
  for (const file of fs.readdirSync(path.join(ROOT, 'js'))) {
    const src = fs.readFileSync(path.join(ROOT, 'js', file), 'utf8');
    assert.doesNotMatch(src, /\bAudio|AudioContext|oscillator|\.play\(/i, file);
  }
});

// Driving uses W, A, S and D (key handling lives in game_input.js), never the arrow keys.
test('the game is controlled with WASD', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'game_input.js'), 'utf8');
  for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) assert.match(src, new RegExp(`'${key}'`));
  assert.doesNotMatch(src, /ArrowUp'\)|has\('Arrow/, 'arrow keys are not used for driving');
});
