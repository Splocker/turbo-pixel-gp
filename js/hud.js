'use strict';

function drawPanel(ctx, x, y, w, h, fill = PAL.purpleDark) {
  ctx.fillStyle = PAL.black;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = PAL.purple;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y, 1, h);
}

// Renderer methods for the race HUD. Mixed into Renderer in render.js.
const HudMethods = {
  drawHUD(race, now) {
    const ctx = this.ctx;
    const pl = race.player;
    const total = race.cars.length;
    const blink = Math.floor(now * 4) % 2 === 0;

    drawPanel(ctx, 6, 6, 62, 30);
    drawText(ctx, 'POS', 10, 9, PAL.lime);
    drawText(ctx, String(pl.position), 10, 19, PAL.orange, 2);
    drawText(ctx, '/' + total, 12 + textWidth(String(pl.position), 2), 26, PAL.white);

    drawPanel(ctx, 74, 6, 50, 30);
    drawText(ctx, 'LAP', 78, 9, PAL.lime);
    const lap = Math.min(RACE_LAPS, pl.lapsCompleted + 1);
    drawText(ctx, String(lap), 78, 19, PAL.white, 2);
    drawText(ctx, '/' + RACE_LAPS, 80 + textWidth(String(lap), 2), 26, PAL.white);

    const tx = VIEW_W - 112;
    drawPanel(ctx, tx, 6, 106, 40);
    drawText(ctx, 'SCORE', tx + 4, 9, PAL.lime);
    drawText(ctx, String(race.scoreTotal), tx + 102, 18, PAL.orange, 2, 'right', PAL.black);
    drawText(ctx, 'TIME', tx + 4, 36, PAL.purpleLight);
    drawText(ctx, formatTime(pl.finished ? pl.finishTime : race.time), tx + 102, 36, PAL.white, 1, 'right');
    if (race.comboTimer > 0 && race.combo > 1 && blink) {
      drawText(ctx, 'COMBO X' + race.combo, tx + 53, 51, PAL.lime, 1, 'center', PAL.black);
    }

    // Mini standings: top four, plus the player if further back.
    const list = race.standings.slice(0, 4);
    if (!list.includes(pl)) list.push(pl);
    drawPanel(ctx, 6, 42, 62, list.length * 9 + 4);
    list.forEach((car, k) => {
      const y = 45 + k * 9;
      drawText(ctx, String(car.position), 10, y, PAL.white);
      ctx.fillStyle = PAL.black;
      ctx.fillRect(22, y, 7, 7);
      ctx.fillStyle = car.body;
      ctx.fillRect(23, y + 1, 5, 5);
      drawText(ctx, car.name, 32, y, car.isPlayer ? PAL.orange : PAL.white);
    });

    this.drawItemSlot(pl, blink);
    if (pl.boostTimer > 0) {
      drawText(ctx, 'BOOST!', 8, VIEW_H - 22, blink ? PAL.orange : PAL.yellow, 2, 'left', PAL.black);
    }

    // Minimap.
    const mm = this.minimap;
    const mx = VIEW_W - mm.cv.width - 10, my = VIEW_H - mm.cv.height - 10;
    drawPanel(ctx, mx - 4, my - 4, mm.cv.width + 8, mm.cv.height + 8);
    ctx.drawImage(mm.cv, mx, my);
    for (const car of race.cars) {
      if (car === pl) continue;
      ctx.fillStyle = car.body;
      ctx.fillRect(mx + Math.floor(car.x * mm.scale) - 1, my + Math.floor(car.y * mm.scale) - 1, 3, 3);
    }
    ctx.fillStyle = PAL.black;
    ctx.fillRect(mx + Math.floor(pl.x * mm.scale) - 3, my + Math.floor(pl.y * mm.scale) - 3, 6, 6);
    ctx.fillStyle = PAL.orange;
    ctx.fillRect(mx + Math.floor(pl.x * mm.scale) - 2, my + Math.floor(pl.y * mm.scale) - 2, 4, 4);

    if (pl.wrongWayTimer > 0.8 && blink) {
      drawText(ctx, 'WRONG WAY!', VIEW_W / 2, 70, PAL.red, 3, 'center', PAL.black);
    } else if (pl.lostTimer > 0.4 && !pl.finished) {
      drawText(ctx, 'RETURN TO TRACK', VIEW_W / 2, 70, PAL.orange, 2, 'center', PAL.black);
    }
  },

  // The held item next to the lap counter, and a bar showing how much Big time is left.
  drawItemSlot(pl, blink) {
    const ctx = this.ctx, x = 130, y = 6;
    drawPanel(ctx, x, y, 34, 30);
    drawText(ctx, 'ITEM', x + 17, y + 3, PAL.lime, 1, 'center');
    if (pl.heldPowerup) {
      ctx.drawImage(this.powerupBoxes[pl.heldPowerup], x + 12, y + 14);
      if (blink) drawText(ctx, 'SPACE', x + 17, y + 33, PAL.white, 1, 'center', PAL.black);
    }
    if (pl.isBig) {
      ctx.fillStyle = PAL.black;
      ctx.fillRect(x - 1, y + 43, 36, 5);
      ctx.fillStyle = PAL.lime;
      ctx.fillRect(x, y + 44, Math.ceil(34 * pl.bigTimer / BIG_TIME), 3);
    }
  },

  // Start lights: three lamps that light up red, then all go lime.
  drawCountdown(race) {
    const ctx = this.ctx;
    const go = race.running;
    const lit = go ? 3 : clamp(Math.floor(COUNTDOWN_TIME - race.countdown) + 1, 0, 3);
    const w = 3 * 20 + 8, x = Math.round(VIEW_W / 2 - w / 2), y = 40;
    drawPanel(ctx, x, y, w, 26, PAL.black);
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = k < lit ? (go ? PAL.lime : PAL.red) : PAL.purpleDark;
      ctx.fillRect(x + 6 + k * 20, y + 5, 16, 16);
      if (k < lit) {
        ctx.fillStyle = PAL.white;
        ctx.fillRect(x + 8 + k * 20, y + 7, 3, 3);
      }
    }
    const label = go ? 'GO!' : String(Math.ceil(race.countdown));
    drawText(ctx, label, VIEW_W / 2, y + 32, go ? PAL.lime : PAL.orange, 4, 'center', PAL.black);
  },
};
