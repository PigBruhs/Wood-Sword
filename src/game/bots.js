import { ACTION_ORDER, ACTIONS, hasEnoughPoints } from "./actions.js";

const BOT_TYPES = ["Aggro", "Saver", "Counter", "Chaos", "Sniper"];
const PREFERRED_ATTACKS = [
  "enchantedDiamondSword",
  "diamondSword",
  "goldSword",
  "ironSword",
  "stoneSword",
  "woodSword",
  "missile",
  "fist",
  "llama"
];

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function randomOf(values) {
  return values[randomInt(values.length)];
}

function livingOpponents(state, playerId) {
  return state.players.filter((p) => p.alive && p.id !== playerId);
}

function canUseDtDefense(state, playerId) {
  return state.players.some((p) => p.alive && p.id !== playerId && p.points > 3);
}

function affordableActions(state, player) {
  return ACTION_ORDER.filter((type) => {
    const action = ACTIONS[type];
    if (!action) {
      return false;
    }
    if (type === "shield" && player.shields >= 2) {
      return false;
    }
    if (type === "dtDefense" && !canUseDtDefense(state, player.id)) {
      return false;
    }
    const minCost = type === "missile" ? 2 : action.cost;
    return hasEnoughPoints(player.points, minCost);
  });
}

export function assignBotType() {
  return randomOf(BOT_TYPES);
}

export function chooseBotAction(state, player) {
  const enemies = livingOpponents(state, player.id);
  if (enemies.length === 0) {
    return { type: "defense" };
  }

  // Requirement: first round always gather.
  if (state.roundNumber === 1) {
    return { type: "gather" };
  }

  const options = affordableActions(state, player);
  if (options.length === 0) {
    return { type: "defense" };
  }

  const attackChoices = options.filter((type) => {
    const kind = ACTIONS[type].kind;
    return kind === "attack" || kind === "aoe" || kind === "missile";
  });

  const richOpponents = enemies.filter((p) => p.points > 3);
  const highThreat = richOpponents.length > 0;

  if (player.botType === "Counter" && options.includes("dtDefense") && highThreat && Math.random() < 0.45) {
    return { type: "dtDefense" };
  }

  if (player.botType === "Saver" && player.points < 2) {
    return { type: "gather" };
  }

  if (attackChoices.length > 0) {
    return chooseAttackIntent(state, player, enemies, attackChoices);
  }

  if (options.includes("gather")) {
    return { type: "gather" };
  }
  return { type: "defense" };
}

function chooseAttackIntent(state, player, enemies, attackChoices) {
  const byType = new Set(attackChoices);

  if (player.botType === "Sniper" && byType.has("missile") && player.points >= 3) {
    return withTarget(state, player.id, "missile", enemies);
  }

  if (player.botType === "Chaos") {
    return withTarget(state, player.id, randomOf(attackChoices), enemies);
  }

  // Aggro/counter/saver default to strongest affordable attack.
  for (const type of PREFERRED_ATTACKS) {
    if (byType.has(type)) {
      return withTarget(state, player.id, type, enemies);
    }
  }

  return withTarget(state, player.id, randomOf(attackChoices), enemies);
}

function withTarget(state, playerId, type, enemies) {
  if (type === "fist") {
    const player = state.players.find((p) => p.id === playerId);
    const maxCount = Math.max(1, Math.floor(player.points / 0.5));
    const count = Math.max(1, Math.min(maxCount, Math.ceil(maxCount * 0.7)));
    return { type, count, targetId: pickPriorityTarget(enemies).id };
  }
  if (type === "missile") {
    const points = state.players.find((p) => p.id === playerId).points;
    const maxCount = Math.max(1, Math.floor(points - 1));
    const useCount = Math.max(1, Math.min(maxCount, Math.ceil(maxCount * 0.75)));
    return { type, count: useCount, missileTargets: allocateMissiles(useCount, enemies) };
  }
  if (ACTIONS[type].needsTarget) {
    return { type, targetId: pickPriorityTarget(enemies).id };
  }
  return { type };
}

function pickPriorityTarget(enemies) {
  const sorted = [...enemies].sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }
    if (a.shields !== b.shields) {
      return a.shields - b.shields;
    }
    return a.id.localeCompare(b.id);
  });
  return sorted[0];
}

function allocateMissiles(total, enemies) {
  const allocation = {};
  let remaining = total;
  const ordered = [...enemies].sort((a, b) => b.points - a.points || a.shields - b.shields);
  let cursor = 0;

  while (remaining > 0) {
    const target = ordered[cursor % ordered.length];
    allocation[target.id] = (allocation[target.id] ?? 0) + 1;
    remaining -= 1;
    cursor += 1;
  }
  return allocation;
}
