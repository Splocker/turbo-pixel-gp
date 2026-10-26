'use strict';

const AI_PACK_GAP = 250;   // distance from the player at which the pack rubber band kicks in
const AI_AHEAD_SPEED = 0.8;
const AI_BEHIND_SPEED = 1.0;

class AIDriver {
  constructor(car, track, rng, { speedFactor = 0.9 } = {}) {
    this.car = car;
    this.track = track;
    this.speedFactor = speedFactor;
    this.lanes = rng() < 0.5 ? track.aiLaneL : track.aiLaneR;
    this.laneBias = (rng() - 0.5) * 8;
    // A slow weave around the lane: sometimes it carries the car into a bumper or the oil.
    this.weaveAmp = 2 + rng() * 6;
    this.weaveFreq = 0.6 + rng() * 0.8;
    this.weavePhase = rng() * TAU;
    this.startLane = null; // grid lane held off the start, blended onto the driving lane
    this.startBlend = 1;
    this.avoid = 0;
    this.avoidTarget = 0;
    this.avoidTimer = 0;
    this.stuckTimer = 0;
    this.reverseTimer = 0;
  }

  update(dt, race) {
    const car = this.car, track = this.track;
    const inp = car.input;
    const vF = car.forwardSpeed;
    const sp = Math.abs(vF);

    // Keep the pack around the player: leaders ease off, stragglers run flat out.
    const player = race.player;
    let factor = this.speedFactor;
    if (player && player !== car && !player.finished) {
      const gap = car.totalDist - player.totalDist;
      if (gap > AI_PACK_GAP) factor = Math.min(factor, AI_AHEAD_SPEED);
      else if (gap < -AI_PACK_GAP) factor = AI_BEHIND_SPEED;
    }
    car.speedFactor = factor;

    this.updateAvoidance(dt, race);

    const la = 24 + sp * 0.12;
    const j = track.wrap(car.idx + Math.round(la / track.spacing));
    const limit = TRACK_HALF_WIDTH - 6;
    if (this.startLane === null) this.startLane = track.lateral(car.x, car.y, car.idx);
    this.startBlend = Math.max(0, this.startBlend - dt / 3);
    const weave = Math.sin(race.time * this.weaveFreq + this.weavePhase) * this.weaveAmp;
    const lane = lerp(this.lanes[j] + this.laneBias + weave, this.startLane, this.startBlend);
    const off = clamp(lane + this.avoid, -limit, limit);
    const tx = track.x[j] + track.nx[j] * off;
    const ty = track.y[j] + track.ny[j] * off;
    const err = wrapAngle(Math.atan2(ty - car.y, tx - car.x) - car.angle);

    // Reverse out only when stuck against something; otherwise U-turn forwards.
    if (this.reverseTimer > 0) {
      this.reverseTimer -= dt;
      inp.throttle = 0;
      inp.brake = 1;
      inp.steer = -Math.sign(err);
      if (Math.abs(err) < 0.6) this.reverseTimer = 0;
      return;
    }
    if (car.spinTimer <= 0 && race.running) {
      if (sp < 12) this.stuckTimer += dt;
      else this.stuckTimer = 0;
      if (this.stuckTimer > 0.8) {
        this.stuckTimer = 0;
        this.reverseTimer = 0.7;
      }
    }

    // Pure pursuit: steer to the curvature that reaches the look-ahead point.
    const rate = CAR_STEER_RATE * Math.min(1, Math.max(sp, 20) / 40);
    const dist = Math.hypot(tx - car.x, ty - car.y) || 1;
    const wantCurv = (2 * Math.sin(err)) / dist;
    inp.steer = clamp((wantCurv * Math.max(sp, 30)) / rate, -1, 1);

    let target = car.topSpeed;
    if (Math.abs(err) > 1.0) target = Math.min(target, 80); // tight recovery turn
    // Don't run into the back of something we can't get around yet.
    if (this.blockedGap < Infinity) target = Math.min(target, this.blockSpeed + Math.max(0, this.blockedGap - 16) * 2.5);

    if (vF < target - 4) {
      inp.throttle = 1;
      inp.brake = 0;
    } else if (vF > target + 20) {
      inp.throttle = 0;
      inp.brake = clamp((vF - target) / 60, 0.3, 1);
    } else {
      inp.throttle = 0;
      inp.brake = 0;
    }
  }

  // Look for a car (or sliding block) directly ahead; if found, go around it on a side that is
  // free. Also give room to cars running alongside.
  updateAvoidance(dt, race) {
    const car = this.car, track = this.track;
    const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
    const limit = TRACK_HALF_WIDTH - 8;
    this.blockedGap = Infinity;
    this.blockSpeed = 0;
    let threat = null;
    let sidePush = 0;
    const others = race.obstacles ? race.cars.concat(race.obstacles.sliders) : race.cars;
    for (const o of others) {
      if (o === car) continue;
      const dx = o.x - car.x, dy = o.y - car.y;
      if (Math.abs(dx) > 80 || Math.abs(dy) > 80) continue;
      const ahead = dx * fx + dy * fy;
      const side = -dx * fy + dy * fx; // positive: the other thing is on my right
      if (Math.abs(ahead) < 18 && Math.abs(side) < 18) {
        sidePush -= Math.sign(side) * (18 - Math.abs(side)) * 0.8;
      }
      if (ahead <= 0 || ahead > 75 || Math.abs(side) > 14) continue;
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
      const myLine = this.lanes[car.idx] + this.laneBias;
      const options = [otherLat - 22, otherLat + 22]
        .filter((lat) => Math.abs(lat) <= limit && this.laneFree(lat, threat, race.cars))
        .sort((a, b) => Math.abs(a - myLine) - Math.abs(b - myLine));
      if (options.length) {
        this.avoidTarget = options[0] - myLine;
        this.avoidTimer = 0.7;
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
