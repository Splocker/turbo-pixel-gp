'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./helpers/load');

const g = loadGame();
const track = new g.Track();
const HW = g.TRACK_HALF_WIDTH;

test('the circuit is a closed loop of evenly spaced samples', () => {
  for (let i = 0; i < track.n; i++) {
    const j = (i + 1) % track.n; // includes the wrap from the last sample back to the first
    const d = Math.hypot(track.x[j] - track.x[i], track.y[j] - track.y[i]);
    assert.ok(Math.abs(d - track.spacing) < 0.5, `gap of ${d.toFixed(2)} after sample ${i}`);
  }
});

test('the course is short enough for quick arcade races', () => {
  assert.ok(track.length > 3000 && track.length < 3600, `length ${track.length.toFixed(0)}`);
});

test('every turn is gentle: centerline radius of at least 150px', () => {
  let minR = Infinity;
  for (let i = 0; i < track.n; i++) minR = Math.min(minR, 1 / Math.abs(track.curv[i]));
  assert.ok(minR >= 150, `tightest radius ${minR.toFixed(0)}`);
});

test('different parts of the circuit never come close to each other', () => {
  const needed = 2 * (HW + g.KERB_WIDTH) + 100;
  const near = Math.round(needed / track.spacing) * 2; // skip samples that are neighbours along the lap
  let minSep = Infinity;
  for (let i = 0; i < track.n; i += 2) {
    for (let j = i + near; j < track.n; j += 2) {
      if (track.n - (j - i) < near) continue;
      minSep = Math.min(minSep, Math.hypot(track.x[i] - track.x[j], track.y[i] - track.y[j]));
    }
  }
  assert.ok(minSep >= needed, `closest sections ${minSep.toFixed(0)}px apart, need ${needed}`);
});

test('the lap starts on a straight and the whole circuit fits in the world', () => {
  // The grid (about 300px long) and the start line sit on a near-straight: no radius under 600px
  // and the heading stays within about 6 degrees of horizontal.
  for (let k = -50; k <= 10; k++) {
    const i = track.wrap(k);
    assert.ok(Math.abs(track.curv[i]) < 1 / 600, `bend at ${k} samples from the line`);
    assert.ok(Math.abs(track.ty[i]) < 0.1 && track.tx[i] > 0, `heading at ${k} samples from the line`);
  }
  const edge = HW + g.KERB_WIDTH;
  for (let i = 0; i < track.n; i++) {
    assert.ok(track.x[i] - edge > 0 && track.x[i] + edge < track.worldW);
    assert.ok(track.y[i] - edge > 0 && track.y[i] + edge < track.worldH);
  }
});

test('tangents and normals are unit length and perpendicular; normals point right', () => {
  for (let i = 0; i < track.n; i += 7) {
    assert.ok(Math.abs(Math.hypot(track.tx[i], track.ty[i]) - 1) < 1e-5);
    assert.ok(Math.abs(Math.hypot(track.nx[i], track.ny[i]) - 1) < 1e-5);
    assert.ok(Math.abs(track.tx[i] * track.nx[i] + track.ty[i] * track.ny[i]) < 1e-5);
    // Screen y grows downward, so "right of travel" is the tangent rotated +90 degrees.
    assert.ok(Math.abs(track.nx[i] + track.ty[i]) < 1e-5 && Math.abs(track.ny[i] - track.tx[i]) < 1e-5);
  }
});

test('indexAt, wrap and nearestLocal agree with the sample layout', () => {
  assert.equal(track.wrap(-1), track.n - 1);
  assert.equal(track.wrap(track.n), 0);
  assert.equal(track.indexAt(track.length), 0);
  const i = track.indexAt(1000);
  assert.equal(track.nearestLocal(track.x[i] + 2, track.y[i] + 2, track.wrap(i + 3), 6, 6), i);
  assert.equal(track.nearestGlobal(track.x[i], track.y[i]), i);
});

test('surfaceAt tells road, kerb and grass apart', () => {
  const i = track.indexAt(1500);
  const at = (lat) => track.surfaceAt(track.x[i] + track.nx[i] * lat, track.y[i] + track.ny[i] * lat, i);
  assert.equal(at(0), 'road');
  assert.equal(at(HW - 1), 'road');
  assert.equal(at(-(HW + g.KERB_WIDTH / 2)), 'kerb');
  assert.equal(at(HW + g.KERB_WIDTH + 10), 'grass');
});

test('all 21 grid slots sit on the road behind the start line without overlapping', () => {
  const poses = [];
  for (let slot = 0; slot <= g.MAX_OPPONENTS; slot++) {
    const p = track.gridPose(slot);
    assert.equal(track.surfaceAt(p.x, p.y, p.idx), 'road', `slot ${slot}`);
    assert.ok(p.idx * track.spacing > track.length - 400, `slot ${slot} is behind the line`);
    // A car is 14px long: 18px between centers leaves a gap.
    for (const q of poses) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= 18, `slot ${slot} overlaps`);
    poses.push(p);
  }
});

test('trees and the grandstand leave plenty of run-off beside the road', () => {
  assert.ok(track.trees.length > 50);
  for (const t of track.trees) {
    assert.ok(track.distanceFromCenter(t.x, t.y) >= g.TREE_CLEARANCE);
    assert.ok(t.x > 0 && t.y > 0 && t.x < track.worldW && t.y < track.worldH);
  }
  const gs = track.grandstand;
  for (const [x, y] of [[gs.x, gs.y + gs.h], [gs.x + gs.w, gs.y + gs.h], [gs.x + gs.w / 2, gs.y + gs.h]]) {
    assert.ok(track.distanceFromCenter(x, y) > HW + g.KERB_WIDTH + 20);
  }
});
