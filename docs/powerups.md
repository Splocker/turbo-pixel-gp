# Powerups

Item boxes sit on the track during a race. Drive over one to collect it, then press **Space** to use it. Every car, player and AI alike, has a single item slot. While the slot is full, you drive straight over other boxes without picking them up.

The oil slicks have been removed. The banana is now the only slippery thing on the course.

## The three powerups

| Box icon | Powerup | What it does |
|---|---|---|
| Yellow banana | **Banana** | Drops a banana peel just behind your car. The next car to drive over it spins out but keeps sliding in the direction it was already travelling, losing speed slowly. Then the peel is gone. |
| Lime up-arrow | **Big** | Your car doubles in size for **7 seconds**. Nothing can move you: other cars bounce off without knocking you back or spinning you, and bananas get squashed. Cars you hit are knocked **twice as far** as normal. Tyre stacks get shoved out of the way and slide back home after a few seconds. Cones fly twice as far. If two big cars meet, they bump each other like two normal cars. |
| Orange "1" | **Swap with 1st** | You instantly trade places with the race leader. Each car keeps its own heading and speed, so you carry your momentum into the leader's spot. If you're already in first, nothing happens and you keep the item. |

### Details worth knowing

- **Dropping a banana:** the peel lands 14px behind the car (28px when big). The car that dropped it is safe from it for 0.6s while it lands. After that it can catch anyone, including the car that dropped it.
- **Big ending:** the car flickers between sizes during its last 1.5s as a warning. A big car is also twice as wide for collisions with cars, tyres, cones, coins and item boxes.
- **What Swap moves:** the race-progress fields change hands: position on the track, distance, laps completed, lap times and lap start time. Heading, velocity, spin and Big stay with each car. Swap only targets cars that haven't finished yet.
- **Finished cars** can't collect items, so they don't take boxes away from cars still racing.

## Where boxes appear

- There are always at least **half as many item boxes as cars**, rounded up (`minimumPickupCount`). For example, 5 cars means at least 3 boxes and 21 cars means at least 11. Collected boxes are replaced in the same update.
- Boxes can appear **anywhere on the road**: a random point along the lap at a random offset across the track.
- **Swap boxes** sometimes (35% of the time) sit up to 12px past the road edge, on the kerb or grass, so grabbing one can cost a little time.
- New boxes avoid tyre stacks and other boxes, and never appear within 60px of a car. If no free spot turns up after 100 tries, the box goes anywhere, so the minimum count always holds.
- Spawn odds: Banana 45%, Big 40%, Swap 15%.
- Spawning uses the race's seeded random generator, so the same seed gives the same boxes.

## How AI rivals use items

AI drivers collect boxes they drive over (they don't steer toward them) and use them with simple rules (`js/ai_powerups.js`):

- **Banana:** dropped when a car is close behind (within 60px, roughly in line), or after holding it for 6s.
- **Big:** used when a car is close ahead (within 70px), or after holding it for 2s.
- **Swap:** used only from **3rd place or worse**, after holding it for 1s. That softens the blow when the player leads.

## Scoring

- Collecting a box: **+10** (counts toward "COINS + STUFF").
- A rival slipping on *your* banana: **+50** (counts toward "BUMPS").
- Bumping cars while big scores like any other bump. The harder knock makes big-hit bonuses more likely.

## Screen feedback

- The **ITEM** panel next to the lap counter shows the held item, with a blinking **SPACE** hint. A lime bar under it shows the Big time left.
- Flash messages: **BIG!** when you grow, **SWAP!** when you take 1st, and **SWAPPED!** when an AI takes your place. The camera jumps to your new spot on a swap.
- Slipping on a banana shakes the screen.

## Tuning constants

| Constant | File | Default |
|---|---|---|
| `BIG_TIME`, `BIG_SCALE` | `js/car.js` | 7s, 2x |
| `SLIDE_DRAG` (how fast a banana slide loses speed) | `js/car.js` | 0.8 |
| `BIG_KNOCKBACK` | `js/physics.js` | 2 |
| `BIG_SHOVE`, `TYRE_RESET`, `TYRE_SHOVE_SPEED` | `js/obstacles.js` | 2, 8s, 60 |
| `POWERUP_WEIGHTS`, `BANANA_*`, `SWAP_OFF_TRACK_*`, `PICKUP_*` | `js/powerups.js` | see file |
| `AI_BANANA_*`, `AI_BIG_*`, `AI_SWAP_*` | `js/ai_powerups.js` | see file |
| `POINTS.powerup`, `POINTS.bananaHit` | `js/race_scoring.js` | 10, 50 |

## Code map

- `js/powerups.js`: `PowerupField`, one per race (`race.powerups`). Holds the item boxes and dropped bananas, handles spawning and the minimum count (`topUp`), and resolves cars against boxes and bananas (`collide`).
- `js/powerup_effects.js`: `usePowerup(car, race)` fires the held item. `swapWithLeader` does the swap.
- `js/ai_powerups.js`: `aiWantsToUsePowerup(car, race)`, called from `AIDriver.update`.
- The use button is `car.input.usePowerup`. The player sets it with Space in `js/game_input.js`, AI sets it every frame, and `Race.update` fires the item and clears the flag.
- Drawing: item and banana sprites live in `js/sprites.js`. `Renderer.drawPowerups` and the big-car scaling are in `js/render.js`, and the item slot is in `js/hud.js`.
