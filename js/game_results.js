'use strict';

// Game methods for the end-of-race screens: finish banner, results tally, name entry and high scores.
// Mixed into Game in game.js.
const GameResultMethods = {
  drawFinished() {
    const ctx = this.ctx, cx = VIEW_W / 2, r = this.result;
    const [headline, color] = r.place === 1 ? ['YOU WIN!', PAL.yellow] : r.place <= 3 ? ['PODIUM!', PAL.lime] : ['NICE DRIVING!', PAL.orange];
    drawPanel(ctx, cx - 130, 70, 260, 104, PAL.purpleDeep);
    this.drawChecker(cx - 126, 74, 252, 4, 2);
    drawText(ctx, headline, cx, 88, color, headline.length > 8 ? 3 : 4, 'center', PAL.black);
    drawText(ctx, ordinal(r.place) + ' OF ' + (r.opponents + 1), cx, 124, PAL.white, 2, 'center', PAL.black);
    drawText(ctx, 'SCORE ' + r.score + '   TIME ' + formatTime(r.time), cx, 144, PAL.orange, 1, 'center');
    this.drawChecker(cx - 126, 162, 252, 4, 2);
    if (this.stateTime > 1.5 && this.blink()) drawText(ctx, 'PRESS ENTER', cx, 182, PAL.white, 1, 'center', PAL.black);
  },

  // Standings on the left, the player's score counting up line by line on the right.
  drawResults() {
    const ctx = this.ctx, race = this.race, r = this.result;
    const rows = race.standings;
    const rh = rows.length > 12 ? 9 : 11;
    const h = Math.max(150, 30 + rows.length * rh + 6);
    const y = Math.max(4, Math.round((VIEW_H - h) / 2));
    const x = 16, w = 180;
    drawPanel(ctx, x, y, w, h);
    drawText(ctx, 'STANDINGS', x + w / 2, y + 6, PAL.orange, 1, 'center');
    rows.forEach((car, k) => {
      const ry = y + 22 + k * rh;
      const color = car.isPlayer ? PAL.orange : PAL.white;
      if (car.isPlayer) {
        ctx.fillStyle = PAL.purple;
        ctx.fillRect(x + 2, ry - 1, w - 4, rh);
      }
      drawText(ctx, ordinal(car.position), x + 6, ry, color);
      ctx.fillStyle = PAL.black;
      ctx.fillRect(x + 36, ry, 7, 7);
      ctx.fillStyle = car.body;
      ctx.fillRect(x + 37, ry + 1, 5, 5);
      drawText(ctx, car.name, x + 48, ry, color);
      const t = car.finished ? formatTime(car.finishTime) : 'LAP ' + Math.min(RACE_LAPS, car.lapsCompleted + 1);
      drawText(ctx, t, x + w - 6, ry, car.finished ? color : PAL.purpleLight, 1, 'right');
    });

    const tx = 210, tw = 254, ty = Math.round((VIEW_H - 196) / 2);
    drawPanel(ctx, tx, ty, tw, 196);
    drawText(ctx, 'YOUR SCORE', tx + tw / 2, ty + 8, PAL.orange, 2, 'center', PAL.black);
    const b = r.breakdown;
    const lines = [
      ['BUMPS', b.bumps],
      ['COINS + STUFF', b.pickups],
      [ordinal(r.place) + ' PLACE', b.place],
      ['BEAT ' + (r.opponents + 1 - r.place) + ' RIVALS', b.field],
      ['TIME BONUS', b.time],
    ];
    const t = this.stateTime;
    const count = (value, start) => Math.round(value * clamp((t - start) / TALLY_STEP, 0, 1));
    lines.forEach(([label, value], k) => {
      const start = TALLY_STEP * (k + 1);
      if (t < start) return;
      const ly = ty + 36 + k * 16;
      drawText(ctx, label, tx + 12, ly, PAL.lime);
      drawText(ctx, String(count(value, start)), tx + tw - 12, ly, PAL.white, 1, 'right');
    });
    const totalStart = TALLY_STEP * (lines.length + 1);
    if (t >= totalStart) {
      ctx.fillStyle = PAL.purple;
      ctx.fillRect(tx + 10, ty + 120, tw - 20, 1);
      drawText(ctx, 'TOTAL', tx + 12, ty + 130, PAL.orange, 2);
      drawText(ctx, String(count(r.score, totalStart)), tx + tw - 12, ty + 130, PAL.yellow, 2, 'right', PAL.black);
    }
    if (t >= TALLY_TIME) {
      if (r.qualifies && this.blink()) drawText(ctx, 'NEW HIGH SCORE!', tx + tw / 2, ty + 158, PAL.lime, 1, 'center');
      drawText(ctx, 'ENTER CONTINUE', tx + tw / 2, ty + 178, PAL.white, 1, 'center');
    }
  },

  drawNameEntry() {
    const ctx = this.ctx, cx = VIEW_W / 2, r = this.result;
    drawPanel(ctx, 70, 40, 340, 180);
    drawText(ctx, 'NEW HIGH SCORE!', cx, 52, PAL.orange, 2, 'center', PAL.black);
    const rank = this.scores.filter((s) => s.score >= r.score).length + 1;
    drawText(ctx, 'RANK #' + rank + '    SCORE ' + r.score + '    ' + ordinal(r.place) + ' PLACE', cx, 76, PAL.white, 1, 'center');
    drawText(ctx, 'ENTER YOUR NAME', cx, 100, PAL.lime, 1, 'center');

    const boxW = 24, total = NAME_MAX * boxW, bx = cx - total / 2;
    for (let k = 0; k < NAME_MAX; k++) {
      const x = bx + k * boxW;
      ctx.fillStyle = PAL.purpleDeep;
      ctx.fillRect(x + 2, 114, boxW - 4, 30);
      const ch = this.nameBuffer[k];
      if (ch) drawText(ctx, ch, x + boxW / 2, 120, PAL.orange, 3, 'center');
      if (k === this.nameBuffer.length && this.blink(2)) {
        ctx.fillStyle = PAL.lime;
        ctx.fillRect(x + 4, 146, boxW - 8, 3);
      }
    }
    drawText(ctx, 'TYPE A-Z 0-9    BACKSPACE DELETE    ENTER SAVE', cx, 196, PAL.purpleLight, 1, 'center');
  },

  drawScores() {
    const ctx = this.ctx, cx = VIEW_W / 2;
    drawText(ctx, 'HALL OF FAME', cx, 20, PAL.orange, 3, 'center', PAL.black);
    this.drawScoreTable(100, 56, 280, this.highlight);
    if (this.result && !this.result.qualifies) {
      drawText(ctx, 'YOU SCORED ' + this.result.score + ' - SO CLOSE! ONE MORE GO?', cx, 192, PAL.white, 1, 'center', PAL.black);
    }
    drawText(ctx, 'ENTER RACE AGAIN    ESC MENU', cx, VIEW_H - 24, PAL.white, 1, 'center', PAL.black);
  },
};
