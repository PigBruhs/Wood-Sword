import assert from "node:assert/strict";
import { chooseBotAction } from "../src/game/bots.js";
import { createGameState } from "../src/game/engine.js";

function player(state, id) {
  return state.players.find((p) => p.id === id);
}

function setAliveDefaults(state) {
  for (const p of state.players) {
    p.alive = true;
    p.points = 2;
    p.shields = 0;
    p.prepReady = false;
  }
}

function withMockedRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

function withMockedRandomSequence(values, fn) {
  const original = Math.random;
  let index = 0;
  Math.random = () => {
    const next = values[Math.min(index, values.length - 1)];
    index += 1;
    return next;
  };
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

function withSeededRandom(seed, fn) {
  const original = Math.random;
  let state = seed >>> 0;
  Math.random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

(function testFirstRoundAlwaysGather() {
  const state = createGameState();
  setAliveDefaults(state);
  state.roundNumber = 1;

  const bot = player(state, "bot-1");
  bot.points = 6;

  const intent = chooseBotAction(state, bot);
  assert.equal(intent.type, "gather");
})();

(function testNeverUsesMissile() {
  const state = createGameState();
  setAliveDefaults(state);
  state.roundNumber = 2;

  const bot = player(state, "bot-1");
  bot.points = 8;

  for (let i = 0; i < 100; i += 1) {
    const intent = chooseBotAction(state, bot);
    assert.notEqual(intent.type, "missile");
  }
})();

(function testAvoidsDtDefenseWithoutRichOpponents() {
  const state = createGameState();
  setAliveDefaults(state);
  state.roundNumber = 2;

  const bot = player(state, "bot-1");
  bot.points = 1;
  bot.shields = 2;

  for (const p of state.players) {
    if (p.id !== bot.id) {
      p.points = 3;
    }
  }

  const intent = withMockedRandom(0.99, () => chooseBotAction(state, bot));
  assert.notEqual(intent.type, "dtDefense");
})();

(function testCanPickDtDefenseWhenRichOpponentExists() {
  const state = createGameState();
  setAliveDefaults(state);
  state.roundNumber = 2;

  const bot = player(state, "bot-1");
  bot.points = 1;
  bot.shields = 2;
  player(state, "bot-2").points = 4;

  const intent = withMockedRandom(0.99, () => chooseBotAction(state, bot));
  assert.equal(intent.type, "dtDefense");
})();

(function testAttackCanTargetHumanAndBotUniformly() {
  const state = createGameState();
  setAliveDefaults(state);
  state.roundNumber = 2;

  const bot = player(state, "bot-1");
  bot.points = 1;
  bot.shields = 2;

  // Keep exactly two alive opponents (human and one bot) for a direct uniform-target check.
  player(state, "bot-3").alive = false;
  player(state, "bot-4").alive = false;

  const humanTargetIntent = withMockedRandomSequence([0.75, 0.1], () => chooseBotAction(state, bot));
  assert.equal(humanTargetIntent.type, "woodSword");
  assert.equal(humanTargetIntent.targetId, "human");

  const botTargetIntent = withMockedRandomSequence([0.75, 0.9], () => chooseBotAction(state, bot));
  assert.equal(botTargetIntent.type, "woodSword");
  assert.equal(botTargetIntent.targetId, "bot-2");
})();

(function testTargetDistributionStaysNearUniform() {
  const state = createGameState();
  setAliveDefaults(state);
  state.roundNumber = 2;

  const bot = player(state, "bot-1");
  bot.points = 1;
  bot.shields = 2;

  // Keep exactly two alive opponents (human and one bot).
  player(state, "bot-3").alive = false;
  player(state, "bot-4").alive = false;

  let humanHits = 0;
  let botHits = 0;

  withSeededRandom(123456789, () => {
    for (let i = 0; i < 4000; i += 1) {
      const intent = chooseBotAction(state, bot);
      if (intent.targetId === "human") {
        humanHits += 1;
      }
      if (intent.targetId === "bot-2") {
        botHits += 1;
      }
    }
  });

  const targetedSamples = humanHits + botHits;
  assert.ok(targetedSamples >= 1200, `targeted sample size too small: ${targetedSamples}`);

  const humanRatio = humanHits / targetedSamples;
  assert.ok(humanRatio > 0.45 && humanRatio < 0.55, `human ratio out of range: ${humanRatio}`);
})();

(function testAvoidsHighDefenseWithoutFivePointOpponent() {
  const state = createGameState();
  setAliveDefaults(state);
  state.roundNumber = 2;

  const bot = player(state, "bot-1");
  bot.points = 3;
  bot.shields = 2;

  for (const p of state.players) {
    if (p.id !== bot.id) {
      p.points = 4;
    }
  }

  const intent = withMockedRandom(0.99, () => chooseBotAction(state, bot));
  assert.notEqual(intent.type, "hollowDefense");
  assert.notEqual(intent.type, "superiorDefense");
})();

(function testCanPickHollowDefenseWithFivePointOpponent() {
  const state = createGameState();
  setAliveDefaults(state);
  state.roundNumber = 2;

  const bot = player(state, "bot-1");
  bot.points = 2;
  bot.shields = 2;
  player(state, "bot-2").points = 5;

  const intent = withMockedRandom(0.99, () => chooseBotAction(state, bot));
  assert.equal(intent.type, "hollowDefense");
})();

(function testCanPickSuperiorDefenseWithFivePointOpponent() {
  const state = createGameState();
  setAliveDefaults(state);
  state.roundNumber = 2;

  const bot = player(state, "bot-1");
  bot.points = 3;
  bot.shields = 2;
  player(state, "bot-2").points = 5;

  const intent = withMockedRandom(0.99, () => chooseBotAction(state, bot));
  assert.equal(intent.type, "superiorDefense");
})();

(function testDeadFivePointOpponentDoesNotUnlockHighDefense() {
  const state = createGameState();
  setAliveDefaults(state);
  state.roundNumber = 2;

  const bot = player(state, "bot-1");
  bot.points = 3;
  bot.shields = 2;

  const deadRich = player(state, "bot-2");
  deadRich.alive = false;
  deadRich.points = 6;

  for (const p of state.players) {
    if (p.id !== bot.id && p.alive) {
      p.points = 4;
    }
  }

  const intent = withMockedRandom(0.99, () => chooseBotAction(state, bot));
  assert.notEqual(intent.type, "hollowDefense");
  assert.notEqual(intent.type, "superiorDefense");
})();

console.log("bot tests passed");
