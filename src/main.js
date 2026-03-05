import "./style.css";
import { ACTIONS, ACTION_ORDER } from "./game/actions.js";
import { assignBotType, chooseBotAction } from "./game/bots.js";
import { createGameState, processRoundEnd, resolveRound, validateIntent } from "./game/engine.js";
import { deriveDisplayAudioEvents, DisplaySfxQueue } from "./game/audio.js";

const app = document.getElementById("app");
const state = createGameState();
const sfxQueue = new DisplaySfxQueue(100);
let lastRevealWithQueuedSfx = null;
let lastRevealWithTrackedStats = null;

for (const p of state.players) {
  if (!p.isHuman) {
    p.botType = assignBotType();
  }
}

let timerId = null;
let impactFlashTimerId = null;
const ui = {
  actionType: "gather",
  targetId: "",
  stackCount: 1,
  message: "选择行动后点击锁定。",
  missileDraft: null,
  lang: "zh",
  soundEnabled: true,
  hardcoreMode: false,
  impactFlash: "",
  logHistory: []
};

const I18N = {
  en: {
    title: "Wood-Sword",
    matchRound: (m, r) => `Match ${m} / Round ${r}`,
    phase: "Phase",
    phaseAction: "Action",
    phaseMissile: "Missile Target Queue",
    phaseDisplay: "Display",
    phaseGameOver: "Game Over",
    players: "Players",
    yourAction: "Your Action",
    action: "Action",
    target: "Target",
    count: "Count",
    lockAction: "Lock Action",
    language: "中文",
    points: "Points",
    shields: "Shields",
    human: "Human",
    botRandom: "Random AI",
    hidden: "Hidden",
    reveal: "Round Reveal",
    noReveal: "No reveal yet.",
    gameOver: (winner) => `Game over. Winner: ${winner}`,
    survived: "survived",
    died: "died",
    incoming: "incoming",
    overflow: "overflow",
    shieldsBroken: "shields broken",
    choosingTargets: (name) => `${name} is choosing targets...`,
    preparingReveal: "Preparing reveal...",
    yourMissiles: (total, left) => `Your missiles: ${total}, remaining: ${left}`,
    addMissile: "Add 1 missile to target",
    finishAllocation: "Finish Allocation",
    lockMessage: (label) => `Locked in: ${label}`,
    actionPhaseHint: "Pick your action and lock it when ready.",
    nextRound: "Next Round",
    nextMatch: "Next Match",
    eliminationHold: "Elimination resolved. Click again to start the next match."
  },
  zh: {
    title: "木剑",
    matchRound: (m, r) => `第 ${m} 场 / 第 ${r} 回合`,
    phase: "阶段",
    phaseAction: "锁定行动",
    phaseMissile: "导弹分配队列",
    phaseDisplay: "展示",
    phaseGameOver: "游戏结束",
    players: "玩家",
    yourAction: "你的行动",
    action: "行动",
    target: "目标",
    count: "数量",
    lockAction: "锁定行动",
    language: "EN",
    points: "气",
    shields: "盾",
    human: "人类",
    botRandom: "统一AI",
    hidden: "隐藏",
    reveal: "回合结算",
    noReveal: "暂无结算。",
    gameOver: (winner) => `游戏结束。胜者：${winner}`,
    survived: "存活",
    died: "死亡",
    incoming: "受到伤害",
    overflow: "溢出伤害",
    shieldsBroken: "破盾数",
    choosingTargets: (name) => `${name} 正在分配目标...`,
    preparingReveal: "准备结算中...",
    yourMissiles: (total, left) => `你的导弹：${total}，剩余：${left}`,
    addMissile: "给目标追加 1 枚导弹",
    finishAllocation: "完成分配",
    lockMessage: (label) => `已锁定：${label}`,
    actionPhaseHint: "选择行动后点击锁定。",
    nextRound: "下一回合",
    nextMatch: "下一场",
    eliminationHold: "本回合淘汰已结算，再点一次进入下一场。"
  }
};

const ACTION_LABELS = {
  gather: { en: "Gather", zh: "集气" },
  defense: { en: "Defense", zh: "防御" },
  fist: { en: "Fist", zh: "拳击" },
  woodSword: { en: "Wood Sword", zh: "木剑" },
  stoneSword: { en: "Stone Sword", zh: "石剑" },
  ironSword: { en: "Iron Sword", zh: "铁剑" },
  goldSword: { en: "Gold Sword", zh: "金剑" },
  diamondSword: { en: "Diamond Sword", zh: "钻石剑" },
  enchantedDiamondSword: { en: "Enchanted Diamond Sword", zh: "附魔钻石剑" },
  llama: { en: "Llama", zh: "羊驼" },
  missile: { en: "Missile", zh: "导弹" },
  shield: { en: "Shield", zh: "护盾" },
  prep: { en: "Prep", zh: "蓄力" },
  dtDefense: { en: "DT Defense", zh: "DT 防御" },
  hollowDefense: { en: "Hollow Defense", zh: "空心防御" },
  superiorDefense: { en: "Superior Defense", zh: "高级防御" }
};

function t() {
  return I18N[ui.lang];
}

function actionLabel(type) {
  const labels = ACTION_LABELS[type];
  if (!labels) {
    return ACTIONS[type]?.label ?? type;
  }
  return labels[ui.lang] ?? labels.en;
}

function phaseLabel() {
  const dict = t();
  if (state.phase === "action") {
    return dict.phaseAction;
  }
  if (state.phase === "missileTarget") {
    return dict.phaseMissile;
  }
  if (state.phase === "display") {
    return dict.phaseDisplay;
  }
  if (state.phase === "gameOver") {
    return dict.phaseGameOver;
  }
  return state.phase;
}

function startActionPhase() {
  clearInterval(timerId);
  state.phase = "action";
  state.phaseSecondsLeft = 0;
  ui.message = t().actionPhaseHint;

  // If human is eliminated, bot rounds continue automatically.
  const human = state.players.find((p) => p.id === "human");
  if (!human?.alive) {
    setTimeout(() => {
      commitRound();
      render();
    }, 300);
  }
}

function commitRound() {
  const human = state.players.find((p) => p.id === "human");
  if (!human.alive) {
    state.intents.human = { type: "defense" };
  } else if (!state.intents.human) {
    state.intents.human = { type: "defense" };
  }

  for (const p of state.players) {
    if (!p.alive || p.isHuman) {
      continue;
    }
    state.intents[p.id] = chooseBotAction(state, p);
  }

  buildMissileQueue();
}

function buildMissileQueue() {
  const ids = Object.entries(state.intents)
    .filter(([, intent]) => intent.type === "missile")
    .map(([id]) => id);

  shuffle(ids);
  state.missileQueue = ids;

  if (ids.length === 0) {
    revealRound();
    return;
  }

  // Missile target picking happens during display so locked actions are already visible.
  state.phase = "display";
  ui.missileDraft = null;
  nextMissilePicker();
}

function nextMissilePicker() {
  if (state.missileQueue.length === 0) {
    revealRound();
    return;
  }
  const pickerId = state.missileQueue[0];
  const picker = state.players.find((p) => p.id === pickerId);
  const enemies = state.players.filter((p) => p.alive && p.id !== pickerId);
  const intent = state.intents[pickerId];

  if (!picker.isHuman) {
    if (!intent.missileTargets) {
      intent.missileTargets = allocateRandom(intent.count, enemies.map((p) => p.id));
    }
    state.missileQueue.shift();
    setTimeout(() => {
      nextMissilePicker();
      render();
    }, 500);
    render();
    return;
  }

  ui.missileDraft = {
    pickerId,
    total: intent.count,
    remaining: intent.count,
    allocations: {},
    targetId: enemies[0]?.id ?? ""
  };
  render();
}

function revealRound() {
  state.phase = "display";
  state.phaseSecondsLeft = 0;
  state.reveal = resolveRound(state, state.intents);
  pushRevealHistory(state.reveal);
  updateCareerStatsFromReveal(state.reveal);
  triggerImpactFlashFromReveal();
  enqueueDisplaySfxIfNeeded();

  clearInterval(timerId);
  render();
}

function triggerImpactFlashFromReveal() {
  const humanResult = state.reveal?.byPlayer?.human;
  if (!humanResult) {
    return;
  }

  let nextFlash = "";
  let durationMs = 0;

  if (humanResult.died) {
    nextFlash = "death";
    durationMs = 720;
  } else if (Number(humanResult.overwhelmedDamage ?? 0) > 0) {
    nextFlash = "hit";
    durationMs = 260;
  }

  if (!nextFlash) {
    return;
  }

  if (impactFlashTimerId) {
    clearTimeout(impactFlashTimerId);
    impactFlashTimerId = null;
  }

  ui.impactFlash = "";
  render();

  setTimeout(() => {
    ui.impactFlash = nextFlash;
    render();
    impactFlashTimerId = setTimeout(() => {
      ui.impactFlash = "";
      impactFlashTimerId = null;
      render();
    }, durationMs);
  }, 0);
}

function enqueueDisplaySfxIfNeeded() {
  if (state.phase !== "display" || !state.reveal) {
    return;
  }
  if (state.reveal === lastRevealWithQueuedSfx) {
    return;
  }

  if (!ui.soundEnabled) {
    lastRevealWithQueuedSfx = state.reveal;
    return;
  }

  const events = deriveDisplayAudioEvents(state.reveal, "human");
  if (events.length > 0) {
    sfxQueue.enqueue(events);
    sfxQueue.play();
  }
  lastRevealWithQueuedSfx = state.reveal;
}

function onToggleSound() {
  ui.soundEnabled = !ui.soundEnabled;
  sfxQueue.setEnabled(ui.soundEnabled);
  render();
}

function onToggleHardcore() {
  ui.hardcoreMode = !ui.hardcoreMode;
  render();
}

function onNextRound() {
  if (state.phase !== "display" || !state.reveal) {
    return;
  }
  processRoundEnd(state, state.reveal);
  if (!state.gameOver && state.phase === "action") {
    startActionPhase();
  }
  render();
}

function submitHumanIntent() {
  const human = state.players.find((p) => p.id === "human");
  if (!human.alive) {
    return;
  }

  const intent = { type: ui.actionType };
  if (ui.actionType === "fist" || ui.actionType === "missile") {
    intent.count = Number(ui.stackCount);
  }
  if (ACTIONS[ui.actionType].needsTarget) {
    const aliveTargets = state.players.filter((p) => p.alive && p.id !== "human");
    const selectedStillAlive = aliveTargets.some((p) => p.id === ui.targetId);
    const fallbackTargetId = aliveTargets[0]?.id ?? "";
    intent.targetId = selectedStillAlive ? ui.targetId : fallbackTargetId;
    ui.targetId = intent.targetId;
  }

  const check = validateIntent(state, human, intent);
  if (!check.ok) {
    ui.message = check.reason;
    render();
    return;
  }

  state.intents.human = intent;
  ui.message = t().lockMessage(actionLabel(intent.type));
  commitRound();
  render();
}

function onMissileAllocate() {
  if (!ui.missileDraft) {
    return;
  }
  const chosenTarget = ui.missileDraft.targetId;
  if (!chosenTarget || ui.missileDraft.remaining <= 0) {
    return;
  }
  ui.missileDraft.allocations[chosenTarget] = (ui.missileDraft.allocations[chosenTarget] ?? 0) + 1;
  ui.missileDraft.remaining -= 1;
  render();
}

function onMissileDone() {
  if (!ui.missileDraft || ui.missileDraft.remaining > 0) {
    return;
  }
  const intent = state.intents[ui.missileDraft.pickerId];
  intent.missileTargets = { ...ui.missileDraft.allocations };
  state.missileQueue.shift();
  ui.missileDraft = null;
  nextMissilePicker();
  render();
}

// Add leaderboard and stats panel UI elements
const leaderboard = {
  maxSurvivalMatches: 0,
  currentSurvivalMatches: 0
};

const stats = {
  totalDamageDealt: 0,
  totalDamageReceived: 0,
  totalShieldsUsed: 0,
  totalEnergySpent: 0,
  totalKills: 0,
  totalDeaths: 0
};

function loadStats() {
  const savedStats = JSON.parse(localStorage.getItem("gameStats"));
  if (savedStats) {
    if (!Number.isFinite(savedStats.totalKills)) {
      savedStats.totalKills = 0;
    }
    if (!Number.isFinite(savedStats.totalDeaths)) {
      savedStats.totalDeaths = 0;
    }
    Object.assign(stats, savedStats);
  }

  const savedLeaderboard = JSON.parse(localStorage.getItem("leaderboard"));
  if (savedLeaderboard) {
    if (Number.isFinite(savedLeaderboard.maxSurvivalRounds) && !Number.isFinite(savedLeaderboard.maxSurvivalMatches)) {
      savedLeaderboard.maxSurvivalMatches = savedLeaderboard.maxSurvivalRounds;
    }
    if (Number.isFinite(savedLeaderboard.currentSurvivalRounds) && !Number.isFinite(savedLeaderboard.currentSurvivalMatches)) {
      savedLeaderboard.currentSurvivalMatches = savedLeaderboard.currentSurvivalRounds;
    }
    Object.assign(leaderboard, savedLeaderboard);
  }

  leaderboard.maxSurvivalMatches = Number(leaderboard.maxSurvivalMatches || 0);
  leaderboard.currentSurvivalMatches = Number(leaderboard.currentSurvivalMatches || 0);
}

function saveStats() {
  localStorage.setItem("gameStats", JSON.stringify(stats));
  localStorage.setItem("leaderboard", JSON.stringify(leaderboard));
}

function updateCareerStatsFromReveal(reveal) {
  if (!reveal?.byPlayer) {
    return;
  }
  if (reveal === lastRevealWithTrackedStats) {
    return;
  }

  const humanEntry = reveal.byPlayer.human;
  if (!humanEntry) {
    lastRevealWithTrackedStats = reveal;
    return;
  }

  const dealtThisRound = Object.values(reveal.byPlayer)
    .reduce((sum, entry) => sum + Number(entry.damageFrom?.human ?? 0), 0);
  const killsThisRound = reveal.deadThisRound
    .filter((deadId) => Number(reveal.byPlayer?.[deadId]?.damageFrom?.human ?? 0) > 0)
    .length;
  const deathsThisRound = humanEntry.died ? 1 : 0;

  stats.totalDamageDealt = fmtNumber(stats.totalDamageDealt + dealtThisRound);
  stats.totalDamageReceived = fmtNumber(stats.totalDamageReceived + Number(humanEntry.overwhelmedDamage ?? 0));
  stats.totalShieldsUsed += Number(humanEntry.shieldsBroken ?? 0);
  stats.totalEnergySpent = fmtNumber(stats.totalEnergySpent + Number(humanEntry.pointsSpent ?? 0));
  stats.totalKills += killsThisRound;
  stats.totalDeaths += deathsThisRound;

  // Match-based streak: update only when this round ended a match (someone eliminated).
  if ((reveal.deadThisRound?.length ?? 0) > 0) {
    if (humanEntry.died) {
      leaderboard.currentSurvivalMatches = 0;
    } else {
      leaderboard.currentSurvivalMatches += 1;
      leaderboard.maxSurvivalMatches = Math.max(
        leaderboard.maxSurvivalMatches,
        leaderboard.currentSurvivalMatches
      );
    }
  }

  lastRevealWithTrackedStats = reveal;
  saveStats();
}

function pushRevealHistory(reveal) {
  if (!reveal?.byPlayer) {
    return;
  }
  ui.logHistory.push({
    matchNumber: state.matchNumber,
    roundNumber: state.roundNumber,
    reveal
  });
}

function renderLeaderboardAndStats() {
  return `
    <div class="panel-card">
      <h2>Leaderboard</h2>
      <div class="log">
        <p>Max Survival Matches: ${leaderboard.maxSurvivalMatches}</p>
        <p>Current Survival Matches: ${leaderboard.currentSurvivalMatches}</p>
      </div>
    </div>
    <div class="panel-card">
      <h2>Stats</h2>
      <div class="log">
        <p>K: ${stats.totalKills}</p>
        <p>D: ${stats.totalDeaths}</p>
        <p>Total Damage Dealt: ${fmt(stats.totalDamageDealt)}</p>
        <p>Total Damage Received: ${fmt(stats.totalDamageReceived)}</p>
        <p>Total Shields Used: ${stats.totalShieldsUsed}</p>
        <p>Total Energy Spent: ${fmt(stats.totalEnergySpent)}</p>
      </div>
    </div>
  `;
}

// Call loadStats on game start.
loadStats();

// Update render function to include leaderboard and stats
function render() {
  const human = state.players.find((p) => p.id === "human");
  const aliveTargets = state.players.filter((p) => p.alive && p.id !== "human");
  const dict = t();
  if (aliveTargets.length === 0) {
    ui.targetId = "";
  } else if (!aliveTargets.some((p) => p.id === ui.targetId)) {
    ui.targetId = aliveTargets[0].id;
  }

  const controlsDisabled = state.phase !== "action" || !human.alive;
  const missileAllocationActive = isMissileAllocationActive();
  const nextLabel = state.pendingMatchAdvance ? dict.nextMatch : dict.nextRound;

  app.innerHTML = `
    <div class="screen-flash ${ui.impactFlash ? `flash-${ui.impactFlash}` : ""}"></div>
    <div class="card">
      <div class="meta">
        <h1>${dict.title}</h1>
        <div class="meta-actions">
          <button id="toggleSound" class="${ui.soundEnabled ? "" : "muted"}">SHUT UP!</button>
          <button id="toggleHardcore" class="${ui.hardcoreMode ? "hardcore-on" : ""}">HARDCORE</button>
          <button id="toggleLang">${dict.language}</button>
        </div>
      </div>
      <div class="meta">
        <span>${dict.matchRound(state.matchNumber, state.roundNumber)}</span>
        <span>${dict.phase}: ${phaseLabel()}</span>
      </div>
    </div>

    ${renderLeaderboardAndStats()}

    <div class="board-grid">
      <div class="panel-card">
        <h2>${dict.yourAction}</h2>
        <div class="controls">
          <div class="row">
            <label>${dict.action}</label>
            <select id="actionType" ${controlsDisabled ? "disabled" : ""}>
              ${ACTION_ORDER.map((type) => {
                const def = ACTIONS[type];
                const selected = ui.actionType === type ? "selected" : "";
                return `<option value="${type}" ${selected}>${actionLabel(type)} (${type === "missile" ? "x+1" : def.cost})</option>`;
              }).join("")}
            </select>
          </div>
          <div class="row" ${ACTIONS[ui.actionType].needsTarget ? "" : "style=\"display:none\""}>
            <label>${dict.target}</label>
            <select id="targetId" ${controlsDisabled ? "disabled" : ""}>
              ${aliveTargets.map((p) => `<option value="${p.id}" ${ui.targetId === p.id ? "selected" : ""}>${p.name}</option>`).join("")}
            </select>
          </div>
          <div class="row" ${(ui.actionType === "fist" || ui.actionType === "missile") ? "" : "style=\"display:none\""}>
            <label>${dict.count}</label>
            <input id="stackCount" type="number" min="1" step="1" value="${ui.stackCount}" ${controlsDisabled ? "disabled" : ""} />
          </div>
          <button class="primary" id="lockAction" ${controlsDisabled ? "disabled" : ""}>${dict.lockAction}</button>
          <button class="primary" id="nextRound" ${(state.phase === "display" && !state.gameOver && state.reveal) ? "" : "disabled"}>${nextLabel}</button>
          <p ${(state.pendingMatchAdvance && state.phase === "display") ? "" : "style=\"display:none\""}>${dict.eliminationHold}</p>
          <p>${ui.message}</p>
        </div>
      </div>

      <div class="panel-card">
        <h2>${dict.players}</h2>
        ${renderCombatArena()}
      </div>

      <div class="panel-card side-stack">
        <div>
          <h2>${dict.reveal}</h2>
        </div>

        <div ${missileAllocationActive ? "" : "style=\"display:none\""}>
          <h2>${dict.phaseMissile}</h2>
          ${renderMissileQueue()}
        </div>

        <div class="log log-history">
          ${renderReveal()}
        </div>
      </div>
    </div>
  `;

  document.getElementById("toggleSound")?.addEventListener("click", onToggleSound);
  document.getElementById("toggleHardcore")?.addEventListener("click", onToggleHardcore);
  document.getElementById("toggleLang")?.addEventListener("click", () => {
    ui.lang = ui.lang === "en" ? "zh" : "en";
    render();
  });
  document.getElementById("actionType")?.addEventListener("change", (e) => {
    ui.actionType = e.target.value;
    render();
  });
  document.getElementById("targetId")?.addEventListener("change", (e) => {
    ui.targetId = e.target.value;
  });
  document.getElementById("stackCount")?.addEventListener("change", (e) => {
    ui.stackCount = Math.max(1, Number(e.target.value || 1));
  });
  document.getElementById("lockAction")?.addEventListener("click", submitHumanIntent);
  document.getElementById("missileTarget")?.addEventListener("change", (e) => {
    if (ui.missileDraft) {
      ui.missileDraft.targetId = e.target.value;
    }
  });
  document.getElementById("missileAllocate")?.addEventListener("click", onMissileAllocate);
  document.getElementById("missileDone")?.addEventListener("click", onMissileDone);
  document.getElementById("nextRound")?.addEventListener("click", onNextRound);
}

function getArenaPlayers() {
  const recentlyEliminated = new Set(
    state.phase === "display" && state.pendingMatchAdvance
      ? (state.reveal?.deadThisRound ?? [])
      : []
  );

  return state.players.filter((p) => p.alive || recentlyEliminated.has(p.id));
}

function renderCombatArena() {
  const arenaPlayers = getArenaPlayers();
  if (arenaPlayers.length === 0) {
    return "<p>No alive players.</p>";
  }

  const positions = computeCirclePositions(arenaPlayers);
  const overlay = buildAttackOverlay(arenaPlayers, positions);

  return `
    <div class="combat-arena">
      <svg class="attack-layer" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <marker id="attack-arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 z" fill="currentColor"></path>
          </marker>
        </defs>
        ${overlay.arcs.join("")}
      </svg>
      ${arenaPlayers.map((player) => renderPlayerNode(player, positions[player.id], overlay)).join("")}
    </div>
  `;
}

function computeCirclePositions(players) {
  const result = {};
  const radius = 39;
  const youIndex = players.findIndex((p) => p.id === "human");

  // Keep You fixed at bottom-center and rotate everyone else around that anchor.
  for (let i = 0; i < players.length; i += 1) {
    const rotated = youIndex >= 0 ? (i - youIndex + players.length) % players.length : i;
    const angle = (Math.PI / 2) + ((2 * Math.PI * rotated) / players.length);
    result[players[i].id] = {
      x: 50 + radius * Math.cos(angle),
      y: 50 + radius * Math.sin(angle)
    };
  }
  return result;
}

function buildAttackOverlay(alivePlayers, positions) {
  const arcs = [];
  const targeted = new Set();
  const aggregateBySource = {};

  for (const player of alivePlayers) {
    const intent = visibleIntentForPlayer(player.id);
    if (!intent) {
      continue;
    }

    if (intent.type === "llama") {
      aggregateBySource[player.id] = "AOE";
      for (const target of alivePlayers) {
        if (target.id !== player.id) {
          targeted.add(target.id);
        }
      }
      continue;
    }

    if (intent.type === "missile") {
      const total = Number(intent.count ?? 0);
      if (total > 0) {
        aggregateBySource[player.id] = `M x${total}`;
      }
      for (const targetId of Object.keys(intent.missileTargets ?? {})) {
        if (positions[targetId]) {
          targeted.add(targetId);
        }
      }
      continue;
    }

    if (!intent.targetId || !positions[intent.targetId]) {
      continue;
    }

    targeted.add(intent.targetId);
    arcs.push(renderAttackArc(player.id, intent.targetId, positions));
  }

  return { arcs, targeted, aggregateBySource };
}

function renderAttackArc(attackerId, targetId, positions) {
  const from = positions[attackerId];
  const to = positions[targetId];
  if (!from || !to) {
    return "";
  }

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  const nx = -dy / length;
  const ny = dx / length;
  const curve = Math.min(14, 6 + length * 0.08);
  const cx = (from.x + to.x) / 2 + nx * curve;
  const cy = (from.y + to.y) / 2 + ny * curve;

  return `<path class="attack-arc" d="M ${from.x.toFixed(2)} ${from.y.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${to.x.toFixed(2)} ${to.y.toFixed(2)}" marker-end="url(#attack-arrowhead)"></path>`;
}

function renderPlayerNode(player, pos, overlay) {
  const dict = t();
  const intent = visibleIntentForPlayer(player.id);
  const actionText = intent ? formatIntentWithTarget(intent) : dict.hidden;
  const roleLabel = player.isHuman ? dict.human : dict.botRandom;
  const showNumericStats = player.isHuman || !ui.hardcoreMode;
  const targetedClass = overlay.targeted.has(player.id) ? " targeted" : "";
  const eliminatedClass = !player.alive ? " eliminated" : "";
  const aggregate = overlay.aggregateBySource[player.id];

  return `
    <div class="player-tile player-node${targetedClass}${eliminatedClass}" style="left:${pos.x.toFixed(2)}%; top:${pos.y.toFixed(2)}%;">
      <h3>${player.name}</h3>
      <div class="badges">
        <span class="badge">${roleLabel}</span>
        ${showNumericStats ? `<span class="badge">${dict.points}: ${fmt(player.points)}</span>` : ""}
        ${showNumericStats ? `<span class="badge">${dict.shields}: ${player.shields}</span>` : ""}
        ${aggregate ? `<span class="badge agg">${aggregate}</span>` : ""}
      </div>
      <p>${dict.action}: ${actionText}</p>
    </div>
  `;
}

function visibleIntentForPlayer(playerId) {
  if (state.phase !== "display" && state.phase !== "gameOver") {
    return null;
  }
  if (state.reveal?.byPlayer?.[playerId]) {
    return state.reveal.byPlayer[playerId].intent;
  }
  return state.intents[playerId] ?? null;
}

function isMissileAllocationActive() {
  return state.phase === "display" && !state.reveal && (Boolean(ui.missileDraft) || state.missileQueue.length > 0);
}

function renderMissileQueue() {
  const dict = t();
  if (!ui.missileDraft) {
    const current = state.missileQueue[0];
    const p = state.players.find((x) => x.id === current);
    return `<p>${p ? dict.choosingTargets(p.name) : dict.preparingReveal}</p>`;
  }

  const enemies = state.players.filter((p) => p.alive && p.id !== ui.missileDraft.pickerId);
  return `
    <p>${dict.yourMissiles(ui.missileDraft.total, ui.missileDraft.remaining)}</p>
    <div class="row">
      <label>${dict.target}</label>
      <select id="missileTarget">
        ${enemies.map((p) => `<option value="${p.id}" ${ui.missileDraft.targetId === p.id ? "selected" : ""}>${p.name}</option>`).join("")}
      </select>
    </div>
    <div class="button-grid">
      <button id="missileAllocate">${dict.addMissile}</button>
      <button id="missileDone" ${ui.missileDraft.remaining === 0 ? "" : "disabled"}>${dict.finishAllocation}</button>
    </div>
  `;
}

function renderReveal() {
  const dict = t();
  const blocks = [];

  if (state.gameOver) {
    const winner = state.players.find((p) => p.id === state.winnerId);
    blocks.push(`<p>${dict.gameOver(winner ? winner.name : "None")}</p>`);
  }

  if (ui.logHistory.length === 0) {
    blocks.push(`<p>${dict.noReveal}</p>`);
    return blocks.join("");
  }

  for (let i = ui.logHistory.length - 1; i >= 0; i -= 1) {
    const item = ui.logHistory[i];
    blocks.push(`<p><strong>${t().matchRound(item.matchNumber, item.roundNumber)}</strong></p>`);
    const lines = Object.values(item.reveal.byPlayer).map((entry) => {
      const player = state.players.find((p) => p.id === entry.playerId);
      const action = formatIntentWithTarget(entry.intent);
      const dead = entry.died ? dict.died : dict.survived;
      return `<p>${player?.name ?? entry.playerId}: ${action}, ${dict.incoming} ${fmt(entry.incomingDamage)}, ${dict.overflow} ${fmt(entry.overwhelmedDamage)}, ${dict.shieldsBroken} ${entry.shieldsBroken}. ${dead}</p>`;
    });
    blocks.push(lines.join(""));
  }

  return blocks.join("");
}

function formatIntentWithTarget(intent) {
  const base = actionLabel(intent.type);
  if (!intent) {
    return base;
  }

  if (intent.type === "missile") {
    const allocations = intent.missileTargets ?? {};
    const parts = Object.entries(allocations)
      .map(([targetId, count]) => `${playerName(targetId)} x${count}`)
      .join(", ");
    return parts ? `${base} -> ${parts}` : base;
  }

  if (intent.targetId) {
    return `${base} -> ${playerName(intent.targetId)}`;
  }

  return base;
}

function playerName(playerId) {
  const p = state.players.find((x) => x.id === playerId);
  return p ? p.name : playerId;
}

function fmt(value) {
  const snapped = Math.round(Number(value) * 2) / 2;
  if (!Number.isFinite(snapped)) {
    return "0";
  }
  return Number.isInteger(snapped) ? String(snapped) : snapped.toFixed(1);
}

function fmtNumber(value) {
  const snapped = Math.round(Number(value) * 2) / 2;
  return Number.isFinite(snapped) ? snapped : 0;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function allocateRandom(total, targets) {
  const result = {};
  let left = total;
  while (left > 0 && targets.length > 0) {
    const target = targets[Math.floor(Math.random() * targets.length)];
    result[target] = (result[target] ?? 0) + 1;
    left -= 1;
  }
  return result;
}

startActionPhase();
render();
