'use strict';

// Pieces of the pre-rendered circuit image, assembled by buildTrackCanvas (see renderTrack.js).

// Grass, the road with its dark outline, rumble-strip kerbs and white edge lines.
function paintRoad(g, track) {
  const W = track.worldW, H = track.worldH, n = track.n;
  const HW = TRACK_HALF_WIDTH;

  for (let y = 0; y < H; y += 32) {
    g.fillStyle = (y / 32) % 2 ? PAL.limeMid : PAL.lime;
    g.fillRect(0, y, W, 32);
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

  // Dark outline just outside the kerbs, then asphalt under the kerb strip.
  const edge = HW + KERB_WIDTH;
  g.strokeStyle = PAL.black;
  g.lineWidth = edge * 2 + 2;
  loop(0);
  g.stroke();
  g.strokeStyle = PAL.asphalt;
  g.lineWidth = edge * 2;
  g.stroke();

  // Rumble-strip kerbs along both edges, alternating purple and white, so the edge is easy to read.
  for (let i = 0; i < n; i++) {
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
}

function paintRoadDecals(g, track, items) {
  // Road decals (snapped with everything else so rotated edges stay crisp).
  for (const o of items) {
    if (o.type === 'boost') {
      const i = o.idx;
      g.save();
      g.setTransform(track.tx[i], track.ty[i], track.nx[i], track.ny[i], o.x, o.y);
      g.fillStyle = PAL.black;
      g.fillRect(-13, -12, 26, 24);
      g.fillStyle = PAL.purpleDark;
      g.fillRect(-12, -11, 24, 22);
      g.fillStyle = PAL.orange;
      for (const ax of [-8, 0, 8]) {
        g.beginPath();
        g.moveTo(ax - 3, -9);
        g.lineTo(ax + 3, 0);
        g.lineTo(ax - 3, 9);
        g.lineTo(ax - 7, 9);
        g.lineTo(ax - 1, 0);
        g.lineTo(ax - 7, -9);
        g.closePath();
        g.fill();
      }
      g.restore();
    }
  }
}

function snapToPalette(g, W, H, rng) {
  // Palette snap + speckle texture.
  const palette = [PAL.lime, PAL.limeMid, PAL.purple, PAL.white, PAL.asphalt, PAL.black, PAL.orange, PAL.purpleDark].map(hexToRgb);
  const asphaltLight = hexToRgb(PAL.asphaltLight), limeDark = hexToRgb(PAL.limeDark);
  const img = g.getImageData(0, 0, W, H);
  const data = img.data;
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
}
