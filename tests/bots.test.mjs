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
    if (!p.isHuman && !p.botType) {
      p.botType = "Aggro";
    }
  }
}

(function testFirstRoundAlwaysGather() {
  const state = createGameState();
  setAliveDefaults(state);
  state.roundNumber = 1;

  const bot = player(state, "bot-1");
  bot.botType = "Aggro";
  bot.points = 6;

  const intent = chooseBotAction(state, bot);
  assert.equal(intent.type, "gather");
})();

(function testCounterAvoidsDtDefenseWithoutRichOpponents() {
  const state = createGameState();
  setAliveDefaults(state);
  state.roundNumber = 2;

  const bot = player(state, "bot-1");
  bot.botType = "Counter";
  bot.points = 2;

  for (const p of state.players) {
    if (p.id !== bot.id) {
      p.points = 3;
    }
  }

  const intent = chooseBotAction(state, bot);
  assert.notEqual(intent.type, "dtDefense");
})();

(function testAggroAttacksAfterRoundOne() {
  const state = createGameState();
  setAliveDefaults(state);
  state.roundNumber = 2;

  const bot = player(state, "bot-1");
  bot.botType = "Aggro";
  bot.points = 4;

  const intent = chooseBotAction(state, bot);
  assert.notEqual(intent.type, "gather");
  assert.notEqual(intent.type, "defense");
})();

console.log("bot tests passed");

