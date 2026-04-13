/**
 * Player.ts
 * Player entity — movement, charge input, visual state.
 * Does NOT own gameplay state (aura/pressure live in models).
 * Receives state back from ArenaScene to drive visuals.
 */
import Phaser from "phaser";
import { PLAYER, ARENA } from "../../config/GameConfig";
import { PlayerState } from "../../core/types";

// Aura ring colors matching tiers
const RING_COLORS = [0x6688cc, 0x44aaff, 0xffcc22, 0xff6600];

export class Player {
  x: number;
  y: number;
  state: PlayerState = "idle";

  private gfx: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Ellipse;
  private auraRing: Phaser.GameObjects.Ellipse;
  private unstableOverlay: Phaser.GameObjects.Ellipse;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private chargeKey!: Phaser.Input.Keyboard.Key;
  private releaseKey!: Phaser.Input.Keyboard.Key;

  private _isCharging: boolean = false;
  private _wantsRelease: boolean = false;

  // Bounds for clamping
  private readonly minX = ARENA.BORDER + PLAYER.RADIUS;
  private readonly maxX = ARENA.WIDTH - ARENA.BORDER - PLAYER.RADIUS;
  private readonly minY = ARENA.BORDER + PLAYER.RADIUS;
  private readonly maxY = ARENA.HEIGHT - ARENA.BORDER - PLAYER.RADIUS;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.x = x;
    this.y = y;

    // -- Visuals (drawn from center) --
    this.auraRing = scene.add.ellipse(
      0, 0,
      PLAYER.RADIUS * 4, PLAYER.RADIUS * 4,
      0x4488ff, 0.0
    );
    this.unstableOverlay = scene.add.ellipse(
      0, 0,
      PLAYER.RADIUS * 2.4, PLAYER.RADIUS * 2.4,
      0xff3333, 0.0
    );
    this.body = scene.add.ellipse(
      0, 0,
      PLAYER.RADIUS * 2, PLAYER.RADIUS * 2,
      0xffffff
    );

    this.gfx = scene.add.container(x, y, [
      this.auraRing,
      this.unstableOverlay,
      this.body,
    ]);
    this.gfx.setDepth(5);

    // -- Input --
    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
      // SPACE = charge, X = release
      this.chargeKey = scene.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.SPACE
      );
      this.releaseKey = scene.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.X
      );
    }
  }

  get isCharging(): boolean { return this._isCharging; }
  get wantsRelease(): boolean { return this._wantsRelease; }

  /**
   * Move + read input.  Blocked during break state.
   */
  update(dtSec: number): void {
    this._wantsRelease = false;

    if (this.state === "breaking") return; // frozen during break

    // --- Movement ---
    let vx = 0;
    let vy = 0;

    if (this.cursors) {
      if (this.cursors.left.isDown) vx -= 1;
      if (this.cursors.right.isDown) vx += 1;
      if (this.cursors.up.isDown) vy -= 1;
      if (this.cursors.down.isDown) vy += 1;
    }

    if (vx !== 0 || vy !== 0) {
      const len = Math.sqrt(vx * vx + vy * vy);
      vx /= len;
      vy /= len;
      // Movement is slower while charging (focus reduces mobility)
      const speed = this._isCharging ? PLAYER.SPEED * 0.4 : PLAYER.SPEED;
      this.x += vx * speed * dtSec;
      this.y += vy * speed * dtSec;
      this.x = Phaser.Math.Clamp(this.x, this.minX, this.maxX);
      this.y = Phaser.Math.Clamp(this.y, this.minY, this.maxY);
      this.gfx.setPosition(this.x, this.y);
    }

    // --- Charge / Release input ---
    const chargingNow = this.chargeKey?.isDown ?? false;
    const releaseTap = Phaser.Input.Keyboard.JustDown(this.releaseKey);

    this._isCharging = chargingNow && this.state !== "releasing";

    if (releaseTap && !this._isCharging) {
      this._wantsRelease = true;
    }
  }

  /**
   * Update visuals from model data.  Called by ArenaScene after systems tick.
   */
  applyVisuals(
    auraNorm: number,
    _pressureNorm: number,
    tierColorIndex: number,
    isUnstable: boolean
  ): void {
    const ringColor = RING_COLORS[Phaser.Math.Clamp(tierColorIndex, 0, RING_COLORS.length - 1)];

    // Aura ring — grows and brightens with aura
    const ringAlpha = auraNorm * 0.7;
    const ringScale = 1 + auraNorm * 0.8;
    this.auraRing.setFillStyle(ringColor, ringAlpha);
    this.auraRing.setScale(ringScale);

    // Body scale grows slightly while charging
    const bodyScale = this._isCharging ? 1 + auraNorm * 0.2 : 1.0;
    this.body.setScale(bodyScale);
    this.body.setFillStyle(this._isCharging ? 0xffffff : 0xccccee);

    // Unstable overlay flickers at high pressure
    if (isUnstable) {
      const flicker = 0.4 + Math.sin(Date.now() * 0.02) * 0.3;
      this.unstableOverlay.setFillStyle(0xff3333, flicker);
    } else {
      this.unstableOverlay.setFillStyle(0xff3333, 0);
    }
  }

  /** Trigger break animation. Calls onDone when finished. */
  playBreak(scene: Phaser.Scene, onDone: () => void): void {
    this.state = "breaking";
    this.body.setFillStyle(0xff4444);
    this.auraRing.setFillStyle(0xff4444, 0.8);

    scene.cameras.main.shake(300, 0.012);

    scene.tweens.add({
      targets: this.gfx,
      scaleX: 1.6,
      scaleY: 0.5,
      duration: 180,
      yoyo: true,
      ease: "Bounce.Out",
      onComplete: () => {
        this.body.setFillStyle(0xffffff);
        this.auraRing.setFillStyle(0x4488ff, 0);
        this.gfx.setScale(1);
        this.state = "idle";
        onDone();
      },
    });
  }

  /** Flash + expand for release payoff. */
  playRelease(scene: Phaser.Scene, isStrong: boolean): void {
    this.state = "releasing";
    const intensity = isStrong ? 0.018 : 0.007;
    scene.cameras.main.shake(400, intensity);

    scene.tweens.add({
      targets: this.gfx,
      scaleX: isStrong ? 2.5 : 1.6,
      scaleY: isStrong ? 2.5 : 1.6,
      alpha: 0,
      duration: isStrong ? 500 : 300,
      ease: "Expo.Out",
      onComplete: () => {
        this.gfx.setAlpha(1);
        this.gfx.setScale(1);
        this.state = "idle";
        this._isCharging = false;
      },
    });
  }

  getPosition() {
    return { x: this.x, y: this.y };
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
