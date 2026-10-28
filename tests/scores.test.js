'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, memoryStorage, brokenStorage } = require('./helpers/load');

const entry = (name, score) => ({ name, score, place: 1, opponents: 4, date: 0 });

test('an empty or corrupt table loads as no scores', () => {
  const storage = memoryStorage();
  const g = loadGame({ storage });
  assert.equal(g.loadHighScores().length, 0);
  storage.setItem(g.SCORE_KEY, '{not json');
  assert.equal(g.loadHighScores().length, 0);
  storage.setItem(g.SCORE_KEY, JSON.stringify({ name: 'NOT A LIST' }));
  assert.equal(g.loadHighScores().length, 0);
});

test('loading drops bad rows, sorts by score and keeps the top ten', () => {
  const storage = memoryStorage();
  const g = loadGame({ storage });
  const rows = [entry('LOW', 100), { name: 'BAD' }, null, entry('HIGH', 3000), { name: 7, score: 50 }];
  for (let i = 0; i < 12; i++) rows.push(entry('P' + i, 500 + i));
  storage.setItem(g.SCORE_KEY, JSON.stringify(rows));

  const list = g.loadHighScores();
  assert.equal(list.length, g.SCORE_LIMIT);
  assert.equal(list[0].name, 'HIGH');
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].score >= list[i].score);
  assert.ok(!list.some((e) => e.name === 'LOW')); // pushed off by the ten better scores
});

test('scores survive a save and reload', () => {
  const storage = memoryStorage();
  const g = loadGame({ storage });
  g.saveHighScores([entry('ZAP', 2304)]);
  const again = loadGame({ storage }); // a fresh page load with the same storage
  const list = again.loadHighScores();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'ZAP');
  assert.equal(list[0].score, 2304);
});

test('the game still runs when storage is blocked', () => {
  const g = loadGame({ storage: brokenStorage() });
  assert.equal(g.loadHighScores().length, 0);
  assert.doesNotThrow(() => g.saveHighScores([entry('ZAP', 1)]));
  assert.equal(JSON.stringify(g.loadSettings()), '{}');
  assert.doesNotThrow(() => g.saveSettings({ opponents: 6 }));
});

test('scoreQualifies: any positive score fills a short table, a full table must be beaten', () => {
  const g = loadGame();
  assert.equal(g.scoreQualifies([], 0), false);
  assert.equal(g.scoreQualifies([], 1), true);
  const full = Array.from({ length: g.SCORE_LIMIT }, (_, i) => entry('P' + i, 1000 - i * 10));
  const lowest = full[full.length - 1].score;
  assert.equal(g.scoreQualifies(full, lowest), false);
  assert.equal(g.scoreQualifies(full, lowest + 1), true);
});

test('insertHighScore returns the new rank and trims the table', () => {
  const g = loadGame();
  const list = Array.from({ length: g.SCORE_LIMIT }, (_, i) => entry('P' + i, 1000 - i * 10));
  const mine = entry('ME', 995);
  assert.equal(g.insertHighScore(list, mine), 1);
  assert.equal(list.length, g.SCORE_LIMIT);
  assert.equal(g.insertHighScore(list, entry('LOW', 1)), -1);
});

test('settings round-trip through storage', () => {
  const storage = memoryStorage();
  const g = loadGame({ storage });
  g.saveSettings({ opponents: 12, lastName: 'ZAP' });
  const s = loadGame({ storage }).loadSettings();
  assert.equal(s.opponents, 12);
  assert.equal(s.lastName, 'ZAP');
});
