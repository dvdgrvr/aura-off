/**
 * NoisePulse.ts
 * A core_pressure hazard that sends an expanding pressure wave across the arena.
 *
 * Lifecycle:
 *   idle        → waiting for scheduler to fire it
 *   telegraph   → pulsing warning ring at origin; player gets ~1.4s to react
 *   active      → wave ring expands outward, damages charging players it crosses
 *   cooldown    → internally tracked by HazardScheduler; NoisePulse resets to idle
 *
 * Responsibilities:
 *   - Draw/update the telegraph ring (Phaser Graphics)
 *   - Draw/update the expanding wave circle (Phaser Graphics)
 *   - Detect when the wave crosses the player and fire the pressure hit callback
 *   - Return to idle cleanly after resolution
 *
 * Does NOT:
 *   - Own schedule logic (that lives in HazardScheduler)
 *   - Mutate PressureModel directly (calls the callback and lets ArenaScene decide)
 */
import Phaser from "phaser";
import { ARENA, HAZARD_NOISE_PULSE } from "../../config/GameConfig";
import { HazardPhase, Vec2 } from "../../core/types";

const CFG = HAZARD_NOISE_PULSE;

export class NoisePulse {
  phase: HazardPhase = "idle";

  // Both rings drawn in Graphics for full stroke/fill control
  private telegraphGfx: Phaser.GameObjects.Graphics;
  private waveGfx: Phaser.GameObjects.Graphics;
  private flashOverlay: Phaser.GameObjects.Rectangle;

  // Phase timers
  private telegraphTimer: number = 0;
  private waveTimer: number = 0;

  // Wave state
  private waveRadius: number = 0;
  /** True once the wave has passed through the player this activation — prevents double hits. */
  private _hitDelivered: boolean = false;

  // Origin (always arena center for this hazard)
  private readonly originX: number = ARENA.WIDTH / 2;
  private readonly originY: number = ARENA.HEIGHT / 2;

  constructor(scene: Phaser.Scene) {
    // Telegraph ring — drawn each frame, depth 15 (above world, below HUD)
    this.telegraphGfx = scene.add.graphics().setDepth(15).setAlpha(0);

    // Wave ring — also a Graphics object for stroke-alpha control
    this.waveGfx = scene.add.graphics().setDepth(14);

    // Hit flash — full-screen tint briefly when the wave hits the player
    const W = ARENA.WIDTH;
    const H = ARENA.HEIGHT;
    this.flashOverlay = scene.add
      .rectangle(W / 2, H / 2, W, H, CFG.COLOR_HIT_FLASH, 0)
      .setDepth(45)
      .setScrollFactor(0);
  }

  /**
   * Returns all Phaser GameObjects this hazard owns that live in world space.
   * Used by ArenaScene._setupCameras() — world camera is ignored here.
   * The camera partition works by default: everything not in HUD list goes to world cam.
   */
  getWorldObjects(): Phaser.GameObjects.GameObject[] {
    return [this.telegraphGfx, this.waveGfx];
  }

  /** The flash overlay is screen-space — ArenaScene adds it to the HUD camera. */
  getScreenObjects(): Phaser.GameObjects.GameObject[] {
    return [this.flashOverlay];
  }

  /**
   * Begin a new Noise Pulse activation.
   * Called by HazardScheduler when cooldown expires.
   */
  fire(): void {
    if (this.phase !== "idle") return;
    this.phase = "telegraph";
    this.telegraphTimer = 0;
    this.waveTimer = 0;
    this.waveRadius = 0;
    this._hitDelivered = false;
    this.telegraphGfx.setAlpha(1);
  }

  /**
   * Main update — call every frame from ArenaScene.
   *
   * @param scene       the Phaser scene (for tweens/time)
   * @param dtSec       delta time in seconds
   * @param playerPos   current player position (world coords)
   * @param isCharging  whether the player is currently charging
   * @param onHit       callback fired when the wave crosses the player while charging
   */
  update(
    scene: Phaser.Scene,
    dtSec: number,
    playerPos: Vec2,
    isCharging: boolean,
    onHit: (pressureHit: number) => void
  ): void {
    if (this.phase === "idle") {
      this._clearVisuals();
      return;
    }

    if (this.phase === "telegraph") {
      this._updateTelegraph(dtSec);
      if (this.telegraphTimer >= CFG.TELEGRAPH_MS / 1000) {
        this.phase = "active";
        this.telegraphGfx.setAlpha(0);
        this.telegraphGfx.clear();
      }
      return;
    }

    if (this.phase === "active") {
      this._updateWave(scene, dtSec, playerPos, isCharging, onHit);
      if (this.waveTimer >= CFG.WAVE_MS / 1000) {
        this._clearVisuals();
        this.phase = "idle"; // HazardScheduler takes it from here (enters cooldown)
      }
    }
  }

  /** Reset to idle (called by HazardScheduler when round ends). */
  reset(): void {
    this.phase = "idle";
    this._clearVisuals();
  }

  destroy(): void {
    this.telegraphGfx.destroy();
    this.waveGfx.destroy();
    this.flashOverlay.destroy();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _updateTelegraph(dtSec: number): void {
    this.telegraphTimer += dtSec;
    const t = Math.min(1, this.telegraphTimer / (CFG.TELEGRAPH_MS / 1000));

    this.telegraphGfx.clear();

    // Outer pulse ring — expands and pulses brightness
    const pulseFreq = 8; // pulses per second
    const pulse = 0.4 + Math.abs(Math.sin(this.telegraphTimer * pulseFreq * Math.PI)) * 0.6;
    const outerR = CFG.TELEGRAPH_RING_RADIUS + Math.sin(this.telegraphTimer * pulseFreq * Math.PI) * 20;

    this.telegraphGfx.lineStyle(3, CFG.COLOR_TELEGRAPH, pulse);
    this.telegraphGfx.strokeCircle(this.originX, this.originY, outerR);

    // Inner solid dot — brightens as telegraph reaches end (urgency signal)
    const innerAlpha = 0.10 + t * 0.35;
    this.telegraphGfx.fillStyle(CFG.COLOR_TELEGRAPH, innerAlpha);
    this.telegraphGfx.fillCircle(this.originX, this.originY, CFG.TELEGRAPH_RING_RADIUS * 0.5);

    // Radial spokes from center — epicenter readability
    const spokeCount = 8;
    this.telegraphGfx.lineStyle(1, CFG.COLOR_TELEGRAPH, pulse * 0.4);
    for (let i = 0; i < spokeCount; i++) {
      const angle = (i / spokeCount) * Math.PI * 2;
      const innerR = CFG.TELEGRAPH_RING_RADIUS * 0.6;
      const len = CFG.TELEGRAPH_RING_RADIUS * 1.4 + t * 40;
      this.telegraphGfx.lineBetween(
        this.originX + Math.cos(angle) * innerR,
        this.originY + Math.sin(angle) * innerR,
        this.originX + Math.cos(angle) * len,
        this.originY + Math.sin(angle) * len
      );
    }
  }

  private _updateWave(
    scene: Phaser.Scene,
    dtSec: number,
    playerPos: Vec2,
    isCharging: boolean,
    onHit: (pressureHit: number) => void
  ): void {
    this.waveTimer += dtSec;
    const t = Math.min(1, this.waveTimer / (CFG.WAVE_MS / 1000));

    // Ease-out expansion so it begins fast (dramatic) and fades at the edges (readable)
    const eased = 1 - Math.pow(1 - t, 2.2);
    this.waveRadius = eased * CFG.WAVE_MAX_RADIUS;

    // Draw the expanding wave in Graphics
    const strokeAlpha = 0.65 * (1 - t * 0.7);
    const strokeWidth = Math.max(1, 5 - t * 3);
    this.waveGfx.clear();
    this.waveGfx.lineStyle(strokeWidth, CFG.COLOR_WAVE, strokeAlpha);
    this.waveGfx.strokeCircle(this.originX, this.originY, this.waveRadius);

    // Faint inner fill so the wave has body
    const fillAlpha = 0.06 * (1 - t);
    this.waveGfx.fillStyle(CFG.COLOR_WAVE, fillAlpha);
    this.waveGfx.fillCircle(this.originX, this.originY, this.waveRadius);

    // Hit detection — wave front passes player while they are charging
    if (!this._hitDelivered && isCharging) {
      const dx = playerPos.x - this.originX;
      const dy = playerPos.y - this.originY;
      const playerDist = Math.sqrt(dx * dx + dy * dy);

      if (this.waveRadius >= playerDist) {
        this._hitDelivered = true;
        onHit(CFG.PRESSURE_HIT);
        this._playHitFlash(scene);
      }
    }
  }

  private _playHitFlash(scene: Phaser.Scene): void {
    scene.tweens.killTweensOf(this.flashOverlay);
    this.flashOverlay.setAlpha(0.30);
    scene.tweens.add({
      targets: this.flashOverlay,
      alpha: 0,
      duration: 400,
      ease: "Expo.Out",
    });
  }

  private _clearVisuals(): void {
    this.telegraphGfx.clear().setAlpha(0);
    this.waveGfx.clear();
    this.flashOverlay.setAlpha(0);
  }
}
