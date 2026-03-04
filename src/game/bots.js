import { ACTION_ORDER, ACTIONS, getIntentDamage, hasEnoughPoints, normalizeHalf, toHalfUnits } from "./actions.js";

const BOT_MODE = "Weighted";

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

function canUseHighDefense(state, playerId) {
  return state.players.some((p) => p.alive && p.id !== playerId && p.points >= 5);
}

function weightedRandom(candidates) {
  const valid = candidates.filter((x) => Number.isFinite(x.weight) && x.weight > 0);
  if (valid.length === 0) {
    return null;
  }
  const total = valid.reduce((sum, x) => sum + x.weight, 0);
  let pick = Math.random() * total;
  for (const candidate of valid) {
    pick -= candidate.weight;
    if (pick <= 0) {
      return candidate.value;
    }
  }
  return valid[valid.length - 1].value;
}

function affordableActions(state, player) {
  return ACTION_ORDER.filter((type) => {
    const action = ACTIONS[type];
    if (!action) {
      return false;
    }
    if (type === "missile") {
      return false;
    }
    if (type === "shield" && player.shields >= 2) {
      return false;
    }
    if (type === "dtDefense" && !canUseDtDefense(state, player.id)) {
      return false;
    }
    if ((type === "hollowDefense" || type === "superiorDefense") && !canUseHighDefense(state, player.id)) {
      return false;
    }
    return hasEnoughPoints(player.points, action.cost);
  });
}

function estimateEnemyMaxAttackDamage(enemy) {
  let best = enemy.prepReady ? 1 : 0;

  if (enemy.points > 0) {
    // Fist can scale with points (0.5 per point of damage).
    best = Math.max(best, normalizeHalf(enemy.points + (enemy.prepReady ? 1 : 0)));
  }

  for (const [type, action] of Object.entries(ACTIONS)) {
    if (action.kind !== "attack") {
      continue;
    }
    if (!hasEnoughPoints(enemy.points, action.cost)) {
      continue;
    }
    const dmg = getIntentDamage({ type }, enemy.prepReady);
    best = Math.max(best, dmg);
  }

  return best;
}

function estimateIncomingThreat(state, player) {
  const enemyThreats = livingOpponents(state, player.id)
    .map((enemy) => estimateEnemyMaxAttackDamage(enemy))
    .sort((a, b) => b - a);

  const highest = enemyThreats[0] ?? 0;
  const second = enemyThreats[1] ?? 0;
  const crowdPressure = Math.max(0, enemyThreats.length - 2) * 0.25;
  return normalizeHalf(highest + (0.5 * second) + crowdPressure);
}

function overflowAgainstBlock(incoming, blockMin, blockMax) {
  if (incoming >= blockMin && incoming <= blockMax) {
    return 0;
  }
  if (incoming < blockMin) {
    return blockMin - incoming;
  }
  return incoming - blockMax;
}

function defenseEfficiencyScore(type, player, predictedIncoming) {
  const action = ACTIONS[type];
  const block = action.block ?? [0, 0];
  const cost = action.cost ?? 0;
  const overflow = overflowAgainstBlock(predictedIncoming, block[0], block[1]);

  // Prefer actions that reduce overflow with lower point cost.
  let score = Math.max(0.1, 4.5 - (overflow * 1.8) - (cost * 0.8));

  if (type === "shield") {
    // Shield scales well under medium/high pressure when cap not reached.
    const shieldNeed = Math.max(0, Math.ceil(predictedIncoming / 2) - player.shields);
    score += (player.shields < 2 ? 0.8 : 0) + (shieldNeed * 0.4);
  }

  if (type === "prep" && predictedIncoming <= 1) {
    // Prep is strongest when pressure is low and follow-up attack is likely.
    score += 0.8;
  }

  if (type === "defense" && predictedIncoming <= 3) {
    score += 0.5;
  }

  return Math.max(0.05, score);
}

function likelyDefenseCeiling(state, target) {
  let maxBlock = 3;
  if (target.points >= 1 && canUseDtDefense(state, target.id)) {
    maxBlock = Math.max(maxBlock, 4);
  }
  if (target.points >= 3 && canUseHighDefense(state, target.id)) {
    maxBlock = Math.max(maxBlock, 6);
  }
  return maxBlock;
}

function aggroMultiplier(state, attackerId, target, enemies) {
  let multiplier = 1;

  const aggroMap = state.aggroByVictim?.[attackerId] ?? {};
  const topDamage = enemies.reduce((best, enemy) => Math.max(best, aggroMap[enemy.id] ?? 0), 0);
  if (topDamage > 0 && (aggroMap[target.id] ?? 0) === topDamage) {
    multiplier *= 2;
  }

  const lowestPoints = enemies.reduce((best, enemy) => Math.min(best, enemy.points), Number.POSITIVE_INFINITY);
  if (target.points === lowestPoints) {
    multiplier *= 1.5;
  }

  return multiplier;
}

function targetDamageScore(state, attackerId, target, damage, enemies) {
  const likelyMaxBlock = likelyDefenseCeiling(state, target);
  const likelyOverflow = Math.max(0, damage - likelyMaxBlock);

  // Prioritize targets who are easier to break and less able to absorb mistakes.
  let score = 0.4 + (likelyOverflow * 2.2);
  score += Math.max(0, 2 - target.shields) * 0.9;
  score += Math.max(0, 3 - target.points) * 0.3;
  if (target.prepReady) {
    score += 0.4;
  }

  score *= aggroMultiplier(state, attackerId, target, enemies);
  return Math.max(0.05, score);
}

function pickAttackTarget(state, player, enemies, damage) {
  return weightedRandom(enemies.map((enemy) => ({
    value: enemy,
    weight: targetDamageScore(state, player.id, enemy, damage, enemies)
  })));
}

function pickFistIntent(state, player, enemies) {
  const maxCount = Math.max(1, toHalfUnits(player.points));
  const countOptions = [];

  for (let count = 1; count <= maxCount; count += 1) {
    const damage = normalizeHalf((count * 0.5) + (player.prepReady ? 1 : 0));
    const bestTargetScore = enemies.reduce(
      (best, enemy) => Math.max(best, targetDamageScore(state, player.id, enemy, damage, enemies)),
      0.1
    );
    // Slightly penalize very large fist stacks to keep variety.
    const countWeight = Math.max(0.05, bestTargetScore - (count * 0.08));
    countOptions.push({ value: count, weight: countWeight });
  }

  const count = weightedRandom(countOptions) ?? 1;
  const damage = normalizeHalf((count * 0.5) + (player.prepReady ? 1 : 0));
  const target = pickAttackTarget(state, player, enemies, damage) ?? randomOf(enemies);
  return { type: "fist", count, targetId: target.id };
}

function actionWeight(state, player, type, predictedIncoming, enemies) {
  const action = ACTIONS[type];
  if (!action) {
    return 0;
  }

  if (type === "gather") {
    const lowPointsBonus = Math.max(0, 2.5 - player.points) * 0.8;
    const dangerPenalty = Math.min(2, predictedIncoming) * 0.5;
    return Math.max(0.05, 1 + lowPointsBonus - dangerPenalty);
  }

  if (action.kind === "defense") {
    const base = defenseEfficiencyScore(type, player, predictedIncoming);
    const dangerAmplifier = 1 + Math.min(2, predictedIncoming) * 0.3;
    return Math.max(0.05, base * dangerAmplifier);
  }

  if (action.kind === "aoe") {
    const enemyCountFactor = Math.max(0, enemies.length - 1) * 0.7;
    const pressurePenalty = predictedIncoming * 0.2;
    return Math.max(0.05, 1.3 + enemyCountFactor - pressurePenalty);
  }

  if (action.kind === "attack") {
    const baseDamage = getIntentDamage({ type }, player.prepReady);
    const bestTarget = enemies.reduce(
      (best, enemy) => Math.max(best, targetDamageScore(state, player.id, enemy, baseDamage, enemies)),
      0.1
    );
    const pressurePenalty = predictedIncoming * 0.15;
    return Math.max(0.05, bestTarget + (baseDamage * 0.15) - pressurePenalty);
  }

  return 0.1;
}

export function assignBotType() {
  return BOT_MODE;
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

  const predictedIncoming = estimateIncomingThreat(state, player);

  // Avoid DT defense if no player has >3 points
  const filteredOptions = options.filter(option => {
    if (option === "DT_defense") {
      return enemies.some(enemy => enemy.points > 3);
    }
    return true;
  });

  const type = weightedRandom(filteredOptions.map((option) => ({
    value: option,
    weight: actionWeight(state, player, option, predictedIncoming, enemies)
  }))) ?? randomOf(filteredOptions);

  if (type === "fist") {
    return pickFistIntent(state, player, enemies);
  }

  if (ACTIONS[type].needsTarget) {
    const damage = getIntentDamage({ type }, player.prepReady);

    // Pick the most efficient target based on damage and hate mechanism
    const target = pickAttackTarget(state, player, enemies, damage, true) ?? randomOf(enemies);
    return { type, targetId: target.id };
  }

  return { type };
}
