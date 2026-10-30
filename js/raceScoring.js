'use strict';

// Arcade scoring. Every race pays out something; bumping and grabbing stuff pays the most.
const POINTS = { bump: 25, bigBump: 75, coin: 10, boost: 5, cone: 5, bananaHit: 50 };
const BIG_BUMP_IMPACT = 90;
const MIN_BUMP_IMPACT = 20;
const COMBO_WINDOW = 2;
const COMBO_MAX = 3;
const PLACE_BONUS = [1000, 700, 500, 350, 200];
const PLACE_BONUS_MIN = 100;
const FIELD_BONUS = 40;       // per car beaten
const TIME_BONUS = 50;        // per second under par
const PAR_SLACK = 1.35;       // par is a flat-out race time plus this margin

// Scoring, mixed into Race (see race.js).
const RACE_SCORING_METHODS = {
  addPoints(kind, pts, x, y, color = PAL.yellow) {
    this.score[kind] += pts;
    this.popups.push({ x, y, text: '+' + pts, color, life: 0.9 });
  },

  scoreBump(hit) {
    const p = this.player;
    if (!this.playerScoring || (hit.a !== p && hit.b !== p)) return;
    if (hit.impact < MIN_BUMP_IMPACT || this.bumpCooldown > 0) return;
    this.bumpCooldown = 0.3;
    this.combo = this.comboTimer > 0 ? Math.min(COMBO_MAX, this.combo + 1) : 1;
    this.comboTimer = COMBO_WINDOW;
    const big = hit.impact >= BIG_BUMP_IMPACT;
    this.addPoints('bumps', (big ? POINTS.bigBump : POINTS.bump) * this.combo, hit.x, hit.y - 6, big ? PAL.orange : PAL.yellow);
    if (this.combo > 1) this.popups.push({ x: hit.x, y: hit.y - 16, text: 'COMBO X' + this.combo + '!', color: PAL.lime, life: 1.1 });
    this.events.push({ type: 'bump', big });
  },

  onObstacleHit(car, hit) {
    if (hit.type === 'cone') this.sparks(hit.x, hit.y, 40, [PAL.orange, PAL.white]);
    if (hit.type === 'coin') this.sparks(hit.x, hit.y, 50, [PAL.yellow, PAL.white]);
    if (car !== this.player || !this.playerScoring || !POINTS[hit.type]) return;
    const color = hit.type === 'coin' ? PAL.yellow : hit.type === 'boost' ? PAL.orange : PAL.lime;
    this.addPoints('pickups', POINTS[hit.type], hit.x, hit.y - 6, color);
  },

  awardFinish(car) {
    const place = car.finishOrder;
    this.score.place = PLACE_BONUS[place - 1] || PLACE_BONUS_MIN;
    this.score.field = (this.cars.length - place) * FIELD_BONUS;
    this.score.time = Math.max(0, Math.round((this.parTime - car.finishTime) * TIME_BONUS));
    this.confetti(car.x, car.y);
  },
};
