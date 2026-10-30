'use strict';

// The Swap with 1st powerup: the car trades track position and lap progress with the leader.
// Each car keeps its own speed, and its heading and slide relative to the road, so neither
// arrives pointing at a wall. Items, Big and spins stay with their own car.

// The best-placed car still racing. A finished leader is out of the race, so it is skipped.
function findSwapTarget(race) {
  return race.standings.find((c) => !c.finished) || null;
}

// Returns true if the cars swapped. Using it from first place does nothing.
function swapWithLeader(race, car) {
  const leader = findSwapTarget(race);
  if (!leader || leader === car) return false;
  const mine = racePlace(car), theirs = racePlace(leader);
  moveToPlace(race.track, car, theirs);
  moveToPlace(race.track, leader, mine);
  race.updatePositions();
  race.events.push({ type: 'swap', car, leader });
  return true;
}

// Everything that says where a car is in the race.
function racePlace(car) {
  return {
    x: car.x, y: car.y, idx: car.idx,
    totalDist: car.totalDist, lapsCompleted: car.lapsCompleted, lapStart: car.lapStart, lapTimes: car.lapTimes,
  };
}

function moveToPlace(track, car, place) {
  // Turn the car and its velocity by however much the road direction differs between the spots.
  const turn = wrapAngle(Math.atan2(track.ty[place.idx], track.tx[place.idx]) - Math.atan2(track.ty[car.idx], track.tx[car.idx]));
  const cos = Math.cos(turn), sin = Math.sin(turn);
  const vx = car.vx * cos - car.vy * sin, vy = car.vx * sin + car.vy * cos;
  car.angle = wrapAngle(car.angle + turn);
  car.vx = vx;
  car.vy = vy;
  Object.assign(car, place);
  car.lostTimer = 0;
  car.wrongWayTimer = 0;
}
