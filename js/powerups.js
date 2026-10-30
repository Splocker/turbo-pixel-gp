'use strict';

// Powerup pickups on the track, the item slot each car carries, and using what's in it.
// There are always half as many pickups as cars (rounded up): a collected one is replaced at once.

const POWERUP_WEIGHTS = [['banana', 0.5], ['big', 0.3], ['swap', 0.2]];
const PICKUP_RADIUS = 6;
const PICKUP_ROAD_MARGIN = 8;        // normal pickups stay this far inside the road edge
const SWAP_OFF_TRACK_CHANCE = 0.5;   // share of swap pickups placed on the grass as a lure
const SWAP_OFF_TRACK_MARGIN = 15;    // how far past the kerb they can go
const PICKUP_CLEARANCE = 24;         // spawn spacing from cars, hazards and other pickups
const PICKUP_SPAWN_TRIES = 30;

function pickupTarget(race) {
  return Math.ceil(race.cars.length / 2);
}

function choosePowerupType(rng) {
  let roll = rng();
  for (const [type, weight] of POWERUP_WEIGHTS) {
    roll -= weight;
    if (roll < 0) return type;
  }
  return POWERUP_WEIGHTS[0][0];
}

function pickupLateral(type, rng) {
  if (type === 'swap' && rng() < SWAP_OFF_TRACK_CHANCE) {
    const side = rng() < 0.5 ? -1 : 1;
    return side * (TRACK_HALF_WIDTH + KERB_WIDTH + rng() * SWAP_OFF_TRACK_MARGIN);
  }
  return (rng() * 2 - 1) * (TRACK_HALF_WIDTH - PICKUP_ROAD_MARGIN);
}

// Is a spot clear of cars, solid furniture and the other pickups?
function pickupSpotClear(race, x, y) {
  const near = (o) => Math.abs(o.x - x) < PICKUP_CLEARANCE && Math.abs(o.y - y) < PICKUP_CLEARANCE;
  return !race.cars.some(near) && !race.pickups.some(near) && !race.obstacles.tyres.some(near) &&
    !race.obstacles.cones.some(near) && !race.obstacles.boostPads.some(near);
}

// Adds one pickup at a random spot anywhere around the lap.
function spawnPickup(race) {
  const track = race.track, rng = race.rng;
  const type = choosePowerupType(rng);
  let pickup = null;
  for (let tries = 0; tries < PICKUP_SPAWN_TRIES; tries++) {
    const idx = Math.floor(rng() * track.n), lateral = pickupLateral(type, rng);
    pickup = { type, idx, lateral, x: track.x[idx] + track.nx[idx] * lateral, y: track.y[idx] + track.ny[idx] * lateral };
    if (pickupSpotClear(race, pickup.x, pickup.y)) break;
  }
  race.pickups.push(pickup);
  return pickup;
}

function maintainPickupCount(race) {
  while (race.pickups.length < pickupTarget(race)) spawnPickup(race);
}

// A car with an empty slot that is still racing picks up what it drives over.
// Returns the pickup it collected, or null.
function collectPickups(race, car) {
  if (car.heldItem || car.finished) return null;
  const reach = PICKUP_RADIUS + CAR_BODY_RADIUS * car.sizeScale;
  const pickup = race.pickups.find((p) => (p.x - car.x) ** 2 + (p.y - car.y) ** 2 <= reach * reach);
  if (!pickup) return null;
  car.heldItem = pickup.type;
  race.pickups = race.pickups.filter((p) => p !== pickup);
  race.sparks(pickup.x, pickup.y, 50, [PAL.cyan, PAL.white, PAL.purpleLight]);
  race.events.push({ type: 'pickup', car, item: pickup.type });
  maintainPickupCount(race);
  return pickup;
}

// Fires the held item. Returns true if an item was used (even a swap from first, which does nothing).
function useHeldItem(race, car) {
  if (!car.heldItem || car.finished || !race.running) return false;
  const item = car.heldItem;
  car.heldItem = null;
  if (item === 'banana') dropBanana(race, car);
  else if (item === 'big') activateBig(car);
  else if (item === 'swap') swapWithLeader(race, car);
  race.events.push({ type: 'item', car, item });
  return true;
}
