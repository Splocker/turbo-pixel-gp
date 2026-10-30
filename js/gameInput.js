'use strict';

// Keyboard handling for menus and screens, mixed into Game (see game.js).
const GAME_INPUT_METHODS = {
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
        if (this.isPressed('KeyR') && this.race.running && this.resetCooldown <= 0) {
          this.race.resetCar(this.race.player);
          this.resetCooldown = 1.5;
        }
        if (this.isPressed('Space')) useHeldItem(this.race, this.race.player);
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

  saveScore() {
    const name = this.nameBuffer.trim() || 'PLAYER';
    const r = this.result;
    const entry = { name, score: r.score, place: r.place, opponents: r.opponents, date: Date.now() };
    this.highlight = insertHighScore(this.scores, entry);
    saveHighScores(this.scores);
    this.settings.lastName = name;
    saveSettings(this.settings);
    this.setState('scores');
  },
};
