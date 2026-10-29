'use strict';

// Race progress that changes hands on a swap. Heading, velocity, spin and Big stay with each car.
const SWAPPED_PROGRESS = ['x', 'y', 'idx', 'totalDist', 'lapsCompleted', 'lapStart', 'lapTimes', 'lostTimer'];

// Fires whatever the car is holding. Returns true if the item was used up.
function usePowerup(car, race) {
  const kind = car.heldPowerup;
  if (!kind || car.finished) return false;
  if (kind === 'banana') race.powerups.dropBanana(car);
  else if (kind === 'big') car.bigTimer = BIG_TIME;
  else if (kind === 'swap' && !swapWithLeader(car, race)) {
    if (car.isPlayer) race.popups.push({ x: car.x, y: car.y - 14, text: 'ALREADY 1ST!', color: PAL.white, life: 1 });
    return false; // nobody ahead to swap with: keep the item
  }
  car.heldPowerup = null;
  race.events.push({ type: 'powerupUsed', kind, car });
  return true;
}

// The car in first place among those still racing.
function raceLeader(race) {
  return race.standings.find((c) => !c.finished);
}

// Trades places with the race leader instantly. Each car keeps its own heading and speed.
function swapWithLeader(car, race) {
  const leader = raceLeader(race);
  if (!leader || leader === car) return false;
  for (const key of SWAPPED_PROGRESS) [car[key], leader[key]] = [leader[key], car[key]];
  race.updatePositions();
  race.events.push({ type: 'swap', car, leader });
  return true;
}
