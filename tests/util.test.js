'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./helpers/load');

const g = loadGame();

test('clamp keeps values inside the range', () => {
  assert.equal(g.clamp(5, 0, 10), 5);
  assert.equal(g.clamp(-1, 0, 10), 0);
  assert.equal(g.clamp(11, 0, 10), 10);
});

test('lerp interpolates between the ends', () => {
  assert.equal(g.lerp(10, 20, 0), 10);
  assert.equal(g.lerp(10, 20, 1), 20);
  assert.equal(g.lerp(10, 20, 0.25), 12.5);
});

test('wrapAngle maps any angle into [-PI, PI) without changing its direction', () => {
  for (const a of [0, 1, -1, Math.PI * 3.5, -Math.PI * 7.25, 100, -100]) {
    const w = g.wrapAngle(a);
    assert.ok(w >= -Math.PI && w < Math.PI, `wrapAngle(${a}) = ${w}`);
    assert.ok(Math.abs(Math.cos(w) - Math.cos(a)) < 1e-9);
    assert.ok(Math.abs(Math.sin(w) - Math.sin(a)) < 1e-9);
  }
});

test('hexToRgb and shade work on palette colors', () => {
  assert.deepEqual([...g.hexToRgb('#754098')], [0x75, 0x40, 0x98]);
  assert.equal(g.shade('#808080', 0.5), '#404040');
  assert.equal(g.shade('#ffffff', 2), '#ffffff'); // clamped at full brightness
});

test('the brand colors lead the palette', () => {
  assert.equal(g.PAL.purple, '#754098');
  assert.equal(g.PAL.orange, '#f99d34');
  assert.equal(g.PAL.lime, '#bfd81c');
});

test('makeRng is deterministic per seed and stays in [0, 1)', () => {
  const a = g.makeRng(42), b = g.makeRng(42), c = g.makeRng(43);
  const seqA = Array.from({ length: 200 }, a);
  const seqB = Array.from({ length: 200 }, b);
  assert.deepEqual(seqA, seqB);
  assert.notEqual(seqA[0], c());
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
});

test('formatTime shows minutes, seconds and hundredths', () => {
  assert.equal(g.formatTime(0), '0:00.00');
  assert.equal(g.formatTime(65.432), '1:05.43');
  assert.equal(g.formatTime(9.999), '0:09.99');
  assert.equal(g.formatTime(null), '-:--.--');
  assert.equal(g.formatTime(Infinity), '-:--.--');
});

test('ordinal handles the teens', () => {
  const cases = { 1: '1ST', 2: '2ND', 3: '3RD', 4: '4TH', 11: '11TH', 12: '12TH', 13: '13TH', 21: '21ST', 22: '22ND', 111: '111TH' };
  for (const [n, s] of Object.entries(cases)) assert.equal(g.ordinal(Number(n)), s);
});
