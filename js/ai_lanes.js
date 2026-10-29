'use strict';

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
