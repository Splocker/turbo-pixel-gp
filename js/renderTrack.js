'use strict';

function paintStartGrid(g, track) {
  const HW = TRACK_HALF_WIDTH;
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
}

function paintGrandstand(g, track, rng) {
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
}

// Trees and the perimeter fence. Tyre stacks are drawn live each frame instead (render.js).
function paintScenery(g, track) {
  const W = track.worldW, H = track.worldH;
  // Trees with a soft pixel shadow.
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
}

// Pre-render the whole circuit once. Shapes are drawn with canvas paths, then every pixel is
// snapped to the nearest palette color, which removes anti-aliasing and gives hard 8-bit edges.
function buildTrackCanvas(track) {
  const cv = makeCanvas(track.worldW, track.worldH);
  const g = cv.getContext('2d');
  const items = obstacleLayout(track);
  const rng = makeRng(99);
  paintRoad(g, track);
  paintRoadDecals(g, track, items);
  snapToPalette(g, track.worldW, track.worldH, rng);
  paintStartGrid(g, track);
  paintGrandstand(g, track, rng);
  paintScenery(g, track);
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
