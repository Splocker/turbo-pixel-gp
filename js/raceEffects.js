'use strict';

// Particles, skid marks and popups, mixed into Race (see race.js).
const RACE_EFFECTS_METHODS = {
  sparks(x, y, impact, colors = [PAL.orange, PAL.yellow, PAL.white]) {
    const n = Math.min(10, 2 + Math.floor(impact / 25));
    for (let i = 0; i < n; i++) {
      const a = this.rng() * TAU, s = 30 + this.rng() * impact;
      const color = colors[Math.floor(this.rng() * colors.length)];
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + this.rng() * 0.3, color });
    }
  },

  confetti(x, y) {
    const colors = [PAL.orange, PAL.lime, PAL.purpleLight, PAL.yellow, PAL.white, PAL.cyan];
    for (let i = 0; i < 70; i++) {
      const a = this.rng() * TAU, s = 60 + this.rng() * 160;
      const color = colors[Math.floor(this.rng() * colors.length)];
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.8 + this.rng() * 0.9, color });
    }
  },

  emitEffects(car) {
    if (car.skidding) {
      const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
      const rx = -fy, ry = fx;
      this.skids.push(
        { x: car.x - fx * 4 + rx * 3, y: car.y - fy * 4 + ry * 3 },
        { x: car.x - fx * 4 - rx * 3, y: car.y - fy * 4 - ry * 3 }
      );
      if (this.skids.length > 4000) this.skids.splice(0, this.skids.length - 4000);
    }
    if (car.surface === 'grass' && car.speed > 60 && this.rng() < 0.35) {
      this.particles.push({
        x: car.x - Math.cos(car.angle) * 6, y: car.y - Math.sin(car.angle) * 6,
        vx: (this.rng() - 0.5) * 30, vy: (this.rng() - 0.5) * 30,
        life: 0.4 + this.rng() * 0.3, color: this.rng() < 0.5 ? PAL.limeDeep : PAL.brown,
      });
    }
    if (car.boostTimer > 0 && this.rng() < 0.6) {
      this.particles.push({
        x: car.x - Math.cos(car.angle) * 8, y: car.y - Math.sin(car.angle) * 8,
        vx: (this.rng() - 0.5) * 30, vy: (this.rng() - 0.5) * 30,
        life: 0.2 + this.rng() * 0.2, color: this.rng() < 0.5 ? PAL.orange : PAL.yellow,
      });
    }
  },

  updateParticles(dt) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-4 * dt);
      p.vy *= Math.exp(-4 * dt);
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const p of this.popups) {
      p.y -= 22 * dt;
      p.life -= dt;
    }
    this.popups = this.popups.filter((p) => p.life > 0);
  },
};
