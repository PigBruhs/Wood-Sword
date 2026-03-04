import assert from "node:assert/strict";
import { createGameState, processRoundEnd, resolveRound } from "../src/game/engine.js";

function player(state, id) {
  return state.players.find((p) => p.id === id);
}

function resetAlive(state) {
  for (const p of state.players) {
    p.alive = true;
    p.points = 10;
    p.shields = 0;
    p.prepReady = false;
  }
}

(function testDefenseOverflowAndShieldBreak() {
  const state = createGameState();
  resetAlive(state);
  player(state, "human").shields = 2;

  const reveal = resolveRound(state, {
    human: { type: "defense" },
    "bot-1": { type: "goldSword", targetId: "human" },
    "bot-2": { type: "defense" },
    "bot-3": { type: "defense" },
    "bot-4": { type: "defense" }
  });

  assert.equal(reveal.byPlayer.human.overwhelmedDamage, 1);
  assert.equal(reveal.byPlayer.human.shieldsBroken, 1);
  assert.equal(player(state, "human").alive, true);
})();

(function testHollowDefenseLowerBoundOverflow() {
  const state = createGameState();
  resetAlive(state);
  player(state, "human").shields = 1;

  const reveal = resolveRound(state, {
    human: { type: "hollowDefense" },
    "bot-1": { type: "defense" },
    "bot-2": { type: "defense" },
    "bot-3": { type: "defense" },
    "bot-4": { type: "defense" }
  });

  assert.equal(reveal.byPlayer.human.overwhelmedDamage, 2);
  assert.equal(reveal.byPlayer.human.shieldsBroken, 1);
  assert.equal(player(state, "human").alive, true);
})();

(function testDeathWhenOverflowTooHighForShields() {
  const state = createGameState();
  resetAlive(state);
  player(state, "human").shields = 1;

  const reveal = resolveRound(state, {
    human: { type: "defense" },
    "bot-1": { type: "enchantedDiamondSword", targetId: "human" },
    "bot-2": { type: "defense" },
    "bot-3": { type: "defense" },
    "bot-4": { type: "defense" }
  });

  assert.equal(reveal.byPlayer.human.overwhelmedDamage, 3);
  assert.equal(player(state, "human").alive, false);
})();

(function testMissileSplit() {
  const state = createGameState();
  resetAlive(state);

  const reveal = resolveRound(state, {
    human: { type: "defense" },
    "bot-1": { type: "missile", count: 3, missileTargets: { human: 2, "bot-2": 1 } },
    "bot-2": { type: "defense" },
    "bot-3": { type: "defense" },
    "bot-4": { type: "defense" }
  });

  assert.equal(reveal.byPlayer.human.incomingDamage, 2);
  assert.equal(reveal.byPlayer["bot-2"].incomingDamage, 1);
})();

(function testReciprocalAttackLowerDamageLoses() {
  const state = createGameState();
  resetAlive(state);
  player(state, "human").shields = 1;

  const reveal = resolveRound(state, {
    human: { type: "woodSword", targetId: "bot-1" },
    "bot-1": { type: "stoneSword", targetId: "human" },
    "bot-2": { type: "defense" },
    "bot-3": { type: "defense" },
    "bot-4": { type: "defense" }
  });

  assert.equal(reveal.byPlayer.human.incomingDamage, 0);
  assert.equal(reveal.byPlayer.human.overwhelmedDamage, 1);
  assert.equal(reveal.byPlayer.human.shieldsBroken, 1);
  assert.equal(player(state, "human").alive, true);
})();

(function testReciprocalEqualDamageNoEffect() {
  const state = createGameState();
  resetAlive(state);

  const reveal = resolveRound(state, {
    human: { type: "woodSword", targetId: "bot-1" },
    "bot-1": { type: "woodSword", targetId: "human" },
    "bot-2": { type: "defense" },
    "bot-3": { type: "defense" },
    "bot-4": { type: "defense" }
  });

  assert.equal(reveal.byPlayer.human.incomingDamage, 0);
  assert.equal(reveal.byPlayer["bot-1"].incomingDamage, 0);
  assert.equal(reveal.byPlayer.human.overwhelmedDamage, 0);
  assert.equal(reveal.byPlayer["bot-1"].overwhelmedDamage, 0);
})();

(function testLlamaFizzleWhenCasterDies() {
  const state = createGameState();
  resetAlive(state);

  const reveal = resolveRound(state, {
    human: { type: "llama" },
    "bot-1": { type: "enchantedDiamondSword", targetId: "human" },
    "bot-2": { type: "defense" },
    "bot-3": { type: "defense" },
    "bot-4": { type: "defense" }
  });

  assert.equal(player(state, "human").alive, false);
  assert.equal(reveal.byPlayer["bot-2"].incomingDamage, 0);
  assert.equal(reveal.byPlayer["bot-3"].incomingDamage, 0);
  assert.equal(reveal.byPlayer["bot-4"].incomingDamage, 0);
  assert.ok(reveal.logs.some((line) => line.includes("llama attacks fizzled")));
})();

(function testHalfPointStorageForQi() {
  const state = createGameState();
  resetAlive(state);
  player(state, "human").points = 2;

  resolveRound(state, {
    human: { type: "fist", count: 3, targetId: "bot-1" },
    "bot-1": { type: "defense" },
    "bot-2": { type: "defense" },
    "bot-3": { type: "defense" },
    "bot-4": { type: "defense" }
  });

  assert.equal(player(state, "human").points, 0.5);
})();

(function testEliminationNeedsSecondAdvanceToStartNextMatch() {
  const state = createGameState();
  resetAlive(state);
  state.roundNumber = 3;

  const reveal = resolveRound(state, {
    human: { type: "defense" },
    "bot-1": { type: "enchantedDiamondSword", targetId: "human" },
    "bot-2": { type: "defense" },
    "bot-3": { type: "defense" },
    "bot-4": { type: "defense" }
  });

  processRoundEnd(state, reveal);
  assert.equal(state.pendingMatchAdvance, true);
  assert.equal(state.matchNumber, 1);
  assert.equal(state.roundNumber, 3);
  assert.equal(player(state, "human").alive, false);
  assert.equal(state.phase, "display");

  processRoundEnd(state, reveal);
  assert.equal(state.pendingMatchAdvance, false);
  assert.equal(state.matchNumber, 2);
  assert.equal(state.roundNumber, 1);
  assert.equal(state.phase, "action");
})();

(function testPrepAddsOneDamageToNextAttackAndIsConsumed() {
  const state = createGameState();
  resetAlive(state);

  const prepReveal = resolveRound(state, {
    human: { type: "prep" },
    "bot-1": { type: "defense" },
    "bot-2": { type: "defense" },
    "bot-3": { type: "defense" },
    "bot-4": { type: "defense" }
  });

  assert.equal(prepReveal.byPlayer.human.incomingDamage, 0);
  assert.equal(player(state, "human").prepReady, true);

  const attackReveal = resolveRound(state, {
    human: { type: "woodSword", targetId: "bot-1" },
    "bot-1": { type: "defense" },
    "bot-2": { type: "defense" },
    "bot-3": { type: "defense" },
    "bot-4": { type: "defense" }
  });

  assert.equal(attackReveal.byPlayer["bot-1"].incomingDamage, 2);
  assert.equal(player(state, "human").prepReady, false);
})();

(function testPrepCanceledWhenTakingIncomingAttack() {
  const state = createGameState();
  resetAlive(state);

  const prepReveal = resolveRound(state, {
    human: { type: "prep" },
    "bot-1": { type: "woodSword", targetId: "human" },
    "bot-2": { type: "defense" },
    "bot-3": { type: "defense" },
    "bot-4": { type: "defense" }
  });

  assert.equal(prepReveal.byPlayer.human.incomingDamage, 1);
  assert.equal(player(state, "human").prepReady, false);

  const attackReveal = resolveRound(state, {
    human: { type: "woodSword", targetId: "bot-2" },
    "bot-1": { type: "defense" },
    "bot-2": { type: "defense" },
    "bot-3": { type: "defense" },
    "bot-4": { type: "defense" }
  });

  assert.equal(attackReveal.byPlayer["bot-2"].incomingDamage, 1);
})();

(function testFinalEliminationShowsDisplayBeforeGameOver() {
  const state = createGameState();
  resetAlive(state);

  player(state, "bot-2").alive = false;
  player(state, "bot-3").alive = false;
  player(state, "bot-4").alive = false;

  const reveal = resolveRound(state, {
    human: { type: "enchantedDiamondSword", targetId: "bot-1" },
    "bot-1": { type: "defense" }
  });

  processRoundEnd(state, reveal);
  assert.equal(state.gameOver, false);
  assert.equal(state.phase, "display");
  assert.equal(state.pendingGameOver, true);
  assert.equal(state.winnerId, "human");

  processRoundEnd(state, reveal);
  assert.equal(state.gameOver, true);
  assert.equal(state.phase, "gameOver");
  assert.equal(state.pendingGameOver, false);
})();

console.log("engine tests passed");
