/**
 * GameConfig.ts
 * All tuning knobs in one place.
 * Change values here — nowhere else.
 */

export const ARENA = {
  WIDTH: 1280,
  HEIGHT: 720,
  /** Inset from canvas edge where movement is clamped. */
  BORDER: 60,
  /** Inner radius from center that counts as "center zone" for bonus pressure. */
  CENTER_ZONE_RADIUS: 160,
  CENTER_ZONE_PRESSURE_BONUS: 0.4, // added to pressure multiplier when in center
} as const;

export const PLAYER = {
  SPEED: 280,
  RADIUS: 22,
  /** Tween duration for the charge scale-up on the player gfx (ms). */
  CHARGE_SCALE_DURATION: 200,
  MAX_SCALE_WHILE_CHARGING: 1.35,
} as const;

export const AURA = {
  MAX: 100,
  /** Base gain per second while holding charge (no pressure). */
  BASE_GAIN_PER_SEC: 4,
  /** Extra gain per 1 unit of pressure (stacks with base). */
  PRESSURE_GAIN_MULTIPLIER: 0.12,
  /** Decay per second when NOT charging. */
  DECAY_PER_SEC: 6,
  /** Tiers define visual/payoff thresholds.  */
  TIERS: [
    { label: "Warming Up", min: 0, color: 0x6688cc },
    { label: "Building", min: 25, color: 0x44aaff },
    { label: "Charged", min: 50, color: 0xffcc22 },
    { label: "MAXIMUM AURA", min: 80, color: 0xff6600 },
  ],
} as const;

export const PRESSURE = {
  MAX: 100,
  /** Radius around player that NPCs contribute pressure. */
  NPC_INFLUENCE_RADIUS: 220,
  /** Pressure added per NPC per second inside radius (scales with proximity). */
  NPC_BASE_PRESSURE_PER_SEC: 18,
  /** Pressure decay per second when not charging (crowd relaxes). */
  DECAY_PER_SEC: 20,
  /** Pressure decay per second while charging (focus narrows decay). */
  DECAY_WHILE_CHARGING_PER_SEC: 5,
  /** Extra pressure build while charging (self-exposure effect). */
  CHARGE_EXTRA_PER_SEC: 8,
} as const;

export const BREAK = {
  /** Pressure threshold above which break risk activates. */
  DANGER_THRESHOLD: 60,
  /** Maximum break chance per second at max pressure (0–1). */
  MAX_CHANCE_PER_SEC: 0.55,
  /** How many seconds of break animation before the player recovers. */
  DURATION_SEC: 1.4,
  /** Aura penalty on break (fraction lost). */
  AURA_LOSS_FRACTION: 0.7,
} as const;

export const RELEASE = {
  /** Minimum aura needed to release. */
  MIN_AURA_TO_RELEASE: 5,
  /** Multiplier applied to aura score for payoff display. */
  SCORE_MULTIPLIER: 100,
  /** Camera shake intensity on strong release. */
  STRONG_SHAKE_INTENSITY: 0.018,
  /** Aura threshold that counts as "strong" release. */
  STRONG_THRESHOLD: 50,
} as const;

export const NPC = {
  COUNT: 12,
  RADIUS: 16,
  SPEED: 60,
  /** How often NPCs pick a new wander target (seconds). */
  WANDER_INTERVAL_SEC: 2.5,
  /** Aura level at which NPCs start glancing at the player. */
  GLANCE_AURA_THRESHOLD: 20,
  /** Aura level at which NPCs step back from the player. */
  STEP_BACK_AURA_THRESHOLD: 50,
  /** Step-back flee speed. */
  FLEE_SPEED: 120,
  /** Distance NPCs try to maintain during flee. */
  FLEE_DISTANCE: 180,
  /** Aura threshold for dramatic reaction on release/break. */
  DRAMATIC_THRESHOLD: 60,
  DRAMATIC_FLEE_SPEED: 280,
  DRAMATIC_FLEE_DURATION_SEC: 0.9,
} as const;

export const ROUND = {
  DURATION_SEC: 60,
} as const;

/** NPC color palette — cycle through these. */
export const NPC_COLORS = [
  0xe8b4b8, 0xa8d8a8, 0xb8cce8, 0xf0d8a8, 0xd0a8d8,
  0xa8e8e8, 0xe8d0a8, 0xb0b0d8,
] as const;
