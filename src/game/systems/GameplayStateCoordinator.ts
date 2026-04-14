/**
 * GameplayStateCoordinator.ts
 * Lightweight gameplay-state orchestration layer.
 *
 * Purpose:
 * - Own the core gameplay models used for sync (aura, pressure, round state)
 * - Apply core systems each frame
 * - Emit contract-friendly gameplay events
 *
 * This keeps Phaser scene code presentation-oriented and makes future
 * authoritative multiplayer integration simpler.
 */
import { Vec2 } from "../core/types";
import { CoreGameplaySnapshot, GameplaySyncEvent } from "../core/multiplayerContracts";
import { AuraModel } from "../state/AuraModel";
import { PressureModel } from "../state/PressureModel";
import { RunState } from "../state/RunState";
import { AuraSystem } from "./AuraSystem";
import { PressureSystem } from "./PressureSystem";
import { BreakSystem } from "./BreakSystem";
import { ReleaseSystem } from "./ReleaseSystem";

export interface GameplayStepInput {
  dtSec: number;
  playerPos: Vec2;
  npcPositions: Vec2[];
  isCharging: boolean;
  movementNorm: number;
  wantsRelease: boolean;
  simulationLocked: boolean;
}

export class GameplayStateCoordinator {
  private aura = new AuraModel();
  private pressure = new PressureModel();
  private runState = new RunState();

  private auraSystem = new AuraSystem();
  private pressureSystem = new PressureSystem();
  private breakSystem = new BreakSystem();
  private releaseSystem = new ReleaseSystem();

  startRound(): void {
    this.aura.resetForNewRound();
    this.pressure.reset();
    this.runState.startRound();
  }

  stopRound(): void {
    this.runState.roundActive = false;
  }

  step(input: GameplayStepInput): GameplaySyncEvent[] {
    const events: GameplaySyncEvent[] = [];
    this.runState.tick(input.dtSec);

    if (this.runState.isOver) {
      this.runState.roundActive = false;
      events.push({
        type: "round_timeout",
        result: {
          peakAura: this.aura.peakValue,
          releaseAura: 0,
          score: 0,
          broke: this.runState.broke,
        },
      });
      return events;
    }

    if (input.simulationLocked) return events;

    this.pressureSystem.tick(
      this.pressure,
      input.playerPos,
      input.npcPositions,
      input.isCharging,
      input.movementNorm,
      input.dtSec
    );
    this.auraSystem.tick(
      this.aura,
      this.pressure,
      input.isCharging,
      input.movementNorm,
      input.dtSec
    );

    if (this.breakSystem.tryBreak(this.pressure, this.aura, input.isCharging, input.dtSec)) {
      this.runState.recordBreak();
      this.breakSystem.applyBreak(this.aura);
      this.pressure.reset();
      events.push({
        type: "break_triggered",
        auraAfterBreak: this.aura.value,
        pressureAfterBreak: this.pressure.value,
      });
      return events;
    }

    if (input.wantsRelease) {
      const released = this.releaseSystem.release(this.aura, this.pressure, this.aura.peakValue);
      if (released) {
        events.push({
          type: "release_committed",
          result: { ...released, broke: this.runState.broke },
          isStrong: this.releaseSystem.isStrong(released.releaseAura),
        });
      }
    }

    return events;
  }

  applyHazardPressure(source: "noise_pulse" | "launch_pad", amount: number): GameplaySyncEvent {
    this.pressure.add(amount);
    return {
      type: "hazard_pressure_applied",
      source,
      amount,
    };
  }

  getSnapshot(): CoreGameplaySnapshot {
    return {
      auraValue: this.aura.value,
      auraNormalized: this.aura.normalized,
      auraTierLabel: this.aura.tier.label,
      auraTierColor: this.aura.tier.color,
      peakAuraValue: this.aura.peakValue,
      pressureValue: this.pressure.value,
      pressureNormalized: this.pressure.normalized,
      pressureDangerous: this.pressure.isDangerous,
      timeRemainingSec: this.runState.timeRemaining,
      roundActive: this.runState.roundActive,
      brokeThisRound: this.runState.broke,
      breakCount: this.runState.breakCount,
    };
  }
}
