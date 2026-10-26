'use strict';

const SCORE_KEY = 'turboPixelGP.highScores.v2';
const SETTINGS_KEY = 'turboPixelGP.settings.v1';
const SCORE_LIMIT = 10;
const NAME_MAX = 8;

// Storage can be unavailable (private mode, blocked site data); the game still runs without it.
function loadHighScores() {
  try {
    const list = JSON.parse(localStorage.getItem(SCORE_KEY));
    if (!Array.isArray(list)) return [];
    return list
      .filter((e) => e && typeof e.name === 'string' && isFinite(e.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, SCORE_LIMIT);
  } catch (e) {
    return [];
  }
}

function saveHighScores(list) {
  try {
    localStorage.setItem(SCORE_KEY, JSON.stringify(list));
  } catch (e) {
    // ignore: scores just won't persist
  }
}

function scoreQualifies(list, score) {
  return score > 0 && (list.length < SCORE_LIMIT || score > list[list.length - 1].score);
}

// Inserts the entry, trims the table, and returns the entry's rank index (or -1 if it fell off).
function insertHighScore(list, entry) {
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  list.splice(SCORE_LIMIT);
  return list.indexOf(entry);
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    // ignore
  }
}
