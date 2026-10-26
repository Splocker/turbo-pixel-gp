'use strict';

const AI_PLAN_DECEL = 340;      // braking assumed when planning corner entry
const AI_CORNER_MARGIN = 0.94;  // safety factor on the theoretical corner speed
const AI_RUBBER_BAND_GAP = 700; // only boost when this far behind the player
const AI_RUBBER_BAND = 1.04;

// Fastest speed at which the car's steering can hold a radius R (see Car.update):
// v = R * rate(v), rate(v) = STEER_RATE * (1 - FALLOFF * v / MAX)
function cornerSpeed(radius) {
  const a = CAR_STEER_RATE, b = CAR_STEER_FALLOFF;
  return (a * radius) / (1 + (a * b * radius) / CAR_MAX_SPEED);
}

// Target speed for every sample of the racing line, including braking zones before corners.
function buildSpeedProfile(track) {
  const n = track.n;
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = 1 / Math.max(Math.abs(track.lineCurv[i]), 1e-5);
    v[i] = Math.min(CAR_MAX_SPEED * 1.05, cornerSpeed(r) * AI_CORNER_MARGIN);
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const j = (i + 1) % n;
      v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * AI_PLAN_DECEL * track.spacing));
    }
  }
  return v;
}

class AIDriver {
  constructor(car, track, rng, { speedFactor = 1, cornerFactor = 1 } = {}) {
    this.car = car;
    this.track = track;
    this.speedFactor = speedFactor;
    this.cornerFactor = cornerFactor;
    this.laneBias = (rng() - 0.5) * 10;
    this.startLane = null; // grid lane held off the start, blended onto the racing line
    this.startBlend = 1;
    this.avoid = 0;
    this.avoidTarget = 0;
    this.avoidTimer = 0;
    this.stuckTimer = 0;
    this.reverseTimer = 0;
    if (!track.aiSpeed) track.aiSpeed = buildSpeedProfile(track);
  }

  update(dt, race) {
    const car = this.car, track = this.track;
    const inp = car.input;
    const vF = car.forwardSpeed;
    const sp = Math.abs(vF);

    // Mild catch-up only when well behind the player; never slowed down when ahead.
    const player = race.player;
    car.boost = player && !player.finished && car.totalDist < player.totalDist - AI_RUBBER_BAND_GAP ? AI_RUBBER_BAND : 1;
    car.speedFactor = this.speedFactor;

    this.updateAvoidance(dt, race.cars);

    const la = 26 + sp * 0.3;
    const j = track.wrap(car.idx + Math.round(la / track.spacing));
    const limit = TRACK_HALF_WIDTH - 6;
    if (this.startLane === null) this.startLane = track.lateral(car.x, car.y, car.idx);
    this.startBlend = Math.max(0, this.startBlend - dt / 5);
    const lane = lerp(track.lineOff[j] + this.laneBias, this.startLane, this.startBlend);
    const off = clamp(lane + this.avoid, -limit, limit);
    const tx = track.x[j] + track.nx[j] * off;
    const ty = track.y[j] + track.ny[j] * off;
    const err = wrapAngle(Math.atan2(ty - car.y, tx - car.x) - car.angle);

    // Reverse out only when stuck against something; otherwise U-turn forwards (the road is wide enough).
    if (this.reverseTimer > 0) {
      this.reverseTimer -= dt;
      inp.throttle = 0;
      inp.brake = 1;
      inp.steer = -Math.sign(err);
      inp.handbrake = false;
      if (Math.abs(err) < 0.6) this.reverseTimer = 0;
      return;
    }
    if (car.spinTimer <= 0 && race.running) {
      if (sp < 12) this.stuckTimer += dt;
      else this.stuckTimer = 0;
      if (this.stuckTimer > 1.0) {
        this.stuckTimer = 0;
        this.reverseTimer = 0.9;
      }
    }

    // Pure pursuit: steer to the curvature that reaches the look-ahead point.
    const rate = CAR_STEER_RATE * (1 - CAR_STEER_FALLOFF * Math.min(1, sp / CAR_MAX_SPEED)) * Math.min(1, Math.max(sp, 20) / 50);
    const dist = Math.hypot(tx - car.x, ty - car.y) || 1;
    const wantCurv = (2 * Math.sin(err)) / dist;
    inp.steer = clamp((wantCurv * Math.max(sp, 30)) / rate, -1, 1);
    inp.handbrake = false;

    // Speed: look slightly ahead on the profile to account for reaction time.
    const k = track.wrap(car.idx + 2 + Math.round(sp * 0.05 / track.spacing));
    let target = Math.min(track.aiSpeed[k] * this.cornerFactor, CAR_MAX_SPEED * this.speedFactor * car.boost);
    if (car.surface === 'grass') target = Math.min(target, CAR_MAX_SPEED * GRASS_SPEED);
    if (Math.abs(err) > 1.0) target = Math.min(target, 60); // tight recovery turn
    // Don't run into the back of a car we can't get around yet.
    if (this.blockedGap < Infinity) target = Math.min(target, this.blockSpeed + Math.max(0, this.blockedGap - 16) * 2);

    if (vF < target - 4) {
      inp.throttle = 1;
      inp.brake = 0;
    } else if (vF > target + 10) {
      inp.throttle = 0;
      inp.brake = clamp((vF - target) / 40, 0.3, 1);
    } else {
      inp.throttle = 0.35;
      inp.brake = 0;
    }
  }

  // Look for a car directly ahead; if found, go around it on a side that is free.
  // Also give room to cars running alongside.
  updateAvoidance(dt, cars) {
    const car = this.car, track = this.track;
    const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
    const limit = TRACK_HALF_WIDTH - 8;
    this.blockedGap = Infinity;
    this.blockSpeed = 0;
    let threat = null;
    let sidePush = 0;
    for (const o of cars) {
      if (o === car) continue;
      const dx = o.x - car.x, dy = o.y - car.y;
      if (Math.abs(dx) > 80 || Math.abs(dy) > 80) continue;
      const ahead = dx * fx + dy * fy;
      const side = -dx * fy + dy * fx; // positive: the other car is on my right
      if (Math.abs(ahead) < 18 && Math.abs(side) < 18) {
        sidePush -= Math.sign(side) * (18 - Math.abs(side)) * 0.8;
      }
      if (ahead <= 0 || ahead > 75 || Math.abs(side) > 13) continue;
      const otherSpeed = o.vx * fx + o.vy * fy;
      if (car.forwardSpeed - otherSpeed <= 0 && ahead > 30) continue;
      if (ahead < this.blockedGap) {
        threat = o;
        this.blockedGap = ahead;
        this.blockSpeed = otherSpeed;
      }
    }

    if (threat && this.startBlend < 0.4) {
      const otherLat = track.lateral(threat.x, threat.y, threat.idx);
      const myLine = track.lineOff[car.idx] + this.laneBias;
      const options = [otherLat - 20, otherLat + 20]
        .filter((lat) => Math.abs(lat) <= limit && this.laneFree(lat, threat, cars))
        .sort((a, b) => Math.abs(a - myLine) - Math.abs(b - myLine));
      if (options.length) {
        this.avoidTarget = options[0] - myLine;
        this.avoidTimer = 0.8;
      }
    } else if (this.avoidTimer > 0) {
      this.avoidTimer -= dt;
    } else {
      this.avoidTarget = 0;
    }
    const want = this.avoidTarget + sidePush;
    this.avoid += (want - this.avoid) * Math.min(1, 4 * dt);
  }

  // Is the lane at this lateral offset clear of other cars near us?
  laneFree(lat, ignore, cars) {
    const car = this.car, track = this.track;
    for (const o of cars) {
      if (o === car || o === ignore) continue;
      let ds = o.idx - car.idx;
      if (ds > track.n / 2) ds -= track.n;
      if (ds < -track.n / 2) ds += track.n;
      ds *= track.spacing;
      if (ds < -16 || ds > 60) continue;
      if (Math.abs(track.lateral(o.x, o.y, o.idx) - lat) < 12) return false;
    }
    return true;
  }
}
