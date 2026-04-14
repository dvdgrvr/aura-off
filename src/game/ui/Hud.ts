/**
 * Hud.ts
 * Minimal in-scene HUD focused on essential readability:
 *   - Timer (primary)
 *   - Small aura state tag
 *   - Subtle danger indicator
 *   - Brief callouts for key moments
 */
import Phaser from "phaser";
import { ARENA } from "../config/GameConfig";

const PAD = 18;

export class Hud {
  private statusPanel: Phaser.GameObjects.Rectangle;
  private auraStateText: Phaser.GameObjects.Text;
  private dangerDot: Phaser.GameObjects.Ellipse;

  private timerText: Phaser.GameObjects.Text;
  private calloutText: Phaser.GameObjects.Text;

  private flashOverlay: Phaser.GameObjects.Rectangle;
  private _objects: Phaser.GameObjects.GameObject[] = [];
  private readonly timerX: number;
  private readonly timerY: number;
  private readonly calloutX: number;
  private readonly calloutY: number;

  constructor(scene: Phaser.Scene) {
    const W = ARENA.WIDTH;
    const H = ARENA.HEIGHT;
    this.timerX = Math.round(W - PAD);
    this.timerY = Math.round(PAD);
    this.calloutX = Math.round(W / 2);
    this.calloutY = 88;

    this.statusPanel = this._t(
      scene.add
        .rectangle(PAD + 96, PAD + 16, 192, 30, 0x050914, 0.42)
        .setScrollFactor(0)
        .setDepth(21)
    );

    this.auraStateText = this._t(
      scene.add
        .text(PAD + 12, PAD + 7, "Quiet", {
          fontFamily: "Verdana, sans-serif",
          fontSize: "12px",
          color: "#a3b6d3",
        })
        .setResolution(2)
        .setScrollFactor(0)
        .setDepth(22)
    );

    this.dangerDot = this._t(
      scene.add
        .ellipse(PAD + 178, PAD + 16, 10, 10, 0xff5a5a, 0)
        .setScrollFactor(0)
        .setDepth(22)
    );

    this.timerText = this._t(
      scene.add
        .text(this.timerX, this.timerY, "1:00", {
          fontFamily: "Verdana, sans-serif",
          fontSize: "27px",
          color: "#ffffff",
          stroke: "#01040a",
          strokeThickness: 2,
        })
        .setOrigin(1, 0)
        .setResolution(2)
        .setScrollFactor(0)
        .setDepth(22)
    );

    this.calloutText = this._t(
      scene.add
        .text(this.calloutX, this.calloutY, "", {
          fontFamily: "Verdana, sans-serif",
          fontSize: "26px",
          color: "#ffee44",
          stroke: "#000000",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setResolution(2)
        .setScrollFactor(0)
        .setDepth(30)
        .setAlpha(0)
    );

    this.flashOverlay = this._t(
      scene.add
        .rectangle(W / 2, H / 2, W, H, 0xffffff, 0)
        .setScrollFactor(0)
        .setDepth(50)
        .setAlpha(0)
    );
  }

  getObjects(): Phaser.GameObjects.GameObject[] {
    return this._objects;
  }

  update(
    _scene: Phaser.Scene,
    _auraNorm: number,
    tierLabel: string,
    tierColor: number,
    pressureNorm: number,
    isDangerous: boolean,
    timeRemaining: number
  ): void {
    const now = Date.now();
    const hexColor = "#" + tierColor.toString(16).padStart(6, "0");

    this.auraStateText.setText(tierLabel).setColor(hexColor).setAlpha(0.86);

    if (isDangerous) {
      const pulse = 0.45 + Math.sin(now * (pressureNorm > 0.85 ? 0.03 : 0.016)) * 0.55;
      this.dangerDot.setFillStyle(pressureNorm > 0.85 ? 0xff2f4f : 0xff7a5a, pulse);
      this.statusPanel.setFillStyle(0x1b0e16, 0.52);
    } else {
      this.dangerDot.setFillStyle(0xff5a5a, 0);
      this.statusPanel.setFillStyle(0x050914, 0.42);
    }

    const mins = Math.floor(timeRemaining / 60);
    const secs = Math.floor(timeRemaining % 60);
    this.timerText.setText(`${mins}:${secs.toString().padStart(2, "0")}`);
    this.timerText.setColor(timeRemaining < 10 ? "#ff5868" : "#ffffff");
    this.timerText.setAlpha(timeRemaining < 10 ? 0.82 + Math.sin(now * 0.02) * 0.18 : 1);
  }

  showCallout(scene: Phaser.Scene, text: string, color = "#ffee44", durationMs = 1400): void {
    scene.tweens.killTweensOf(this.calloutText);
    this.calloutText
      .setText(text)
      .setColor(color)
      .setAlpha(1)
      .setScale(1)
      .setPosition(this.calloutX, this.calloutY);
    scene.tweens.add({
      targets: this.calloutText,
      alpha: 0,
      duration: durationMs,
      ease: "Quad.easeOut",
    });
  }

  flashScreen(scene: Phaser.Scene, color: number, alpha: number, duration: number): void {
    scene.tweens.killTweensOf(this.flashOverlay);
    this.flashOverlay.setFillStyle(color).setAlpha(alpha);
    scene.tweens.add({
      targets: this.flashOverlay,
      alpha: 0,
      duration,
      ease: "Expo.Out",
    });
  }

  private _t<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this._objects.push(obj);
    return obj;
  }
}
