/**
 * multiplayerContracts.ts
 * Shared contracts for future lightweight multiplayer synchronization.
 *
 * Transport-agnostic by design:
 * - no sockets
 * - no server assumptions
 * - no room/account concerns
 *
 * These are plain data shapes that both local single-player flow and
 * future netcode can depend on.
 */
import { RoundResult, Vec2 } from "./types";

export interface ReplicatedPlayerState {
  playerId: string;
  position: Vec2;
  isCharging: boolean;
  isBreaking: boolean;
  isReleasing: boolean;
  isAirborne: boolean;
}

export interface CoreGameplaySnapshot {
  auraValue: number;
  auraNormalized: number;
  auraTierLabel: string;
  auraTierColor: number;
  peakAuraValue: number;

  pressureValue: number;
  pressureNormalized: number;
  pressureDangerous: boolean;

  timeRemainingSec: number;
  roundActive: boolean;
  brokeThisRound: boolean;
  breakCount: number;
}

export type GameplaySyncEvent =
  | {
      type: "break_triggered";
      auraAfterBreak: number;
      pressureAfterBreak: number;
    }
  | {
      type: "release_committed";
      result: RoundResult;
      isStrong: boolean;
    }
  | {
      type: "round_timeout";
      result: RoundResult;
    }
  | {
      type: "hazard_pressure_applied";
      source: "noise_pulse" | "launch_pad";
      amount: number;
    };

