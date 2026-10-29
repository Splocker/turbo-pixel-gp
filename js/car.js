'use strict';

const CAR_SPEED = 250;        // the one cruising speed, px/s
const CAR_ACCEL = 1200;       // high enough that W feels like instant full speed
const CAR_COAST = 150;
const CAR_BRAKE = 700;
const CAR_REVERSE_MAX = 110;
const CAR_STEER_RATE = 3.2;   // rad/s, the same at every speed above a crawl
const CAR_GRIP = 12;          // how quickly sideways slide is scrubbed off
const GRASS_SPEED = 0.6;      // off the road the car eases down to this share of its speed
const GRASS_GRIP = 0.75;
const CAR_BOOST = 1.3;
const CAR_BOOST_TIME = 1.2;
const CAR_RADIUS = 4.2;       // collision shape: two circles along the car's length
const CAR_CIRCLE_OFFSET = 3.5;
const BIG_TIME = 7;           // seconds the Big powerup lasts
const BIG_SCALE = 2;          // a big car is twice the size, for drawing and collisions
const SLIDE_DRAG = 0.8;       // how fast a car sliding on a banana loses speed

class Car {
  constructor({ name, body, stripe, isPlayer = false }) {
    this.name = name;
    this.body = body;
    this.stripe = stripe;
    this.isPlayer = isPlayer;
    this.mass = isPlayer ? 1.4 : 1; // the player shoves harder than they get shoved
    this.x = 0;
    this.y = 0;
    this.angle = 0;
    this.vx = 0;
    this.vy = 0;
    this.speedFactor = 1;
    this.boostTimer = 0;
    this.bigTimer = 0;
    this.heldPowerup = null;      // 'banana' | 'big' | 'swap' | null - one item slot
    this.heldPowerupTime = 0;     // how long the current item has been held
    this.surface = 'road';
    this.input = { throttle: 0, brake: 0, steer: 0, usePowerup: false };
    this.spinTimer = 0;
    this.spinRate = 0;
    this.spinKeepsTrajectory = false;
    this.skidding = false;
    this.ai = null;

    // Race progress
    this.idx = 0;
    this.totalDist = 0;
    this.lapsCompleted = 0;
    this.lapStart = 0;
    this.lapTimes = [];
    this.finished = false;
    this.finishTime = null;
    this.finishOrder = 0;
    this.position = 0;
    this.lostTimer = 0;
    this.wrongWayTimer = 0;
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  get forwardSpeed() {
    return this.vx * Math.cos(this.angle) + this.vy * Math.sin(this.angle);
  }

  get bestLap() {
    return this.lapTimes.length ? Math.min(...this.lapTimes) : null;
  }

  get isBig() {
    return this.bigTimer > 0;
  }

  get sizeScale() {
    return this.isBig ? BIG_SCALE : 1;
  }

  get topSpeed() {
    const surface = this.surface === 'grass' ? GRASS_SPEED : 1;
    return CAR_SPEED * this.speedFactor * surface * (this.boostTimer > 0 ? CAR_BOOST : 1);
  }

  place(x, y, angle) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.vx = 0;
    this.vy = 0;
    this.spinTimer = 0;
    this.spinRate = 0;
    this.spinKeepsTrajectory = false;
    this.boostTimer = 0;
    this.bigTimer = 0;
  }

  // Loss of control. With keepTrajectory (a banana) the car twirls but keeps sliding the way it
  // was already travelling; otherwise (a bump) it scrubs speed and slides with little grip.
  spinOut(duration, rate, { keepTrajectory = false } = {}) {
    if (this.isPlayer) duration *= 0.7;
    if (this.spinTimer <= 0) {
      this.spinRate = rate;
      this.spinKeepsTrajectory = keepTrajectory;
    } else if (keepTrajectory) {
      this.spinKeepsTrajectory = true;
    }
    this.spinTimer = Math.max(this.spinTimer, duration);
  }

  update(dt) {
    this.boostTimer = Math.max(0, this.boostTimer - dt);
    this.bigTimer = Math.max(0, this.bigTimer - dt);
    if (this.heldPowerup) this.heldPowerupTime += dt;
    if (this.spinTimer > 0 && this.spinKeepsTrajectory) {
      this.slideAlongTrajectory(dt);
      return;
    }

    const cos = Math.cos(this.angle), sin = Math.sin(this.angle);
    let vF = this.vx * cos + this.vy * sin;
    let vL = -this.vx * sin + this.vy * cos;
    const inp = this.input;
    const maxSp = this.topSpeed;
    let grip = CAR_GRIP;
    let turn = 0;

    if (this.spinTimer > 0) {
      // Loss of control: inputs ignored, the car rotates and slides.
      this.spinTimer -= dt;
      turn = this.spinRate;
      this.spinRate *= Math.exp(-2 * dt);
      vF -= vF * 1.2 * dt;
      grip = 2;
    } else {
      if (inp.throttle > 0 && vF < maxSp) vF = Math.min(maxSp, vF + CAR_ACCEL * inp.throttle * dt);
      if (inp.brake > 0) {
        if (vF > 5) vF = Math.max(0, vF - CAR_BRAKE * inp.brake * dt);
        else if (vF > -CAR_REVERSE_MAX) vF -= 300 * inp.brake * dt;
      }
      if (!inp.throttle && !inp.brake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), CAR_COAST * dt);
      if (vF > maxSp) vF -= (vF - maxSp) * 3 * dt; // bleed off boost, bumps and grass

      const rate = CAR_STEER_RATE * Math.min(1, Math.abs(vF) / 40);
      turn = inp.steer * rate * Math.sign(vF);
      if (this.surface === 'grass') grip *= GRASS_GRIP;
    }

    vL *= Math.exp(-grip * dt);
    this.vx = vF * cos - vL * sin;
    this.vy = vF * sin + vL * cos;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle = wrapAngle(this.angle + turn * dt);
    this.skidding = (Math.abs(vL) > 45 || this.spinTimer > 0) && this.surface !== 'grass';
  }

  // Banana spin: the body rotates while the car keeps moving in the same direction, slowly losing speed.
  slideAlongTrajectory(dt) {
    this.spinTimer -= dt;
    const drag = Math.exp(-SLIDE_DRAG * dt);
    this.vx *= drag;
    this.vy *= drag;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle = wrapAngle(this.angle + this.spinRate * dt);
    this.spinRate *= Math.exp(-dt);
    this.skidding = this.surface !== 'grass';
    if (this.spinTimer <= 0) this.spinKeepsTrajectory = false;
  }
}
