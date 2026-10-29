'use strict';

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
