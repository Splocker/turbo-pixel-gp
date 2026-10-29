# File layout

The game is a set of plain browser scripts: no modules and no build step. They all share one global scope, and `index.html` loads them in order. Each file is kept to about 200 lines. Large classes are spread across several files using the `mixInto` pattern described below.

## Game logic (also loaded by the tests)

Load order matters. It is listed in `LOGIC_SCRIPTS` in `tests/helpers/load.js` and must match `index.html` (`tests/page.test.js` checks this).

| File | What it holds |
|---|---|
| `util.js` | Palette, maths helpers, seeded RNG, `mixInto` |
| `spline.js` | Catmull-Rom spline and curvature, used to build the track |
| `track.js` | `Track`: centerline, scenery, surface lookups, grid slots |
| `ai_lanes.js` | `buildAiLanes`: the two AI driving lines around hazards |
| `obstacles.js` | Course layout (boost pads, cones, tyre islands, coins) and the per-race `Obstacles` |
| `car.js` | `Car`: driving model, spin-outs, Big state, item slot |
| `ai_powerups.js` | When AI drivers fire their item |
| `ai.js` | `AIDriver`: steering, speed and overtaking |
| `physics.js` | Car-vs-car collisions (including Big rules) and scenery collisions |
| `powerups.js` | `PowerupField`: item boxes, bananas, spawning |
| `powerup_effects.js` | `usePowerup`, `swapWithLeader` |
| `roster.js` | AI driver names and liveries |
| `race_scoring.js` | Points constants and the `RaceScoringMethods` mixin |
| `race_effects.js` | Particles, skid marks and popups (`RaceEffectsMethods` mixin) |
| `race.js` | `Race`: the race loop, progress and standings |
| `scores.js` | High-score table and settings storage |

## Drawing and screens (browser only)

| File | What it holds |
|---|---|
| `font.js` | Pixel font |
| `sprites.js` | Car, tree, tyre, cone, coin, banana and item-box sprites |
| `track_canvas.js` | Pre-renders the road, kerbs and boost pads, then snaps to the palette |
| `track_decor.js` | Start line, grid boxes, grandstand, trees, fence, minimap |
| `hud.js` | `drawPanel` and the `HudMethods` mixin (HUD, item slot, start lights) |
| `render.js` | `Renderer`: world view, cars, obstacles, powerups |
| `game_input.js` | `GameInputMethods`: keyboard handling on every screen |
| `game_menus.js` | `GameMenuMethods`: title, setup, pause, in-race overlay |
| `game_results.js` | `GameResultMethods`: finish banner, results, name entry, high scores |
| `game_events.js` | `GameEventMethods`: reacts to race events (flashes, shake, finish) |
| `game.js` | `Game`: state machine, main loop, camera. Must load last. |

## The `mixInto` pattern

To split a class across files, its extra methods go into a plain object in a helper file that loads **before** the class file:

```js
// race_scoring.js
const RaceScoringMethods = {
  get playerScoring() { ... },
  scoreBump(hit) { ... },
};
```

The class file then copies them onto its prototype:

```js
// race.js
class Race { ... }
mixInto(Race, RaceScoringMethods);
```

`mixInto` (in `util.js`) copies property descriptors, so getters stay getters. `Object.assign` would call the getter once and store the result instead.

## Adding a new script

1. Add a `<script>` tag to `index.html` in the right place: after anything it needs at load time, and before `game.js`.
2. If it is game logic that doesn't need a canvas, also add it to `LOGIC_SCRIPTS` in `tests/helpers/load.js`, in the same order.
