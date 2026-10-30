'use strict';

// A just-enough browser for booting the whole page (render and game scripts included) in a vm.
// Canvas drawing calls are accepted and ignored, so tests can check that every screen draws
// without throwing, but not what it looks like.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT, memoryStorage } = require('./load');

function fakeContext2d() {
  const imageData = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
  const methods = {
    createImageData: imageData,
    getImageData: (x, y, w, h) => imageData(w, h),
    measureText: () => ({ width: 0 }),
  };
  return new Proxy({}, {
    get: (target, key) => (key in methods ? methods[key] : key in target ? target[key] : () => {}),
    set: (target, key, value) => { target[key] = value; return true; },
  });
}

function fakeCanvas() {
  return { width: 300, height: 150, style: {}, getContext: () => fakeContext2d() };
}

// Loads every script index.html lists, in order. Returns controls for driving the game loop.
function bootPage() {
  const listeners = {};
  const frames = [];
  const window = {
    innerWidth: 960,
    innerHeight: 540,
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
  };
  const document = { createElement: () => fakeCanvas(), getElementById: () => fakeCanvas() };
  const context = vm.createContext({
    console, window, document, localStorage: memoryStorage(),
    requestAnimationFrame: (fn) => frames.push(fn),
  });
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const [, name] of html.matchAll(/<script src="js\/([\w-]+)\.js"><\/script>/g)) {
    const file = path.join(ROOT, 'js', name + '.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  const fire = (type, event = {}) => (listeners[type] || []).forEach((fn) => fn({ preventDefault() {}, ...event }));
  fire('load');

  let clock = 0;
  return {
    game: () => window.game,
    // Runs the animation loop for a number of 60 Hz frames.
    frames(count) {
      for (let k = 0; k < count; k++) {
        clock += 1000 / 60;
        const pending = frames.splice(0);
        for (const fn of pending) fn(clock);
      }
    },
    keyDown: (code, key = code) => fire('keydown', { code, key }),
    keyUp: (code) => fire('keyup', { code }),
    // A key tap that the next frame sees as pressed.
    tap(code, key) {
      this.keyDown(code, key);
      this.frames(1);
      this.keyUp(code);
    },
  };
}

module.exports = { bootPage };
