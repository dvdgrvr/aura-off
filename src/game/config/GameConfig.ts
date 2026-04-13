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
  CENTER_ZONE_PRESSURE_BONUS: 0.4,
} as const;

export const PLAYER = {
  /** Top movement speed in px/sec. */
  SPEED: 280,
  /** Player circle radius in pixels. */
  RADIUS: 22,
  /**
   * Velocity lerp toward target each frame.
   * 1.0 = instant (no acceleration feel).
   * 0.25–0.35 = snappy but not instant.
   */
  ACCEL_LERP: 0.28,
  /**
   * Friction applied when no direction is held (velocity → 0).
   * Higher = faster stop. 0.22 = quick stop, minimal slide.
   */
  FRICTION_LERP: 0.22,
  /** Speed multiplier while charging. */
  CHARGE_SPEED_MULT: 0.35,
  /**
   * Extra velocity decay per frame while charging and moving.
   * Makes charged movement feel weighted without changing top speed formula.
   */
  CHARGE_EXTRA_FRICTION: 0.08,
  /** Frames a charge input is buffered before expiring (at 60fps). */
  CHARGE_BUFFER_FRAMES: 3,
  /** Frames a release input is buffered — so a slightly early tap still registers. */
  RELEASE_BUFFER_FRAMES: 6,
  /** Duration of brief movement lock on release (impact feel), in ms. */
  RELEASE_LOCK_MS: 90,
  /**
   * Minimum hold duration before releasing Space counts as a release.
   * Prevents accidental release from a quick tap.
   */
  MIN_CHARGE_HOLD_SEC: 0.18,
} as const;

export const AURA = {
  MAX: 100,
  BASE_GAIN_PER_SEC: 4,
  PRESSURE_GAIN_MULTIPLIER: 0.12,
  DECAY_PER_SEC: 6,
  TIERS: [
    { label: "Warming Up",   min: 0,  color: 0x6688cc },
    { label: "Building",     min: 25, color: 0x44aaff },
    { label: "Charged",      min: 50, color: 0xffcc22 },
    { label: "MAXIMUM AURA", min: 80, color: 0xff6600 },
  ],
} as const;

export const PRESSURE = {
  MAX: 100,
  NPC_INFLUENCE_RADIUS: 220,
  NPC_BASE_PRESSURE_PER_SEC: 18,
  DECAY_PER_SEC: 20,
  DECAY_WHILE_CHARGING_PER_SEC: 5,
  CHARGE_EXTRA_PER_SEC: 8,
} as const;

export const BREAK = {
  DANGER_THRESHOLD: 60,
  /** Pressure above which the "unstable" warning visual kicks in (lower than break, higher visibility). */
  UNSTABLE_VISUAL_THRESHOLD: 50,
  MAX_CHANCE_PER_SEC: 0.55,
  DURATION_SEC: 1.4,
  AURA_LOSS_FRACTION: 0.7,
  /** Shake intensity on break. */
  SHAKE_INTENSITY: 0.022,
  SHAKE_DURATION_MS: 450,
  /** Brief dramatic pause to make break read as a public failure moment. */
  HITSTOP_MS: 70,
  HITSTOP_TIMESCALE: 0.08,
  /** Radius of the break impact burst ring. */
  IMPACT_RING_RADIUS: 320,
} as const;

export const RELEASE = {
  MIN_AURA_TO_RELEASE: 5,
  SCORE_MULTIPLIER: 100,
  STRONG_THRESHOLD: 50,
  /** Camera shake intensity for strong release. */
  STRONG_SHAKE_INTENSITY: 0.025,
  STRONG_SHAKE_DURATION_MS: 600,
  /** Weak release shake. */
  WEAK_SHAKE_INTENSITY: 0.008,
  WEAK_SHAKE_DURATION_MS: 250,
  /** Flash-white screen overlay alpha on strong release. */
  STRONG_FLASH_ALPHA: 0.55,
  /** Duration of the second (delayed) ring wave on strong release (ms). */
  STRONG_SECOND_RING_DELAY_MS: 160,
  /** Delay before _endRound is called after a strong release plays out (ms). */
  POST_RELEASE_DELAY_STRONG_MS: 400,
  /** Delay before _endRound is called after a weak release (ms). */
  POST_RELEASE_DELAY_WEAK_MS: 180,
  /** Delay inside _endRound before scene transition (ms). Shorter = snappier replay. */
  ROUND_END_DELAY_MS: 350,
  /** Strong release primary shockwave size. */
  STRONG_SHOCKWAVE_PRIMARY: 760,
  /** Strong release delayed shockwave size. */
  STRONG_SHOCKWAVE_SECONDARY: 980,
  /** Weak release shockwave size. */
  WEAK_SHOCKWAVE: 340,
} as const;

export const NPC = {
  COUNT: 12,
  RADIUS: 16,
  SPEED: 60,
  WANDER_INTERVAL_SEC: 2.5,
  GLANCE_AURA_THRESHOLD: 20,
  /** Above this aura value, crowd behavior becomes visibly dominant/fearful. */
  DOMINANT_AURA_THRESHOLD: 50,
  STEP_BACK_AURA_THRESHOLD: 50,
  FLEE_SPEED: 120,
  FLEE_DISTANCE: 180,
  /** Additional personal space granted to very strong aura players. */
  MAX_EXTRA_SPACE_FROM_AURA: 170,
  /** If player aura is weak, crowd is willing to move this close. */
  CROWD_IN_DISTANCE_LOW_AURA: 105,
  /** Radius where unstable players cause crowd hesitation. */
  UNSTABLE_HESITATE_RADIUS: 230,
  DRAMATIC_THRESHOLD: 60,
  DRAMATIC_FLEE_SPEED: 320,
  DRAMATIC_FLEE_DURATION_SEC: 1.1,
  /** Radius of dramatic reaction on break (smaller, more personal). */
  BREAK_DRAMATIC_RADIUS: 220,
  /** Radius of dramatic reaction on strong release (wider). */
  RELEASE_STRONG_DRAMATIC_RADIUS: 560,
  RELEASE_WEAK_DRAMATIC_RADIUS: 280,
} as const;

export const ROUND = {
  DURATION_SEC: 60,
} as const;

export const CAMERA = {
  /** Default (resting) zoom. */
  ZOOM_DEFAULT: 1.0,
  /** Maximum zoom at peak aura. */
  ZOOM_MAX: 1.18,
  /** Aura fraction at which zoom starts to kick in. */
  ZOOM_AURA_START: 0.2,
  /** Lerp speed toward target zoom per frame (0–1). */
  ZOOM_LERP: 0.04,
  /** Extra zoom added when pressure is dangerous. */
  ZOOM_PRESSURE_BONUS: 0.04,
} as const;

/**
 * Noise Pulse hazard tuning.
 *
 * Lifecycle:
 *   - Telegraph ring pulses at the origin for TELEGRAPH_MS
 *   - Wave expands outward for WAVE_MS until it reaches WAVE_MAX_RADIUS
 *   - Any player charging and inside the wave radius gets a pressure spike
 *   - Round ends with a cooldown before the next pulse can fire
 *
 * Fairness notes:
 *   - The telegraph is long enough to react (move, stop charging) if skilled
 *   - The pressure spike is meaningful but not instantly fatal
 *   - First hazard fires after FIRST_FIRE_DELAY_MS so the round starts calmly
 */
export const HAZARD_NOISE_PULSE = {
  /** Category — drives scheduler rules. */
  CATEGORY: "core_pressure" as const,

  /** How long before the first pulse can fire (ms). Gives player time to settle. */
  FIRST_FIRE_DELAY_MS: 10_000,

  /** Minimum delay between pulses (ms). */
  COOLDOWN_MS: 9_000,

  /** Maximum ± jitter added to cooldown so pulses don't feel metronome. */
  COOLDOWN_JITTER_MS: 3_000,

  /** Duration of the telegraph phase (ms). Ring pulses at origin, player warned. */
  TELEGRAPH_MS: 1_400,

  /** Duration of the expanding wave phase (ms). */
  WAVE_MS: 900,

  /**
   * Maximum radius the wave expands to (px).
   * Should comfortably cover the full arena so no corner is safe.
   */
  WAVE_MAX_RADIUS: 820,

  /**
   * Pressure added to the player when the wave passes through them while charging.
   * Not added if the player is NOT charging — reward for dropping charge early.
   */
  PRESSURE_HIT: 22,

  /**
   * Additional pressure multiplier when the player is already in the danger zone
   * (pressure > BREAK.DANGER_THRESHOLD). Slightly more punishing at high risk.
   */
  DANGER_PRESSURE_MULTIPLIER: 1.35,

  /**
   * Radius of the telegraphed "warning zone" ring drawn at wave origin.
   * Visual only — no gameplay effect during telegraph phase.
   */
  TELEGRAPH_RING_RADIUS: 60,

  /** Color of the telegraph ring and expanding wave. */
  COLOR_TELEGRAPH: 0xff9900,
  COLOR_WAVE: 0xff6600,
  COLOR_HIT_FLASH: 0xff4400,
} as const;

/**
 * Launch Pad chaos hazard tuning.
 *
 * Frequency control:
 *   - Scheduler waits FIRST_ROLL_DELAY_MS
 *   - Then rolls every ROLL_INTERVAL_MS (+/- ROLL_JITTER_MS)
 *   - On each roll, it triggers with BASE_TRIGGER_CHANCE
 *   - Round cap is MAX_TRIGGERS_PER_ROUND (with a tiny outlier chance for one extra)
 */
export const HAZARD_CHAOS_LAUNCHPAD = {
  CATEGORY: "chaos" as const,

  /** Feature gate for quick balancing toggles. */
  ENABLED: true,

  /** Delay before the first chaos roll (ms). */
  FIRST_ROLL_DELAY_MS: 18_000,

  /** Base interval between chaos rolls (ms). */
  ROLL_INTERVAL_MS: 7_000,

  /** +- jitter added to each roll interval so timing is less predictable. */
  ROLL_JITTER_MS: 2_000,

  /** Chance to trigger on each scheduler roll. Keep low so chaos stays rare. */
  BASE_TRIGGER_CHANCE: 0.06,

  /** Hard cap for normal chaos triggers in one round. */
  MAX_TRIGGERS_PER_ROUND: 1,

  /**
   * Very small chance to allow one extra chaos trigger after hitting the cap.
   * This creates occasional story outlier rounds without normalizing spam.
   */
  OUTLIER_SECOND_TRIGGER_CHANCE: 0.04,

  /** Minimum spacing between chaos triggers (ms). */
  COOLDOWN_MS: 26_000,

  /** Telegraph duration before launch burst (ms). */
  TELEGRAPH_MS: 1_350,

  /** Active burst window (ms). */
  ACTIVE_MS: 650,

  /** Launch pad marker radius (px). */
  PAD_RADIUS: 74,

  /** Hit radius checked at trigger moment (px). */
  HIT_RADIUS: 68,

  /** Catapult travel duration (ms). */
  LAUNCH_TRAVEL_MS: 950,

  /** Max visual jump height (px). */
  LAUNCH_ARC_HEIGHT: 150,

  /** Landing distance range from pad center (px). */
  LAUNCH_DISTANCE_MIN: 260,
  LAUNCH_DISTANCE_MAX: 430,

  /** Light pressure spike on launch; enough to matter without deciding rounds alone. */
  PRESSURE_HIT_ON_LAUNCH: 10,

  COLOR_PAD: 0x66ccff,
  COLOR_TELEGRAPH: 0x33bbff,
  COLOR_BURST: 0xffffff,
} as const;

export const NPC_COLORS = [
  0xe8b4b8, 0xa8d8a8, 0xb8cce8, 0xf0d8a8, 0xd0a8d8,
  0xa8e8e8, 0xe8d0a8, 0xb0b0d8,
] as const;
