'use strict';

const CAR_DIRS = 32;

// Top-down car, front facing right (+x). 14 long, 8 wide.
const CAR_PIXELS = [
  '..ttt....ttt..',
  '.kbbbbbbbbbbk.',
  'rbbkddwwbbbbbh',
  'ksskddwwssssbk',
  'ksskddwwssssbk',
  'rbbkddwwbbbbbh',
  '.kbbbbbbbbbbk.',
  '..ttt....ttt..',
];

function makeCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

// Nearest-neighbour rotation into a fixed set of directions keeps the pixel-art look.
function buildCarSprites(body, stripe) {
  const colors = {
    t: '#2a2030', k: PAL.black, b: body, s: stripe, d: shade(body, 0.7),
    w: PAL.cyan, h: '#fff4a0', r: PAL.red,
  };
  const rgb = {};
  for (const k in colors) rgb[k] = hexToRgb(colors[k]);
  const sprites = [], shadows = [];
  for (let d = 0; d < CAR_DIRS; d++) {
    const a = (d * TAU) / CAR_DIRS, c = Math.cos(a), s = Math.sin(a);
    const cv = makeCanvas(17, 17), sh = makeCanvas(17, 17);
    const g = cv.getContext('2d'), gs = sh.getContext('2d');
    const img = g.createImageData(17, 17), simg = gs.createImageData(17, 17);
    for (let oy = 0; oy < 17; oy++) {
      for (let ox = 0; ox < 17; ox++) {
        const wx = ox + 0.5 - 8.5, wy = oy + 0.5 - 8.5;
        const px = Math.floor(wx * c + wy * s + 7);
        const py = Math.floor(-wx * s + wy * c + 4);
        if (px < 0 || px >= 14 || py < 0 || py >= 8) continue;
        const ch = CAR_PIXELS[py][px];
        if (ch === '.') continue;
        const o = (oy * 17 + ox) * 4;
        img.data.set([...rgb[ch], 255], o);
        simg.data.set([26, 16, 36, 110], o);
      }
    }
    g.putImageData(img, 0, 0);
    gs.putImageData(simg, 0, 0);
    sprites.push(cv);
    shadows.push(sh);
  }
  return { sprites, shadows };
}

function dirIndex(angle) {
  return ((Math.round(angle / (TAU / CAR_DIRS)) % CAR_DIRS) + CAR_DIRS) % CAR_DIRS;
}

function buildRoundSprite(radius, colorAt) {
  const size = Math.ceil(radius * 2) + 1;
  const cv = makeCanvas(size, size);
  const g = cv.getContext('2d');
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      const col = d <= radius ? colorAt(x - c, y - c, d) : null;
      if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
    }
  }
  return cv;
}

const TREE_SPRITE_RADIUS = 6;
function buildTreeSprite() {
  return buildRoundSprite(TREE_SPRITE_RADIUS, (x, y, d) => {
    if (d > TREE_SPRITE_RADIUS - 1.1) return PAL.forest;
    if (x + y < -3 && d < 4) return PAL.limeDark;
    if ((Math.floor(x) * 3 + Math.floor(y) * 5) % 7 === 0) return PAL.forest;
    return PAL.limeDeep;
  });
}

function buildTyreSprite() {
  return buildRoundSprite(TYRE_RADIUS, (x, y, d) => {
    if (d > TYRE_RADIUS - 1.2) return PAL.black;
    if (d > 3.2) return x + y < 0 ? PAL.asphaltLight : PAL.asphalt;
    if (d > 1.6) return PAL.black;
    return PAL.white;
  });
}

// Small hand-drawn sprite from rows of characters; '.' is transparent.
function buildPixelSprite(rows, colors) {
  const cv = makeCanvas(rows[0].length, rows.length);
  const g = cv.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    g.fillStyle = colors[ch];
    g.fillRect(x, y, 1, 1);
  }));
  return cv;
}

function buildConeSprite() {
  return buildPixelSprite(['..o..', '.ooo.', '.www.', 'ooooo', 'kkkkk'], { o: PAL.orange, w: PAL.white, k: PAL.black });
}

// Two frames: face-on and edge-on, alternated so the coin appears to spin.
function buildCoinSprites() {
  const face = buildRoundSprite(COIN_RADIUS - 1, (x, y, d) => {
    if (d > COIN_RADIUS - 2) return PAL.orangeDark;
    if (x < -1 && y < -1) return PAL.white;
    return PAL.yellow;
  });
  const edge = makeCanvas(face.width, face.height);
  const g = edge.getContext('2d');
  const cx = Math.floor(face.width / 2);
  g.fillStyle = PAL.orangeDark;
  g.fillRect(cx - 1, 0, 3, face.height);
  g.fillStyle = PAL.yellow;
  g.fillRect(cx, 1, 1, face.height - 2);
  return [face, edge];
}

// A dropped banana peel lying on the road.
function buildBananaSprite() {
  return buildPixelSprite([
    '......kk',
    '.....yyk',
    '....yyy.',
    '..yyyyd.',
    'yyyyyd..',
    'kyyyd...',
    '.kkk....',
  ], { y: PAL.yellow, d: PAL.orangeDark, k: PAL.black });
}

// 7x7 icons for each powerup, used on the pickup boxes and in the HUD item slot.
const POWERUP_ICONS = {
  banana: ['.....d.', '.....yy', '.....yy', '....yyy', '..yyyy.', 'yyyyy..', '.ddd...'],
  big: ['...l...', '..lll..', '.lllll.', 'lllllll', '..lll..', '..lll..', '..lll..'],
  swap: ['..oo...', '.ooo...', '..oo...', '..oo...', '..oo...', '.oooo..', '.......'],
};
const POWERUP_ICON_COLORS = { y: PAL.yellow, d: PAL.orangeDark, l: PAL.lime, o: PAL.orange };

// An 11x11 item box per powerup kind: dark outline, purple box, the icon in the middle.
function buildPowerupSprites() {
  const boxes = {};
  for (const [kind, rows] of Object.entries(POWERUP_ICONS)) {
    const cv = makeCanvas(11, 11);
    const g = cv.getContext('2d');
    g.fillStyle = PAL.black;
    g.fillRect(0, 0, 11, 11);
    g.fillStyle = PAL.purple;
    g.fillRect(1, 1, 9, 9);
    g.fillStyle = PAL.purpleLight;
    g.fillRect(1, 1, 9, 1);
    g.drawImage(buildPixelSprite(rows, POWERUP_ICON_COLORS), 2, 2);
    boxes[kind] = cv;
  }
  return boxes;
}
