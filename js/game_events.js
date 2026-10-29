'use strict';

// Game methods that react to what happened in the race: lap and powerup flashes, screen shake,
// and the player crossing the line. Mixed into Game in game.js.
const GameEventMethods = {
  onRaceEvent(e) {
    const player = this.race.player;
    if (e.type === 'lap' && e.car.isPlayer) {
      const final = e.car.lapsCompleted === RACE_LAPS - 1;
      this.showFlash(final ? 'FINAL LAP!' : 'LAP ' + (e.car.lapsCompleted + 1), final ? PAL.orange : PAL.lime, 1.8,
        'LAST ' + formatTime(e.car.lapTimes[e.car.lapTimes.length - 1]));
    } else if (e.type === 'finish' && e.car.isPlayer) {
      this.onPlayerFinish(e.car);
    } else if (e.type === 'bump') {
      this.shake = Math.max(this.shake, e.big ? 4 : 2);
    } else if (e.type === 'banana' && e.car === player) {
      this.shake = Math.max(this.shake, 3);
    } else if (e.type === 'powerupUsed' && e.car === player && e.kind === 'big') {
      this.showFlash('BIG!', PAL.lime, 1.2, 'NOTHING CAN MOVE YOU');
    } else if (e.type === 'swap' && (e.car === player || e.leader === player)) {
      this.onSwap(e);
    }
  },

  // A swap teleports the player, so the camera jumps straight to the new spot.
  onSwap(e) {
    if (e.car === this.race.player) this.showFlash('SWAP!', PAL.cyan, 1.4, 'YOU TOOK 1ST PLACE');
    else this.showFlash('SWAPPED!', PAL.red, 1.4, e.car.name + ' TOOK YOUR PLACE');
    this.updateCamera(0, true);
  },

  onPlayerFinish(player) {
    // The car keeps lapping on autopilot behind the result screens.
    player.ai = new AIDriver(player, this.track, Math.random, { speedFactor: 0.85 });
    this.result = {
      score: this.race.scoreTotal,
      breakdown: { ...this.race.score },
      time: player.finishTime,
      place: player.finishOrder,
      opponents: this.race.cars.length - 1,
    };
    this.result.qualifies = scoreQualifies(this.scores, this.result.score);
    this.shake = 0;
    this.flash = null;
    this.setState('finished');
  },

  showFlash(text, color, duration, sub = '') {
    this.flash = { text, color, sub, until: this.race.time + duration };
  },
};
