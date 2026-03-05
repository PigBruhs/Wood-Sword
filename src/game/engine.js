import {
  ACTIONS,
  fromHalfUnits,
  getActionCost,
  getBlockRange,
  getIntentDamage,
  hasEnoughPoints,
  toHalfUnits
} from "./actions.js";

export function createGameState() {
  const players = [
    { id: "human", name: "You", isHuman: true, alive: true, points: 0, shields: 0, prepReady: false },
    { id: "bot-1", name: "Bot 1", isHuman: false, alive: true, points: 0, shields: 0, prepReady: false },
    { id: "bot-2", name: "Bot 2", isHuman: false, alive: true, points: 0, shields: 0, prepReady: false },
    { id: "bot-3", name: "Bot 3", isHuman: false, alive: true, points: 0, shields: 0, prepReady: false },
    { id: "bot-4", name: "Bot 4", isHuman: false, alive: true, points: 0, shields: 0, prepReady: false }
  ];

  return {
    gameOver: false,
    winnerId: null,
    matchNumber: 1,
    roundNumber: 1,
    phase: "action",
    phaseSecondsLeft: 5,
    players,
    intents: {},
    reveal: null,
    missileQueue: [],
    pendingMatchAdvance: false,
    pendingGameOver: false,
    aggroByVictim: {}
  };
}

export function resetMatch(state) {
  for (const p of state.players) {
    if (!p.alive) {
      continue;
    }
    p.points = 0;
    p.shields = 0;
    p.prepReady = false;
  }

  state.intents = {};
  state.reveal = null;
  state.missileQueue = [];
  state.roundNumber = 1;
  state.phase = "action";
  state.phaseSecondsLeft = 5;
  state.pendingMatchAdvance = false;
  state.pendingGameOver = false;
  state.aggroByVictim = {};
}

export function getAlivePlayers(state) {
  return state.players.filter((p) => p.alive);
}

export function validateIntent(state, player, intent) {
  const action = ACTIONS[intent.type];
  if (!action) {
    return { ok: false, reason: "Unknown action." };
  }

  const cost = getActionCost(intent);
  if (!hasEnoughPoints(player.points, cost)) {
    return { ok: false, reason: "Not enough points." };
  }

  if (intent.type === "shield" && player.shields >= 2) {
    return { ok: false, reason: "Shield cap is 2." };
  }

  if (action.needsTarget) {
    if (!intent.targetId) {
      return { ok: false, reason: "Target is required." };
    }
    const target = state.players.find((p) => p.id === intent.targetId);
    if (!target) {
      return { ok: false, reason: "Target is invalid." };
    }
    if (!target.alive) {
      return { ok: false, reason: "Target is invalid." };
    }
    if (target.id === player.id) {
      return { ok: false, reason: "Target is invalid." };
    }
  }

  if (intent.type === "fist") {
    const count = intent.count ?? 1;
    if (!Number.isInteger(count)) {
      return { ok: false, reason: "Fist count must be an integer >= 1." };
    }
    if (count <= 0) {
      return { ok: false, reason: "Fist count must be an integer >= 1." };
    }
  }

  if (intent.type === "missile") {
    const count = intent.count ?? 1;
    if (!Number.isInteger(count)) {
      return { ok: false, reason: "Missile count must be an integer >= 1." };
    }
    if (count <= 0) {
      return { ok: false, reason: "Missile count must be an integer >= 1." };
    }
  }

  return { ok: true };
}

export function normalizeIntent(intent) {
  if (!intent) {
    return { type: "defense" };
  }
  if (intent.type === "fist") {
    return { ...intent, count: Math.max(1, Math.floor(intent.count ?? 1)) };
  }
  if (intent.type === "missile") {
    return { ...intent, count: Math.max(1, Math.floor(intent.count ?? 1)) };
  }
  return { ...intent };
}

export function resolveRound(state, intents) {
  const alive = getAlivePlayers(state);
  const local = {};
  const logs = [];

  for (const p of alive) {
    local[p.id] = {
      playerId: p.id,
      beforePoints: p.points,
      beforeShields: p.shields,
      intent: normalizeIntent(intents[p.id] ?? { type: "defense" }),
      incomingDamage: 0,
      overwhelmedDamage: 0,
      died: false,
      shieldsBroken: 0,
      pointsSpent: 0,
      pointsGained: 0,
      damageFrom: {},
      usedPrepBoost: false,
      afterPoints: p.points,
      afterShields: p.shields
    };
  }

  for (const p of alive) {
    const entry = local[p.id];
    const cost = getActionCost(entry.intent);
    entry.pointsSpent = cost;
    p.points = fromHalfUnits(toHalfUnits(p.points - cost));

    if (entry.intent.type === "gather") {
      p.points = fromHalfUnits(toHalfUnits(p.points + 1));
      entry.pointsGained = 1;
    }
    if (entry.intent.type === "shield") {
      p.shields = Math.min(2, p.shields + 1);
    }
  }

  const duelContext = buildDuelContext(alive, local);
  for (const attackId of duelContext.usedPrepAttackers) {
    const attacker = state.players.find((x) => x.id === attackId);
    if (attacker) {
      attacker.prepReady = false;
    }
    if (local[attackId]) {
      local[attackId].usedPrepBoost = true;
    }
  }

  const llamaUsers = alive.filter((p) => local[p.id].intent.type === "llama").map((p) => p.id);
  let activeLlamaUsers = new Set(llamaUsers);
  let outcome = null;
  let finalDamageModel = { damageByTarget: {}, damageSourcesByTarget: {} };

  for (let i = 0; i < llamaUsers.length + 1; i += 1) {
    const damageModel = buildDamageByTarget(alive, local, duelContext, activeLlamaUsers);
    outcome = simulateDefendAndShields(alive, local, damageModel.damageByTarget, duelContext.duelOverflowByTarget);
    finalDamageModel = damageModel;

    const deadSet = new Set(outcome.deadThisRound);
    const nextActive = new Set(llamaUsers.filter((id) => !deadSet.has(id)));
    if (sameSet(activeLlamaUsers, nextActive)) {
      break;
    }
    activeLlamaUsers = nextActive;
  }

  if (llamaUsers.length !== activeLlamaUsers.size) {
    logs.push("Some llama attacks fizzled because the caster died this round.");
  }

  for (const p of alive) {
    const entry = local[p.id];
    const res = outcome.byPlayer[p.id];
    entry.incomingDamage = res.incomingDamage;
    entry.overwhelmedDamage = res.overwhelmedDamage;
    entry.shieldsBroken = res.shieldsBroken;
    entry.died = res.died;
    entry.damageFrom = mergeDamageMaps(
      finalDamageModel.damageSourcesByTarget[p.id],
      duelContext.duelOverflowByTargetSources[p.id]
    );

    p.shields = res.afterShields;
    p.alive = !res.died;

    entry.afterPoints = p.points;
    entry.afterShields = p.shields;
    accumulateAggro(state, p.id, entry.damageFrom);
  }

  for (const p of alive) {
    const entry = local[p.id];
    if (entry.intent.type === "prep") {
      p.prepReady = entry.incomingDamage <= 0;
    } else if (entry.incomingDamage > 0) {
      p.prepReady = false;
    }
  }

  return {
    logs,
    byPlayer: local,
    deadThisRound: outcome.deadThisRound
  };
}

function buildDuelContext(alive, local) {
  const byAttackerToTarget = new Map();
  const duelOverflowByTarget = {};
  const duelOverflowByTargetSources = {};
  const canceledAttackPairs = new Set();
  const usedPrepAttackers = new Set();

  for (const p of alive) {
    const intent = local[p.id].intent;
    const action = ACTIONS[intent.type];
    if (!action) {
      continue;
    }
    if (action.kind !== "attack") {
      continue;
    }
    if (!intent.targetId) {
      continue;
    }

    const damage = getIntentDamage(intent, p.prepReady);
    if (p.prepReady) {
      usedPrepAttackers.add(p.id);
    }
    byAttackerToTarget.set(`${p.id}->${intent.targetId}`, damage);
  }

  for (const p of alive) {
    const intent = local[p.id].intent;
    const action = ACTIONS[intent.type];
    if (!action) {
      continue;
    }
    if (action.kind !== "attack") {
      continue;
    }
    if (!intent.targetId) {
      continue;
    }

    const reverseKey = `${intent.targetId}->${p.id}`;
    if (!byAttackerToTarget.has(reverseKey)) {
      continue;
    }

    const key = pairKey(p.id, intent.targetId);
    if (canceledAttackPairs.has(key)) {
      continue;
    }

    const left = byAttackerToTarget.get(`${p.id}->${intent.targetId}`);
    const right = byAttackerToTarget.get(reverseKey);
    canceledAttackPairs.add(key);

    if (left === right) {
      continue;
    }

    if (left > right) {
      const delta = left - right;
      duelOverflowByTarget[intent.targetId] = (duelOverflowByTarget[intent.targetId] ?? 0) + delta;
      addDamageSource(duelOverflowByTargetSources, intent.targetId, p.id, delta);
    } else {
      const delta = right - left;
      duelOverflowByTarget[p.id] = (duelOverflowByTarget[p.id] ?? 0) + delta;
      addDamageSource(duelOverflowByTargetSources, p.id, intent.targetId, delta);
    }
  }

  return {
    canceledAttackPairs,
    duelOverflowByTarget,
    duelOverflowByTargetSources,
    usedPrepAttackers,
    byAttackerToTarget
  };
}

function buildDamageByTarget(alive, local, duelContext, activeLlamaUsers) {
  const damageByTarget = {};
  const damageSourcesByTarget = {};

  for (const p of alive) {
    const intent = local[p.id].intent;
    const action = ACTIONS[intent.type];

    if (intent.type === "missile") {
      const targetMap = intent.missileTargets ?? {};
      for (const [targetId, count] of Object.entries(targetMap)) {
        damageByTarget[targetId] = (damageByTarget[targetId] ?? 0) + count;
        addDamageSource(damageSourcesByTarget, targetId, p.id, count);
      }
      continue;
    }

    if (action.kind === "attack") {
      const key = pairKey(p.id, intent.targetId);
      if (duelContext.canceledAttackPairs.has(key)) {
        continue;
      }
      // Use precomputed attack damage so prep bonus applies exactly once.
      const damage = duelContext.byAttackerToTarget.get(`${p.id}->${intent.targetId}`) ?? getIntentDamage(intent, false);
      damageByTarget[intent.targetId] = (damageByTarget[intent.targetId] ?? 0) + damage;
      addDamageSource(damageSourcesByTarget, intent.targetId, p.id, damage);
      continue;
    }

    if (action.kind === "aoe" && activeLlamaUsers.has(p.id)) {
      for (const target of alive) {
        if (target.id === p.id) {
          continue;
        }
        damageByTarget[target.id] = (damageByTarget[target.id] ?? 0) + action.baseDamage;
        addDamageSource(damageSourcesByTarget, target.id, p.id, action.baseDamage);
      }
    }
  }

  return { damageByTarget, damageSourcesByTarget };
}

function addDamageSource(byTarget, targetId, attackerId, amount) {
  if (!(targetId && attackerId)) {
    return;
  }
  if (amount <= 0) {
    return;
  }
  if (!byTarget[targetId]) {
    byTarget[targetId] = {};
  }
  byTarget[targetId][attackerId] = (byTarget[targetId][attackerId] ?? 0) + amount;
}

function mergeDamageMaps(primary, secondary) {
  const merged = { ...(primary ?? {}) };
  for (const [attackerId, amount] of Object.entries(secondary ?? {})) {
    merged[attackerId] = (merged[attackerId] ?? 0) + amount;
  }
  return merged;
}

function accumulateAggro(state, victimId, damageFrom) {
  if (!state.aggroByVictim[victimId]) {
    state.aggroByVictim[victimId] = {};
  }
  for (const [attackerId, amount] of Object.entries(damageFrom ?? {})) {
    if (amount <= 0) {
      continue;
    }
    state.aggroByVictim[victimId][attackerId] = (state.aggroByVictim[victimId][attackerId] ?? 0) + amount;
  }
}

function simulateDefendAndShields(alive, local, damageByTarget, duelOverflowByTarget) {
  const byPlayer = {};
  const deadThisRound = [];

  for (const p of alive) {
    const entry = local[p.id];
    const [minBlock, maxBlock] = getBlockRange(entry.intent);
    const incoming = damageByTarget[p.id] ?? 0;
    let overflow = 0;

    if (incoming >= minBlock && incoming <= maxBlock) {
      overflow = 0;
    } else if (incoming < minBlock) {
      overflow = minBlock - incoming;
    } else {
      overflow = incoming - maxBlock;
    }

    overflow += duelOverflowByTarget[p.id] ?? 0;
    overflow = fromHalfUnits(toHalfUnits(overflow));

    const neededShields = overflow > 0 ? Math.ceil(overflow / 2) : 0;
    const shieldsBroken = Math.min(p.shields, neededShields);
    const died = neededShields > p.shields;
    const afterShields = died ? 0 : p.shields - shieldsBroken;

    byPlayer[p.id] = {
      incomingDamage: incoming,
      overwhelmedDamage: overflow,
      shieldsBroken,
      died,
      afterShields
    };

    if (died) {
      deadThisRound.push(p.id);
    }
  }

  return { byPlayer, deadThisRound };
}

function pairKey(a, b) {
  return a < b ? `${a}~${b}` : `${b}~${a}`;
}

function sameSet(a, b) {
  if (a.size !== b.size) {
    return false;
  }
  for (const v of a) {
    if (!b.has(v)) {
      return false;
    }
  }
  return true;
}

export function processRoundEnd(state, reveal) {
  state.reveal = reveal;

  if (state.pendingGameOver) {
    state.gameOver = true;
    state.phase = "gameOver";
    state.pendingGameOver = false;
    state.pendingMatchAdvance = false;
    state.intents = {};
    return;
  }

  if (state.pendingMatchAdvance) {
    state.matchNumber += 1;
    resetMatch(state);
    return;
  }

  if (reveal.deadThisRound.length > 0) {
    for (const deadId of reveal.deadThisRound) {
      const p = state.players.find((x) => x.id === deadId);
      if (p) {
        p.alive = false;
      }
    }

    const stillAlive = getAlivePlayers(state);
    if (stillAlive.length <= 1) {
      state.winnerId = stillAlive.length === 1 ? stillAlive[0].id : null;
      state.phase = "display";
      state.pendingGameOver = true;
      state.pendingMatchAdvance = false;
      state.intents = {};
      return;
    }

    state.phase = "display";
    state.pendingMatchAdvance = true;
    state.pendingGameOver = false;
    state.intents = {};
    return;
  }

  state.roundNumber += 1;
  state.phase = "action";
  state.phaseSecondsLeft = 5;
  state.pendingMatchAdvance = false;
  state.pendingGameOver = false;
  state.intents = {};
}

export function advancePhase(state) {
  if (state.phase === "display" && state.pendingMatchAdvance) {
    state.phase = "action";
    state.roundNumber += 1;
    state.phaseSecondsLeft = 5;
    state.pendingMatchAdvance = false;
    state.intents = {};
    return;
  }

  if (state.phase === "display") {
    state.pendingMatchAdvance = true;
    return;
  }

  if (state.phase === "action") {
    // Existing logic for action phase...
  }

  // Other phases...
}
