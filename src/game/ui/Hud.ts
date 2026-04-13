/**
 * Hud.ts
 * In-scene HUD — aura bar, pressure bar, round timer, callout text.
 * Reads model data only; does not modify anything.
 *
 * All GameObjects created here are tracked in _objects[].
 * ArenaScene reads getObjects() to assign them to the dedicated HUD camera,
 * keeping them unaffected by the main camera's zoom.
 */
import Phaser from "phaser";
import { ARENA } from "../config/GameConfig";

const PAD = 18;
const BAR_W = 240;
const BAR_H = 20;

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

  /** Full-screen flash overlay for break/release moments. */
  private flashOverlay: Phaser.GameObjects.Rectangle;

  /** Track last tier to detect tier transitions. */
  private _lastTierLabel: string = "";

  /** All GameObjects owned by this HUD — used to assign them to a fixed HUD camera. */
  private _objects: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene) {
    const W = ARENA.WIDTH;
    const H = ARENA.HEIGHT;

    // ── Aura bar (top-left) ──────────────────────────────────────────────
    const ax = PAD;
    const ay = PAD;

    // Shadow
    this._t(scene.add.rectangle(ax + BAR_W / 2, ay + BAR_H / 2, BAR_W + 6, BAR_H + 6, 0x000000, 0.7)
      .setScrollFactor(0).setDepth(20));
    this.auraBarBg = this._t(scene.add.rectangle(ax + BAR_W / 2, ay + BAR_H / 2, BAR_W, BAR_H, 0x1a2240)
      .setScrollFactor(0).setDepth(21));
    this.auraBarFill = this._t(scene.add.rectangle(ax, ay + BAR_H / 2, 0, BAR_H, 0x44aaff)
      .setOrigin(0, 0.5)
      .setScrollFactor(0).setDepth(22));

    this.auraLabel = this._t(scene.add.text(ax, ay - 3, "AURA", {
      fontFamily: "monospace", fontSize: "11px", color: "#8888cc",
    }).setScrollFactor(0).setDepth(22));

    this.auraTierLabel = this._t(scene.add.text(ax + BAR_W + 10, ay + BAR_H / 2, "", {
      fontFamily: "monospace", fontSize: "12px", color: "#aaccff",
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(22));

    // ── Pressure bar (below aura) ────────────────────────────────────────
    const pressY = ay + BAR_H + 24;

    this._t(scene.add.rectangle(ax + BAR_W / 2, pressY + BAR_H / 2, BAR_W + 6, BAR_H + 6, 0x000000, 0.7)
      .setScrollFactor(0).setDepth(20));
    this.pressureBarBg = this._t(scene.add.rectangle(ax + BAR_W / 2, pressY + BAR_H / 2, BAR_W, BAR_H, 0x2a0a0a)
      .setScrollFactor(0).setDepth(21));
    this.pressureBarFill = this._t(scene.add.rectangle(ax, pressY + BAR_H / 2, 0, BAR_H, 0xdd3333)
      .setOrigin(0, 0.5)
      .setScrollFactor(0).setDepth(22));

    this.pressureLabel = this._t(scene.add.text(ax, pressY - 3, "PRESSURE", {
      fontFamily: "monospace", fontSize: "11px", color: "#cc6666",
    }).setScrollFactor(0).setDepth(22));

    // ── Timer (top-right) ────────────────────────────────────────────────
    this.timerText = this._t(scene.add.text(W - PAD, PAD, "1:00", {
      fontFamily: "monospace", fontSize: "26px", color: "#ffffff",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(22));

    // ── Callout text (center, upper area) ───────────────────────────────
    this.calloutText = this._t(scene.add.text(W / 2, 90, "", {
      fontFamily: "monospace",
      fontSize: "30px",
      color: "#ffee44",
      stroke: "#000000",
      strokeThickness: 5,
    })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30)
      .setAlpha(0));

    // ── Controls hint (bottom center) ───────────────────────────────────
    this.controlsText = this._t(scene.add.text(W / 2, H - PAD,
      "WASD: move   SPACE: hold to charge / release   R: restart   (X: fallback)",
      { fontFamily: "monospace", fontSize: "11px", color: "#444466" }
    ).setOrigin(0.5, 1).setScrollFactor(0).setDepth(22));

    // ── Flash overlay (full screen, used for break/release moments) ──────
    this.flashOverlay = this._t(scene.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0)
      .setScrollFactor(0).setDepth(50).setAlpha(0));
  }

  /** Returns all GameObjects owned by this HUD (for camera ignore-list assignment). */
  getObjects(): Phaser.GameObjects.GameObject[] {
    return this._objects;
  }

  update(
    scene: Phaser.Scene,
    auraNorm: number,
    tierLabel: string,
    tierColor: number,
    pressureNorm: number,
    isDangerous: boolean,
    timeRemaining: number
  ): void {
    const now = Date.now();
    const hexColor = "#" + tierColor.toString(16).padStart(6, "0");

    // Aura bar fill — height pulses slightly at higher tiers
    const tierIdx = ["Warming Up", "Building", "Charged", "MAXIMUM AURA"].indexOf(tierLabel);
    const barH = BAR_H + Math.max(0, tierIdx) * 2;
    this.auraBarFill.setDisplaySize(BAR_W * auraNorm, barH);
    const ac = Phaser.Display.Color.IntegerToColor(tierColor);
    this.auraBarFill.setFillStyle(Phaser.Display.Color.GetColor(ac.red, ac.green, ac.blue));
    this.auraTierLabel.setText(tierLabel).setColor(hexColor);

    // Tier transition — flash the bar and show a brief callout
    if (tierLabel !== this._lastTierLabel && this._lastTierLabel !== "") {
      this._pulsAuraBar(scene);
      if (tierIdx >= 2) {
        this.showCallout(scene,
          tierIdx >= 3 ? "MAXIMUM AURA" : "Charged!",
          hexColor,
          900
        );
      }
    }
    this._lastTierLabel = tierLabel;

    // Pressure bar
    this.pressureBarFill.setDisplaySize(BAR_W * pressureNorm, BAR_H);

    if (isDangerous) {
      // Near break (>85%): fast strobe — deliberately alarming
      const isNearBreak = pressureNorm > 0.85;
      const freq = isNearBreak ? 0.028 : 0.014;
      const t = 0.5 + Math.sin(now * freq) * 0.5;
      const fromColor = isNearBreak ? 0xff6600 : 0xdd3333;
      const toColor   = isNearBreak ? 0xff0000 : 0xff1100;
      const dangerColor = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.IntegerToColor(fromColor),
        Phaser.Display.Color.IntegerToColor(toColor),
        100, Math.round(t * 100)
      );
      this.pressureBarFill.setFillStyle(
        Phaser.Display.Color.GetColor(dangerColor.r, dangerColor.g, dangerColor.b)
      );
      const labelAlpha = isNearBreak ? 0.4 + t * 0.6 : 0.65 + t * 0.35;
      this.pressureLabel
        .setAlpha(labelAlpha)
        .setText(isNearBreak ? "⚠️ BREAKING!" : "⚠️ DANGER");
    } else {
      this.pressureBarFill.setFillStyle(0xdd3333);
      this.pressureLabel.setAlpha(1).setText("PRESSURE");
    }

    // Timer — turns red in last 10s
    const mins = Math.floor(timeRemaining / 60);
    const secs = Math.floor(timeRemaining % 60);
    this.timerText.setText(`${mins}:${secs.toString().padStart(2, "0")}`);
    this.timerText.setColor(timeRemaining < 10 ? "#ff4444" : "#ffffff");
    if (timeRemaining < 10) {
      const pulse = 0.82 + Math.sin(now * 0.018) * 0.18;
      this.timerText.setAlpha(pulse);
    } else {
      this.timerText.setAlpha(1);
    }
  }

  showCallout(scene: Phaser.Scene, text: string, color = "#ffee44", durationMs = 1400): void {
    scene.tweens.killTweensOf(this.calloutText);
    this.calloutText.setText(text).setColor(color).setAlpha(1).setScale(1.5);
    scene.tweens.add({
      targets: this.calloutText,
      alpha: 0,
      scale: 1.0,
      duration: durationMs,
      ease: "Cubic.easeIn",
    });
  }

  /**
   * White screen flash — called on break or strong release.
   * @param color    hex integer (e.g. 0xffffff or 0xff4444)
   * @param alpha    peak opacity (0..1)
   * @param duration total duration in ms
   */
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

  // ── Private ───────────────────────────────────────────────────────────────

  /** Brief scale pulse on the aura bar when crossing a tier threshold. */
  private _pulsAuraBar(scene: Phaser.Scene): void {
    scene.tweens.killTweensOf(this.auraBarFill);
    scene.tweens.add({
      targets: this.auraBarFill,
      scaleY: 2.2,
      duration: 80,
      ease: "Expo.Out",
      yoyo: true,
    });
    scene.tweens.add({
      targets: this.auraBarBg,
      alpha: 0.5,
      duration: 80,
      ease: "Linear",
      yoyo: true,
    });
  }

  /** Track a GameObject — adds it to _objects and returns it for chaining. */
  private _t<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this._objects.push(obj);
    return obj;
  }
}
