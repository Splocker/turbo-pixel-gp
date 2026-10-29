'use strict';

const TYRE_RADIUS = 6;
const TYRE_RESET = 8;         // seconds before a shoved tyre stack slides back home
const BOOST_RADIUS = 12;
const CONE_RADIUS = 3;
const CONE_RESET = 8;
const COIN_RADIUS = 5;
const COIN_RESPAWN = 6;
const CAR_BODY_RADIUS = 6;    // car treated as one circle against obstacles
const BIG_SHOVE = 2;          // a big car sends tyres and cones flying this many times harder
const TYRE_SHOVE_SPEED = 60;

// Hand-placed course furniture, by distance along the lap (d) and offset from the centerline (lat,
// positive is the driver's right). The grid (the last ~320px of the lap) is kept clear.
const OBSTACLE_LAYOUT = [
  { type: 'coins', d: 90, lat: -22, count: 5 },
  { type: 'boost', d: 420, lat: -20 },
  { type: 'cones', d: 620, lat: 22 },
  { type: 'coins', d: 760, lat: -18, count: 4 },
  { type: 'cones', d: 1040, lat: 20 },
  { type: 'island', d: 1250, len: 100 },
  { type: 'coins', d: 1260, lat: 26, count: 4 },
  { type: 'boost', d: 1620, lat: 0 },
  { type: 'coins', d: 1760, lat: -20, count: 5 },
  { type: 'cones', d: 1900, lat: 18 },
  { type: 'coins', d: 2000, lat: -24, count: 4 },
  { type: 'boost', d: 2300, lat: 0 },
  { type: 'coins', d: 2420, lat: 10, count: 5 },
  { type: 'cones', d: 2680, lat: 24 },
  { type: 'boost', d: 2780, lat: -6 },
  { type: 'island', d: 2820, len: 60 },
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
      case 'boost': items.push({ type: 'boost', r: BOOST_RADIUS, ...at(e.d, e.lat) }); break;
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

// The static layout and AI lanes are built once per track and shared by every race.
function obstacleLayout(track) {
  if (!track.obstacleLayout) {
    track.obstacleLayout = placeObstacles(track);
    buildAiLanes(track, track.obstacleLayout);
  }
  return track.obstacleLayout;
}

// Moves a knocked item along, slows it down, and snaps it back home when its timer runs out.
function slideAndReturnHome(item, dt) {
  if (!item.timer) return;
  item.x += item.vx * dt;
  item.y += item.vy * dt;
  item.vx *= Math.exp(-2.5 * dt);
  item.vy *= Math.exp(-2.5 * dt);
  item.timer -= dt;
  if (item.timer <= 0) {
    item.timer = 0;
    item.x = item.homeX;
    item.y = item.homeY;
    item.vx = item.vy = 0;
  }
}

// Per-race state of the course furniture: boost-pad flashes, kicked cones, shoved tyres, coins.
class Obstacles {
  constructor(track) {
    this.track = track;
    this.items = obstacleLayout(track).map((o) => ({ ...o, homeX: o.x, homeY: o.y, vx: 0, vy: 0, flash: 0, timer: 0 }));
    this.tyres = this.items.filter((o) => o.type === 'tyre');
    this.pads = this.items.filter((o) => o.type === 'boost');
    this.cones = this.items.filter((o) => o.type === 'cone');
    this.coins = this.items.filter((o) => o.type === 'coin');
    this.time = 0;
  }

  update(dt) {
    this.time += dt;
    for (const o of this.items) o.flash = Math.max(0, o.flash - dt);
    for (const c of this.cones) slideAndReturnHome(c, dt);
    for (const t of this.tyres) slideAndReturnHome(t, dt);
    for (const c of this.coins) c.timer = Math.max(0, c.timer - dt);
  }

  // Resolves one car against the furniture. Returns what it hit, for scoring and effects.
  collide(car) {
    const hits = [];
    const body = CAR_BODY_RADIUS * car.sizeScale;
    for (const o of this.tyres) this.collideTyre(car, o, body, hits);

    for (const o of this.pads) {
      const dx = car.x - o.x, dy = car.y - o.y;
      if (dx * dx + dy * dy > o.r * o.r) continue;
      if (car.boostTimer < CAR_BOOST_TIME - 0.4) {
        car.boostTimer = CAR_BOOST_TIME;
        o.flash = 0.3;
        hits.push({ type: 'boost', x: o.x, y: o.y });
      }
    }

    const kick = car.isBig ? BIG_SHOVE : 1;
    for (const c of this.cones) {
      const dx = c.x - car.x, dy = c.y - car.y;
      if (Math.abs(dx) > 12 * car.sizeScale || Math.abs(dy) > 12 * car.sizeScale) continue;
      const d = Math.hypot(dx, dy) || 1;
      if (d > CONE_RADIUS + body) continue;
      c.vx = (car.vx * 1.25 + (dx / d) * 70) * kick;
      c.vy = (car.vy * 1.25 + (dy / d) * 70) * kick;
      if (!c.timer) hits.push({ type: 'cone', x: c.x, y: c.y });
      c.timer = CONE_RESET;
      if (car.isBig) continue;
      car.vx *= 0.94;
      car.vy *= 0.94;
    }

    if (car.isPlayer) {
      for (const c of this.coins) {
        if (c.timer > 0) continue;
        const dx = c.x - car.x, dy = c.y - car.y;
        if (dx * dx + dy * dy > (COIN_RADIUS + body) ** 2) continue;
        c.timer = COIN_RESPAWN;
        hits.push({ type: 'coin', x: c.x, y: c.y });
      }
    }
    return hits;
  }

  // Tyre stacks are solid but soft: a normal car bounces off and keeps going. A big car
  // shoves the stack out of its way instead and doesn't slow down.
  collideTyre(car, tyre, body, hits) {
    const dx = car.x - tyre.x, dy = car.y - tyre.y;
    const reach = 16 * car.sizeScale;
    if (Math.abs(dx) > reach || Math.abs(dy) > reach) return;
    const d = Math.hypot(dx, dy);
    const pen = tyre.r + body - d;
    if (pen <= 0 || d < 1e-4) return;
    const nx = dx / d, ny = dy / d;
    if (car.isBig) {
      tyre.x -= nx * pen;
      tyre.y -= ny * pen;
      tyre.vx = car.vx - nx * TYRE_SHOVE_SPEED * BIG_SHOVE;
      tyre.vy = car.vy - ny * TYRE_SHOVE_SPEED * BIG_SHOVE;
      if (!tyre.timer) hits.push({ type: 'tyreShove', x: tyre.x, y: tyre.y });
      tyre.timer = TYRE_RESET;
      return;
    }
    car.x += nx * pen;
    car.y += ny * pen;
    const vn = car.vx * nx + car.vy * ny;
    if (vn < 0) {
      car.vx -= 1.5 * vn * nx;
      car.vy -= 1.5 * vn * ny;
      car.vx *= 0.85;
      car.vy *= 0.85;
    }
  }
}
