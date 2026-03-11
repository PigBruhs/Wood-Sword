import {
  ACTIONS,
  fromHalfUnits,
  getActionCost,
  getBlockRange,
  getIntentDamage,
  hasEnoughPoints,
  toHalfUnits
} from "./actions.js";

export function createGameState(options = {}) {
  const requestedCount = Number(options.playerCount ?? 8);
  const totalPlayers = Math.max(2, Math.min(64, Number.isFinite(requestedCount) ? Math.floor(requestedCount) : 8));
  const botCount = totalPlayers - 1;
  const players = [
    { id: "human", name: "你", isHuman: true, alive: true, points: 0, shields: 0, prepReady: false, prepStacks: 0 }
  ];

  for (let i = 1; i <= botCount; i += 1) {
    players.push({
      id: `bot-${i}`,
      name: `Bot ${i}`,
      isHuman: false,
      alive: true,
      points: 0,
      shields: 0,
      prepReady: false,
      prepStacks: 0
    });
  }

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
    p.prepStacks = 0;
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
  const prepBonusByPlayerId = {};

  for (const p of alive) {
    prepBonusByPlayerId[p.id] = getPrepStacks(p);
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

  const duelContext = buildDuelContext(alive, local, prepBonusByPlayerId);

  const llamaUsers = alive.filter((p) => local[p.id].intent.type === "llama").map((p) => p.id);
  let activeLlamaUsers = new Set(llamaUsers);
  let outcome = null;
  let finalDamageModel = { damageByTarget: {}, damageSourcesByTarget: {} };

  for (let i = 0; i < llamaUsers.length + 1; i += 1) {
    const damageModel = buildDamageByTarget(alive, local, duelContext, activeLlamaUsers, prepBonusByPlayerId);
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

  for (const attackId of duelContext.usedPrepAttackers) {
    const attacker = state.players.find((x) => x.id === attackId);
    if (attacker) {
      setPrepStacks(attacker, 0);
    }
    if (local[attackId]) {
      local[attackId].usedPrepBoost = true;
    }
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
      // Prep only resolves on the prep turn: gain stack if untouched, otherwise no gain.
      if (entry.incomingDamage <= 0) {
        setPrepStacks(p, getPrepStacks(p) + 1);
      } else {
        setPrepStacks(p, getPrepStacks(p));
      }
    } else {
      // Non-prep turns do not clear prep; stacks persist until consumed by an attack.
      setPrepStacks(p, getPrepStacks(p));
    }
  }

  return {
    logs,
    byPlayer: local,
    deadThisRound: outcome.deadThisRound
  };
}

function buildDuelContext(alive, local, prepBonusByPlayerId) {
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

    if (intent.type === "missile") {
      const targetMap = intent.missileTargets ?? {};
      for (const [targetId, countRaw] of Object.entries(targetMap)) {
        const count = Number(countRaw);
        if (!targetId || !Number.isFinite(count) || count <= 0) {
          continue;
        }
        byAttackerToTarget.set(`${p.id}->${targetId}`, (byAttackerToTarget.get(`${p.id}->${targetId}`) ?? 0) + count);
      }
      continue;
    }

    if (intent.type === "llama") {
      const prepBonus = prepBonusByPlayerId[p.id] ?? 0;
      const aoeDamage = getIntentDamage(intent, prepBonus);
      if (prepBonus > 0) {
        usedPrepAttackers.add(p.id);
      }
      for (const target of alive) {
        if (target.id === p.id) {
          continue;
        }
        byAttackerToTarget.set(
          `${p.id}->${target.id}`,
          (byAttackerToTarget.get(`${p.id}->${target.id}`) ?? 0) + aoeDamage
        );
      }
      continue;
    }

    if (action.kind !== "attack" || !intent.targetId) {
      continue;
    }

    const damage = getIntentDamage(intent, prepBonusByPlayerId[p.id] ?? 0);
    if ((prepBonusByPlayerId[p.id] ?? 0) > 0) {
      usedPrepAttackers.add(p.id);
    }
    byAttackerToTarget.set(`${p.id}->${intent.targetId}`, (byAttackerToTarget.get(`${p.id}->${intent.targetId}`) ?? 0) + damage);
  }

  for (const [edgeKey, left] of byAttackerToTarget.entries()) {
    const [from, to] = edgeKey.split("->");
    const pair = pairKey(from, to);
    if (canceledAttackPairs.has(pair)) {
      continue;
    }

    const reverseKey = `${to}->${from}`;
    if (!byAttackerToTarget.has(reverseKey)) {
      continue;
    }

    const right = byAttackerToTarget.get(reverseKey);
    canceledAttackPairs.add(pair);

    if (left === right) {
      continue;
    }

    if (left > right) {
      const delta = left - right;
      duelOverflowByTarget[to] = (duelOverflowByTarget[to] ?? 0) + delta;
      addDamageSource(duelOverflowByTargetSources, to, from, delta);
    } else {
      const delta = right - left;
      duelOverflowByTarget[from] = (duelOverflowByTarget[from] ?? 0) + delta;
      addDamageSource(duelOverflowByTargetSources, from, to, delta);
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

function buildDamageByTarget(alive, local, duelContext, activeLlamaUsers, prepBonusByPlayerId) {
  const damageByTarget = {};
  const damageSourcesByTarget = {};

  for (const p of alive) {
    const intent = local[p.id].intent;
    const action = ACTIONS[intent.type];

    if (intent.type === "missile") {
      const targetMap = intent.missileTargets ?? {};
      for (const [targetId, countRaw] of Object.entries(targetMap)) {
        const count = Number(countRaw);
        if (!targetId || !Number.isFinite(count) || count <= 0) {
          continue;
        }
        const key = pairKey(p.id, targetId);
        if (duelContext.canceledAttackPairs.has(key)) {
          continue;
        }
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
      const damage = duelContext.byAttackerToTarget.get(`${p.id}->${intent.targetId}`) ?? getIntentDamage(intent, false);
      damageByTarget[intent.targetId] = (damageByTarget[intent.targetId] ?? 0) + damage;
      addDamageSource(damageSourcesByTarget, intent.targetId, p.id, damage);
      continue;
    }

    if (action.kind === "aoe" && activeLlamaUsers.has(p.id)) {
      const aoeDamage = getIntentDamage(intent, prepBonusByPlayerId[p.id] ?? 0);
      for (const target of alive) {
        if (target.id === p.id) {
          continue;
        }
        const key = pairKey(p.id, target.id);
        if (duelContext.canceledAttackPairs.has(key)) {
          continue;
        }
        damageByTarget[target.id] = (damageByTarget[target.id] ?? 0) + aoeDamage;
        addDamageSource(damageSourcesByTarget, target.id, p.id, aoeDamage);
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

    let neededShields = overflow > 0 ? Math.ceil(overflow / 2) : 0;
    if (entry.intent.type === "shield" && incoming > 0) {
      // Shield action now always loses at least one shield when hit.
      neededShields = Math.max(neededShields, 1);
    }
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

  if ((reveal?.deadThisRound?.length ?? 0) > 0) {
    for (const deadId of reveal.deadThisRound) {
      const p = state.players.find((x) => x.id === deadId);
      if (p) {
        p.alive = false;
      }
    }

    const stillAlive = getAlivePlayers(state);
    if (stillAlive.length <= 1) {
      state.winnerId = stillAlive.length === 1 ? stillAlive[0].id : null;
      state.gameOver = true;
      state.phase = "gameOver";
      state.pendingGameOver = false;
      state.pendingMatchAdvance = false;
      state.intents = {};
      return;
    }

    state.matchNumber += 1;
    resetMatch(state);
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
}

function getPrepStacks(player) {
  const stacks = Number(player.prepStacks);
  if (Number.isFinite(stacks)) {
    return Math.max(0, Math.min(2, Math.floor(stacks)));
  }
  return player.prepReady ? 1 : 0;
}

function setPrepStacks(player, nextStacks) {
  const clamped = Math.max(0, Math.min(2, Math.floor(Number(nextStacks) || 0)));
  player.prepStacks = clamped;
  player.prepReady = clamped > 0;
}
