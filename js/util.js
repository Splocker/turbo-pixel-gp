'use strict';

// Core palette. The three brand colors (purple, orange, lime) lead; the rest support them.
const PAL = {
  purple: '#754098',
  orange: '#f99d34',
  lime: '#bfd81c',
  purpleLight: '#a77bc4',
  purpleDark: '#3d1f52',
  purpleDeep: '#24122f',
  orangeDark: '#c46f12',
  limeMid: '#afc71a',
  limeDark: '#8fa816',
  limeDeep: '#5f7a0e',
  forest: '#2f4a0a',
  asphalt: '#3a3a46',
  asphaltLight: '#4a4a5a',
  skid: '#2b2b35',
  white: '#f4f0ff',
  black: '#1a1024',
  red: '#e63946',
  yellow: '#ffd23f',
  cyan: '#9ee8ff',
  brown: '#6b3d1f',
};

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function shade(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    clamp(Math.round(r * f), 0, 255),
    clamp(Math.round(g * f), 0, 255),
    clamp(Math.round(b * f), 0, 255)
  );
}

// Small deterministic RNG (mulberry32) so the track decoration is identical every load.
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function formatTime(t) {
  if (t == null || !isFinite(t)) return '-:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const whole = Math.floor(s);
  const cs = Math.floor((s - whole) * 100);
  return m + ':' + String(whole).padStart(2, '0') + '.' + String(cs).padStart(2, '0');
}

function ordinal(n) {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return n + (teen ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] || 'TH');
}

// Copies a methods object onto a class prototype, so one class can be spread over several files.
// Getters stay getters (Object.assign would call them and copy the result instead).
function mixInto(TargetClass, methods) {
  Object.defineProperties(TargetClass.prototype, Object.getOwnPropertyDescriptors(methods));
}
