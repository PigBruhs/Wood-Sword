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

function withSeededRandom(seed, fn) {
  const original = Math.random;
  let rng = seed >>> 0;
  Math.random = () => {
    rng = (1664525 * rng + 1013904223) >>> 0;
    return rng / 0x100000000;
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

  withSeededRandom(1, () => {
    for (let i = 0; i < 500; i += 1) {
      const intent = chooseBotAction(state, bot);
      assert.notEqual(intent.type, "missile");
    }
  });
})();

(function testAvoidsDtDefenseWithoutRichOpponents() {
  const state = createGameState();
  setAliveDefaults(state);
  state.roundNumber = 2;

  const bot = player(state, "bot-1");
  bot.points = 3;
  bot.shields = 2;

  for (const p of state.players) {
    if (p.id !== bot.id) {
      p.points = 3;
    }
  }

  withSeededRandom(2, () => {
    for (let i = 0; i < 1000; i += 1) {
      const intent = chooseBotAction(state, bot);
      assert.notEqual(intent.type, "dtDefense");
    }
  });
})();

(function testCanUseDtDefenseWhenRichOpponentExists() {
  const state = createGameState();
  setAliveDefaults(state);
  state.roundNumber = 2;

  const bot = player(state, "bot-1");
  bot.points = 3;
  bot.shields = 2;
  player(state, "bot-2").points = 4;

  let dtCount = 0;
  withSeededRandom(3, () => {
    for (let i = 0; i < 1500; i += 1) {
      const intent = chooseBotAction(state, bot);
      if (intent.type === "dtDefense") {
        dtCount += 1;
      }
    }
  });

  assert.ok(dtCount > 0, `expected dtDefense to appear, got ${dtCount}`);
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

  withSeededRandom(4, () => {
    for (let i = 0; i < 1000; i += 1) {
      const intent = chooseBotAction(state, bot);
      assert.notEqual(intent.type, "hollowDefense");
      assert.notEqual(intent.type, "superiorDefense");
    }
  });
})();

(function testCanUseHighDefenseWithFivePointOpponent() {
  const state = createGameState();
  setAliveDefaults(state);
  state.roundNumber = 2;

  const bot = player(state, "bot-1");
  bot.points = 3;
  bot.shields = 2;
  player(state, "bot-2").points = 5;

  let hollow = 0;
  let superior = 0;

  withSeededRandom(5, () => {
    for (let i = 0; i < 2000; i += 1) {
      const intent = chooseBotAction(state, bot);
      if (intent.type === "hollowDefense") {
        hollow += 1;
      }
      if (intent.type === "superiorDefense") {
        superior += 1;
      }
    }
  });

  assert.ok(hollow > 0, `expected hollowDefense to appear, got ${hollow}`);
  assert.ok(superior > 0, `expected superiorDefense to appear, got ${superior}`);
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

  withSeededRandom(6, () => {
    for (let i = 0; i < 1000; i += 1) {
      const intent = chooseBotAction(state, bot);
      assert.notEqual(intent.type, "hollowDefense");
      assert.notEqual(intent.type, "superiorDefense");
    }
  });
})();

(function testPrefersEfficientDefenseUnderHeavyThreat() {
  const state = createGameState();
  setAliveDefaults(state);
  state.roundNumber = 2;

  const bot = player(state, "bot-1");
  bot.points = 3;
  bot.shields = 0;

  // Keep pressure high so defense choice matters.
  player(state, "human").points = 6;
  player(state, "bot-2").points = 6;
  player(state, "bot-3").points = 6;
  player(state, "bot-4").points = 6;

  let defense = 0;
  let superior = 0;

  withSeededRandom(7, () => {
    for (let i = 0; i < 3000; i += 1) {
      const intent = chooseBotAction(state, bot);
      if (intent.type === "defense") {
        defense += 1;
      }
      if (intent.type === "superiorDefense") {
        superior += 1;
      }
    }
  });

  assert.ok(superior > defense, `expected superiorDefense to be preferred over defense, got superior=${superior}, defense=${defense}`);
})();

(function testBiasesTargetsTowardVulnerableOpponents() {
  const state = createGameState();
  setAliveDefaults(state);
  state.roundNumber = 2;

  const bot = player(state, "bot-1");
  bot.points = 1;
  bot.shields = 2;

  // Keep exactly two alive opponents for a cleaner target-bias check.
  player(state, "bot-3").alive = false;
  player(state, "bot-4").alive = false;

  const human = player(state, "human");
  human.points = 0;
  human.shields = 0;
  human.prepReady = true;

  const tank = player(state, "bot-2");
  tank.points = 6;
  tank.shields = 2;

  let vulnerableHits = 0;
  let tankHits = 0;

  withSeededRandom(8, () => {
    for (let i = 0; i < 5000; i += 1) {
      const intent = chooseBotAction(state, bot);
      if (!intent.targetId) {
        continue;
      }
      if (intent.targetId === "human") {
        vulnerableHits += 1;
      }
      if (intent.targetId === "bot-2") {
        tankHits += 1;
      }
    }
  });

  const targetedSamples = vulnerableHits + tankHits;
  assert.ok(targetedSamples >= 1200, `targeted sample size too small: ${targetedSamples}`);

  const vulnerableRatio = vulnerableHits / targetedSamples;
  assert.ok(vulnerableRatio > 0.62, `expected vulnerable target bias, ratio=${vulnerableRatio}`);
})();

(function testAggroDoublesRetaliationWeightAgainstTopDamager() {
  const state = createGameState();
  setAliveDefaults(state);
  state.roundNumber = 2;

  const bot = player(state, "bot-1");
  bot.points = 1;
  bot.shields = 2;

  // Keep exactly two alive opponents for clear probability comparison.
  player(state, "bot-3").alive = false;
  player(state, "bot-4").alive = false;

  const human = player(state, "human");
  human.points = 2;
  human.shields = 1;

  const rival = player(state, "bot-2");
  rival.points = 2;
  rival.shields = 1;

  let baseRivalHits = 0;
  let baseHumanHits = 0;

  withSeededRandom(11, () => {
    for (let i = 0; i < 4000; i += 1) {
      const intent = chooseBotAction(state, bot);
      if (!intent.targetId) {
        continue;
      }
      if (intent.targetId === "bot-2") {
        baseRivalHits += 1;
      }
      if (intent.targetId === "human") {
        baseHumanHits += 1;
      }
    }
  });

  state.aggroByVictim = {
    "bot-1": {
      "bot-2": 8
    }
  };

  let aggroRivalHits = 0;
  let aggroHumanHits = 0;

  withSeededRandom(11, () => {
    for (let i = 0; i < 4000; i += 1) {
      const intent = chooseBotAction(state, bot);
      if (!intent.targetId) {
        continue;
      }
      if (intent.targetId === "bot-2") {
        aggroRivalHits += 1;
      }
      if (intent.targetId === "human") {
        aggroHumanHits += 1;
      }
    }
  });

  const baselineSamples = baseRivalHits + baseHumanHits;
  const aggroSamples = aggroRivalHits + aggroHumanHits;
  assert.ok(baselineSamples >= 900, `baseline targeted sample too small: ${baselineSamples}`);
  assert.ok(aggroSamples >= 900, `aggro targeted sample too small: ${aggroSamples}`);

  const baselineRatio = baseRivalHits / baselineSamples;
  const aggroRatio = aggroRivalHits / aggroSamples;
  assert.ok(aggroRatio > baselineRatio + 0.12, `expected aggro ratio increase, baseline=${baselineRatio}, aggro=${aggroRatio}`);
})();

(function testLowestQiTargetGetsExtraBias() {
  const state = createGameState();
  setAliveDefaults(state);
  state.roundNumber = 2;

  const bot = player(state, "bot-1");
  bot.points = 1;
  bot.shields = 2;

  player(state, "bot-3").alive = false;
  player(state, "bot-4").alive = false;

  const lowQi = player(state, "human");
  lowQi.points = 1;
  lowQi.shields = 1;

  const highQi = player(state, "bot-2");
  highQi.points = 2;
  highQi.shields = 1;

  let lowQiHits = 0;
  let highQiHits = 0;

  withSeededRandom(12, () => {
    for (let i = 0; i < 4500; i += 1) {
      const intent = chooseBotAction(state, bot);
      if (!intent.targetId) {
        continue;
      }
      if (intent.targetId === "human") {
        lowQiHits += 1;
      }
      if (intent.targetId === "bot-2") {
        highQiHits += 1;
      }
    }
  });

  const targetedSamples = lowQiHits + highQiHits;
  assert.ok(targetedSamples >= 1000, `targeted sample size too small: ${targetedSamples}`);

  const lowQiRatio = lowQiHits / targetedSamples;
  assert.ok(lowQiRatio > 0.56, `expected low-Qi bias, ratio=${lowQiRatio}`);
})();

console.log("bot tests passed");
