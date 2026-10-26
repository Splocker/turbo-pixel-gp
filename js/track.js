'use strict';

const TRACK_HALF_WIDTH = 48;
const TRACK_SPACING = 6; // distance between centerline samples, in pixels
const KERB_WIDTH = 5;
const WALL_WIDTH = 6;    // bouncy barrier just outside the kerb
const WORLD_MARGIN = 150;

// Control points of the circuit, driven in this order. The first three are collinear so the
// start/finish straight is perfectly straight.
const TRACK_CONTROL = [
  [250, 150], [600, 150], [950, 150],
  [1140, 200], [1220, 360], [1180, 540],
  [1040, 660], [860, 680], [720, 590], [560, 600],
  [430, 740], [250, 760], [120, 620], [110, 400], [150, 220],
];
const TRACK_START = [820, 150];

// Centripetal Catmull-Rom (no overshoot or cusps with uneven point spacing).
function catmullRom(p0, p1, p2, p3, u) {
  const knot = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const t = t1 + (t2 - t1) * u;
  const mix = (a, b, ta, tb) => {
    const w = (t - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
  };
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

function curvatureOf(xs, ys, k) {
  const n = xs.length;
  const heading = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n, b = (i + 1) % n;
    heading[i] = Math.atan2(ys[b] - ys[a], xs[b] - xs[a]);
  }
  const curv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i + n - k) % n, b = (i + k) % n;
    const ds = Math.hypot(xs[b] - xs[a], ys[b] - ys[a]) || 1;
    curv[i] = wrapAngle(heading[b] - heading[a]) / ds;
  }
  return curv;
}

class Track {
  constructor() {
    this.buildCenterline();
    this.buildScenery();
  }

  buildCenterline() {
    const P = TRACK_CONTROL;
    const m = P.length;
    const dense = [];
    for (let i = 0; i < m; i++) {
      const p0 = P[(i + m - 1) % m], p1 = P[i], p2 = P[(i + 1) % m], p3 = P[(i + 2) % m];
      for (let s = 0; s < 120; s++) dense.push(catmullRom(p0, p1, p2, p3, s / 120));
    }

    // Resample at equal arc length.
    let total = 0;
    const segLen = dense.map((p, i) => {
      const q = dense[(i + 1) % dense.length];
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      total += d;
      return d;
    });
    const n = Math.round(total / TRACK_SPACING);
    const step = total / n;
    const pts = [];
    let seg = 0, segStart = 0;
    for (let k = 0; k < n; k++) {
      const target = k * step;
      while (segStart + segLen[seg] < target) segStart += segLen[seg++];
      const p = dense[seg], q = dense[(seg + 1) % dense.length];
      const w = segLen[seg] > 0 ? (target - segStart) / segLen[seg] : 0;
      pts.push([p[0] + (q[0] - p[0]) * w, p[1] + (q[1] - p[1]) * w]);
    }

    // Rotate so sample 0 sits on the start/finish line.
    let best = 0, bestD = Infinity;
    pts.forEach((p, i) => {
      const d = Math.hypot(p[0] - TRACK_START[0], p[1] - TRACK_START[1]);
      if (d < bestD) { bestD = d; best = i; }
    });
    const ordered = pts.slice(best).concat(pts.slice(0, best));

    // Shift into world space with a grass margin on every side.
    const minX = Math.min(...ordered.map((p) => p[0]));
    const minY = Math.min(...ordered.map((p) => p[1]));
    const maxX = Math.max(...ordered.map((p) => p[0]));
    const maxY = Math.max(...ordered.map((p) => p[1]));
    const ox = WORLD_MARGIN - minX, oy = WORLD_MARGIN - minY;
    this.worldW = Math.ceil(maxX - minX + WORLD_MARGIN * 2);
    this.worldH = Math.ceil(maxY - minY + WORLD_MARGIN * 2);

    this.n = n;
    this.spacing = step;
    this.length = total;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.tx = new Float32Array(n);
    this.ty = new Float32Array(n);
    this.nx = new Float32Array(n);
    this.ny = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.x[i] = ordered[i][0] + ox;
      this.y[i] = ordered[i][1] + oy;
    }
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n, b = (i + 1) % n;
      const dx = this.x[b] - this.x[a], dy = this.y[b] - this.y[a];
      const len = Math.hypot(dx, dy) || 1;
      this.tx[i] = dx / len;
      this.ty[i] = dy / len;
      // Normal points to the driver's right (screen y grows downward).
      this.nx[i] = -this.ty[i];
      this.ny[i] = this.tx[i];
    }
    this.curv = curvatureOf(this.x, this.y, 3);

    // Kerbs wherever the corner is meaningful, extended a little so they read as blocks.
    this.kerb = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      for (let k = -6; k <= 6; k++) {
        if (Math.abs(this.curv[(i + k + n) % n]) > 1 / 260) { this.kerb[i] = 1; break; }
      }
    }
  }

  buildScenery() {
    const edge = TRACK_HALF_WIDTH + KERB_WIDTH + WALL_WIDTH;
    // Grandstand above the start straight (the straight is the topmost part of the circuit).
    const sx = this.x[0], sy = this.y[0];
    this.grandstand = { x: sx - 330, y: sy - edge - 52, w: 400, h: 40 };

    // Trees are decoration only: the walls keep every car on the circuit.
    const rng = makeRng(1337);
    this.trees = [];
    const gs = this.grandstand;
    for (let tries = 0; tries < 3000 && this.trees.length < 110; tries++) {
      const x = 24 + rng() * (this.worldW - 48);
      const y = 24 + rng() * (this.worldH - 48);
      if (x > gs.x - 20 && x < gs.x + gs.w + 20 && y > gs.y - 20 && y < gs.y + gs.h + 20) continue;
      if (this.distanceFromCenter(x, y) < edge + 26) continue;
      if (this.trees.some((t) => Math.hypot(t.x - x, t.y - y) < 16)) continue;
      this.trees.push({ x, y, r: 5 });
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
