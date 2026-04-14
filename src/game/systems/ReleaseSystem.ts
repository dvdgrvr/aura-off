/**
 * ReleaseSystem.ts
 * Handles a release action: converts aura into a result + clears models.
 */
import { RELEASE } from "../config/GameConfig";
import { AuraModel } from "../state/AuraModel";
import { PressureModel } from "../state/PressureModel";
import { RoundResult } from "../core/types";

export class ReleaseSystem {
  /**
   * Executes a release.
   * @returns the result, or null if release is not valid (too little aura).
   */
  release(
    aura: AuraModel,
    pressure: PressureModel,
    peakAura: number
  ): RoundResult | null {
    if (aura.value < RELEASE.MIN_AURA_TO_RELEASE) return null;

    const releaseAura = aura.value;
    const perfectRelease =
      pressure.value >= RELEASE.PERFECT_WINDOW_MIN_PRESSURE &&
      pressure.value <= RELEASE.PERFECT_WINDOW_MAX_PRESSURE;
    const multiplier = perfectRelease ? RELEASE.PERFECT_SCORE_MULTIPLIER : 1;
    const score = Math.round(releaseAura * RELEASE.SCORE_MULTIPLIER * multiplier);

    aura.reset();
    pressure.reset();

    return {
      peakAura,
      releaseAura,
      score,
      broke: false, // caller sets this from RunState
      perfectRelease,
      perfectMultiplier: multiplier,
    };
  }

  isStrong(aura: number): boolean {
    return aura >= RELEASE.STRONG_THRESHOLD;
  }
}
