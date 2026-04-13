/**
 * RunState.ts
 * Tracks round-level state: timer, break count, results.
 */
import { ROUND } from "../config/GameConfig";
import { RoundResult } from "../core/types";

export class RunState {
  timeRemaining: number = ROUND.DURATION_SEC;
  broke: boolean = false;
  breakCount: number = 0;
  roundActive: boolean = false;

  startRound(): void {
    this.timeRemaining = ROUND.DURATION_SEC;
    this.broke = false;
    this.breakCount = 0;
    this.roundActive = true;
  }

  tick(dtSec: number): void {
    if (!this.roundActive) return;
    this.timeRemaining = Math.max(0, this.timeRemaining - dtSec);
  }

  get isOver(): boolean {
    return this.roundActive && this.timeRemaining <= 0;
  }

  recordBreak(): void {
    this.broke = true;
    this.breakCount++;
  }

  buildResult(releaseAura: number, peakAura: number): RoundResult {
    return {
      peakAura,
      releaseAura,
      score: Math.round(releaseAura * 100),
      broke: this.broke,
    };
  }
}
