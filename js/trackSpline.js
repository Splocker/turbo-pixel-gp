'use strict';

// Control points of the circuit, driven in this order. The first three are collinear so the
// start/finish straight is perfectly straight.
const TRACK_CONTROL = [
  [280, 150], [650, 150], [1000, 150],
  [1220, 220], [1310, 400], [1260, 600],
  [1100, 740], [900, 770], [740, 725], [580, 745],
  [400, 815], [230, 800], [110, 670], [90, 460], [130, 270],
];
const TRACK_START = [870, 150];

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

// Spline sampling, mixed into Track (see track.js).
const TRACK_SPLINE_METHODS = {
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
  },
};
