import { ACTION_ORDER, ACTIONS, hasEnoughPoints } from "./actions.js";

const BOT_MODE = "Random";

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

  const type = randomOf(options);
  if (type === "fist") {
    return { type, count: 1, targetId: randomOf(enemies).id };
  }
  if (ACTIONS[type].needsTarget) {
    return { type, targetId: randomOf(enemies).id };
  }
  return { type };
}
