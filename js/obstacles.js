'use strict';

const BUMPER_RADIUS = 8;
const BUMPER_KICK = 150;      // minimum speed a bumper throws a car back out at
const BUMPER_BOUNCE = 1.2;
const TYRE_RADIUS = 6;
const SLIDER_RADIUS = 9;
const OIL_RADIUS = 13;
const BOOST_RADIUS = 12;
const CONE_RADIUS = 3;
const CONE_RESET = 8;
const COIN_RADIUS = 5;
const COIN_RESPAWN = 6;
const CAR_BODY_RADIUS = 6;    // car treated as one circle against obstacles

// Hand-placed course furniture, by distance along the lap (d) and offset from the centerline (lat,
// positive is the driver's right). The grid (the last ~320px of the lap) is kept clear.
const OBSTACLE_LAYOUT = [
  { type: 'coins', d: 90, lat: -22, count: 5 },
  { type: 'bumper', d: 330, lat: 4 },
  { type: 'boost', d: 520, lat: -24 },
  { type: 'cones', d: 660, lat: 22 },
  { type: 'coins', d: 700, lat: -18, count: 4 },
  { type: 'oil', d: 840, lat: -16 },
  { type: 'bumper', d: 960, lat: -30 },
  { type: 'bumper', d: 960, lat: 30 },
  { type: 'island', d: 1150, len: 100 },
  { type: 'coins', d: 1160, lat: 26, count: 4 },
  { type: 'oil', d: 1330, lat: 20 },
  { type: 'boost', d: 1480, lat: 0 },
  { type: 'slider', d: 1620, amp: 34, speed: 1.7 },
  { type: 'bumper', d: 1780, lat: -20 },
  { type: 'coins', d: 1830, lat: 26, count: 4 },
  { type: 'bumper', d: 1910, lat: 22 },
  { type: 'cones', d: 1980, lat: -10 },
  { type: 'oil', d: 2080, lat: 22 },
  { type: 'slider', d: 2200, amp: 34, speed: -1.3 },
  { type: 'coins', d: 2290, lat: 0, count: 5 },
  { type: 'bumper', d: 2420, lat: 12 },
  { type: 'oil', d: 2500, lat: -24 },
  { type: 'cones', d: 2560, lat: 26 },
  { type: 'boost', d: 2640, lat: -6 },
  { type: 'island', d: 2680, len: 70 },
];

// Expands the layout into individual objects with world positions.
function placeObstacles(track) {
  const items = [];
  const at = (d, lat) => {
    const i = track.indexAt(d);
    return { idx: i, lat, x: track.x[i] + track.nx[i] * lat, y: track.y[i] + track.ny[i] * lat };
  };
  for (const e of OBSTACLE_LAYOUT) {
    switch (e.type) {
      case 'bumper': items.push({ type: 'bumper', r: BUMPER_RADIUS, ...at(e.d, e.lat) }); break;
      case 'oil': items.push({ type: 'oil', r: OIL_RADIUS, ...at(e.d, e.lat) }); break;
      case 'boost': items.push({ type: 'boost', r: BOOST_RADIUS, ...at(e.d, e.lat) }); break;
      case 'slider': items.push({ type: 'slider', r: SLIDER_RADIUS, amp: e.amp, speed: e.speed, ...at(e.d, 0) }); break;
      case 'island':
        for (let s = 0; s <= e.len; s += 10) items.push({ type: 'tyre', r: TYRE_RADIUS, ...at(e.d + s, 0) });
        break;
      case 'cones':
        // Small triangle of cones pointing at the oncoming cars.
        for (const [ds, dl] of [[0, 0], [10, -6], [10, 6], [20, -12], [20, 0], [20, 12]]) {
          items.push({ type: 'cone', r: CONE_RADIUS, ...at(e.d + ds, e.lat + dl) });
        }
        break;
      case 'coins':
        for (let k = 0; k < e.count; k++) items.push({ type: 'coin', r: COIN_RADIUS, ...at(e.d + k * 24, e.lat) });
        break;
    }
  }
  return items;
}

// Two preferred driving lanes (left-hand and right-hand) around everything that hurts. Each AI
// sticks to one, so the field splits around obstacles instead of queueing on one side.
function buildAiLanes(track, items) {
  const n = track.n, limit = TRACK_HALF_WIDTH - 8;
  const BEFORE = 10, AFTER = 6, MIN_GAP = 14;
  const hazards = items.filter((o) => o.type === 'bumper' || o.type === 'tyre' || o.type === 'oil' || o.type === 'cone');
  const boosts = items.filter((o) => o.type === 'boost');
  const left = new Float32Array(n), right = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const blocked = [];
    for (const o of hazards) {
      let ahead = o.idx - i;
      if (ahead > n / 2) ahead -= n;
      if (ahead < -n / 2) ahead += n;
      if (ahead > BEFORE || ahead < -AFTER) continue;
      blocked.push([o.lat - o.r - CAR_BODY_RADIUS - 4, o.lat + o.r + CAR_BODY_RADIUS + 4]);
    }
    if (!blocked.length) {
      const pad = boosts.find((o) => {
        const ahead = track.wrap(o.idx - i);
        return ahead <= BEFORE;
      });
      left[i] = pad ? pad.lat : -10;
      right[i] = pad ? pad.lat : 10;
      continue;
    }
    // Free intervals across the road once the blocked spans are removed.
    blocked.sort((a, b) => a[0] - b[0]);
    const free = [];
    let from = -limit;
    for (const [a, b] of blocked) {
      if (a - from >= MIN_GAP) free.push([from, a]);
      from = Math.max(from, b);
    }
    if (limit - from >= MIN_GAP) free.push([from, limit]);
    if (!free.length) {
      left[i] = right[i] = 0;
      continue;
    }
    const mid = (f) => (f[0] + f[1]) / 2;
    left[i] = mid(free[0]);
    right[i] = mid(free[free.length - 1]);
  }

  for (const arr of [left, right]) {
    for (let pass = 0; pass < 2; pass++) {
      const src = arr.slice();
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let k = -4; k <= 4; k++) s += src[(i + k + n) % n];
        arr[i] = s / 9;
      }
    }
  }
  track.aiLaneL = left;
  track.aiLaneR = right;
}

// The static layout and AI lanes are built once per track and shared by every race.
function obstacleLayout(track) {
  if (!track.obstacleLayout) {
    track.obstacleLayout = placeObstacles(track);
    buildAiLanes(track, track.obstacleLayout);
  }
  return track.obstacleLayout;
}

// Per-race state of the course furniture: bumper flashes, sliding blocks, kicked cones, coins.
class Obstacles {
  constructor(track) {
    this.track = track;
    this.items = obstacleLayout(track).map((o) => ({ ...o, homeX: o.x, homeY: o.y, vx: 0, vy: 0, flash: 0, timer: 0, spin: 0 }));
    this.solids = this.items.filter((o) => o.type === 'bumper' || o.type === 'tyre' || o.type === 'slider');
    this.sliders = this.items.filter((o) => o.type === 'slider');
    this.pads = this.items.filter((o) => o.type === 'oil' || o.type === 'boost');
    this.cones = this.items.filter((o) => o.type === 'cone');
    this.coins = this.items.filter((o) => o.type === 'coin');
    this.time = 0;
  }

  update(dt) {
    const track = this.track;
    this.time += dt;
    for (const o of this.items) o.flash = Math.max(0, o.flash - dt);
    for (const s of this.sliders) {
      const i = s.idx;
      const lat = Math.sin(this.time * s.speed) * s.amp;
      s.lat = lat;
      s.x = track.x[i] + track.nx[i] * lat;
      s.y = track.y[i] + track.ny[i] * lat;
    }
    for (const c of this.cones) {
      if (!c.timer) continue;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vx *= Math.exp(-2.5 * dt);
      c.vy *= Math.exp(-2.5 * dt);
      c.spin += c.vx * dt * 0.2;
      bounceOffWalls(c, track, CONE_RADIUS, 0.5);
      c.idx = track.nearestLocal(c.x, c.y, c.idx, 6, 6);
      c.timer -= dt;
      if (c.timer <= 0) {
        c.timer = 0;
        c.x = c.homeX;
        c.y = c.homeY;
        c.vx = c.vy = 0;
        c.idx = track.nearestGlobal(c.x, c.y);
      }
    }
    for (const c of this.coins) c.timer = Math.max(0, c.timer - dt);
  }

  // Resolves one car against the furniture. Returns what it hit, for scoring and effects.
  collide(car) {
    const hits = [];
    for (const o of this.solids) {
      const dx = car.x - o.x, dy = car.y - o.y;
      if (Math.abs(dx) > 24 || Math.abs(dy) > 24) continue;
      const d = Math.hypot(dx, dy);
      const pen = o.r + CAR_BODY_RADIUS - d;
      if (pen <= 0 || d < 1e-4) continue;
      const nx = dx / d, ny = dy / d;
      car.x += nx * pen;
      car.y += ny * pen;
      const vn = car.vx * nx + car.vy * ny;
      if (o.type === 'tyre') {
        if (vn < 0) {
          car.vx -= 1.5 * vn * nx;
          car.vy -= 1.5 * vn * ny;
          car.vx *= 0.85;
          car.vy *= 0.85;
        }
        continue;
      }
      // Bumpers and sliders throw the car back out like a pinball bumper.
      const out = Math.max(-vn * BUMPER_BOUNCE, BUMPER_KICK);
      if (vn < out) {
        car.vx += (out - vn) * nx;
        car.vy += (out - vn) * ny;
      }
      if (o.flash <= 0.1) {
        const side = nx * Math.sin(car.angle) - ny * Math.cos(car.angle);
        car.spinOut(0.25, (side >= 0 ? 1 : -1) * 5);
        hits.push({ type: 'bumper', x: o.x, y: o.y });
      }
      o.flash = 0.3;
    }

    for (const o of this.pads) {
      const dx = car.x - o.x, dy = car.y - o.y;
      if (dx * dx + dy * dy > o.r * o.r) continue;
      if (o.type === 'oil') {
        if (car.oilCooldown > 0) continue;
        car.oilCooldown = 1.2;
        const slide = -car.vx * Math.sin(car.angle) + car.vy * Math.cos(car.angle);
        car.spinOut(0.7, (slide >= 0 ? 1 : -1) * 6);
        hits.push({ type: 'oil', x: o.x, y: o.y });
      } else if (car.boostTimer < CAR_BOOST_TIME - 0.4) {
        car.boostTimer = CAR_BOOST_TIME;
        o.flash = 0.3;
        hits.push({ type: 'boost', x: o.x, y: o.y });
      }
    }

    for (const c of this.cones) {
      const dx = c.x - car.x, dy = c.y - car.y;
      if (Math.abs(dx) > 12 || Math.abs(dy) > 12) continue;
      const d = Math.hypot(dx, dy) || 1;
      if (d > CONE_RADIUS + CAR_BODY_RADIUS) continue;
      c.vx = car.vx * 1.25 + (dx / d) * 70;
      c.vy = car.vy * 1.25 + (dy / d) * 70;
      if (!c.timer) hits.push({ type: 'cone', x: c.x, y: c.y });
      c.timer = CONE_RESET;
      car.vx *= 0.94;
      car.vy *= 0.94;
    }

    if (car.isPlayer) {
      for (const c of this.coins) {
        if (c.timer > 0) continue;
        const dx = c.x - car.x, dy = c.y - car.y;
        if (dx * dx + dy * dy > (COIN_RADIUS + CAR_BODY_RADIUS) ** 2) continue;
        c.timer = COIN_RESPAWN;
        hits.push({ type: 'coin', x: c.x, y: c.y });
      }
    }
    return hits;
  }
}
