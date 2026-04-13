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

export class NpcCrowdController {
  readonly npcs: Npc[] = [];

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < NPC.COUNT; i++) {
      const x = Phaser.Math.Between(BOUNDS.minX, BOUNDS.maxX);
      const y = Phaser.Math.Between(BOUNDS.minY, BOUNDS.maxY);
      const color = NPC_COLORS[i % NPC_COLORS.length];
      this.npcs.push(new Npc(scene, i, x, y, color));
    }
  }

  /**
   * Main update — decides each NPC's reaction based on player aura,
   * then delegates movement to the NPC.
   */
  update(
    playerPos: Vec2,
    playerAura: number,
    dtSec: number
  ): void {
    for (const npc of this.npcs) {
      const dx = npc.x - playerPos.x;
      const dy = npc.y - playerPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // ----- Decide reaction -----
      if (npc.reaction === "dramatic_flee") {
        // Let dramatic flee play out — it gets reset by triggerDramatic
        npc.dramaticFlee(playerPos, dtSec);
        npc.clampToBounds(BOUNDS);
        continue;
      }

      if (playerAura >= NPC.STEP_BACK_AURA_THRESHOLD) {
        npc.setReaction("fleeing");
        if (dist < NPC.FLEE_DISTANCE) {
          npc.fleeFrom(playerPos, NPC.FLEE_SPEED, dtSec);
        } else {
          npc.updateWander(dtSec, BOUNDS);
        }
        npc.facePlayer(playerPos);
      } else if (playerAura >= NPC.GLANCE_AURA_THRESHOLD) {
        npc.setReaction("glancing");
        npc.updateWander(dtSec, BOUNDS);
        npc.facePlayer(playerPos);
      } else {
        npc.setReaction("wandering");
        npc.updateWander(dtSec, BOUNDS);
      }

      npc.clampToBounds(BOUNDS);
    }
  }

  /**
   * Trigger a dramatic crowd reaction (on strong release or break).
   * NPCs near the player get a dramatic flee; others just flash.
   */
  triggerDramatic(scene: Phaser.Scene, playerPos: Vec2, radius: number): void {
    for (const npc of this.npcs) {
      const dx = npc.x - playerPos.x;
      const dy = npc.y - playerPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < radius) {
        npc.setReaction("dramatic_flee");
        npc.flash(scene);
        // Reset dramatic flag after duration
        scene.time.delayedCall(NPC.DRAMATIC_FLEE_DURATION_SEC * 1000, () => {
          if (npc.reaction === "dramatic_flee") {
            npc.setReaction("wandering");
          }
        });
      } else {
        npc.flash(scene);
      }
    }
  }

  /** Returns all NPC positions for system calculations. */
  getPositions(): Vec2[] {
    return this.npcs.map((n) => n.getPosition());
  }

  destroy(): void {
    for (const npc of this.npcs) npc.destroy();
    this.npcs.length = 0;
  }
}
