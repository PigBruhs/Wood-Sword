import { ACTIONS } from "./actions.js";

const SOUND_URLS = {
  weak: new URL("../../sounds/weak.ogg", import.meta.url).href,
  hit: new URL("../../sounds/hit.ogg", import.meta.url).href,
  crit: new URL("../../sounds/crit.ogg", import.meta.url).href,
  block: new URL("../../sounds/block.ogg", import.meta.url).href,
  knockback: new URL("../../sounds/knockback.ogg", import.meta.url).href,
  sweep: new URL("../../sounds/sweep.ogg", import.meta.url).href,
  use_totem: new URL("../../sounds/use_totem.ogg", import.meta.url).href,
  Kill: new URL("../../sounds/Kill.wav", import.meta.url).href
};

const SFX_VOLUME = 0.5;

export class DisplaySfxQueue {
  constructor(gapMs = 100) {
    this.gapMs = gapMs;
    this.high = [];
    this.normal = [];
    this.isPlaying = false;
    this.enabled = true;
    this.currentAudio = null;
    this.currentDone = null;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (this.enabled) {
      return;
    }

    this.high.length = 0;
    this.normal.length = 0;
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
    }
    if (this.currentDone) {
      this.currentDone();
    }
  }

  enqueue(events) {
    if (!this.enabled) {
      return;
    }
    for (const event of events) {
      if (!SOUND_URLS[event.name]) {
        continue;
      }
      if (event.priority === "high") {
        this.high.push(event.name);
      } else {
        this.normal.push(event.name);
      }
    }
  }

  async play() {
    if (this.isPlaying || !this.enabled) {
      return;
    }
    this.isPlaying = true;
    try {
      while (this.enabled && (this.high.length > 0 || this.normal.length > 0)) {
        const nextName = this.high.length > 0 ? this.high.shift() : this.normal.shift();
        await playOne(nextName, this);
        if (this.enabled) {
          await sleep(this.gapMs);
        }
      }
    } finally {
      this.currentAudio = null;
      this.currentDone = null;
      this.isPlaying = false;
    }
  }
}

export function deriveDisplayAudioEvents(reveal, humanId = "human") {
  if (!reveal?.byPlayer) {
    return [];
  }

  const events = [];
  const dealtByAttacker = collectDealtDamageByAttacker(reveal.byPlayer, humanId);
  for (const entry of Object.values(reveal.byPlayer)) {
    const intent = entry.intent ?? { type: "defense" };

    const push = (name, actorId = null, targetId = null) => {
      events.push({
        name,
        priority: isHumanRelated(actorId, targetId, humanId) ? "high" : "normal"
      });
    };

    // Damage bucket is based on actual dealt damage, not overflow damage.
    const dealt = dealtByAttacker[entry.playerId];
    if (dealt?.max > 0 && isOffensiveIntent(intent)) {
      const sound = damageSound(dealt.max);
      if (sound) {
        push(sound, entry.playerId, dealt.hitHuman ? humanId : intent.targetId ?? null);
      }
    }

    if (entry.incomingDamage > 0 && entry.overwhelmedDamage === 0) {
      push("block", null, entry.playerId);
    }

    if (entry.shieldsBroken > 0) {
      push("use_totem", null, entry.playerId);
    }

    if (entry.died) {
      push("Kill", null, entry.playerId);
    }

    if (intent.type === "llama" && !entry.died) {
      push("sweep", entry.playerId, null);
    }

    if (entry.usedPrepBoost && ACTIONS[intent.type]?.kind === "attack") {
      push("knockback", entry.playerId, intent.targetId ?? null);
    }
  }

  return events;
}

function collectDealtDamageByAttacker(byPlayer, humanId) {
  const dealt = {};
  for (const targetEntry of Object.values(byPlayer)) {
    for (const [attackerId, amount] of Object.entries(targetEntry.damageFrom ?? {})) {
      if (amount <= 0) {
        continue;
      }
      if (!dealt[attackerId]) {
        dealt[attackerId] = { max: 0, hitHuman: false };
      }
      dealt[attackerId].max = Math.max(dealt[attackerId].max, amount);
      if (targetEntry.playerId === humanId) {
        dealt[attackerId].hitHuman = true;
      }
    }
  }
  return dealt;
}

function damageSound(value) {
  if (value === 0.5) {
    return "weak";
  }
  if (value >= 1 && value <= 3) {
    return "hit";
  }
  if (value >= 4) {
    return "crit";
  }
  return null;
}

function isHumanRelated(actorId, targetId, humanId) {
  return actorId === humanId || targetId === humanId;
}

function isOffensiveIntent(intent) {
  const kind = ACTIONS[intent.type]?.kind;
  return kind === "attack" || kind === "aoe" || kind === "missile";
}

function playOne(name, queue = null) {
  return new Promise((resolve) => {
    const src = SOUND_URLS[name];
    if (!src) {
      resolve();
      return;
    }

    const audio = new Audio(src);
    audio.volume = SFX_VOLUME;
    let finished = false;
    const done = () => {
      if (finished) {
        return;
      }
      finished = true;
      if (queue) {
        queue.currentAudio = null;
        queue.currentDone = null;
      }
      resolve();
    };

    if (queue) {
      queue.currentAudio = audio;
      queue.currentDone = done;
    }

    audio.addEventListener("ended", done, { once: true });
    audio.addEventListener("error", done, { once: true });
    audio.play().catch(done);

    // Safety timeout in case browser never emits ended/error.
    setTimeout(done, 8000);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
