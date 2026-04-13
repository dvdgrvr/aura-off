/**
 * AuraSystem.ts
 * Applies aura gain and decay rules each frame.
 * Reads from AuraModel and PressureModel — does not own them.
 */
import { AURA } from "../config/GameConfig";
import { AuraModel } from "../state/AuraModel";
import { PressureModel } from "../state/PressureModel";

export class AuraSystem {
  tick(
    aura: AuraModel,
    pressure: PressureModel,
    isCharging: boolean,
    dtSec: number
  ): void {
    if (isCharging) {
      // Base gain + pressure bonus
      const gain =
        (AURA.BASE_GAIN_PER_SEC +
          pressure.value * AURA.PRESSURE_GAIN_MULTIPLIER) *
        dtSec;
      aura.add(gain);
    } else {
      // Aura decays slowly when not charging
      aura.subtract(AURA.DECAY_PER_SEC * dtSec);
    }
  }
}
