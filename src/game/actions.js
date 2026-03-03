export const ACTIONS = {
  gather: { label: "Gather", cost: 0, kind: "economy" },
  defense: { label: "Defense", cost: 0, kind: "defense", block: [0, 3] },
  fist: { label: "Fist", cost: 0.5, kind: "attack", baseDamage: 0.5, needsTarget: true, stackable: true },
  woodSword: { label: "Wood Sword", cost: 1, kind: "attack", baseDamage: 1, needsTarget: true },
  stoneSword: { label: "Stone Sword", cost: 2, kind: "attack", baseDamage: 2, needsTarget: true },
  ironSword: { label: "Iron Sword", cost: 3, kind: "attack", baseDamage: 3, needsTarget: true },
  goldSword: { label: "Gold Sword", cost: 4, kind: "attack", baseDamage: 4, needsTarget: true },
  diamondSword: { label: "Diamond Sword", cost: 5, kind: "attack", baseDamage: 5, needsTarget: true },
  enchantedDiamondSword: { label: "Enchanted Diamond Sword", cost: 6, kind: "attack", baseDamage: 6, needsTarget: true },
  llama: { label: "Llama", cost: 2, kind: "aoe", baseDamage: 0.5 },
  missile: { label: "Missile", cost: 2, kind: "missile", baseDamage: 1, stackable: true },
  shield: { label: "Shield", cost: 2, kind: "defense", block: [0, 2], givesShield: 1 },
  prep: { label: "Prep", cost: 1, kind: "defense", block: [0, 3], givesPrep: true },
  dtDefense: { label: "DT Defense", cost: 1, kind: "defense", block: [0, 4] },
  hollowDefense: { label: "Hollow Defense", cost: 2, kind: "defense", block: [2, 6] },
  superiorDefense: { label: "Superior Defense", cost: 3, kind: "defense", block: [0, 6] }
};

export const ACTION_ORDER = Object.keys(ACTIONS);

export function toHalfUnits(value) {
  return Math.round(Number(value) * 2);
}

export function fromHalfUnits(units) {
  return units / 2;
}

export function normalizeHalf(value) {
  return fromHalfUnits(toHalfUnits(value));
}

export function hasEnoughPoints(points, cost) {
  return toHalfUnits(points) >= toHalfUnits(cost);
}

export function getActionCost(intent) {
  const def = ACTIONS[intent.type];
  if (!def) {
    return Number.POSITIVE_INFINITY;
  }
  if (intent.type === "fist") {
    const count = Math.max(1, Math.floor(intent.count ?? 1));
    return normalizeHalf(count * def.cost);
  }
  if (intent.type === "missile") {
    const count = Math.max(1, Math.floor(intent.count ?? 1));
    return normalizeHalf(count + 1);
  }
  return normalizeHalf(def.cost);
}

export function getIntentDamage(intent, prepReady) {
  const def = ACTIONS[intent.type];
  if (!def) {
    return 0;
  }
  if (intent.type === "fist") {
    return normalizeHalf((Math.max(1, Math.floor(intent.count ?? 1)) * def.baseDamage) + (prepReady ? 1 : 0));
  }
  if (intent.type === "missile") {
    return normalizeHalf(Math.max(1, Math.floor(intent.count ?? 1)));
  }
  if (def.kind === "attack") {
    return normalizeHalf(def.baseDamage + (prepReady ? 1 : 0));
  }
  return 0;
}

export function getBlockRange(intent) {
  const def = ACTIONS[intent.type];
  if (!def || !def.block) {
    return [0, 0];
  }
  return def.block;
}
