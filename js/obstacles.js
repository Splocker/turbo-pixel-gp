'use strict';

// Per-race state of the course furniture: boost-pad flashes, kicked cones, shoved tyres, coins.
class Obstacles {
  constructor(track) {
    this.track = track;
    this.items = obstacleLayout(track).map((o) => ({ ...o, homeX: o.x, homeY: o.y, vx: 0, vy: 0, flash: 0, timer: 0 }));
    this.tyres = this.items.filter((o) => o.type === 'tyre');
    this.boostPads = this.items.filter((o) => o.type === 'boost');
    this.cones = this.items.filter((o) => o.type === 'cone');
    this.coins = this.items.filter((o) => o.type === 'coin');
    this.movables = this.cones.concat(this.tyres); // knocked out of place, they slide back home later
    this.time = 0;
  }

  update(dt) {
    this.time += dt;
    for (const o of this.items) o.flash = Math.max(0, o.flash - dt);
    for (const c of this.movables) {
      if (!c.timer) continue;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vx *= Math.exp(-2.5 * dt);
      c.vy *= Math.exp(-2.5 * dt);
      c.timer -= dt;
      if (c.timer <= 0) {
        c.timer = 0;
        c.x = c.homeX;
        c.y = c.homeY;
        c.vx = c.vy = 0;
      }
    }
    for (const c of this.coins) c.timer = Math.max(0, c.timer - dt);
  }

  // Resolves one car against the furniture. Returns what it hit, for scoring and effects.
  collide(car) {
    const hits = [];
    const body = CAR_BODY_RADIUS * car.sizeScale;
    // Tyre stacks are solid but soft: the car bounces off and keeps going. A Big car shoves them.
    for (const o of this.tyres) {
      const dx = car.x - o.x, dy = car.y - o.y;
      if (Math.abs(dx) > o.r + body || Math.abs(dy) > o.r + body) continue;
      const d = Math.hypot(dx, dy);
      const pen = o.r + body - d;
      if (pen <= 0 || d < 1e-4) continue;
      const nx = dx / d, ny = dy / d;
      if (car.isBig) {
        o.x -= nx * pen;
        o.y -= ny * pen;
        if (!o.timer) hits.push({ type: 'tyre', x: o.x, y: o.y });
        shoveTyre(o, car.vx - nx * TYRE_SHOVE, car.vy - ny * TYRE_SHOVE);
        continue;
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

    for (const o of this.boostPads) {
      const dx = car.x - o.x, dy = car.y - o.y;
      if (dx * dx + dy * dy > o.r * o.r) continue;
      if (car.boostTimer < CAR_BOOST_TIME - 0.4) {
        car.boostTimer = CAR_BOOST_TIME;
        o.flash = 0.3;
        hits.push({ type: 'boost', x: o.x, y: o.y });
      }
    }

    for (const c of this.cones) {
      const dx = c.x - car.x, dy = c.y - car.y;
      if (Math.abs(dx) > CONE_RADIUS + body || Math.abs(dy) > CONE_RADIUS + body) continue;
      const d = Math.hypot(dx, dy) || 1;
      if (d > CONE_RADIUS + body) continue;
      c.vx = car.vx * 1.25 + (dx / d) * 70;
      c.vy = car.vy * 1.25 + (dy / d) * 70;
      if (!c.timer) hits.push({ type: 'cone', x: c.x, y: c.y });
      c.timer = CONE_RESET;
      if (car.isBig) continue; // Big cars plough through without slowing
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
}
