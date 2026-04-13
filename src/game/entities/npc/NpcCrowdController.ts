/**
 * NpcCrowdController.ts
 * Owns all NPCs and drives their collective behavior each frame.
 * Decisions are based on player aura — not buried inside individual NPCs.
 */
import Phaser from "phaser";
import { Npc } from "./Npc";
import { NPC, NPC_COLORS, ARENA } from "../../config/GameConfig";
import { Vec2 } from "../../core/types";

const BOUNDS = {
  minX: ARENA.BORDER + NPC.RADIUS,
  maxX: ARENA.WIDTH - ARENA.BORDER - NPC.RADIUS,
  minY: ARENA.BORDER + NPC.RADIUS,
  maxY: ARENA.HEIGHT - ARENA.BORDER - NPC.RADIUS,
};

/**
 * Aura fraction above which NPCs freeze and stare instead of wandering.
 * Below STEP_BACK_AURA_THRESHOLD — they still move, just glance.
 * At and above this they truly stop and watch.
 */
const STARE_AURA_THRESHOLD = 38;

export class NpcCrowdController {
  readonly npcs: Npc[] = [];
  private prevAura: number = 0;

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < NPC.COUNT; i++) {
      const x = Phaser.Math.Between(BOUNDS.minX, BOUNDS.maxX);
      const y = Phaser.Math.Between(BOUNDS.minY, BOUNDS.maxY);
      const color = NPC_COLORS[i % NPC_COLORS.length];
      this.npcs.push(new Npc(scene, i, x, y, color));
    }
  }

  /**
   * Main update — reaction decisions driven by player aura.
   *
   * Behaviour tiers (ascending aura):
   *   0–20:  wander freely, ignore player
   *   20–38: glance and slowly drift toward player (mild clustering)
   *   38–50: freeze in place, stare at player, slow drift stops
   *   50+:   step back / flee, maintaining distance
   */
  update(
    playerPos: Vec2,
    playerAura: number,
    playerPressureNorm: number,
    playerUnstable: boolean,
    dtSec: number
  ): void {
    const auraNorm = Phaser.Math.Clamp(playerAura / 100, 0, 1);
    const auraRisePerSec = (playerAura - this.prevAura) / Math.max(0.0001, dtSec);
    const auraIsRisingHard = auraRisePerSec > 7.5;

    for (const npc of this.npcs) {
      if (npc.reaction === "dramatic_flee") {
        npc.dramaticFlee(playerPos, dtSec);
        npc.clampToBounds(BOUNDS);
        continue;
      }

      const dx = npc.x - playerPos.x;
      const dy = npc.y - playerPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dominantSpaceRadius = NPC.FLEE_DISTANCE + auraNorm * NPC.MAX_EXTRA_SPACE_FROM_AURA;

      if (
        playerUnstable &&
        dist < NPC.UNSTABLE_HESITATE_RADIUS &&
        playerAura >= NPC.GLANCE_AURA_THRESHOLD * 0.8
      ) {
        // --- Unstable hesitation ring ---
        npc.setReaction("stepping_back");
        npc.facePlayer(playerPos);
        const intensity = Math.max(0, playerPressureNorm - 0.45);
        npc.hesitate(dtSec, intensity);

        // Slight retreat if too close, but don't fully flee — this should read as hesitation.
        if (dist < dominantSpaceRadius * 0.72) {
          npc.fleeFrom(playerPos, NPC.FLEE_SPEED * 0.55, dtSec);
        }

      } else if (playerAura >= NPC.DOMINANT_AURA_THRESHOLD) {
        // --- Flee / step back ---
        npc.setReaction("fleeing");
        if (dist < dominantSpaceRadius) {
          const speed = NPC.FLEE_SPEED + auraNorm * 150;
          npc.fleeFrom(playerPos, speed, dtSec);
        } else {
          // Beyond flee distance: stay put and stare
          // (don't wander — keep the focused feel)
        }
        npc.facePlayer(playerPos);

      } else if (playerAura >= STARE_AURA_THRESHOLD || (auraIsRisingHard && playerAura >= 16)) {
        // --- Freeze and stare ---
        // stepping_back gives more visual weight than glancing (stare ring visible)
        npc.setReaction("stepping_back");
        npc.facePlayer(playerPos);
        // Slow drift: only even-ID NPCs creep closer (curious)
        if (npc.id % 2 === 0 && dist > 140) {
          const nx = dx / dist;
          const ny = dy / dist;
          npc.x -= nx * 20 * dtSec;
          npc.y -= ny * 20 * dtSec;
          npc.syncGfxPosition();
        }

      } else if (playerAura >= NPC.GLANCE_AURA_THRESHOLD) {
        // --- Glance while wandering ---
        npc.setReaction("glancing");
        npc.updateWander(dtSec, BOUNDS);
        npc.facePlayer(playerPos);

      } else {
        // --- Wander freely, but low-aura players feel more crowded ---
        npc.setReaction("wandering");
        if (dist > NPC.CROWD_IN_DISTANCE_LOW_AURA && npc.id % 2 === 0) {
          const nx = dx / dist;
          const ny = dy / dist;
          npc.x -= nx * 24 * dtSec;
          npc.y -= ny * 24 * dtSec;
          npc.syncGfxPosition();
        } else {
          npc.updateWander(dtSec, BOUNDS);
        }
      }

      npc.clampToBounds(BOUNDS);
    }

    this.prevAura = playerAura;
  }

  /**
   * Release dramatic: NPCs scatter in a distance-staggered ripple.
   * isStrong = true makes them flee wider and harder.
   */
  triggerReleaseDramatic(scene: Phaser.Scene, playerPos: Vec2, isStrong: boolean): void {
    const innerRadius = isStrong ? NPC.RELEASE_STRONG_DRAMATIC_RADIUS : NPC.RELEASE_WEAK_DRAMATIC_RADIUS;

    for (const npc of this.npcs) {
      const dx = npc.x - playerPos.x;
      const dy = npc.y - playerPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Stagger reaction outward like a shockwave
      const delay = isStrong ? (dist / innerRadius) * 180 : 0;

      scene.time.delayedCall(delay, () => {
        if (dist < innerRadius) {
          npc.setReaction("dramatic_flee");
          npc.dramaticReact(scene, true);
          scene.time.delayedCall(NPC.DRAMATIC_FLEE_DURATION_SEC * 1000, () => {
            if (npc.reaction === "dramatic_flee") npc.setReaction("wandering");
          });
        } else if (dist < innerRadius * 1.6) {
          // Outer ring: stumble in place then recover
          npc.dramaticReact(scene, false);
        }
      });
    }
  }

  /**
   * Break dramatic: nearby NPCs stumble; feels personal, not stadium-wide.
   */
  triggerBreakDramatic(scene: Phaser.Scene, playerPos: Vec2): void {
    for (const npc of this.npcs) {
      const dx = npc.x - playerPos.x;
      const dy = npc.y - playerPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Stagger by distance — nearest NPCs react first
      const delay = Math.min(dist * 0.5, 220);

      scene.time.delayedCall(delay, () => {
        if (dist < NPC.BREAK_DRAMATIC_RADIUS) {
          npc.setReaction("stepping_back");
          npc.stumble(scene);
          npc.dramaticReact(scene, false);
          // Hold the reaction longer — "awkward watching" feel
          scene.time.delayedCall(1800, () => {
            if (npc.reaction === "stepping_back") npc.setReaction("wandering");
          });
        } else if (dist < NPC.BREAK_DRAMATIC_RADIUS * 2.0) {
          npc.stumble(scene);
        }
      });
    }
  }

  getPositions(): Vec2[] {
    return this.npcs.map((n) => n.getPosition());
  }

  destroy(): void {
    for (const npc of this.npcs) npc.destroy();
    this.npcs.length = 0;
  }
}
