'use strict';

const AI_NAMES = [
  'ACE', 'BOLT', 'ZIP', 'NOVA', 'DASH', 'FLUX', 'VIPER', 'BLITZ', 'TURBO', 'NEON',
  'RAZOR', 'COMET', 'GHOST', 'JINX', 'ROCKET', 'SURGE', 'ORBIT', 'STORM', 'BYTE', 'VOLT',
];

// Body / stripe pairs. Orange is reserved for the player's car.
const AI_LIVERIES = [
  [PAL.purple, PAL.lime], [PAL.lime, PAL.purple], ['#2ec4b6', PAL.white], [PAL.red, PAL.white],
  ['#5fa8ff', PAL.orange], ['#ff6fb5', PAL.purple], [PAL.yellow, PAL.black], [PAL.white, PAL.purple],
  ['#3a4cc0', PAL.lime], ['#2fa84f', PAL.white], ['#b3007a', PAL.orange], [PAL.purpleLight, PAL.white],
  ['#8a5a2b', PAL.orange], ['#8a8aa0', PAL.red], ['#2b2b3b', PAL.lime], ['#7ee0a8', PAL.purple],
  ['#ff8a65', PAL.white], ['#3fd0e0', PAL.black], ['#6b7d1a', PAL.yellow], ['#a01830', PAL.yellow],
];
const PLAYER_LIVERY = [PAL.orange, PAL.purple];
const PLAYER_MAX_SLOT = 7;
