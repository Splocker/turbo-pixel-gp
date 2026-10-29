'use strict';

const COLLISION_RESTITUTION = 0.8;
const MIN_BUMP_IMPULSE = 40;      // even a nudge pushes cars visibly apart
const SPIN_IMPACT_THRESHOLD = 30; // px/s closing speed needed to knock a car out of control
const BIG_KNOCKBACK = 2;          // a big car knocks a normal car this many times further than usual

function carCircles(car) {
  const offset = CAR_CIRCLE_OFFSET * car.sizeScale;
  const fx = Math.cos(car.angle) * offset, fy = Math.sin(car.angle) * offset;
  return [[car.x + fx, car.y + fy], [car.x - fx, car.y - fy]];
}

// Car-vs-car: separate, exchange momentum along the contact normal, and spin both cars.
// A big car against a normal one is immovable and knocks the other car twice as far.
// Returns the impact point and strength, or null if they are not touching.
function collideCars(a, b) {
  const reach = 10 * (a.sizeScale + b.sizeScale);
  if (Math.abs(a.x - b.x) > reach || Math.abs(a.y - b.y) > reach) return null;
  const ca = carCircles(a), cb = carCircles(b);
  const touching = CAR_RADIUS * (a.sizeScale + b.sizeScale);
  let best = null;
  for (const p of ca) {
    for (const q of cb) {
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const d = Math.hypot(dx, dy);
      const pen = touching - d;
      if (pen > 0 && (!best || pen > best.pen)) best = { p, dx, dy, d, pen };
    }
  }
  if (!best) return null;

  let nx, ny;
  if (best.d > 1e-4) { nx = best.dx / best.d; ny = best.dy / best.d; }
  else { nx = Math.cos(a.angle + Math.PI / 2); ny = Math.sin(a.angle + Math.PI / 2); }

  const ia = 1 / a.mass, ib = 1 / b.mass;
  const bigVsNormal = a.isBig !== b.isBig;
  // How much of the separation and of the impulse each car takes.
  const pushA = bigVsNormal ? (a.isBig ? 0 : 1) : ia / (ia + ib);
  const knockA = bigVsNormal ? (a.isBig ? 0 : BIG_KNOCKBACK) : 1;
  const knockB = bigVsNormal ? (b.isBig ? 0 : BIG_KNOCKBACK) : 1;
  a.x -= nx * best.pen * pushA; a.y -= ny * best.pen * pushA;
  b.x += nx * best.pen * (1 - pushA); b.y += ny * best.pen * (1 - pushA);

  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn >= 0) return null; // already separating
  const j = Math.max(MIN_BUMP_IMPULSE, -(1 + COLLISION_RESTITUTION) * vn) / (ia + ib);
  a.vx -= j * ia * knockA * nx; a.vy -= j * ia * knockA * ny;
  b.vx += j * ib * knockB * nx; b.vy += j * ib * knockB * ny;

  const impact = -vn;
  const cx = best.p[0] + nx * CAR_RADIUS * a.sizeScale, cy = best.p[1] + ny * CAR_RADIUS * a.sizeScale;
  let spun = false;
  if (impact > SPIN_IMPACT_THRESHOLD) {
    // Short, snappy loss of control: a wobble for taps, a quick spin for big hits.
    const duration = clamp(0.15 + impact / 600, 0.2, 0.5);
    const rate = clamp(2 + impact / 40, 2, 9);
    // Spin direction follows the torque of the impulse about each car's center.
    const torqueA = (cx - a.x) * -ny - (cy - a.y) * -nx;
    const torqueB = (cx - b.x) * ny - (cy - b.y) * nx;
    if (knockA) a.spinOut(duration, (torqueA >= 0 ? 1 : -1) * rate);
    if (knockB) b.spinOut(duration, (torqueB >= 0 ? 1 : -1) * rate);
    spun = true;
  }
  return { a, b, x: cx, y: cy, impact, spun };
}

function resolveCarCollisions(cars, onImpact) {
  for (let i = 0; i < cars.length; i++) {
    for (let k = i + 1; k < cars.length; k++) {
      const hit = collideCars(cars[i], cars[k]);
      if (hit && onImpact) onImpact(hit);
    }
  }
}

function pushOut(car, nx, ny, pen) {
  car.x += nx * pen;
  car.y += ny * pen;
  const vn = car.vx * nx + car.vy * ny;
  if (vn < 0) {
    car.vx -= 1.4 * vn * nx;
    car.vy -= 1.4 * vn * ny;
    car.vx *= 0.7;
    car.vy *= 0.7;
  }
}

// Trees, the grandstand and the edge of the world are solid. All sit well off the road.
function collideScenery(car, track) {
  const gx = Math.floor(car.x / 64), gy = Math.floor(car.y / 64);
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      const list = track.treeGrid.get((gx + ox) + ',' + (gy + oy));
      if (!list) continue;
      for (const t of list) {
        const dx = car.x - t.x, dy = car.y - t.y;
        const d = Math.hypot(dx, dy);
        const pen = t.r + 5 - d;
        if (pen > 0 && d > 1e-4) pushOut(car, dx / d, dy / d, pen);
      }
    }
  }

  const g = track.grandstand;
  const qx = clamp(car.x, g.x, g.x + g.w), qy = clamp(car.y, g.y, g.y + g.h);
  const dx = car.x - qx, dy = car.y - qy;
  const d = Math.hypot(dx, dy);
  if (d < 6 && d > 1e-4) pushOut(car, dx / d, dy / d, 6 - d);

  const m = 10;
  if (car.x < m) pushOut(car, 1, 0, m - car.x);
  if (car.y < m) pushOut(car, 0, 1, m - car.y);
  if (car.x > track.worldW - m) pushOut(car, -1, 0, car.x - (track.worldW - m));
  if (car.y > track.worldH - m) pushOut(car, 0, -1, car.y - (track.worldH - m));
}
