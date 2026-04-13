/**
 * HazardScheduler.ts
 * Drives hazard timing for a single round.
 *
 * Current rules:
 *   - Core hazard (Noise Pulse): frequent, steady pressure
 *   - Chaos hazard (Launch Pad): rare chance-based roll, long cooldown, hard cap
 */
import { HAZARD_CHAOS_LAUNCHPAD, HAZARD_NOISE_PULSE } from "../config/GameConfig";
import { LaunchPadChaos } from "../entities/hazards/LaunchPadChaos";
import { NoisePulse } from "../entities/hazards/NoisePulse";
import { Vec2 } from "../core/types";

const CORE = HAZARD_NOISE_PULSE;
const CHAOS = HAZARD_CHAOS_LAUNCHPAD;

type HazardSchedulerCallbacks = {
  onCoreTelegraph?: () => void;
  onChaosTelegraph?: () => void;
};

export class HazardScheduler {
  readonly noisePulse: NoisePulse;
  readonly launchPadChaos: LaunchPadChaos;

  private coreCooldownRemaining: number;

  private chaosRollRemaining: number;
  private chaosCooldownRemaining: number = 0;
  private chaosTriggersThisRound: number = 0;
  private chaosOutlierUsed: boolean = false;

  private callbacks: HazardSchedulerCallbacks;

  constructor(noisePulse: NoisePulse, launchPadChaos: LaunchPadChaos, callbacks?: HazardSchedulerCallbacks) {
    this.noisePulse = noisePulse;
    this.launchPadChaos = launchPadChaos;
    this.callbacks = callbacks ?? {};
    this.coreCooldownRemaining = CORE.FIRST_FIRE_DELAY_MS / 1000;
    this.chaosRollRemaining = CHAOS.FIRST_ROLL_DELAY_MS / 1000;
  }

  tick(dtSec: number, paused: boolean, playerPos: Vec2): void {
    if (paused) return;

    this._tickCore(dtSec);
    this._tickChaos(dtSec, playerPos);
  }

  reset(): void {
    this.noisePulse.reset();
    this.launchPadChaos.reset();
    this.coreCooldownRemaining = CORE.FIRST_FIRE_DELAY_MS / 1000;
    this.chaosRollRemaining = CHAOS.FIRST_ROLL_DELAY_MS / 1000;
    this.chaosCooldownRemaining = 0;
    this.chaosTriggersThisRound = 0;
    this.chaosOutlierUsed = false;
  }

  private _tickCore(dtSec: number): void {
    this.coreCooldownRemaining -= dtSec;
    if (this.coreCooldownRemaining <= 0 && this.noisePulse.phase === "idle") {
      this.callbacks.onCoreTelegraph?.();
      this.noisePulse.fire();
      this._resetCoreCooldown();
    }
  }

  private _tickChaos(dtSec: number, playerPos: Vec2): void {
    if (!CHAOS.ENABLED) return;
    if (this.launchPadChaos.phase !== "idle") return;
    if (this.noisePulse.phase !== "idle") return; // avoid stacking major moments

    this.chaosCooldownRemaining = Math.max(0, this.chaosCooldownRemaining - dtSec);
    this.chaosRollRemaining -= dtSec;
    if (this.chaosRollRemaining > 0) return;
    this._resetChaosRollInterval();

    if (this.chaosCooldownRemaining > 0) return;
    if (!this._canTriggerChaos()) return;
    if (Math.random() >= CHAOS.BASE_TRIGGER_CHANCE) return;

    this.launchPadChaos.fire(playerPos);
    this.callbacks.onChaosTelegraph?.();
    this.chaosCooldownRemaining = CHAOS.COOLDOWN_MS / 1000;
    this.chaosTriggersThisRound += 1;
  }

  private _canTriggerChaos(): boolean {
    if (this.chaosTriggersThisRound < CHAOS.MAX_TRIGGERS_PER_ROUND) {
      return true;
    }

    if (this.chaosOutlierUsed) return false;

    if (Math.random() < CHAOS.OUTLIER_SECOND_TRIGGER_CHANCE) {
      this.chaosOutlierUsed = true;
      return true;
    }

    return false;
  }

  private _resetCoreCooldown(): void {
    const base = CORE.COOLDOWN_MS / 1000;
    const jitter = (Math.random() * 2 - 1) * (CORE.COOLDOWN_JITTER_MS / 1000);
    this.coreCooldownRemaining = Math.max(base * 0.5, base + jitter);
  }

  private _resetChaosRollInterval(): void {
    const base = CHAOS.ROLL_INTERVAL_MS / 1000;
    const jitter = (Math.random() * 2 - 1) * (CHAOS.ROLL_JITTER_MS / 1000);
    this.chaosRollRemaining = Math.max(base * 0.5, base + jitter);
  }
}
