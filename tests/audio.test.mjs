import assert from "node:assert/strict";
import { deriveDisplayAudioEvents } from "../src/game/audio.js";

(function testDamageBucketsAndBlock() {
  const reveal = {
    byPlayer: {
      human: {
        playerId: "human",
        intent: { type: "defense" },
        incomingDamage: 6.5,
        overwhelmedDamage: 0,
        shieldsBroken: 0,
        died: false,
        usedPrepBoost: false,
        damageFrom: { "bot-1": 0.5, "bot-2": 2, "bot-3": 4 }
      },
      "bot-1": {
        playerId: "bot-1",
        intent: { type: "fist", targetId: "human", count: 1 },
        incomingDamage: 0,
        overwhelmedDamage: 0,
        shieldsBroken: 0,
        died: false,
        usedPrepBoost: false,
        damageFrom: {}
      },
      "bot-2": {
        playerId: "bot-2",
        intent: { type: "stoneSword", targetId: "human" },
        incomingDamage: 0,
        overwhelmedDamage: 0,
        shieldsBroken: 0,
        died: false,
        usedPrepBoost: false,
        damageFrom: {}
      },
      "bot-3": {
        playerId: "bot-3",
        intent: { type: "goldSword", targetId: "human" },
        incomingDamage: 0,
        overwhelmedDamage: 0,
        shieldsBroken: 0,
        died: false,
        usedPrepBoost: false,
        damageFrom: {}
      }
    }
  };

  const events = deriveDisplayAudioEvents(reveal, "human");
  const names = events.map((x) => x.name);
  assert.ok(names.includes("block"));
  assert.ok(names.includes("weak"));
  assert.ok(names.includes("hit"));
  assert.ok(names.includes("crit"));
})();

(function testPrepKnockbackAndLlamaAndKill() {
  const reveal = {
    byPlayer: {
      human: {
        playerId: "human",
        intent: { type: "woodSword", targetId: "bot-1" },
        incomingDamage: 0,
        overwhelmedDamage: 0,
        shieldsBroken: 0,
        died: false,
        usedPrepBoost: true,
        damageFrom: {}
      },
      "bot-1": {
        playerId: "bot-1",
        intent: { type: "llama" },
        incomingDamage: 5,
        overwhelmedDamage: 5,
        shieldsBroken: 1,
        died: true,
        usedPrepBoost: false,
        damageFrom: { human: 2 }
      }
    }
  };

  const events = deriveDisplayAudioEvents(reveal, "human");
  const names = events.map((x) => x.name);

  assert.ok(names.includes("knockback"));
  assert.ok(names.includes("use_totem"));
  assert.ok(names.includes("Kill"));
  assert.ok(!names.includes("sweep"));
})();

(function testHumanRelatedGetsPriority() {
  const reveal = {
    byPlayer: {
      human: {
        playerId: "human",
        intent: { type: "defense" },
        incomingDamage: 1,
        overwhelmedDamage: 0,
        shieldsBroken: 0,
        died: false,
        usedPrepBoost: false,
        damageFrom: { "bot-2": 1 }
      },
      "bot-1": {
        playerId: "bot-1",
        intent: { type: "woodSword", targetId: "bot-3" },
        incomingDamage: 0,
        overwhelmedDamage: 0,
        shieldsBroken: 0,
        died: false,
        usedPrepBoost: true,
        damageFrom: {}
      },
      "bot-2": {
        playerId: "bot-2",
        intent: { type: "woodSword", targetId: "human" },
        incomingDamage: 0,
        overwhelmedDamage: 0,
        shieldsBroken: 0,
        died: false,
        usedPrepBoost: false,
        damageFrom: {}
      },
      "bot-3": {
        playerId: "bot-3",
        intent: { type: "defense" },
        incomingDamage: 1,
        overwhelmedDamage: 1,
        shieldsBroken: 0,
        died: false,
        usedPrepBoost: false,
        damageFrom: { "bot-1": 1 }
      }
    }
  };

  const events = deriveDisplayAudioEvents(reveal, "human");
  const blockEvent = events.find((x) => x.name === "block");
  const hitEventOnHuman = events.find((x) => x.name === "hit" && x.priority === "high");
  const knockbackEvent = events.find((x) => x.name === "knockback");

  assert.equal(blockEvent?.priority, "high");
  assert.equal(hitEventOnHuman?.priority, "high");
  assert.equal(knockbackEvent?.priority, "normal");
})();

(function testPerAttackerUsesHighestSingleHitNotSum() {
  const reveal = {
    byPlayer: {
      human: {
        playerId: "human",
        intent: { type: "defense" },
        incomingDamage: 0.5,
        overwhelmedDamage: 0,
        shieldsBroken: 0,
        died: false,
        usedPrepBoost: false,
        damageFrom: { "bot-1": 0.5 }
      },
      "bot-2": {
        playerId: "bot-2",
        intent: { type: "defense" },
        incomingDamage: 0.5,
        overwhelmedDamage: 0,
        shieldsBroken: 0,
        died: false,
        usedPrepBoost: false,
        damageFrom: { "bot-1": 0.5 }
      },
      "bot-3": {
        playerId: "bot-3",
        intent: { type: "defense" },
        incomingDamage: 0.5,
        overwhelmedDamage: 0,
        shieldsBroken: 0,
        died: false,
        usedPrepBoost: false,
        damageFrom: { "bot-1": 0.5 }
      },
      "bot-4": {
        playerId: "bot-4",
        intent: { type: "defense" },
        incomingDamage: 0.5,
        overwhelmedDamage: 0,
        shieldsBroken: 0,
        died: false,
        usedPrepBoost: false,
        damageFrom: { "bot-1": 0.5 }
      },
      "bot-1": {
        playerId: "bot-1",
        intent: { type: "llama" },
        incomingDamage: 0,
        overwhelmedDamage: 0,
        shieldsBroken: 0,
        died: false,
        usedPrepBoost: false,
        damageFrom: {}
      }
    }
  };

  const events = deriveDisplayAudioEvents(reveal, "human");
  const damageSounds = events.filter((x) => x.name === "weak" || x.name === "hit" || x.name === "crit");

  // One attacker, one deduped damage SFX, based on highest single hit (0.5 => weak), not total sum (2.0).
  assert.equal(damageSounds.length, 1);
  assert.equal(damageSounds[0].name, "weak");
  assert.equal(damageSounds[0].priority, "high");
})();

console.log("audio tests passed");
