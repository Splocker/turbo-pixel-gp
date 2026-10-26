'use strict';

const CAR_MAX_SPEED = 300;    // px/s on asphalt
const CAR_ACCEL = 240;
const CAR_BRAKE = 520;
const CAR_REVERSE_MAX = 90;
const CAR_STEER_RATE = 3.4;   // rad/s at low speed
const CAR_STEER_FALLOFF = 0.6; // fraction of steering lost at top speed
const CAR_GRIP = 9;           // how quickly sideways slide is scrubbed off
const GRASS_SPEED = 0.42;
const CAR_RADIUS = 4.2;       // collision shape: two circles along the car's length
const CAR_CIRCLE_OFFSET = 3.5;

class Car {
  constructor({ name, body, stripe, isPlayer = false }) {
    this.name = name;
    this.body = body;
    this.stripe = stripe;
    this.isPlayer = isPlayer;
    this.x = 0;
    this.y = 0;
    this.angle = 0;
    this.vx = 0;
    this.vy = 0;
    this.speedFactor = 1;
    this.boost = 1;
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this.spinTimer = 0;
    this.spinRate = 0;
    this.surface = 'road';
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

  place(x, y, angle) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.vx = 0;
    this.vy = 0;
    this.spinTimer = 0;
    this.spinRate = 0;
  }

  spinOut(duration, rate) {
    if (this.spinTimer <= 0) this.spinRate = rate;
    this.spinTimer = Math.max(this.spinTimer, duration);
  }

  update(dt) {
    const cos = Math.cos(this.angle), sin = Math.sin(this.angle);
    let vF = this.vx * cos + this.vy * sin;
    let vL = -this.vx * sin + this.vy * cos;
    const inp = this.input;
    const onGrass = this.surface === 'grass';
    const maxSp = CAR_MAX_SPEED * this.speedFactor * this.boost * (onGrass ? GRASS_SPEED : 1);
    let grip = CAR_GRIP;
    let turn = 0;

    if (this.spinTimer > 0) {
      // Loss of control: inputs ignored, the car rotates and slides.
      this.spinTimer -= dt;
      turn = this.spinRate;
      this.spinRate *= Math.exp(-1.5 * dt);
      vF -= vF * 1.4 * dt;
      grip = 1.5;
    } else {
      if (inp.throttle > 0) {
        if (vF < -5) vF = Math.min(0, vF + CAR_BRAKE * inp.throttle * dt);
        else if (vF < maxSp) vF += inp.throttle * CAR_ACCEL * (1 - 0.8 * Math.max(0, vF) / maxSp) * dt;
      }
      if (inp.brake > 0) {
        if (vF > 5) vF = Math.max(0, vF - CAR_BRAKE * inp.brake * dt);
        else if (vF > -CAR_REVERSE_MAX) vF -= CAR_ACCEL * 0.6 * inp.brake * dt;
      }
      if (!inp.throttle && !inp.brake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 60 * dt);
      if (vF > maxSp) vF -= (vF - maxSp) * 3 * dt;
      vF -= vF * 0.05 * dt;

      const sp = Math.abs(vF);
      let rate = CAR_STEER_RATE * (1 - CAR_STEER_FALLOFF * Math.min(1, sp / CAR_MAX_SPEED)) * Math.min(1, sp / 50);
      if (inp.handbrake && sp > 20) {
        grip = 1.8;
        rate *= 1.35;
        vF -= vF * 0.9 * dt;
      }
      if (onGrass) grip *= 0.6;
      turn = inp.steer * rate * Math.sign(vF);
    }

    vL *= Math.exp(-grip * dt);
    this.vx = vF * cos - vL * sin;
    this.vy = vF * sin + vL * cos;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle = wrapAngle(this.angle + turn * dt);
    this.skidding = (Math.abs(vL) > 45 || this.spinTimer > 0 || (inp.handbrake && Math.abs(vF) > 60)) && !onGrass;
  }
}
