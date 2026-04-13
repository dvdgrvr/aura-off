/**
 * PressureSystem.ts
 * Calculates and applies pressure each frame.
 * Pressure comes from nearby NPCs + self-exposure while charging.
 */
import { PRESSURE, ARENA } from "../config/GameConfig";
import { PressureModel } from "../state/PressureModel";
import { Vec2 } from "../core/types";

export class PressureSystem {
  /**
   * @param pressure  mutable pressure model
   * @param playerPos current player world position
   * @param npcPositions array of NPC world positions
   * @param isCharging whether the player is currently charging
   * @param dtSec delta time in seconds
   */
  tick(
    pressure: PressureModel,
    playerPos: Vec2,
    npcPositions: Vec2[],
    isCharging: boolean,
    dtSec: number
  ): void {
    // --- NPC contribution ---
    let npcPressure = 0;
    for (const npc of npcPositions) {
      const dx = npc.x - playerPos.x;
      const dy = npc.y - playerPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < PRESSURE.NPC_INFLUENCE_RADIUS) {
        // Closer = more pressure (linear falloff)
        const proximity = 1 - dist / PRESSURE.NPC_INFLUENCE_RADIUS;
        npcPressure += proximity * PRESSURE.NPC_BASE_PRESSURE_PER_SEC;
      }
    }

    // --- Center zone bonus ---
    const cx = ARENA.WIDTH / 2;
    const cy = ARENA.HEIGHT / 2;
    const distToCenter = Math.sqrt(
      (playerPos.x - cx) ** 2 + (playerPos.y - cy) ** 2
    );
    if (distToCenter < ARENA.CENTER_ZONE_RADIUS) {
      npcPressure *= 1 + ARENA.CENTER_ZONE_PRESSURE_BONUS;
    }

    if (isCharging) {
      pressure.add((npcPressure + PRESSURE.CHARGE_EXTRA_PER_SEC) * dtSec);
      pressure.subtract(PRESSURE.DECAY_WHILE_CHARGING_PER_SEC * dtSec);
    } else {
      pressure.add(npcPressure * dtSec);
      pressure.subtract(PRESSURE.DECAY_PER_SEC * dtSec);
    }
  }
}
