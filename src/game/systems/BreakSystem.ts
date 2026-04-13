/**
 * BreakSystem.ts
 * Determines when the player breaks under pressure.
 * Returns a boolean — ArenaScene owns the break response.
 */
import { BREAK } from "../config/GameConfig";
import { PressureModel } from "../state/PressureModel";
import { AuraModel } from "../state/AuraModel";

export class BreakSystem {
  /**
   * Rolls for a break event this frame.
   * Only triggers when pressure exceeds the danger threshold AND player is charging.
   * @returns true if break should trigger
   */
  tryBreak(
    pressure: PressureModel,
    aura: AuraModel,
    isCharging: boolean,
    dtSec: number
  ): boolean {
    if (!isCharging) return false;
    if (pressure.value < BREAK.DANGER_THRESHOLD) return false;
    if (aura.value <= 0) return false;

    // Pressure above threshold: scale break chance with excess pressure
    const excess = pressure.value - BREAK.DANGER_THRESHOLD;
    const excessNorm = excess / (100 - BREAK.DANGER_THRESHOLD); // 0..1
    const chanceThisFrame = BREAK.MAX_CHANCE_PER_SEC * excessNorm * dtSec;

    return Math.random() < chanceThisFrame;
  }

  /**
   * Applies the consequence of a break to the aura model.
   */
  applyBreak(aura: AuraModel): void {
    aura.subtract(aura.value * BREAK.AURA_LOSS_FRACTION);
  }
}
