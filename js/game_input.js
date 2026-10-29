'use strict';

// Game methods for keyboard input on every screen. Mixed into Game in game.js.
const GameInputMethods = {
  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (BLOCKED_KEYS.has(e.code)) e.preventDefault();
      this.held.add(e.code);
      this.pressed.push(e.code);
      if (this.state === 'nameEntry') this.typed.push(e.key);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => {
      this.held.clear();
      if (this.state === 'race') this.setState('paused');
    });
  },

  isPressed(...codes) {
    return this.pressed.some((c) => codes.includes(c));
  },

  handleInput() {
    switch (this.state) {
      case 'title':
        if (this.isPressed(...ENTER)) this.setState('setup');
        break;

      case 'setup':
        if (this.isPressed('KeyA', 'KeyS')) this.changeOpponents(-1);
        if (this.isPressed('KeyD', 'KeyW')) this.changeOpponents(1);
        if (this.isPressed(...ENTER)) this.startRace();
        else if (this.isPressed('Escape')) this.setState('title');
        break;

      case 'race':
        if (this.isPressed('Escape')) this.setState('paused');
        // Held until the race's next step fires the item, so a quick tap is never missed.
        if (this.isPressed('Space')) this.race.player.input.usePowerup = true;
        if (this.isPressed('KeyR') && this.race.running && this.resetCooldown <= 0) {
          this.race.resetCar(this.race.player);
          this.resetCooldown = 1.5;
        }
        break;

      case 'paused':
        if (this.isPressed('Escape', ...ENTER)) {
          this.state = 'race';
          this.held.clear();
        } else if (this.isPressed('KeyQ')) {
          this.startAttract();
          this.setState('title');
        }
        break;

      case 'finished':
        if (this.stateTime > 1.5 && this.isPressed(...ENTER)) this.setState('results');
        break;

      case 'results':
        if (this.isPressed(...ENTER) && this.stateTime < TALLY_TIME) {
          this.stateTime = TALLY_TIME; // skip the count-up
        } else if (this.stateTime > TALLY_TIME + 0.3 && this.isPressed(...ENTER)) {
          if (this.result.qualifies) {
            this.nameBuffer = (this.settings.lastName || '').slice(0, NAME_MAX);
            this.setState('nameEntry');
          } else {
            this.setState('scores');
          }
        }
        break;

      case 'nameEntry':
        for (const key of this.typed) {
          if (key === 'Backspace') this.nameBuffer = this.nameBuffer.slice(0, -1);
          else if (key.length === 1 && /[a-z0-9 ]/i.test(key) && this.nameBuffer.length < NAME_MAX) {
            if (key !== ' ' || this.nameBuffer.length) this.nameBuffer += key.toUpperCase();
          }
        }
        if (this.isPressed(...ENTER)) this.saveScore();
        break;

      case 'scores':
        if (this.isPressed(...ENTER)) this.startRace();
        else if (this.isPressed('Escape')) {
          this.startAttract();
          this.setState('title');
        }
        break;
    }
  },

  changeOpponents(delta) {
    this.opponents = clamp(this.opponents + delta, 1, MAX_OPPONENTS);
    this.settings.opponents = this.opponents;
    saveSettings(this.settings);
  },

  applyPlayerInput(dt) {
    const p = this.race.player;
    if (!p || p.ai) return;
    const k = this.held;
    const racing = this.state === 'race';
    p.input.throttle = racing && k.has('KeyW') ? 1 : 0;
    p.input.brake = racing && k.has('KeyS') ? 1 : 0;
    const target = racing ? (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) : 0;
    const rate = (target === 0 ? 10 : 7) * dt;
    p.input.steer += clamp(target - p.input.steer, -rate, rate);
  },
};
