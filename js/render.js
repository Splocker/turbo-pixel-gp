'use strict';

const VIEW_W = 480;
const VIEW_H = 270;
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

// Pre-render the whole circuit once. Shapes are drawn with canvas paths, then every pixel is
// snapped to the nearest palette color, which removes anti-aliasing and gives hard 8-bit edges.
function buildTrackCanvas(track) {
  const W = track.worldW, H = track.worldH, n = track.n;
  const HW = TRACK_HALF_WIDTH;
  const cv = makeCanvas(W, H);
  const g = cv.getContext('2d');

  for (let y = 0; y < H; y += 32) {
    g.fillStyle = (y / 32) % 2 ? PAL.limeMid : PAL.lime;
    g.fillRect(0, y, W, 32);
  }

  // Kerbs on the corners, alternating purple and white.
  for (let i = 0; i < n; i++) {
    if (!track.kerb[i]) continue;
    const j = (i + 1) % n;
    g.fillStyle = Math.floor(i / 2) % 2 ? PAL.white : PAL.purple;
    for (const side of [-1, 1]) {
      const a = HW - 1, b = HW + KERB_WIDTH;
      g.beginPath();
      g.moveTo(track.x[i] + track.nx[i] * side * a, track.y[i] + track.ny[i] * side * a);
      g.lineTo(track.x[j] + track.nx[j] * side * a, track.y[j] + track.ny[j] * side * a);
      g.lineTo(track.x[j] + track.nx[j] * side * b, track.y[j] + track.ny[j] * side * b);
      g.lineTo(track.x[i] + track.nx[i] * side * b, track.y[i] + track.ny[i] * side * b);
      g.closePath();
      g.fill();
    }
  }

  const loop = (offset) => {
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const k = i % n;
      const x = track.x[k] + track.nx[k] * offset, y = track.y[k] + track.ny[k] * offset;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
  };
  g.lineJoin = 'round';
  g.strokeStyle = PAL.asphalt;
  g.lineWidth = HW * 2;
  loop(0);
  g.stroke();
  g.strokeStyle = PAL.white;
  g.lineWidth = 2;
  loop(HW - 3);
  g.stroke();
  loop(-(HW - 3));
  g.stroke();

  // Palette snap + speckle texture.
  const palette = [PAL.lime, PAL.limeMid, PAL.purple, PAL.white, PAL.asphalt].map(hexToRgb);
  const asphaltLight = hexToRgb(PAL.asphaltLight), limeDark = hexToRgb(PAL.limeDark);
  const img = g.getImageData(0, 0, W, H);
  const data = img.data;
  const rng = makeRng(99);
  for (let p = 0; p < data.length; p += 4) {
    const r = data[p], gg = data[p + 1], b = data[p + 2];
    let best = 0, bestD = Infinity;
    for (let k = 0; k < palette.length; k++) {
      const c = palette[k];
      const d = (r - c[0]) ** 2 + (gg - c[1]) ** 2 + (b - c[2]) ** 2;
      if (d < bestD) { bestD = d; best = k; }
    }
    let c = palette[best];
    const roll = rng();
    if (best === 4 && roll < 0.05) c = asphaltLight;
    else if (best <= 1 && roll < 0.012) c = limeDark;
    data[p] = c[0];
    data[p + 1] = c[1];
    data[p + 2] = c[2];
    data[p + 3] = 255;
  }
  g.putImageData(img, 0, 0);

  // Start/finish checkers and grid boxes, drawn in track-aligned space (the straight is axis-aligned).
  g.save();
  g.setTransform(track.tx[0], track.ty[0], track.nx[0], track.ny[0], Math.round(track.x[0]), Math.round(track.y[0]));
  for (let a = -HW; a < HW; a += 4) {
    for (let k = 0; k < 2; k++) {
      g.fillStyle = ((a + HW) / 4 + k) % 2 ? PAL.black : PAL.white;
      g.fillRect(k * 4 - 4, a, 4, 4);
    }
  }
  g.restore();
  g.fillStyle = PAL.white;
  for (let slot = 0; slot <= MAX_OPPONENTS; slot++) {
    const p = track.gridPose(slot);
    const i = p.idx;
    g.save();
    g.setTransform(track.tx[i], track.ty[i], track.nx[i], track.ny[i], Math.round(p.x), Math.round(p.y));
    g.fillRect(9, -6, 1, 12);
    g.fillRect(-4, -6, 13, 1);
    g.fillRect(-4, 5, 13, 1);
    g.restore();
  }

  // Tyre stacks on the outside of the tighter corners.
  for (let i = 0; i < n; i += 9) {
    if (Math.abs(track.curv[i]) < 1 / 150) continue;
    const side = track.curv[i] > 0 ? -1 : 1;
    for (const extra of [12, 18]) {
      const off = HW + KERB_WIDTH + extra;
      const x = Math.round(track.x[i] + track.nx[i] * side * off);
      const y = Math.round(track.y[i] + track.ny[i] * side * off);
      if (track.distanceFromCenter(x, y) < HW + 10) continue;
      g.fillStyle = PAL.black;
      g.fillRect(x - 2, y - 1, 5, 3);
      g.fillRect(x - 1, y - 2, 3, 5);
      g.fillStyle = Math.floor(i / 9) % 2 ? PAL.orange : PAL.white;
      g.fillRect(x, y, 1, 1);
    }
  }

  // Grandstand with crowd, roof banner and advertising boards.
  const gs = track.grandstand;
  g.fillStyle = PAL.black;
  g.fillRect(gs.x - 1, gs.y - 1, gs.w + 2, gs.h + 2);
  g.fillStyle = PAL.purpleDark;
  g.fillRect(gs.x, gs.y, gs.w, gs.h);
  g.fillStyle = PAL.purple;
  g.fillRect(gs.x, gs.y, gs.w, 11);
  g.fillStyle = PAL.lime;
  g.fillRect(gs.x, gs.y + 11, gs.w, 1);
  const crowd = [PAL.orange, PAL.lime, PAL.white, PAL.purpleLight, PAL.yellow, PAL.cyan, PAL.orange];
  for (let y = gs.y + 14; y < gs.y + gs.h - 6; y += 3) {
    for (let x = gs.x + 2; x < gs.x + gs.w - 2; x += 2) {
      if ((x - gs.x) % 50 < 3) continue; // aisles
      if (rng() < 0.15) continue;
      g.fillStyle = crowd[Math.floor(rng() * crowd.length)];
      g.fillRect(x, y, 1, 2);
    }
  }
  const boards = [PAL.orange, PAL.lime, PAL.purpleLight];
  for (let x = gs.x, k = 0; x < gs.x + gs.w; x += 25, k++) {
    g.fillStyle = boards[k % 3];
    g.fillRect(x, gs.y + gs.h - 4, Math.min(24, gs.x + gs.w - x), 4);
  }
  for (let x = gs.x + 6; x < gs.x + gs.w - 80; x += 130) {
    drawText(g, 'TURBO PIXEL GP', x, gs.y + 2, PAL.orange, 1, 'left', PAL.purpleDeep);
  }

  // Trees (solid) with a soft pixel shadow.
  const tree = buildTreeSprite();
  const shadow = buildRoundSprite(TREE_SPRITE_RADIUS - 1, () => '#97ad14');
  for (const t of track.trees) {
    g.drawImage(shadow, Math.round(t.x - shadow.width / 2 + 3), Math.round(t.y - shadow.height / 2 + 3));
  }
  for (const t of track.trees) {
    g.drawImage(tree, Math.round(t.x - tree.width / 2), Math.round(t.y - tree.height / 2));
  }

  // Perimeter fence.
  g.fillStyle = PAL.purpleDeep;
  g.fillRect(0, 0, W, 8);
  g.fillRect(0, H - 8, W, 8);
  g.fillRect(0, 0, 8, H);
  g.fillRect(W - 8, 0, 8, H);
  g.fillStyle = PAL.purple;
  for (let x = 0; x < W; x += 16) { g.fillRect(x, 2, 4, 4); g.fillRect(x, H - 6, 4, 4); }
  for (let y = 0; y < H; y += 16) { g.fillRect(2, y, 4, 4); g.fillRect(W - 6, y, 4, 4); }

  return cv;
}

function buildMinimap(track) {
  const scale = Math.min(104 / track.worldW, 78 / track.worldH);
  const w = Math.ceil(track.worldW * scale), h = Math.ceil(track.worldH * scale);
  const cv = makeCanvas(w, h);
  const g = cv.getContext('2d');
  g.fillStyle = PAL.white;
  for (let i = 0; i < track.n; i += 2) {
    g.fillRect(Math.floor(track.x[i] * scale) - 1, Math.floor(track.y[i] * scale) - 1, 2, 2);
  }
  g.fillStyle = PAL.lime;
  g.fillRect(Math.floor(track.x[0] * scale) - 1, Math.floor(track.y[0] * scale) - 2, 2, 4);
  return { cv, scale };
}

function drawPanel(ctx, x, y, w, h, fill = PAL.purpleDark) {
  ctx.fillStyle = PAL.black;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = PAL.purple;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y, 1, h);
}

class Renderer {
  constructor(ctx, track) {
    this.ctx = ctx;
    this.track = track;
    this.base = buildTrackCanvas(track);
    this.world = makeCanvas(track.worldW, track.worldH);
    this.wctx = this.world.getContext('2d');
    this.minimap = buildMinimap(track);
    this.spriteCache = new Map();
    this.resetWorld();
  }

  // Fresh copy of the circuit (clears old skid marks).
  resetWorld() {
    this.wctx.drawImage(this.base, 0, 0);
  }

  spritesFor(body, stripe) {
    const key = body + stripe;
    if (!this.spriteCache.has(key)) this.spriteCache.set(key, buildCarSprites(body, stripe));
    return this.spriteCache.get(key);
  }

  drawCarIcon(body, stripe, x, y, angle) {
    const s = this.spritesFor(body, stripe);
    this.ctx.drawImage(s.sprites[dirIndex(angle)], Math.round(x - 8.5), Math.round(y - 8.5));
  }

  dim() {
    this.ctx.globalAlpha = 0.6;
    this.ctx.fillStyle = PAL.purpleDeep;
    this.ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.ctx.globalAlpha = 1;
  }

  drawWorld(race, camX, camY) {
    const ctx = this.ctx;
    camX = Math.round(camX);
    camY = Math.round(camY);

    // Skid marks are painted permanently into the working copy of the track.
    this.wctx.fillStyle = PAL.skid;
    for (const s of race.skids) this.wctx.fillRect(Math.floor(s.x), Math.floor(s.y), 1, 1);
    race.skids.length = 0;

    ctx.drawImage(this.world, camX, camY, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);

    const visible = race.cars.filter((c) => c.x > camX - 20 && c.x < camX + VIEW_W + 20 && c.y > camY - 20 && c.y < camY + VIEW_H + 20);
    for (const car of visible) {
      const s = this.spritesFor(car.body, car.stripe);
      ctx.drawImage(s.shadows[dirIndex(car.angle)], Math.round(car.x - camX - 8.5) + 1, Math.round(car.y - camY - 8.5) + 2);
    }
    for (const car of visible) {
      const s = this.spritesFor(car.body, car.stripe);
      ctx.drawImage(s.sprites[dirIndex(car.angle)], Math.round(car.x - camX - 8.5), Math.round(car.y - camY - 8.5));
    }

    for (const p of race.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), 2, 2);
    }

    // Marker over the player's car so it's easy to find in a big pack.
    const pl = race.player;
    if (pl) {
      const x = Math.round(pl.x - camX), y = Math.round(pl.y - camY) - 14;
      ctx.fillStyle = PAL.black;
      ctx.fillRect(x - 4, y - 1, 9, 5);
      ctx.fillStyle = PAL.orange;
      ctx.fillRect(x - 3, y, 7, 1);
      ctx.fillRect(x - 2, y + 1, 5, 1);
      ctx.fillRect(x - 1, y + 2, 3, 1);
      ctx.fillRect(x, y + 3, 1, 1);
    }
  }

  drawHUD(race, now) {
    const ctx = this.ctx;
    const pl = race.player;
    const total = race.cars.length;

    drawPanel(ctx, 6, 6, 62, 30);
    drawText(ctx, 'POS', 10, 9, PAL.lime);
    drawText(ctx, String(pl.position), 10, 19, PAL.orange, 2);
    drawText(ctx, '/' + total, 12 + textWidth(String(pl.position), 2), 26, PAL.white);

    drawPanel(ctx, 74, 6, 50, 30);
    drawText(ctx, 'LAP', 78, 9, PAL.lime);
    const lap = Math.min(RACE_LAPS, pl.lapsCompleted + 1);
    drawText(ctx, String(lap), 78, 19, PAL.white, 2);
    drawText(ctx, '/' + RACE_LAPS, 80 + textWidth(String(lap), 2), 26, PAL.white);

    const tx = VIEW_W - 112;
    drawPanel(ctx, tx, 6, 106, 36);
    const current = pl.finished ? pl.lapTimes[pl.lapTimes.length - 1] : race.time - pl.lapStart;
    const rows = [['TIME', race.time], ['LAP', current], ['BEST', pl.bestLap]];
    rows.forEach(([label, t], k) => {
      drawText(ctx, label, tx + 4, 9 + k * 11, PAL.lime);
      drawText(ctx, formatTime(t), tx + 102, 9 + k * 11, k === 2 ? PAL.orange : PAL.white, 1, 'right');
    });

    // Mini standings: top four, plus the player if further back.
    const list = race.standings.slice(0, 4);
    if (!list.includes(pl)) list.push(pl);
    drawPanel(ctx, 6, 42, 62, list.length * 9 + 4);
    list.forEach((car, k) => {
      const y = 45 + k * 9;
      drawText(ctx, String(car.position), 10, y, PAL.white);
      ctx.fillStyle = PAL.black;
      ctx.fillRect(22, y, 7, 7);
      ctx.fillStyle = car.body;
      ctx.fillRect(23, y + 1, 5, 5);
      drawText(ctx, car.name, 32, y, car.isPlayer ? PAL.orange : PAL.white);
    });

    // Speed bar.
    drawPanel(ctx, 6, VIEW_H - 20, 106, 14);
    drawText(ctx, 'SPD', 10, VIEW_H - 17, PAL.lime);
    const segs = 14, lit = Math.round(clamp(pl.speed / CAR_MAX_SPEED, 0, 1) * segs);
    for (let k = 0; k < segs; k++) {
      ctx.fillStyle = k >= lit ? PAL.purpleDeep : k < 9 ? PAL.lime : k < 12 ? PAL.orange : PAL.red;
      ctx.fillRect(32 + k * 5, VIEW_H - 17, 4, 8);
    }

    // Minimap.
    const mm = this.minimap;
    const mx = VIEW_W - mm.cv.width - 10, my = VIEW_H - mm.cv.height - 10;
    drawPanel(ctx, mx - 4, my - 4, mm.cv.width + 8, mm.cv.height + 8);
    ctx.drawImage(mm.cv, mx, my);
    for (const car of race.cars) {
      if (car === pl) continue;
      ctx.fillStyle = car.body;
      ctx.fillRect(mx + Math.floor(car.x * mm.scale) - 1, my + Math.floor(car.y * mm.scale) - 1, 3, 3);
    }
    ctx.fillStyle = PAL.black;
    ctx.fillRect(mx + Math.floor(pl.x * mm.scale) - 3, my + Math.floor(pl.y * mm.scale) - 3, 6, 6);
    ctx.fillStyle = PAL.orange;
    ctx.fillRect(mx + Math.floor(pl.x * mm.scale) - 2, my + Math.floor(pl.y * mm.scale) - 2, 4, 4);

    const blink = Math.floor(now * 4) % 2 === 0;
    if (pl.wrongWayTimer > 0.8 && blink) {
      drawText(ctx, 'WRONG WAY!', VIEW_W / 2, 70, PAL.red, 3, 'center', PAL.black);
    } else if (pl.lostTimer > 0.4 && !pl.finished) {
      drawText(ctx, 'RETURN TO TRACK', VIEW_W / 2, 70, PAL.orange, 2, 'center', PAL.black);
    }
  }

  // Start lights: three lamps that light up red, then all go lime.
  drawCountdown(race) {
    const ctx = this.ctx;
    const go = race.running;
    const lit = go ? 3 : clamp(Math.floor(COUNTDOWN_TIME - race.countdown) + 1, 0, 3);
    const w = 3 * 20 + 8, x = Math.round(VIEW_W / 2 - w / 2), y = 40;
    drawPanel(ctx, x, y, w, 26, PAL.black);
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = k < lit ? (go ? PAL.lime : PAL.red) : PAL.purpleDark;
      ctx.fillRect(x + 6 + k * 20, y + 5, 16, 16);
      if (k < lit) {
        ctx.fillStyle = PAL.white;
        ctx.fillRect(x + 8 + k * 20, y + 7, 3, 3);
      }
    }
    const label = go ? 'GO!' : String(Math.ceil(race.countdown));
    drawText(ctx, label, VIEW_W / 2, y + 32, go ? PAL.lime : PAL.orange, 4, 'center', PAL.black);
  }
}
