/**
 * PressureModel.ts
 * Pure state container for the player's current pressure level.
 * No Phaser dependency — pure data.
 */
import { PRESSURE } from "../config/GameConfig";

export class PressureModel {
  value: number = 0;

  get normalized(): number {
    return this.value / PRESSURE.MAX;
  }

  get isDangerous(): boolean {
    return this.value >= 60; // mirrors BREAK.DANGER_THRESHOLD
  }

  add(amount: number): void {
    this.value = Math.min(PRESSURE.MAX, this.value + amount);
  }

  subtract(amount: number): void {
    this.value = Math.max(0, this.value - amount);
  }

  reset(): void {
    this.value = 0;
  }
}
