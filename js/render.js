'use strict';

const VIEW_W = 480;
const VIEW_H = 270;

class Renderer {
  constructor(ctx, track) {
    this.ctx = ctx;
    this.track = track;
    this.base = buildTrackCanvas(track);
    this.world = makeCanvas(track.worldW, track.worldH);
    this.wctx = this.world.getContext('2d');
    this.minimap = buildMinimap(track);
    this.spriteCache = new Map();
    this.cone = buildConeSprite();
    this.coin = buildCoinSprites();
    this.tyre = buildTyreSprite();
    this.itemIcons = buildItemIcons();
    this.resetWorld();
  }

  // Fresh copy of the circuit (clears old skid marks).
  resetWorld() {
    this.wctx.drawImage(this.base, 0, 0);
  }

  spritesFor(body, stripe) {
    const key = body + stripe;
    if (!this.spriteCache.has(key)) this.spriteCache.set(key, buildCarSprites(body, stripe));
    return this.spriteCache.get(key);
  }

  drawCarIcon(body, stripe, x, y, angle) {
    const s = this.spritesFor(body, stripe);
    this.ctx.drawImage(s.sprites[dirIndex(angle)], Math.round(x - 8.5), Math.round(y - 8.5));
  }

  dim() {
    this.ctx.globalAlpha = 0.6;
    this.ctx.fillStyle = PAL.purpleDeep;
    this.ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.ctx.globalAlpha = 1;
  }

  drawWorld(race, camX, camY) {
    const ctx = this.ctx;
    camX = Math.round(camX);
    camY = Math.round(camY);

    // Skid marks are painted permanently into the working copy of the track.
    this.wctx.fillStyle = PAL.skid;
    for (const s of race.skids) this.wctx.fillRect(Math.floor(s.x), Math.floor(s.y), 1, 1);
    race.skids.length = 0;

    ctx.drawImage(this.world, camX, camY, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);
    this.drawObstacles(race.obstacles, camX, camY);
    this.drawPickups(race, camX, camY);
    this.drawBananas(race, camX, camY);

    // Big cars are drawn at double size; the sprite's pixels just get bigger.
    const visible = race.cars.filter((c) => c.x > camX - 40 && c.x < camX + VIEW_W + 40 && c.y > camY - 40 && c.y < camY + VIEW_H + 40);
    const drawCar = (img, car, dx, dy) => {
      const size = 17 * car.sizeScale, half = 8.5 * car.sizeScale;
      ctx.drawImage(img, Math.round(car.x - camX - half) + dx, Math.round(car.y - camY - half) + dy, size, size);
    };
    for (const car of visible) drawCar(this.spritesFor(car.body, car.stripe).shadows[dirIndex(car.angle)], car, 1, 2);
    for (const car of visible) drawCar(this.spritesFor(car.body, car.stripe).sprites[dirIndex(car.angle)], car, 0, 0);

    for (const p of race.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), 2, 2);
    }

    // Marker over the player's car so it's easy to find in a big pack.
    const pl = race.player;
    if (pl) {
      const x = Math.round(pl.x - camX), y = Math.round(pl.y - camY) - 14;
      ctx.fillStyle = PAL.black;
      ctx.fillRect(x - 4, y - 1, 9, 5);
      ctx.fillStyle = PAL.orange;
      ctx.fillRect(x - 3, y, 7, 1);
      ctx.fillRect(x - 2, y + 1, 5, 1);
      ctx.fillRect(x - 1, y + 2, 3, 1);
      ctx.fillRect(x, y + 3, 1, 1);
    }

    // Floating score popups; they blink out at the end of their life.
    for (const p of race.popups) {
      if (p.life < 0.25 && Math.floor(p.life * 20) % 2) continue;
      drawText(ctx, p.text, Math.round(p.x - camX), Math.round(p.y - camY), p.color, 1, 'center', PAL.black);
    }
  }

  drawObstacles(obs, camX, camY) {
    const ctx = this.ctx;
    const near = (o) => o.x > camX - 16 && o.x < camX + VIEW_W + 16 && o.y > camY - 16 && o.y < camY + VIEW_H + 16;
    const blit = (img, o) => ctx.drawImage(img, Math.round(o.x - camX - img.width / 2), Math.round(o.y - camY - img.height / 2));
    const frame = Math.floor(obs.time * 6) % 2;
    for (const o of obs.coins) if (o.timer <= 0 && near(o)) blit(this.coin[frame], o);
    for (const o of obs.cones) if (near(o)) blit(this.cone, o);
    for (const o of obs.tyres) if (near(o)) blit(this.tyre, o); // drawn live: Big cars shove them
  }
}

Object.assign(Renderer.prototype, RENDERER_HUD_METHODS, RENDERER_POWERUP_METHODS);
