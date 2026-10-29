'use strict';

const VIEW_W = 480;
const VIEW_H = 270;
const CAR_SPRITE_SIZE = 17;
const BIG_WARNING_TIME = 1.5; // a big car flickers between sizes this long before it shrinks

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
    this.banana = buildBananaSprite();
    this.powerupBoxes = buildPowerupSprites();
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

  // Drawing size of a car: doubled while big, flickering just before it shrinks back.
  drawScale(car) {
    if (car.isBig && car.bigTimer < BIG_WARNING_TIME && Math.floor(car.bigTimer * 8) % 2) return 1.5;
    return car.sizeScale;
  }

  drawCar(car, camX, camY, shadow) {
    const s = this.spritesFor(car.body, car.stripe);
    const img = (shadow ? s.shadows : s.sprites)[dirIndex(car.angle)];
    const scale = this.drawScale(car);
    const size = CAR_SPRITE_SIZE * scale;
    const x = Math.round(car.x - camX - size / 2) + (shadow ? Math.round(scale) : 0);
    const y = Math.round(car.y - camY - size / 2) + (shadow ? Math.round(2 * scale) : 0);
    this.ctx.drawImage(img, x, y, size, size);
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
    this.drawPowerups(race.powerups, camX, camY);

    const visible = race.cars.filter((c) => c.x > camX - 40 && c.x < camX + VIEW_W + 40 && c.y > camY - 40 && c.y < camY + VIEW_H + 40);
    for (const car of visible) this.drawCar(car, camX, camY, true);
    for (const car of visible) this.drawCar(car, camX, camY, false);

    for (const p of race.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), 2, 2);
    }

    // Marker over the player's car so it's easy to find in a big pack.
    const pl = race.player;
    if (pl) {
      const x = Math.round(pl.x - camX), y = Math.round(pl.y - camY) - 6 - 8 * pl.sizeScale;
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

  // Draws a sprite centered on a world position, if it is anywhere near the screen.
  blitNear(img, o, camX, camY, offsetY = 0) {
    if (o.x < camX - 16 || o.x > camX + VIEW_W + 16 || o.y < camY - 16 || o.y > camY + VIEW_H + 16) return;
    this.ctx.drawImage(img, Math.round(o.x - camX - img.width / 2), Math.round(o.y - camY - img.height / 2) + offsetY);
  }

  drawObstacles(obs, camX, camY) {
    const frame = Math.floor(obs.time * 6) % 2;
    for (const o of obs.coins) if (o.timer <= 0) this.blitNear(this.coin[frame], o, camX, camY);
    for (const o of obs.cones) this.blitNear(this.cone, o, camX, camY);
    for (const o of obs.tyres) this.blitNear(this.tyre, o, camX, camY);
  }

  // Item boxes bob gently so they stand out from the course furniture.
  drawPowerups(field, camX, camY) {
    for (const b of field.bananas) this.blitNear(this.banana, b, camX, camY);
    for (const p of field.pickups) {
      const bob = Math.round(Math.sin(field.time * 4 + p.idx) * 1.5);
      this.blitNear(this.powerupBoxes[p.kind], p, camX, camY, bob);
    }
  }
}

mixInto(Renderer, HudMethods);
