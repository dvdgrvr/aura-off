/**
 * ResultScene.ts
 * Displays round result and offers instant restart.
 * Receives RoundResult via scene data.
 */
import Phaser from "phaser";
import { ARENA } from "../config/GameConfig";
import { RoundResult } from "../core/types";

export class ResultScene extends Phaser.Scene {
  constructor() {
    super({ key: "ResultScene" });
  }

  create(data: { result: RoundResult }): void {
    const { WIDTH: W, HEIGHT: H } = ARENA;
    const result = data?.result ?? { peakAura: 0, releaseAura: 0, score: 0, broke: false };

    // Dark overlay
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.82).setDepth(0);

    // Title
    const mainText = result.broke && result.releaseAura === 0
      ? "YOU BROKE! 💀"
      : result.releaseAura === 0
        ? "TIME'S UP!"
        : result.score >= 5000
          ? "MAXIMUM AURA! ✨"
          : "RELEASED!";

    const titleColor = result.broke && result.releaseAura === 0
      ? "#ff4444"
      : result.score >= 5000
        ? "#ffcc00"
        : "#88eeff";

    this.add
      .text(W / 2, H / 2 - 100, mainText, {
        fontFamily: "monospace",
        fontSize: "44px",
        color: titleColor,
        stroke: "#000000",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(10);

    // Stats
    const lines = [
      `Peak Aura:    ${result.peakAura.toFixed(1)}`,
      `Released:     ${result.releaseAura.toFixed(1)}`,
      `Score:        ${result.score.toLocaleString()}`,
      result.broke ? `(broke during round)` : "",
    ].filter(Boolean);

    lines.forEach((line, i) => {
      this.add
        .text(W / 2, H / 2 - 20 + i * 34, line, {
          fontFamily: "monospace",
          fontSize: "22px",
          color: "#ccccdd",
        })
        .setOrigin(0.5)
        .setDepth(10);
    });

    // Restart prompt
    const promptY = H / 2 + 150;
    const prompt = this.add
      .text(W / 2, promptY, "[ SPACE ] or [ R ] — Play Again", {
        fontFamily: "monospace",
        fontSize: "18px",
        color: "#888899",
      })
      .setOrigin(0.5)
      .setDepth(10);

    // Pulse the prompt
    this.tweens.add({
      targets: prompt,
      alpha: 0.3,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });

    // Input handler
    if (this.input.keyboard) {
      const spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      const enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
      const rKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
      spaceKey.once("down", () => this._restart());
      enterKey.once("down", () => this._restart());
      rKey.once("down",     () => this._restart());
    }
  }

  private _restart(): void {
    this.scene.start("ArenaScene");
  }
}
