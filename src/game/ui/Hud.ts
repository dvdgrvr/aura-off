/**
 * Hud.ts
 * In-scene HUD — aura bar, pressure bar, round timer, callout text.
 * Reads model data; does not modify it.
 */
import Phaser from "phaser";
import { AURA, ARENA } from "../config/GameConfig";

const PAD = 16;
const BAR_W = 220;
const BAR_H = 18;

export class Hud {
  private auraBarBg: Phaser.GameObjects.Rectangle;
  private auraBarFill: Phaser.GameObjects.Rectangle;
  private auraLabel: Phaser.GameObjects.Text;
  private auraTierLabel: Phaser.GameObjects.Text;

  private pressureBarBg: Phaser.GameObjects.Rectangle;
  private pressureBarFill: Phaser.GameObjects.Rectangle;
  private pressureLabel: Phaser.GameObjects.Text;

  private timerText: Phaser.GameObjects.Text;
  private calloutText: Phaser.GameObjects.Text;

  private controlsText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    const cam = scene.cameras.main;
    const cx = cam.scrollX;
    const cy = cam.scrollY;

    // ---- Aura bar (top-left) ----
    const auraX = PAD;
    const auraY = PAD;

    scene.add.rectangle(auraX + BAR_W / 2, auraY + 8, BAR_W + 4, BAR_H + 4, 0x000000, 0.6)
      .setScrollFactor(0).setDepth(20);
    this.auraBarBg = scene.add.rectangle(auraX + BAR_W / 2, auraY + 8, BAR_W, BAR_H, 0x223366)
      .setScrollFactor(0).setDepth(21);
    this.auraBarFill = scene.add.rectangle(auraX, auraY + 8, 0, BAR_H, 0x44aaff)
      .setOrigin(0, 0.5)
      .setScrollFactor(0).setDepth(22);

    this.auraLabel = scene.add.text(auraX, auraY - 2, "AURA", {
      fontFamily: "monospace", fontSize: "11px", color: "#88aaff",
    }).setScrollFactor(0).setDepth(22);

    this.auraTierLabel = scene.add.text(auraX + BAR_W + 8, auraY + 8, "Warming Up", {
      fontFamily: "monospace", fontSize: "11px", color: "#aaccff",
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(22);

    // ---- Pressure bar (top-left, below aura) ----
    const pressY = auraY + BAR_H + 22;

    scene.add.rectangle(auraX + BAR_W / 2, pressY + 8, BAR_W + 4, BAR_H + 4, 0x000000, 0.6)
      .setScrollFactor(0).setDepth(20);
    this.pressureBarBg = scene.add.rectangle(auraX + BAR_W / 2, pressY + 8, BAR_W, BAR_H, 0x331122)
      .setScrollFactor(0).setDepth(21);
    this.pressureBarFill = scene.add.rectangle(auraX, pressY + 8, 0, BAR_H, 0xff4444)
      .setOrigin(0, 0.5)
      .setScrollFactor(0).setDepth(22);

    this.pressureLabel = scene.add.text(auraX, pressY - 2, "PRESSURE", {
      fontFamily: "monospace", fontSize: "11px", color: "#ff8888",
    }).setScrollFactor(0).setDepth(22);

    // ---- Timer (top-right) ----
    this.timerText = scene.add.text(ARENA.WIDTH - PAD, PAD, "1:00", {
      fontFamily: "monospace", fontSize: "22px", color: "#ffffff",
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(22);

    // ---- Callout text (center, below top) ----
    this.calloutText = scene.add
      .text(ARENA.WIDTH / 2, 80, "", {
        fontFamily: "monospace",
        fontSize: "26px",
        color: "#ffee44",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30)
      .setAlpha(0);

    // ---- Controls hint (bottom) ----
    this.controlsText = scene.add.text(
      ARENA.WIDTH / 2,
      ARENA.HEIGHT - PAD,
      "ARROWS: move   SPACE: hold to charge   X: release",
      {
        fontFamily: "monospace", fontSize: "11px", color: "#555577",
      }
    ).setOrigin(0.5, 1).setScrollFactor(0).setDepth(22);
  }

  update(
    auraNorm: number,
    tierLabel: string,
    tierColor: number,
    pressureNorm: number,
    isDangerous: boolean,
    timeRemaining: number
  ): void {
    // Aura bar
    this.auraBarFill.setDisplaySize(BAR_W * auraNorm, BAR_H);
    const ac = Phaser.Display.Color.IntegerToColor(tierColor);
    this.auraBarFill.setFillStyle(Phaser.Display.Color.GetColor(ac.red, ac.green, ac.blue));
    this.auraTierLabel.setText(tierLabel);

    // Pressure bar
    this.pressureBarFill.setDisplaySize(BAR_W * pressureNorm, BAR_H);
    const pressColor = isDangerous ? 0xff2200 : 0xdd4444;
    this.pressureBarFill.setFillStyle(pressColor);

    // Pulse pressure label when dangerous
    if (isDangerous) {
      const pulse = 0.7 + Math.sin(Date.now() * 0.01) * 0.3;
      this.pressureLabel.setAlpha(pulse);
      this.pressureLabel.setText("⚠ PRESSURE");
    } else {
      this.pressureLabel.setAlpha(1);
      this.pressureLabel.setText("PRESSURE");
    }

    // Timer
    const mins = Math.floor(timeRemaining / 60);
    const secs = Math.floor(timeRemaining % 60);
    this.timerText.setText(`${mins}:${secs.toString().padStart(2, "0")}`);
    this.timerText.setColor(timeRemaining < 10 ? "#ff4444" : "#ffffff");
  }

  showCallout(scene: Phaser.Scene, text: string, color = "#ffee44", durationMs = 1400): void {
    this.calloutText.setText(text).setColor(color).setAlpha(1).setScale(1.4);
    scene.tweens.add({
      targets: this.calloutText,
      alpha: 0,
      scale: 1,
      duration: durationMs,
      ease: "Quad.easeIn",
    });
  }
}
