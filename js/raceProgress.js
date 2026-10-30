'use strict';

const EDGE_ASSIST_ZONE = 10;  // px inside the road edge where the player's steering assist starts
const EDGE_ASSIST_RATE = 0.8; // rad/s

// Lap progress, positions and resets, mixed into Race (see race.js).
const RACE_PROGRESS_METHODS = {
  // Near the edge and pointing off the road, the player's car eases back toward the track
  // direction. It is gentle enough that steering off on purpose still works.
  assistToRoad(car, dt) {
    if (car.spinTimer > 0 || car.forwardSpeed < 40) return;
    const t = this.track, i = car.idx;
    const lat = t.lateral(car.x, car.y, i);
    if (Math.abs(lat) < TRACK_HALF_WIDTH - EDGE_ASSIST_ZONE) return;
    const diff = wrapAngle(Math.atan2(t.ty[i], t.tx[i]) - car.angle);
    if (Math.abs(diff) > Math.PI / 2) return; // facing backwards: leave it alone
    const outward = Math.sign(lat) * Math.sin(-diff) > 0;
    if (!outward) return;
    car.angle = wrapAngle(car.angle + clamp(diff, -EDGE_ASSIST_RATE * dt, EDGE_ASSIST_RATE * dt));
  },

  updateProgress(car, dt) {
    const track = this.track;
    // Local search only: progress can't jump to another part of the circuit, so cutting doesn't pay.
    const i = track.nearestLocal(car.x, car.y, car.idx, 15, 20);
    const lat = track.lateral(car.x, car.y, i);
    if (Math.abs(lat) < TRACK_HALF_WIDTH + 90) {
      let ds = i - car.idx;
      if (ds > track.n / 2) ds -= track.n;
      if (ds < -track.n / 2) ds += track.n;
      car.totalDist += ds * track.spacing;
      car.idx = i;
      car.lostTimer = 0;
    } else {
      car.lostTimer += dt;
      if (car.lostTimer > 3) this.resetCar(car);
    }

    const done = Math.floor(car.totalDist / track.length);
    while (done > car.lapsCompleted) {
      car.lapsCompleted++;
      car.lapTimes.push(this.time - car.lapStart);
      car.lapStart = this.time;
      if (car.lapsCompleted >= RACE_LAPS && !car.finished) {
        car.finished = true;
        car.finishTime = this.time;
        car.finishOrder = ++this.finishCount;
        if (car.isPlayer) this.awardFinish(car);
        this.events.push({ type: 'finish', car });
      } else if (car.isPlayer) {
        this.events.push({ type: 'lap', car });
      }
    }

    if (car.isPlayer) {
      const dot = Math.cos(car.angle) * track.tx[car.idx] + Math.sin(car.angle) * track.ty[car.idx];
      if (dot < -0.3 && car.forwardSpeed > 20) car.wrongWayTimer += dt;
      else car.wrongWayTimer = 0;
    }
  },

  // Put a car back on the road at its last valid progress point, in a lane clear of obstacles.
  resetCar(car) {
    const t = this.track, i = car.idx, lat = t.aiLaneL[i];
    car.place(t.x[i] + t.nx[i] * lat, t.y[i] + t.ny[i] * lat, Math.atan2(t.ty[i], t.tx[i]));
    car.lostTimer = 0;
    if (car.ai) car.ai.reverseTimer = 0;
  },

  updatePositions() {
    const sorted = this.cars.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishOrder - b.finishOrder;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.totalDist - a.totalDist;
    });
    sorted.forEach((c, i) => { c.position = i + 1; });
    this.standings = sorted;
  },
};
