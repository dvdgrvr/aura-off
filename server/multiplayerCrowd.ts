import { ARENA, MULTIPLAYER_NPC } from "../src/game/config/GameConfig";
import { NpcState } from "../src/shared/protocol";

type PlayerLike = {
  id: string;
  position: { x: number; y: number };
  aura: number;
  pressure: number;
  isCharging: boolean;
  isBroken: boolean;
  isReleased: boolean;
};

type ServerNpc = NpcState & {
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  retargetSec: number;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function createRoomCrowd(): ServerNpc[] {
  const out: ServerNpc[] = [];
  for (let i = 0; i < MULTIPLAYER_NPC.COUNT; i++) {
    const x = rand(ARENA.BORDER + 24, ARENA.WIDTH - ARENA.BORDER - 24);
    const y = rand(ARENA.BORDER + 24, ARENA.HEIGHT - ARENA.BORDER - 24);
    out.push({
      id: `npc_${i}`,
      position: { x, y },
      reaction: "idle",
      intensity: 0,
      vx: 0,
      vy: 0,
      targetX: x,
      targetY: y,
      retargetSec: rand(MULTIPLAYER_NPC.WANDER_RETARGET_SEC_MIN, MULTIPLAYER_NPC.WANDER_RETARGET_SEC_MAX),
    });
  }
  return out;
}

export function updateRoomCrowd(npcs: ServerNpc[], players: PlayerLike[], dtSec: number): void {
  const activePlayers = players.filter((p) => !p.isBroken && !p.isReleased);
  const attentionTarget = pickAttentionTarget(activePlayers);

  for (const npc of npcs) {
    npc.retargetSec -= dtSec;
    if (npc.retargetSec <= 0) {
      npc.targetX = rand(ARENA.BORDER + 20, ARENA.WIDTH - ARENA.BORDER - 20);
      npc.targetY = rand(ARENA.BORDER + 20, ARENA.HEIGHT - ARENA.BORDER - 20);
      npc.retargetSec = rand(MULTIPLAYER_NPC.WANDER_RETARGET_SEC_MIN, MULTIPLAYER_NPC.WANDER_RETARGET_SEC_MAX);
    }

    // Base gentle wander.
    let steerX = npc.targetX - npc.position.x;
    let steerY = npc.targetY - npc.position.y;

    // Reactive space behavior around players (crowd pressure, never chasing or blocking).
    let reaction: NpcState["reaction"] = "idle";
    let reactionIntensity = 0;
    for (const p of activePlayers) {
      const d = distance(npc.position.x, npc.position.y, p.position.x, p.position.y);
      const auraNorm = clamp(p.aura / 100, 0, 1);
      const spaceR =
        MULTIPLAYER_NPC.PERSONAL_SPACE_BASE +
        auraNorm * MULTIPLAYER_NPC.PERSONAL_SPACE_AURA_BONUS;
      if (d < spaceR) {
        // Step back from strong aura to create visible social space.
        const awayX = npc.position.x - p.position.x;
        const awayY = npc.position.y - p.position.y;
        const strength = clamp(1 - d / spaceR, 0, 1);
        steerX += awayX * (0.8 + strength * 2.0);
        steerY += awayY * (0.8 + strength * 2.0);
        reaction = "stepping_back";
        reactionIntensity = Math.max(reactionIntensity, strength);
      } else if (p.pressure >= 74 && d < spaceR * 1.25) {
        // Hesitate near unstable players.
        reaction = "hesitating";
        reactionIntensity = Math.max(reactionIntensity, clamp(1 - d / (spaceR * 1.25), 0, 1));
      }
    }

    if (attentionTarget) {
      const d = distance(
        npc.position.x,
        npc.position.y,
        attentionTarget.position.x,
        attentionTarget.position.y
      );
      if (d < MULTIPLAYER_NPC.PRESSURE_RADIUS * 1.7 && reaction === "idle") {
        reaction = "watching";
        reactionIntensity = clamp(1 - d / (MULTIPLAYER_NPC.PRESSURE_RADIUS * 1.7), 0, 1);
      }
    }

    const len = Math.hypot(steerX, steerY) || 1;
    const nx = steerX / len;
    const ny = steerY / len;
    npc.vx = nx * MULTIPLAYER_NPC.SPEED;
    npc.vy = ny * MULTIPLAYER_NPC.SPEED;
    npc.position.x = clamp(
      npc.position.x + npc.vx * dtSec,
      ARENA.BORDER + 18,
      ARENA.WIDTH - ARENA.BORDER - 18
    );
    npc.position.y = clamp(
      npc.position.y + npc.vy * dtSec,
      ARENA.BORDER + 18,
      ARENA.HEIGHT - ARENA.BORDER - 18
    );

    npc.reaction = reaction;
    npc.intensity = clamp(reactionIntensity, 0, 1);
  }
}

function pickAttentionTarget(players: PlayerLike[]): PlayerLike | undefined {
  if (players.length === 0) return undefined;
  let best: PlayerLike | undefined;
  let bestScore = -Infinity;
  for (const p of players) {
    const auraScore = (p.aura / 100) * MULTIPLAYER_NPC.ATTENTION_AURA_WEIGHT;
    const chargeBonus = p.isCharging ? MULTIPLAYER_NPC.ATTENTION_CHARGE_BONUS : 0;
    const score = auraScore + chargeBonus;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

export function npcPressureForPlayerPerSec(player: PlayerLike, npcs: ServerNpc[]): number {
  let pressure = 0;
  for (const npc of npcs) {
    const d = distance(player.position.x, player.position.y, npc.position.x, npc.position.y);
    if (d > MULTIPLAYER_NPC.PRESSURE_RADIUS) continue;
    const t = clamp(1 - d / MULTIPLAYER_NPC.PRESSURE_RADIUS, 0, 1);
    pressure += t * MULTIPLAYER_NPC.PRESSURE_MAX_PER_SEC;
    if (npc.reaction === "watching" || npc.reaction === "hesitating") {
      pressure += t * MULTIPLAYER_NPC.ATTENTION_PRESSURE_BONUS_PER_SEC * npc.intensity;
    }
  }
  return pressure;
}

