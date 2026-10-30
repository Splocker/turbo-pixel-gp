# Architecture

The game is plain browser JavaScript. There are no modules and no build step. `index.html` loads classic `<script>` tags in order, and all the scripts share one global scope.

The project rule is that a file should be 200 lines or less. Large classes are therefore split across files:
- A helper file defines an object of methods, for example `const RACE_SCORING_METHODS = { ... }`.
- The class file mixes those methods in after the class body: `Object.assign(Race.prototype, ...)`.
- Helper files load before the class file that uses them.

## Files, in load order

| File | What it holds |
| --- | --- |
| `util.js` | Palette, math helpers, the seeded RNG |
| `font.js` | 5x7 bitmap font, `drawText` |
| `trackSpline.js` | Track control points, the Catmull-Rom spline and centerline sampling (`TRACK_SPLINE_METHODS`) |
| `track.js` | `Track`: scenery and the nearest-sample, lateral and surface queries |
| `obstacleLayout.js` | Hand-placed course furniture, its placement and the two AI lanes |
| `obstacles.js` | `Obstacles`: per-race furniture state and car-vs-furniture collisions |
| `car.js` | `Car`: driving physics, spins and powerup state |
| `ai.js` | `AIDriver`: lane following, avoidance, rubber-banding |
| `aiItems.js` | How AI cars chase pickups, dodge bananas and use items |
| `physics.js` | Car-vs-car and car-vs-scenery collisions |
| `bigMode.js`, `banana.js`, `swap.js`, `powerups.js` | Powerups (see [powerups.md](powerups.md)) |
| `raceScoring.js` | Points, combos, finish bonuses (`RACE_SCORING_METHODS`) |
| `raceEffects.js` | Sparks, confetti, skid marks, popups (`RACE_EFFECTS_METHODS`) |
| `raceProgress.js` | Lap progress, positions, resets, the edge assist (`RACE_PROGRESS_METHODS`) |
| `race.js` | `Race`: the grid, the per-step update order |
| `scores.js` | High scores and settings in localStorage |
| `renderSprites.js` | Pixel-art sprite builders |
| `renderTrackPaint.js`, `renderTrack.js` | The pre-rendered circuit image and the minimap |
| `renderHud.js` | HUD panels and start lights (`RENDERER_HUD_METHODS`) |
| `renderPowerups.js` | Pickup boxes, bananas and the item slot (`RENDERER_POWERUP_METHODS`) |
| `render.js` | `Renderer`: the world view, cars, obstacles |
| `gameInput.js` | Menu and screen keyboard handling (`GAME_INPUT_METHODS`) |
| `gameScreens.js` | Draw dispatch, the title and setup screens (`GAME_SCREEN_METHODS`) |
| `gameOverlays.js` | In-race overlay, pause, finish, results and high-score screens (`GAME_OVERLAY_METHODS`) |
| `game.js` | `Game`: the main loop, state machine, driving input, camera. It must load last |

## Adding a script

New files must be added in two places:
- `index.html`
- `LOGIC_SCRIPTS` in `tests/helpers/load.js`, if the file is game logic and doesn't need the DOM

`tests/page.test.js` checks that both lists match the files in `js/` and that they use the same order.

## Tests

`npm test` needs Node 22 or newer.
- Logic tests load the game scripts into a `vm` context through `tests/helpers/load.js`.
- `tests/smoke.test.js` boots the whole page against the stub DOM in `tests/helpers/fakeDom.js`. It drives the game through every screen and every powerup, so a broken draw path fails the tests.
