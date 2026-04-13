/**
 * AuraModel.ts
 * Pure state container for the player's aura.
 * No Phaser dependency — pure data.
 */
import { AURA } from "../config/GameConfig";
import { AuraTier } from "../core/types";

export class AuraModel {
  value: number = 0;
  peakValue: number = 0;

  get tier(): AuraTier {
    const tiers = [...AURA.TIERS].reverse();
    return tiers.find((t) => this.value >= t.min) ?? AURA.TIERS[0];
  }

  get normalized(): number {
    return this.value / AURA.MAX;
  }

  add(amount: number): void {
    this.value = Math.min(AURA.MAX, this.value + amount);
    if (this.value > this.peakValue) this.peakValue = this.value;
  }

  subtract(amount: number): void {
    this.value = Math.max(0, this.value - amount);
  }

  reset(): void {
    this.value = 0;
    this.peakValue = 0;
  }

  resetForNewRound(): void {
    this.value = 0;
    this.peakValue = 0;
  }
}
