'use strict';

// Game methods for the title, setup and pause screens and the in-race overlay. Mixed into Game in game.js.
const GameMenuMethods = {
  blink(rate = 2) {
    return Math.floor(this.now * rate * 2) % 2 === 0;
  },

  drawChecker(x, y, w, size = 4, rows = 2) {
    const ctx = this.ctx;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c * size < w; c++) {
        ctx.fillStyle = (r + c) % 2 ? PAL.black : PAL.white;
        ctx.fillRect(x + c * size, y + r * size, Math.min(size, w - c * size), size);
      }
    }
  },

  drawLogo(y) {
    const ctx = this.ctx, cx = VIEW_W / 2;
    drawText(ctx, 'TURBO', cx + 4, y + 4, PAL.purpleDeep, 6, 'center');
    drawText(ctx, 'TURBO', cx + 2, y + 2, PAL.purple, 6, 'center');
    drawText(ctx, 'TURBO', cx, y, PAL.orange, 6, 'center');
    drawText(ctx, 'PIXEL GP', cx, y + 48, PAL.lime, 3, 'center', PAL.black);
    this.drawChecker(cx - 100, y + 74, 200);
  },

  drawTitle() {
    const ctx = this.ctx;
    this.drawLogo(12);
    if (this.blink()) drawText(ctx, 'PRESS ENTER TO START', VIEW_W / 2, 98, PAL.white, 1, 'center', PAL.black);
    this.drawScoreTable(100, 112, 280, -1);
    drawText(ctx, 'BUMP RIVALS  GRAB COINS  HIT BOOSTS  GRAB ITEMS', VIEW_W / 2, VIEW_H - 24, PAL.lime, 1, 'center', PAL.black);
    drawText(ctx, 'W GAS  S BRAKE  A/D STEER  SPACE ITEM  R RESET  ESC PAUSE', VIEW_W / 2, VIEW_H - 12, PAL.purpleLight, 1, 'center', PAL.black);
  },

  drawScoreTable(x, y, w, highlight) {
    const ctx = this.ctx;
    const h = 22 + SCORE_LIMIT * 10;
    drawPanel(ctx, x, y, w, h);
    drawText(ctx, 'HIGH SCORES', x + w / 2, y + 4, PAL.orange, 1, 'center');
    const cols = [x + 6, x + 26, x + 100, x + 170];
    ['#', 'NAME', 'SCORE', 'PLACE'].forEach((t, k) => drawText(ctx, t, cols[k], y + 14, PAL.lime));
    if (!this.scores.length) {
      drawText(ctx, 'NO RECORDS YET - SET THE FIRST!', x + w / 2, y + 60, PAL.white, 1, 'center');
      return;
    }
    this.scores.forEach((s, k) => {
      const ry = y + 24 + k * 10;
      const hl = k === highlight;
      if (hl) {
        ctx.fillStyle = this.blink(3) ? PAL.purple : PAL.purpleDark;
        ctx.fillRect(x + 2, ry - 2, w - 4, 10);
      }
      const color = hl ? PAL.orange : k === 0 ? PAL.yellow : PAL.white;
      drawText(ctx, String(k + 1), cols[0], ry, color);
      drawText(ctx, s.name, cols[1], ry, color);
      drawText(ctx, String(s.score), cols[2], ry, color);
      drawText(ctx, ordinal(s.place || 1) + ' OF ' + ((s.opponents || 0) + 1), cols[3], ry, color);
    });
  },

  drawSetup() {
    const ctx = this.ctx, cx = VIEW_W / 2;
    const x = 80, y = 30, w = 320, h = 210;
    drawPanel(ctx, x, y, w, h);
    drawText(ctx, 'RACE SETUP', cx, y + 10, PAL.orange, 2, 'center', PAL.black);
    this.drawChecker(x + 10, y + 30, w - 20, 3, 1);

    drawText(ctx, 'OPPONENTS', cx, y + 42, PAL.lime, 1, 'center');
    const num = String(this.opponents).padStart(2, '0');
    drawText(ctx, num, cx, y + 56, PAL.orange, 4, 'center', PAL.black);
    const arrowColor = this.blink(1) ? PAL.white : PAL.purpleLight;
    if (this.opponents > 1) drawText(ctx, '<', cx - 50, y + 60, arrowColor, 3, 'center');
    if (this.opponents < MAX_OPPONENTS) drawText(ctx, '>', cx + 50, y + 60, arrowColor, 3, 'center');
    drawText(ctx, 'LAPS: ' + RACE_LAPS + '    MORE RIVALS = MORE POINTS', cx, y + 94, PAL.white, 1, 'center');

    // Grid preview: the player's car plus one icon per opponent.
    const icons = [PLAYER_LIVERY, ...AI_LIVERIES.slice(0, this.opponents)];
    const perRow = 11, gap = 24;
    icons.forEach((liv, k) => {
      const row = Math.floor(k / perRow), col = k % perRow;
      const count = Math.min(perRow, icons.length - row * perRow);
      const ix = cx - ((count - 1) * gap) / 2 + col * gap;
      this.renderer.drawCarIcon(liv[0], liv[1], ix, y + 122 + row * 26, -Math.PI / 2);
    });

    drawText(ctx, 'A/D CHANGE    ENTER START    ESC BACK', cx, y + h - 14, PAL.purpleLight, 1, 'center');
  },

  drawRaceOverlay() {
    const race = this.race, ctx = this.ctx;
    this.renderer.drawHUD(race, this.now);
    if (!race.running || race.time < 1) this.renderer.drawCountdown(race);
    if (this.flash && race.time < this.flash.until) {
      drawText(ctx, this.flash.text, VIEW_W / 2, 92, this.flash.color, 3, 'center', PAL.black);
      if (this.flash.sub) drawText(ctx, this.flash.sub, VIEW_W / 2, 118, PAL.white, 1, 'center', PAL.black);
    }
    if (this.state === 'race' && race.player.lostTimer > 1.2) {
      drawText(ctx, 'R TO RESET', VIEW_W / 2, 92, PAL.white, 1, 'center', PAL.black);
    }
  },

  drawPaused() {
    const ctx = this.ctx, cx = VIEW_W / 2;
    drawPanel(ctx, cx - 90, 90, 180, 80);
    drawText(ctx, 'PAUSED', cx, 102, PAL.orange, 3, 'center', PAL.black);
    drawText(ctx, 'ESC / ENTER  RESUME', cx, 136, PAL.white, 1, 'center');
    drawText(ctx, 'Q  QUIT TO MENU', cx, 150, PAL.lime, 1, 'center');
  },
};
