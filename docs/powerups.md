# Powerups

Turbo Pixel GP has three powerups: **Banana**, **Big** and **Swap with 1st**. They replace the old oil slick. The banana is now the only slippery hazard on the track.

## How players get and use them

- Powerups sit on the track as boxes. Each box shows its item's icon, so racers can choose which one to go for.
- Driving over a box puts the item in the car's single **item slot**. A car that is already holding an item drives straight through boxes and leaves them for someone else.
- Press **Space** to use the held item. Items can't be used during the countdown, or after the car has finished.
- The HUD shows the held item in the **ITEM** box in the bottom-left corner. While Big is active, a panel next to it shows `BIG!` and a countdown bar.
- Every car in the race plays the item game, AI cars included (see [AI behavior](#ai-behavior)). Cars that have finished, including the player's car on autopilot, stop collecting and using items. Bananas they dropped earlier stay on the track.

## Spawning

| Rule | Value |
| --- | --- |
| Pickups on the track | always exactly `ceil(cars / 2)`. A collected pickup is replaced right away |
| Where | a random spot anywhere around the lap, using the race's seeded RNG so a seed replays exactly |
| Item odds | Banana 50%, Big 30%, Swap 20% |
| On-road pickups | at least 8px inside the road edge |
| Swap lure | half of all Swap pickups spawn on the grass, up to 15px past the kerb |
| Spacing | the spawner tries to keep 24px from cars, tyres, cones, boost pads and other pickups |

Dropped bananas don't count toward the pickup total.

## Banana

- Using it drops a banana just behind the car.
- The next car to touch it **spins out**. The car rotates out of control for 1.2s and steering does nothing. Its velocity keeps the same direction and only slowly loses speed, so the car slides on along the path it was taking.
- Each banana works once and disappears when hit. Bananas never expire, and there is no limit on how many can be on the track.
- The car that dropped a banana is safe from it for 0.75s. After that, it can slip on its own banana too.
- A Big car squashes bananas without spinning.
- When the player's banana spins out a rival, the player scores `POINTS.bananaHit` (50). These points count in the **BUMPS + BANANAS** line of the results.

## Big

The car is Big for **7 seconds**.

- Its sprite and collision circles are twice the size. Its top speed is unchanged.
- **Immovable:** when a Big car hits a normal car, the Big car takes no push-back, no slow-down and no spin. The normal car gets **twice the knockback** it would get from a normal car of the same mass. It also spins if the hit is hard enough, as usual.
- **Two Big cars** collide exactly like two normal cars, spins included.
- Big cars can't be spun by bump spins or by bananas.
- **Tyre stacks:** a Big car shoves them out of the way. They slide to a stop, and after 8s they return to their original spot. To normal cars a tyre stack is always a solid wall, even after it has been shoved somewhere else.
- Cones don't slow a Big car down.

## Swap with 1st

- Using it makes the car **trade places with the leader** instantly. The leader is the highest-placed car that is still racing; finished cars are skipped.
- What gets traded is the position on the track and the race progress: distance, laps completed, lap times and lap start. This means the race positions change right away, and no lap announcements are triggered.
- **Trajectory and velocity are kept.** Each car keeps its own speed. Its heading and its direction of travel are rotated by the difference in road direction between the two spots. A car drifting 10° left of the road before the swap is still drifting 10° left of the road after it.
- Everything else stays with its own car: the held item, the Big timer and any spin.
- Using Swap while in 1st does nothing, and the item is used up.
- If the player is involved, a `SWAP!` or `SWAPPED!` message is shown.

## AI behavior

- AI cars steer toward a pickup up to about 150px ahead if it is within 28px of their racing line. They never go for pickups that are off the road, so they don't take the swap lure.
- AI cars steer around bananas lying on their line, unless they are Big.
- When AI cars use their item:
  - **Big:** straight away.
  - **Swap:** when not in 1st. The leader holds on to it.
  - **Banana:** when a rival is within 70px behind and close to its line, or after holding it for 8s.

## Where the code lives

| File | What it does |
| --- | --- |
| [js/powerups.js](../js/powerups.js) | Pickup spawning, keeping the pickup count, collecting, and `useHeldItem` |
| [js/banana.js](../js/banana.js) | Dropping bananas, hit checks, the spin, scoring |
| [js/bigMode.js](../js/bigMode.js) | Big constants, `activateBig`, the lone-Big-car rule, `shoveTyre` |
| [js/swap.js](../js/swap.js) | `findSwapTarget` and `swapWithLeader` |
| [js/aiItems.js](../js/aiItems.js) | AI steering toward pickups and around bananas, and when AI uses items |
| [js/physics.js](../js/physics.js) | Car-vs-car collisions, including Big immovability and double knockback |
| [js/obstacles.js](../js/obstacles.js) | Tyre stacks shoved by Big cars and returning home |
| [js/car.js](../js/car.js) | `heldItem`, `bigTimer`, `isBig`, `sizeScale`, `glideSpin` |
| [js/renderPowerups.js](../js/renderPowerups.js) | Pickup boxes, bananas and the HUD item slot |

The tests are in `tests/powerups.test.js`, `tests/banana.test.js`, `tests/bigMode.test.js`, `tests/swap.test.js` and `tests/aiItems.test.js`.
