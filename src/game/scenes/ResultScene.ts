/**
 * ResultScene.ts
 * Clean round-end presentation:
 *   1) Outcome first
 *   2) Minimal supporting stats
 *   3) Immediate replay prompt
 */
import Phaser from "phaser";
import { ARENA } from "../config/GameConfig";
import { RoundResult } from "../core/types";
import { MobileInput } from "../input/MobileInput";

export class ResultScene extends Phaser.Scene {
  private resultMode: "training" | "match" = "match";
  private isTransitioning = false;
  private failSafeTimer?: Phaser.Time.TimerEvent;
  constructor() {
    super({ key: "ResultScene" });
  }

  create(data: { result: RoundResult }): void {
    const { WIDTH: W, HEIGHT: H } = ARENA;
    const result = data?.result ?? { peakAura: 0, releaseAura: 0, score: 0, broke: false };
    this.resultMode = result.mode ?? "match";
    const cx = Math.round(W / 2);
    const titleY = Math.round(H / 2 - 88);
    const scoreY = Math.round(H / 2 - 26);

    // Set up scene lifecycle cleanup
    this.events.once("shutdown", () => this._cleanup());
    this.events.once("destroy", () => this._cleanup());

    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.84).setDepth(0);

    const mainText =
      this.resultMode === "training"
        ? (result.trainingCompletedSteps ?? 0) >= 3
          ? "TRAINING COMPLETE"
          : "TRAINING ROUND"
        : result.broke && result.releaseAura === 0
          ? "COMPOSURE BROKE"
          : result.releaseAura === 0
            ? "TIME UP"
            : result.score >= 5000
              ? "MAXIMUM RELEASE"
              : "RELEASE LANDED";

    const titleColor =
      this.resultMode === "training"
        ? (result.trainingCompletedSteps ?? 0) >= 3
          ? "#9de8ff"
          : "#ffd68a"
        : result.broke && result.releaseAura === 0
          ? "#ff5a6d"
          : result.score >= 5000
            ? "#ffd05a"
            : "#9de8ff";

    this.add
      .text(cx, titleY, mainText, {
        fontFamily: "Verdana, sans-serif",
        fontSize: "46px",
        color: titleColor,
        stroke: "#01040a",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setResolution(2)
      .setDepth(10);

    this.add
      .text(cx, scoreY, `Score ${result.score.toLocaleString()}`, {
        fontFamily: "Verdana, sans-serif",
        fontSize: "30px",
        color: "#e2ecff",
      })
      .setOrigin(0.5)
      .setResolution(2)
      .setDepth(10);

    const subLines: string[] = [
      result.outcomeReason ? result.outcomeReason : "",
      `Peak Aura ${result.peakAura.toFixed(1)}`,
      result.releaseAura > 0 ? `Release ${result.releaseAura.toFixed(1)}` : "",
      this.resultMode === "training"
        ? `Training ${result.trainingCompletedSteps ?? 0}/${result.trainingTotalSteps ?? 3}`
        : "",
      result.perfectRelease ? `Perfect x${(result.perfectMultiplier ?? 1).toFixed(2)}` : "",
      result.loreTitle ? result.loreTitle : "",
    ].filter(Boolean);

    subLines.forEach((line, i) => {
      this.add
        .text(cx, Math.round(H / 2 + 26 + i * 28), line, {
          fontFamily: "Verdana, sans-serif",
          fontSize: i === 0 ? "22px" : "18px",
          color: i === 0 ? "#bfcce5" : "#97a7c3",
        })
        .setOrigin(0.5)
        .setResolution(2)
        .setDepth(10);
    });

    const prompt = this.add
      .text(cx, Math.round(H - 118), "[ SPACE ] or [ R ] Play Again   •   [ M ] or [ ESC ] Main Menu", {
        fontFamily: "Verdana, sans-serif",
        fontSize: "17px",
        color: "#7f8da8",
      })
      .setOrigin(0.5)
      .setResolution(2)
      .setDepth(10);

    this.tweens.add({
      targets: prompt,
      alpha: 0.32,
      duration: 720,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });

    this._buildActionButtons(cx, H);
    this._bindKeys();
  }

  private _buildActionButtons(cx: number, h: number): void {
    const y = Math.round(h - 72);
    this._createButton(cx - 122, y, 210, 50, "Play Again", () => this._restartRound());
    this._createButton(cx + 122, y, 210, 50, "Back To Menu", () => this._goToMenu());
  }

  private _bindKeys(): void {
    if (!this.input.keyboard) return;
    const spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    const enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    const rKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    const mKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    const escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    spaceKey.once("down", () => this._restartRound());
    enterKey.once("down", () => this._restartRound());
    rKey.once("down", () => this._restartRound());
    mKey.once("down", () => this._goToMenu());
    escKey.once("down", () => this._goToMenu());
  }

  private _createButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    onClick: () => void
  ): void {
    const bg = this.add.rectangle(x, y, width, height, 0x1d3f76, 0.95)
      .setStrokeStyle(2, 0xa5d0ff, 0.95)
      .setDepth(11)
      .setInteractive({ useHandCursor: true });
    const text = this.add.text(x, y, label, {
      fontFamily: "Verdana, sans-serif",
      fontSize: "20px",
      color: "#edf7ff",
      fontStyle: "bold",
    }).setOrigin(0.5).setResolution(2).setDepth(12);
    bg.on("pointerover", () => {
      if (!this.isTransitioning) bg.setFillStyle(0x2b5faa, 1);
    });
    bg.on("pointerout", () => {
      if (!this.isTransitioning) bg.setFillStyle(0x1d3f76, 0.95);
    });
    bg.on("pointerup", () => {
      if (this.isTransitioning) return;
      bg.setFillStyle(0x1d3f76, 0.95);
      onClick();
    });
  }

  private _restartRound(): void {
    this.scene.start("ArenaScene", { mode: this.resultMode });
  }

  private _goToMenu(): void {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    // Stop the fail-safe timer if it exists
    if (this.failSafeTimer) {
      this.failSafeTimer.remove();
      this.failSafeTimer = undefined;
    }

    this.scene.start("MainMenuScene");
  }

  /**
   * Clean up all resources before scene shutdown
   */
  private _cleanup(): void {
    // Remove all keyboard listeners
    if (this.input.keyboard) {
      this.input.keyboard.removeAllListeners();
    }

    // Stop all tweens
    this.tweens.killAll();

    // Don't destroy MobileInput - it's a singleton that persists for the game session
    // Just hide mobile controls if they're visible
    const controlsOverlay = document.getElementById("mobile-controls");
    if (controlsOverlay) {
      controlsOverlay.style.display = "none";
    }
  }
}
