'use strict';

const TYRE_RADIUS = 6;
const BOOST_RADIUS = 12;
const CONE_RADIUS = 3;
const CONE_RESET = 8;
const COIN_RADIUS = 5;
const COIN_RESPAWN = 6;
const CAR_BODY_RADIUS = 6;    // car treated as one circle against obstacles

// Hand-placed course furniture, by distance along the lap (d) and offset from the centerline (lat,
// positive is the driver's right). The grid (the last ~320px of the lap) is kept clear.
const OBSTACLE_LAYOUT = [
  { type: 'coins', d: 90, lat: -22, count: 5 },
  { type: 'boost', d: 420, lat: -20 },
  { type: 'cones', d: 620, lat: 22 },
  { type: 'coins', d: 760, lat: -18, count: 4 },
  { type: 'cones', d: 1040, lat: 20 },
  { type: 'island', d: 1250, len: 100 },
  { type: 'coins', d: 1260, lat: 26, count: 4 },
  { type: 'boost', d: 1620, lat: 0 },
  { type: 'coins', d: 1760, lat: -20, count: 5 },
  { type: 'cones', d: 1900, lat: 18 },
  { type: 'coins', d: 2000, lat: -24, count: 4 },
  { type: 'boost', d: 2300, lat: 0 },
  { type: 'coins', d: 2420, lat: 10, count: 5 },
  { type: 'cones', d: 2680, lat: 24 },
  { type: 'boost', d: 2780, lat: -6 },
  { type: 'island', d: 2820, len: 60 },
];

// Expands the layout into individual objects with world positions.
function placeObstacles(track) {
  const items = [];
  const at = (d, lat) => {
    const i = track.indexAt(d);
    return { idx: i, lat, x: track.x[i] + track.nx[i] * lat, y: track.y[i] + track.ny[i] * lat };
  };
  for (const e of OBSTACLE_LAYOUT) {
    switch (e.type) {
      case 'boost': items.push({ type: 'boost', r: BOOST_RADIUS, ...at(e.d, e.lat) }); break;
      case 'island':
        for (let s = 0; s <= e.len; s += 10) items.push({ type: 'tyre', r: TYRE_RADIUS, ...at(e.d + s, 0) });
        break;
      case 'cones':
        // Small triangle of cones pointing at the oncoming cars.
        for (const [ds, dl] of [[0, 0], [10, -6], [10, 6], [20, -12], [20, 0], [20, 12]]) {
          items.push({ type: 'cone', r: CONE_RADIUS, ...at(e.d + ds, e.lat + dl) });
        }
        break;
      case 'coins':
        for (let k = 0; k < e.count; k++) items.push({ type: 'coin', r: COIN_RADIUS, ...at(e.d + k * 24, e.lat) });
        break;
    }
  }
  return items;
}

// Two preferred driving lanes (left-hand and right-hand) around everything that hurts. Each AI
// sticks to one, so the field splits around obstacles instead of queueing on one side.
function buildAiLanes(track, items) {
  const n = track.n, limit = TRACK_HALF_WIDTH - 8;
  const BEFORE = 10, AFTER = 6, MIN_GAP = 14;
  const hazards = items.filter((o) => o.type === 'tyre' || o.type === 'cone');
  const boosts = items.filter((o) => o.type === 'boost');
  const left = new Float32Array(n), right = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const blocked = [];
    for (const o of hazards) {
      let ahead = o.idx - i;
      if (ahead > n / 2) ahead -= n;
      if (ahead < -n / 2) ahead += n;
      if (ahead > BEFORE || ahead < -AFTER) continue;
      blocked.push([o.lat - o.r - CAR_BODY_RADIUS - 4, o.lat + o.r + CAR_BODY_RADIUS + 4]);
    }
    if (!blocked.length) {
      const pad = boosts.find((o) => {
        const ahead = track.wrap(o.idx - i);
        return ahead <= BEFORE;
      });
      left[i] = pad ? pad.lat : -10;
      right[i] = pad ? pad.lat : 10;
      continue;
    }
    // Free intervals across the road once the blocked spans are removed.
    blocked.sort((a, b) => a[0] - b[0]);
    const free = [];
    let from = -limit;
    for (const [a, b] of blocked) {
      if (a - from >= MIN_GAP) free.push([from, a]);
      from = Math.max(from, b);
    }
    if (limit - from >= MIN_GAP) free.push([from, limit]);
    if (!free.length) {
      left[i] = right[i] = 0;
      continue;
    }
    const mid = (f) => (f[0] + f[1]) / 2;
    left[i] = mid(free[0]);
    right[i] = mid(free[free.length - 1]);
  }

  for (const arr of [left, right]) {
    for (let pass = 0; pass < 2; pass++) {
      const src = arr.slice();
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let k = -4; k <= 4; k++) s += src[(i + k + n) % n];
        arr[i] = s / 9;
      }
    }
  }
  track.aiLaneL = left;
  track.aiLaneR = right;
}

// The static layout and AI lanes are built once per track and shared by every race.
function obstacleLayout(track) {
  if (!track.obstacleLayout) {
    track.obstacleLayout = placeObstacles(track);
    buildAiLanes(track, track.obstacleLayout);
  }
  return track.obstacleLayout;
}
