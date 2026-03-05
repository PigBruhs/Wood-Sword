# Wood-Sword
A browser-based round game with one human player and four bots.

## Current MVP
- Runs fully in the browser after page load.
- Fixed roster: 1 human + 4 bots.
- Mobile-friendly layout with action controls and a circular combat arena.
- English/Chinese language toggle in UI.
- Match/round flow implemented with deterministic damage checks.
- Visual attack indicators: curved arrows for single-target attacks, aggregate badges/highlights for multi-target attacks.

## Game Flow
- A game has multiple matches.
- A match has multiple rounds.
- Round phases:
  1. Action lock phase: players choose actions in secret; round advances only when human locks action.
  2. Display + missile allocation phase: locked actions are shown; missile users choose target allocations one-by-one in random order.
  3. Display resolution phase: once missile allocations are done, actions resolve and results are revealed; player clicks `Next Round` to continue.
- A match ends when at least one player dies in a round.
- Dead players are eliminated from the game.
- Survivors start the next match with reset stats (`0` points, `0` shields, no prep).
- Game ends when one player remains.

## Damage, Defense, and Shields
- Every defense action defines a deterministic block range, for example `0~3`.
- If incoming damage is inside the range, damage is fully blocked.
- If damage is outside the range, overwhelmed damage is applied:
  - Above max: `incoming - max`
  - Below min: `min - incoming`
- Reciprocal duel rule: if two players directly attack each other in one round,
  - lower attack damage takes overflow equal to the damage difference,
  - equal damage means neither side takes duel overflow,
  - those two direct attacks are otherwise canceled from normal incoming damage.
- Shields absorb overwhelmed damage:
  - Each shield absorbs up to `2` overwhelmed damage.
  - Broken shields needed = `ceil(overwhelmed / 2)`.
  - If available shields are insufficient, player dies.

## Actions
1. `gather`: +1 point.
2. `defense`: cost 0, blocks `0~3`.
3. `fist`: cost 0.5 each, stackable, 0.5 damage each to one target.
4. `wood sword`: cost 1, 1 damage to one target.
5. `stone sword`: cost 2, 2 damage to one target.
6. `iron sword`: cost 3, 3 damage to one target.
7. `gold sword`: cost 4, 4 damage to one target.
8. `diamond sword`: cost 5, 5 damage to one target.
9. `enchanted diamond sword`: cost 6, 6 damage to one target.
10. `llama`: cost 2, 0.5 damage to all other players, but deals no damage if the caster dies that round.
11. `missile`: choose `X` missiles (cost `X + 1`, total damage `X`), then split targets during the display + missile allocation phase.
12. `shield`: cost 2, blocks `0~2`, add one shield (max 2).
13. `prep`: cost 1, blocks `0~3`, next attack +1 damage if not damaged.
14. `dt defense`: cost 1, blocks `0~4`.
15. `hollow defense`: cost 2, blocks `2~6`.
16. `superior defense`: cost 3, blocks `0~6`.

## Implementation Notes
- Invalid actions are rejected (for example, not enough points or trying `shield` at cap 2).
- `Qi`/points are stored in `0.5` increments internally.
- Bots now use one unified weighted-random AI mode.
- Bot baseline rules include:
  - first round always `gather`,
  - action picks remain random but are weighted by situation (incoming threat, cost, and damage potential),
  - defense actions are biased toward better overflow prevention per cost,
  - single-target attacks are biased toward opponents estimated to be more vulnerable,
  - aggro multipliers: `2x` against the opponent who has dealt this bot the most damage in the current match, and `1.5x` against lowest-Qi targets,
  - `dt defense` is not used unless an alive opponent has more than 3 points,
  - `hollow defense` / `superior defense` are not used unless an alive opponent has at least 5 points,
  - bots never use `missile`.
- Match transition rule: if someone is eliminated this round, that round still stays in display/reveal; click `Next Round` once to settle elimination display, click again to start the next match.

## One-Click Start (Windows)
### For players (no Node install needed)
Use the portable package produced by the maintainer:

1. Unzip `Wood-Sword-portable.zip`.
2. Open the extracted folder.
3. Double-click `start-game.bat`.

The package already includes:
- built game files (`dist`),
- bundled Node runtime (`runtime/node`),
- local launcher (`start-game.bat`).

The launcher starts on port `4173` by default and automatically switches to the next free port if `4173` is occupied.

### For maintainer (build portable package)
Run:

```powershell
npm run build:portable
```

This creates `release/Wood-Sword-portable.zip`. Send that zip to your friend.

## Development
Requirements: Node.js 18+

```powershell
npm install
npm run dev
```

Open the local URL shown by Vite.

Run engine tests:

```powershell
npm test
```
