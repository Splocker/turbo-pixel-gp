'use strict';

// 5x7 bitmap font. Each glyph is 7 rows; bit 16 is the leftmost pixel.
const FONT_GLYPHS = {
  'A': [14, 17, 17, 31, 17, 17, 17],
  'B': [30, 17, 17, 30, 17, 17, 30],
  'C': [14, 17, 16, 16, 16, 17, 14],
  'D': [28, 18, 17, 17, 17, 18, 28],
  'E': [31, 16, 16, 30, 16, 16, 31],
  'F': [31, 16, 16, 30, 16, 16, 16],
  'G': [14, 17, 16, 23, 17, 17, 15],
  'H': [17, 17, 17, 31, 17, 17, 17],
  'I': [14, 4, 4, 4, 4, 4, 14],
  'J': [7, 2, 2, 2, 2, 18, 12],
  'K': [17, 18, 20, 24, 20, 18, 17],
  'L': [16, 16, 16, 16, 16, 16, 31],
  'M': [17, 27, 21, 21, 17, 17, 17],
  'N': [17, 17, 25, 21, 19, 17, 17],
  'O': [14, 17, 17, 17, 17, 17, 14],
  'P': [30, 17, 17, 30, 16, 16, 16],
  'Q': [14, 17, 17, 17, 21, 18, 13],
  'R': [30, 17, 17, 30, 20, 18, 17],
  'S': [15, 16, 16, 14, 1, 1, 30],
  'T': [31, 4, 4, 4, 4, 4, 4],
  'U': [17, 17, 17, 17, 17, 17, 14],
  'V': [17, 17, 17, 17, 17, 10, 4],
  'W': [17, 17, 17, 21, 21, 21, 10],
  'X': [17, 17, 10, 4, 10, 17, 17],
  'Y': [17, 17, 17, 10, 4, 4, 4],
  'Z': [31, 1, 2, 4, 8, 16, 31],
  '0': [14, 17, 19, 21, 25, 17, 14],
  '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 2, 4, 8, 31],
  '3': [31, 2, 4, 2, 1, 17, 14],
  '4': [2, 6, 10, 18, 31, 2, 2],
  '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14],
  '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 2, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  ':': [0, 12, 12, 0, 12, 12, 0],
  '.': [0, 0, 0, 0, 0, 12, 12],
  ',': [0, 0, 0, 0, 12, 4, 8],
  '-': [0, 0, 0, 31, 0, 0, 0],
  '_': [0, 0, 0, 0, 0, 0, 31],
  '/': [1, 1, 2, 4, 8, 16, 16],
  '!': [4, 4, 4, 4, 4, 0, 4],
  '?': [14, 17, 1, 2, 4, 0, 4],
  '>': [8, 4, 2, 1, 2, 4, 8],
  '<': [2, 4, 8, 16, 8, 4, 2],
  "'": [4, 4, 8, 0, 0, 0, 0],
  '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8],
  '#': [10, 10, 31, 10, 31, 10, 10],
  '+': [0, 4, 4, 31, 4, 4, 0],
  '=': [0, 0, 31, 0, 31, 0, 0],
  '*': [0, 4, 21, 14, 21, 4, 0],
};

const FONT_W = 5;
const FONT_H = 7;
const FONT_ADV = 6;

const fontAtlases = new Map();

// One atlas canvas per color; glyphs are then blitted with drawImage.
function fontAtlas(color) {
  let atlas = fontAtlases.get(color);
  if (atlas) return atlas;
  const chars = Object.keys(FONT_GLYPHS);
  const cv = document.createElement('canvas');
  cv.width = chars.length * FONT_ADV;
  cv.height = FONT_H;
  const g = cv.getContext('2d');
  g.fillStyle = color;
  const index = {};
  chars.forEach((ch, i) => {
    index[ch] = i;
    const rows = FONT_GLYPHS[ch];
    for (let y = 0; y < FONT_H; y++) {
      for (let x = 0; x < FONT_W; x++) {
        if (rows[y] & (16 >> x)) g.fillRect(i * FONT_ADV + x, y, 1, 1);
      }
    }
  });
  atlas = { cv, index };
  fontAtlases.set(color, atlas);
  return atlas;
}

function textWidth(str, scale = 1) {
  str = String(str);
  return str.length ? (str.length * FONT_ADV - 1) * scale : 0;
}

function drawTextRaw(ctx, str, x, y, color, scale) {
  const { cv, index } = fontAtlas(color);
  for (let i = 0; i < str.length; i++) {
    const gi = index[str[i]];
    if (gi === undefined) continue;
    ctx.drawImage(cv, gi * FONT_ADV, 0, FONT_W, FONT_H, x + i * FONT_ADV * scale, y, FONT_W * scale, FONT_H * scale);
  }
}

function drawText(ctx, str, x, y, color, scale = 1, align = 'left', shadow = null) {
  str = String(str).toUpperCase();
  if (align === 'center') x -= Math.floor(textWidth(str, scale) / 2);
  else if (align === 'right') x -= textWidth(str, scale);
  x = Math.round(x);
  y = Math.round(y);
  if (shadow) drawTextRaw(ctx, str, x + scale, y + scale, shadow, scale);
  drawTextRaw(ctx, str, x, y, color, scale);
}
