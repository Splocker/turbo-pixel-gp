'use strict';

const COLLISION_RESTITUTION = 0.8;
const MIN_BUMP_IMPULSE = 40;      // even a nudge pushes cars visibly apart
const SPIN_IMPACT_THRESHOLD = 30; // px/s closing speed needed to knock a car out of control
const WALL_RESTITUTION = 0.6;

function carCircles(car) {
  const fx = Math.cos(car.angle) * CAR_CIRCLE_OFFSET, fy = Math.sin(car.angle) * CAR_CIRCLE_OFFSET;
  return [[car.x + fx, car.y + fy], [car.x - fx, car.y - fy]];
}

// Car-vs-car: separate, exchange momentum along the contact normal, and spin both cars.
// Returns the impact point and strength, or null if they are not touching.
function collideCars(a, b) {
  if (Math.abs(a.x - b.x) > 20 || Math.abs(a.y - b.y) > 20) return null;
  const ca = carCircles(a), cb = carCircles(b);
  let best = null;
  for (const p of ca) {
    for (const q of cb) {
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const d = Math.hypot(dx, dy);
      const pen = CAR_RADIUS * 2 - d;
      if (pen > 0 && (!best || pen > best.pen)) best = { p, dx, dy, d, pen };
    }
  }
  if (!best) return null;

  let nx, ny;
  if (best.d > 1e-4) { nx = best.dx / best.d; ny = best.dy / best.d; }
  else { nx = Math.cos(a.angle + Math.PI / 2); ny = Math.sin(a.angle + Math.PI / 2); }

  const ia = 1 / a.mass, ib = 1 / b.mass;
  a.x -= nx * best.pen * ia / (ia + ib); a.y -= ny * best.pen * ia / (ia + ib);
  b.x += nx * best.pen * ib / (ia + ib); b.y += ny * best.pen * ib / (ia + ib);

  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn >= 0) return null; // already separating
  const j = Math.max(MIN_BUMP_IMPULSE, -(1 + COLLISION_RESTITUTION) * vn) / (ia + ib);
  a.vx -= j * ia * nx; a.vy -= j * ia * ny;
  b.vx += j * ib * nx; b.vy += j * ib * ny;

  const impact = -vn;
  const cx = best.p[0] + nx * CAR_RADIUS, cy = best.p[1] + ny * CAR_RADIUS;
  let spun = false;
  if (impact > SPIN_IMPACT_THRESHOLD) {
    // Short, snappy loss of control: a wobble for taps, a quick spin for big hits.
    const duration = clamp(0.15 + impact / 600, 0.2, 0.5);
    const rate = clamp(2 + impact / 40, 2, 9);
    // Spin direction follows the torque of the impulse about each car's center.
    const torqueA = (cx - a.x) * -ny - (cy - a.y) * -nx;
    const torqueB = (cx - b.x) * ny - (cy - b.y) * nx;
    a.spinOut(duration, (torqueA >= 0 ? 1 : -1) * rate);
    b.spinOut(duration, (torqueB >= 0 ? 1 : -1) * rate);
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

// Keeps a body (car or cone) between the barriers on both sides of the road. The body's idx must
// be a recent nearest centerline sample. Returns the impact speed, or 0 if it didn't touch a wall.
function bounceOffWalls(body, track, radius, restitution = WALL_RESTITUTION) {
  const i = track.nearestLocal(body.x, body.y, body.idx, 4, 4);
  const limit = TRACK_HALF_WIDTH + KERB_WIDTH - radius;
  const lat = track.lateral(body.x, body.y, i);
  if (Math.abs(lat) <= limit) return 0;
  const side = Math.sign(lat);
  const nx = -track.nx[i] * side, ny = -track.ny[i] * side; // points back onto the road
  const pen = Math.abs(lat) - limit;
  body.x += nx * pen;
  body.y += ny * pen;
  const vn = body.vx * nx + body.vy * ny;
  if (vn >= 0) return 0;
  body.vx -= (1 + restitution) * vn * nx;
  body.vy -= (1 + restitution) * vn * ny;
  return -vn;
}
