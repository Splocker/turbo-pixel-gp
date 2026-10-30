'use strict';

// Powerup art: pickup boxes and dropped bananas in the world, and the item slot on the HUD.

const ITEM_ICON_PIXELS = {
  banana: [
    '.......kk',
    '......kyk',
    '.....kyyk',
    'k...kyyk.',
    'kykkyyyk.',
    '.kyyyykk.',
    '..kkkk...',
  ],
  big: [
    '....k....',
    '...klk...',
    '..klllk..',
    '.klllllk.',
    'kkklllkkk',
    '..klllk..',
    '..klllk..',
    '..kkkkk..',
  ],
  swap: [
    '..k......',
    '.kck.....',
    'kccccccck',
    '.kck.....',
    '..k...k..',
    '.....kok.',
    'koooooook',
    '.....kok.',
    '......k..',
  ],
};
const ITEM_ICON_COLORS = { k: PAL.black, y: PAL.yellow, l: PAL.lime, c: PAL.cyan, o: PAL.orange };
const PICKUP_BOX_SIZE = 13;

function buildItemIcons() {
  const icons = {};
  for (const type in ITEM_ICON_PIXELS) icons[type] = buildPixelSprite(ITEM_ICON_PIXELS[type], ITEM_ICON_COLORS);
  return icons;
}

// Powerup methods, mixed into Renderer (see render.js).
const RENDERER_POWERUP_METHODS = {
  // Pickups are boxes with the item on show, so players can pick which one to go for.
  drawPickups(race, camX, camY) {
    const ctx = this.ctx, half = Math.floor(PICKUP_BOX_SIZE / 2);
    const frame = Math.floor(race.time * 4) % 2 ? PAL.white : PAL.purpleLight;
    for (const p of race.pickups) {
      const x = Math.round(p.x - camX) - half, y = Math.round(p.y - camY) - half;
      if (x < -16 || y < -16 || x > VIEW_W + 16 || y > VIEW_H + 16) continue;
      ctx.fillStyle = PAL.black;
      ctx.fillRect(x - 1, y - 1, PICKUP_BOX_SIZE + 2, PICKUP_BOX_SIZE + 2);
      ctx.fillStyle = frame;
      ctx.fillRect(x, y, PICKUP_BOX_SIZE, PICKUP_BOX_SIZE);
      ctx.fillStyle = PAL.purpleDark;
      ctx.fillRect(x + 1, y + 1, PICKUP_BOX_SIZE - 2, PICKUP_BOX_SIZE - 2);
      const icon = this.itemIcons[p.type];
      ctx.drawImage(icon, x + Math.floor((PICKUP_BOX_SIZE - icon.width) / 2), y + Math.floor((PICKUP_BOX_SIZE - icon.height) / 2));
    }
  },

  drawBananas(race, camX, camY) {
    const icon = this.itemIcons.banana;
    for (const b of race.bananas) {
      const x = Math.round(b.x - camX - icon.width / 2), y = Math.round(b.y - camY - icon.height / 2);
      if (x < -16 || y < -16 || x > VIEW_W + 16 || y > VIEW_H + 16) continue;
      this.ctx.drawImage(icon, x, y);
    }
  },

  // Bottom-left: the held item, then a countdown bar while Big (or the boost label).
  drawItemHud(pl, blink) {
    const ctx = this.ctx, y = VIEW_H - 38;
    drawPanel(ctx, 6, y, 30, 32);
    drawText(ctx, 'ITEM', 9, y + 2, PAL.lime);
    if (pl.heldItem) {
      const icon = this.itemIcons[pl.heldItem];
      ctx.drawImage(icon, 21 - icon.width, y + 12 + (9 - icon.height), icon.width * 2, icon.height * 2);
    }
    if (pl.isBig) {
      drawPanel(ctx, 42, y, 64, 32);
      drawText(ctx, 'BIG!', 46, y + 3, blink ? PAL.lime : PAL.white, 2, 'left', PAL.black);
      ctx.fillStyle = PAL.black;
      ctx.fillRect(45, y + 21, 58, 7);
      ctx.fillStyle = PAL.lime;
      ctx.fillRect(46, y + 22, Math.ceil(56 * pl.bigTimer / BIG_TIME), 5);
    } else if (pl.boostTimer > 0) {
      drawText(ctx, 'BOOST!', 42, y + 16, blink ? PAL.orange : PAL.yellow, 2, 'left', PAL.black);
    }
  },
};
