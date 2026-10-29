'use strict';

// The game ships as classic browser scripts that share one global scope (no modules, no build).
// This loads the logic scripts into a fresh vm context the same way the page does, so tests
// exercise the real files unchanged.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');

// Game logic in page load order. The drawing and screen scripts (font, sprites, track_canvas,
// track_decor, hud, render, game*) need a canvas/DOM and are not loaded.
const LOGIC_SCRIPTS = [
  'util', 'spline', 'track', 'ai_lanes', 'obstacles', 'car', 'ai_powerups', 'ai', 'physics',
  'powerups', 'powerup_effects', 'roster', 'race_scoring', 'race_effects', 'race', 'scores',
];

// In-memory stand-in for window.localStorage.
function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    clear: () => data.clear(),
  };
}

// Storage that fails like a browser with site data blocked.
function brokenStorage() {
  const fail = () => { throw new Error('SecurityError: storage is disabled'); };
  return { getItem: fail, setItem: fail, removeItem: fail, clear: fail };
}

// Returns an object whose properties resolve to the game's globals (functions, classes, constants).
// Values created inside the vm context come from another realm: compare arrays/objects with
// assert.deepEqual or by value, not assert.deepStrictEqual.
function loadGame({ storage = memoryStorage() } = {}) {
  const context = vm.createContext({ console, localStorage: storage });
  for (const name of LOGIC_SCRIPTS) {
    const file = path.join(ROOT, 'js', name + '.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  return new Proxy({}, {
    get(_, key) {
      if (typeof key !== 'string' || key === 'then') return undefined;
      return vm.runInContext(key, context);
    },
  });
}

// Advances a race by whole seconds of game time at the game's fixed 60 Hz step.
function runRace(race, seconds, dt = 1 / 60) {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    race.update(dt);
    race.skids.length = 0;
  }
}

module.exports = { ROOT, LOGIC_SCRIPTS, loadGame, memoryStorage, brokenStorage, runRace };
