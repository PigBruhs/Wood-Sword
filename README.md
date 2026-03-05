# Wood-Sword（中文）
一个基于浏览器的回合制游戏：1 名人类玩家对战 4 个机器人。

## 当前 MVP
- 页面加载后可在浏览器中完整运行。
- 固定阵容：1 人类 + 4 机器人。
- 移动端友好布局，包含行动控制区与环形竞技场。
- UI 支持中英文切换。
- 已实现比赛/回合流程与确定性伤害结算。
- 攻击可视化指示：单体攻击使用弧形箭头，多目标攻击使用聚合徽标/高亮。

## 游戏流程
- 一局游戏包含多场 match。
- 一场 match 包含多个 round。
- 每回合阶段：
  1. 行动锁定阶段：玩家秘密选择行动；仅当人类玩家锁定行动后进入下一阶段。
  2. 展示 + 导弹分配阶段：显示已锁定行动；导弹使用者按随机顺序逐个分配目标。
  3. 展示结算阶段：导弹分配完成后执行结算并展示结果；玩家点击 `Next Round` 继续。
- 当某回合至少有一名玩家死亡时，该 match 结束。
- 死亡玩家从整局游戏中淘汰。
- 存活者进入下一场 match 时重置状态（`0` 点气、`0` 护盾、无蓄力）。
- 当仅剩 1 名玩家存活时，游戏结束。

## 伤害、防御与护盾
- 每种防御行动都有确定性格挡区间，例如 `0~3`。
- 若来袭伤害落在区间内，则完全格挡。
- 若来袭伤害超出区间，则承受溢出伤害：
  - 高于上限：`incoming - max`
  - 低于下限：`min - incoming`
- 对攻规则：若两名玩家在同一回合互相直接攻击，
  - 伤害较低的一方承受差值作为对攻溢出伤害，
  - 若伤害相等，双方都不承受对攻溢出，
  - 这两次直接攻击不再计入各自的普通来袭伤害。
- 护盾用于吸收溢出伤害：
  - 每个护盾最多吸收 `2` 点溢出伤害。
  - 所需破盾数 = `ceil(overwhelmed / 2)`。
  - 若现有护盾不足以吸收，则玩家死亡。

## 行动列表
1. `gather`：+1 点气。
2. `defense`：消耗 0，格挡 `0~3`。
3. `fist`：每次消耗 0.5，可叠加，对单目标每次造成 0.5 伤害。
4. `wood sword`：消耗 1，对单目标造成 1 伤害。
5. `stone sword`：消耗 2，对单目标造成 2 伤害。
6. `iron sword`：消耗 3，对单目标造成 3 伤害。
7. `gold sword`：消耗 4，对单目标造成 4 伤害。
8. `diamond sword`：消耗 5，对单目标造成 5 伤害。
9. `enchanted diamond sword`：消耗 6，对单目标造成 6 伤害。
10. `llama`：消耗 2，对所有其他玩家各造成 0.5 伤害；若施放者当回合死亡，则不造成伤害。
11. `missile`：选择 `X` 枚导弹（消耗 `X + 1`，总伤害 `X`），并在展示 + 导弹分配阶段拆分目标。
12. `shield`：消耗 2，格挡 `0~2`，并增加一层护盾（上限 2）。
13. `prep`：消耗 1，格挡 `0~3`；若本回合未受伤，则下一次攻击 +1 伤害。
14. `dt defense`：消耗 1，格挡 `0~4`。
15. `hollow defense`：消耗 2，格挡 `2~6`。
16. `superior defense`：消耗 3，格挡 `0~6`。

## 实现说明
- 非法行动会被拒绝（例如：点气不足，或护盾已达上限仍尝试 `shield`）。
- `Qi`/点气在内部以 `0.5` 为最小单位存储。
- 机器人当前统一使用加权随机 AI 模式。
- 机器人基础规则包括：
  - 第一回合必定 `gather`，
  - 行动仍保持随机，但会按局势加权（来袭威胁、消耗与伤害潜力），
  - 防御行动会偏向单位成本下溢出防护效率更高的选项，
  - 单体攻击会偏向预计更脆弱的对手，
  - 仇恨权重：对本场 match 中对其造成累计伤害最高的对手为 `2x`，对最低气目标为 `1.5x`，
  - 若没有存活对手点气大于 3，不使用 `dt defense`，
  - 若没有存活对手点气至少 5，不使用 `hollow defense` / `superior defense`，
  - 机器人不会使用 `missile`。
- Match 切换规则：若本回合有人被淘汰，当前回合仍停留在展示/揭示阶段；点击一次 `Next Round` 结算淘汰展示，再点一次才进入下一场 match。

## 一键启动（Windows）
### 玩家使用（无需安装 Node）
使用维护者打包好的便携版：

1. 解压 `Wood-Sword-portable.zip`。
2. 打开解压后的文件夹。
3. 双击 `start-game.bat`。

该包已包含：
- 构建产物（`dist`），
- 内置 Node 运行时（`runtime/node`），
- 本地启动脚本（`start-game.bat`）。

启动器默认使用端口 `4173`，若被占用会自动切换到下一个可用端口。

### 维护者使用（构建便携包）
运行：

```powershell
npm run build:portable
```

会生成 `release/Wood-Sword-portable.zip`，发送该 zip 给朋友即可。

## 开发
要求：Node.js 18+

```powershell
npm install
npm run dev
```

打开 Vite 输出的本地地址。

运行引擎测试：

```powershell
npm test
```

---

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
