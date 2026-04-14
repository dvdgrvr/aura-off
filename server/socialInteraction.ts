import { AURA, BREAK, MULTIPLAYER_INTERACTION } from "../src/game/config/GameConfig";

type PlayerLike = {
  id: string;
  position: { x: number; y: number };
  isCharging: boolean;
  isBroken: boolean;
  isReleased: boolean;
  aura: number;
  pressure: number;
};

function distance(a: PlayerLike, b: PlayerLike): number {
  return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
}

export function sharedPressureMultiplier(chargingCount: number): number {
  if (chargingCount <= 1) return 1;
  return 1 + (chargingCount - 1) * MULTIPLAYER_INTERACTION.SHARED_PRESSURE_PER_EXTRA_CHARGER;
}

export function proximityChargePressurePerSec(player: PlayerLike, all: PlayerLike[]): number {
  if (!player.isCharging) return 0;

  let extra = 0;
  for (const other of all) {
    if (other.id === player.id) continue;
    if (!other.isCharging) continue;
    if (other.isBroken || other.isReleased) continue;

    const d = distance(player, other);
    if (d >= MULTIPLAYER_INTERACTION.PROXIMITY_CHARGE_RADIUS) continue;
    const t = 1 - d / MULTIPLAYER_INTERACTION.PROXIMITY_CHARGE_RADIUS;
    extra += t * MULTIPLAYER_INTERACTION.PROXIMITY_CHARGE_MAX_PER_PLAYER;
  }
  return extra;
}

export function buildAttentionPressureMapPerSec(players: PlayerLike[]): Map<string, number> {
  const map = new Map<string, number>();
  const alive = players.filter((p) => !p.isBroken && !p.isReleased);
  if (alive.length === 0) return map;

  const weights = alive.map((p) => {
    const auraWeight = p.aura / AURA.MAX;
    const chargeBonus = p.isCharging ? MULTIPLAYER_INTERACTION.ATTENTION_CHARGING_WEIGHT_BONUS : 0;
    return {
      id: p.id,
      w: Math.max(0.05, auraWeight + chargeBonus + 0.10),
    };
  });
  const total = weights.reduce((sum, w) => sum + w.w, 0);

  for (const entry of weights) {
    const share = entry.w / total;
    const attention =
      MULTIPLAYER_INTERACTION.ATTENTION_BASE_PER_SEC +
      share * MULTIPLAYER_INTERACTION.ATTENTION_AURA_SCALE_PER_SEC;
    map.set(entry.id, attention);
  }
  return map;
}

export function applyBreakCascade(source: PlayerLike, all: PlayerLike[]): Map<string, number> {
  const delta = new Map<string, number>();
  for (const other of all) {
    if (other.id === source.id) continue;
    if (other.isBroken || other.isReleased) continue;
    const d = distance(source, other);
    if (d > MULTIPLAYER_INTERACTION.INTERACTION_RADIUS) continue;
    const t = 1 - d / MULTIPLAYER_INTERACTION.INTERACTION_RADIUS;
    delta.set(other.id, t * MULTIPLAYER_INTERACTION.BREAK_CASCADE_SPIKE);
  }
  return delta;
}

export function applyReleaseRelief(source: PlayerLike, all: PlayerLike[]): Map<string, number> {
  const delta = new Map<string, number>();
  for (const other of all) {
    if (other.id === source.id) continue;
    if (other.isBroken || other.isReleased) continue;
    const d = distance(source, other);
    if (d > MULTIPLAYER_INTERACTION.INTERACTION_RADIUS) continue;
    const t = 1 - d / MULTIPLAYER_INTERACTION.INTERACTION_RADIUS;
    delta.set(other.id, t * MULTIPLAYER_INTERACTION.RELEASE_NEARBY_PRESSURE_REDUCTION);
  }
  return delta;
}

export function resolveBreakThresholdWithVariance(pressureValue: number): number {
  const base = BREAK.DANGER_THRESHOLD + 35;
  if (pressureValue < MULTIPLAYER_INTERACTION.VARIANCE_START_PRESSURE) return base;
  const variance =
    (Math.random() * 2 - 1) * MULTIPLAYER_INTERACTION.BREAK_THRESHOLD_VARIANCE;
  return base + variance;
}

