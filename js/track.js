'use strict';

const TRACK_HALF_WIDTH = 48;
const TRACK_SPACING = 6; // distance between centerline samples, in pixels
const KERB_WIDTH = 5;
const WORLD_MARGIN = 200;
const TREE_CLEARANCE = 120; // trees stay this far from the centerline, leaving plenty of run-off

class Track {
  constructor() {
    this.buildCenterline();
    this.buildScenery();
  }

  buildScenery() {
    // Grandstand above the start straight (the straight is the topmost part of the circuit).
    const sx = this.x[0], sy = this.y[0];
    this.grandstand = { x: sx - 330, y: sy - 130, w: 400, h: 40 };

    const rng = makeRng(1337);
    this.trees = [];
    const gs = this.grandstand;
    for (let tries = 0; tries < 4000 && this.trees.length < 140; tries++) {
      const x = 24 + rng() * (this.worldW - 48);
      const y = 24 + rng() * (this.worldH - 48);
      if (x > gs.x - 20 && x < gs.x + gs.w + 20 && y > gs.y - 20 && y < gs.y + gs.h + 20) continue;
      if (this.distanceFromCenter(x, y) < TREE_CLEARANCE) continue;
      if (this.trees.some((t) => Math.hypot(t.x - x, t.y - y) < 16)) continue;
      this.trees.push({ x, y, r: 5 });
    }
    this.treeGrid = new Map();
    for (const t of this.trees) {
      const key = Math.floor(t.x / 64) + ',' + Math.floor(t.y / 64);
      if (!this.treeGrid.has(key)) this.treeGrid.set(key, []);
      this.treeGrid.get(key).push(t);
    }
  }

  wrap(i) {
    const n = this.n;
    return ((i % n) + n) % n;
  }

  nearestLocal(x, y, idx, back, fwd) {
    let best = idx, bestD = Infinity;
    for (let k = -back; k <= fwd; k++) {
      const i = this.wrap(idx + k);
      const dx = x - this.x[i], dy = y - this.y[i];
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  nearestGlobal(x, y) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < this.n; i += 4) {
      const dx = x - this.x[i], dy = y - this.y[i];
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return this.nearestLocal(x, y, best, 4, 4);
  }

  lateral(x, y, i) {
    return (x - this.x[i]) * this.nx[i] + (y - this.y[i]) * this.ny[i];
  }

  distanceFromCenter(x, y) {
    const i = this.nearestGlobal(x, y);
    return Math.hypot(x - this.x[i], y - this.y[i]);
  }

  // Surface under a point, searched near a known sample index (cheap enough to run every frame).
  surfaceAt(x, y, idx) {
    const i = this.nearestLocal(x, y, idx, 4, 4);
    const d = Math.abs(this.lateral(x, y, i));
    if (d <= TRACK_HALF_WIDTH) return 'road';
    if (d <= TRACK_HALF_WIDTH + KERB_WIDTH) return 'kerb';
    return 'grass';
  }

  // Sample index for a distance along the lap.
  indexAt(d) {
    return this.wrap(Math.round(d / this.spacing));
  }

  // Pose of a grid slot: two staggered columns behind the start line, pole on the left.
  gridPose(slot) {
    const row = Math.floor(slot / 2), col = slot % 2;
    const back = 34 + row * 26 + col * 13;
    const i = this.wrap(Math.round((this.length - back) / this.spacing));
    const lat = col === 0 ? -18 : 18;
    return {
      idx: i,
      x: this.x[i] + this.nx[i] * lat,
      y: this.y[i] + this.ny[i] * lat,
      angle: Math.atan2(this.ty[i], this.tx[i]),
    };
  }
}

Object.assign(Track.prototype, TRACK_SPLINE_METHODS);
