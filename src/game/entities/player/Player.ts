/**
 * Player.ts
 * Player entity — movement, charge input, visual state.
 * Does NOT own gameplay state (aura/pressure live in models).
 * Receives state back from ArenaScene to drive visuals.
 *
 * Movement model: velocity-based with acceleration lerp and friction.
 *   - Key held → velocity lerps toward (direction × speed) each frame
 *   - Key released → velocity lerps toward 0 (friction)
 *   - Charging → lower top speed + extra friction for "weighted" feel
 *
 * Input model:
 *   - Charge: immediate on key-down, 3-frame buffer to absorb misfires
 *   - Release: 6-frame buffer so a slightly early tap still registers
 *   - Release: 90ms movement lock for tactile "impact" feel
 */
import Phaser from "phaser";
import { PLAYER, ARENA, BREAK, RELEASE } from "../../config/GameConfig";
import { PlayerState } from "../../core/types";

// Aura ring colors — matches AURA.TIERS order
const RING_COLORS = [0x6688cc, 0x44aaff, 0xffcc22, 0xff6600];

// Per-aura-tier visual feel: how much each tier escalates the charge look
const TIER_VISUALS = [
  { outerScale: 0.90, pulseSpeed: 0.0012, ringGrow: 0.80, bodyBrightness: 0xddddff }, // Warming Up
  { outerScale: 1.12, pulseSpeed: 0.0019, ringGrow: 1.05, bodyBrightness: 0xffffff }, // Building
  { outerScale: 1.36, pulseSpeed: 0.0028, ringGrow: 1.32, bodyBrightness: 0xffeebb }, // Charged
  { outerScale: 1.68, pulseSpeed: 0.0042, ringGrow: 1.70, bodyBrightness: 0xffdd88 }, // MAXIMUM AURA
];

export class Player {
  x: number;
  y: number;
  state: PlayerState = "idle";

  private scene: Phaser.Scene;
  private gfx: Phaser.GameObjects.Container;

  // Visual layers (back → front)
  private shadow: Phaser.GameObjects.Ellipse;
  private outerRing: Phaser.GameObjects.Ellipse;
  private dominanceShell: Phaser.GameObjects.Ellipse;
  private auraRing: Phaser.GameObjects.Ellipse;
  private unstableOverlay: Phaser.GameObjects.Ellipse;
  private body: Phaser.GameObjects.Ellipse;
  private eyeDot: Phaser.GameObjects.Ellipse;

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyX!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;

  // --- Movement state ---
  private vx: number = 0;
  private vy: number = 0;
  private facingX: number = 1;

  // --- Charge state ---
  private _isCharging: boolean = false;
  private _chargeDurationSec: number = 0;
  private chargeBufferFrames: number = 0;

  // --- Release state ---
  private _wantsRelease: boolean = false;
  private releaseBufferFrames: number = 0;
  private releaseLocked: boolean = false;
  private _airborne: boolean = false;
  private launchTween?: Phaser.Tweens.Tween;

  // --- Unstable jitter ---
  private jitterOffset: { x: number; y: number } = { x: 0, y: 0 };
  private jitterTimer: number = 0;
  /** Tracks last tier to detect tier transitions for a brief visual pulse. */
  private _lastTierIndex: number = -1;
  private levitationY: number = 0;

  // Bounds
  private readonly minX = ARENA.BORDER + PLAYER.RADIUS;
  private readonly maxX = ARENA.WIDTH - ARENA.BORDER - PLAYER.RADIUS;
  private readonly minY = ARENA.BORDER + PLAYER.RADIUS;
  private readonly maxY = ARENA.HEIGHT - ARENA.BORDER - PLAYER.RADIUS;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.x = x;
    this.y = y;
    this.scene = scene;

    const R = PLAYER.RADIUS;

    this.shadow = scene.add.ellipse(0, 0, R * 2.6, R * 1.35, 0x000000, 0.32);
    this.outerRing = scene.add.ellipse(0, 0, R * 10, R * 10, 0x4488ff, 0);
    this.dominanceShell = scene.add.ellipse(0, 0, R * 13, R * 13, 0x88ccff, 0);
    this.auraRing = scene.add.ellipse(0, 0, R * 4.4, R * 4.4, 0x4488ff, 0);
    this.unstableOverlay = scene.add.ellipse(0, 0, R * 4.2, R * 4.2, 0xff2222, 0);
    this.body = scene.add.ellipse(0, 0, R * 2, R * 2, 0xffffff);
    this.eyeDot = scene.add.ellipse(R * 0.5, -R * 0.3, 6, 6, 0x111133);

    this.gfx = scene.add.container(x, y, [
      this.shadow,
      this.outerRing,
      this.dominanceShell,
      this.auraRing,
      this.unstableOverlay,
      this.body,
      this.eyeDot,
    ]);
    this.gfx.setDepth(5);

    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
      this.keyW = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.keyA = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyS = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
      this.keyD = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
      this.keySpace = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.keyX     = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
      this.keyR = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    }
  }

  get isCharging(): boolean { return this._isCharging; }
  get wantsRelease(): boolean { return this._wantsRelease; }
  get isAirborne(): boolean { return this._airborne; }

  update(dtSec: number): void {
    this._wantsRelease = false;
    if (this._airborne) {
      this._isCharging = false;
      return;
    }

    const chargeIsDown = (this.keySpace?.isDown || this.keyX?.isDown) ?? false;
    const chargeJustUp = Phaser.Input.Keyboard.JustUp(this.keySpace) ||
                         Phaser.Input.Keyboard.JustUp(this.keyX);

    if (chargeIsDown) {
      this._chargeDurationSec += dtSec;
      this.chargeBufferFrames = PLAYER.CHARGE_BUFFER_FRAMES;
    } else if (this.chargeBufferFrames > 0) {
      this.chargeBufferFrames--;
    } else {
      this._chargeDurationSec = 0;
    }

    if (chargeJustUp && this._isCharging &&
        this._chargeDurationSec >= PLAYER.MIN_CHARGE_HOLD_SEC) {
      this.releaseBufferFrames = PLAYER.RELEASE_BUFFER_FRAMES;
    }
    if (this.releaseBufferFrames > 0) this.releaseBufferFrames--;

    if (this.state === "breaking") return;

    this._isCharging = this.chargeBufferFrames > 0 && this.state !== "releasing";

    if (this.releaseBufferFrames > 0 && !this._isCharging && !this.releaseLocked) {
      this._wantsRelease = true;
      this.releaseBufferFrames = 0;
    }

    if (!this.releaseLocked) {
      this._updateMovement(dtSec);
    } else {
      this.vx *= (1 - PLAYER.FRICTION_LERP * 3);
      this.vy *= (1 - PLAYER.FRICTION_LERP * 3);
      this._applyPosition();
    }
  }

  private _updateMovement(dtSec: number): void {
    let inputX = 0;
    let inputY = 0;
    if (this.keyA?.isDown || this.cursors?.left.isDown)  inputX -= 1;
    if (this.keyD?.isDown || this.cursors?.right.isDown) inputX += 1;
    if (this.keyW?.isDown || this.cursors?.up.isDown)    inputY -= 1;
    if (this.keyS?.isDown || this.cursors?.down.isDown)  inputY += 1;

    if (inputX !== 0 || inputY !== 0) {
      const len = Math.sqrt(inputX * inputX + inputY * inputY);
      inputX /= len;
      inputY /= len;
      this.facingX = Math.sign(inputX) || this.facingX;
    }

    const topSpeed = this._isCharging
      ? PLAYER.SPEED * PLAYER.CHARGE_SPEED_MULT
      : PLAYER.SPEED;

    const targetVx = inputX * topSpeed;
    const targetVy = inputY * topSpeed;

    if (inputX !== 0 || inputY !== 0) {
      this.vx += (targetVx - this.vx) * PLAYER.ACCEL_LERP;
      this.vy += (targetVy - this.vy) * PLAYER.ACCEL_LERP;
      if (this._isCharging) {
        this.vx *= (1 - PLAYER.CHARGE_EXTRA_FRICTION);
        this.vy *= (1 - PLAYER.CHARGE_EXTRA_FRICTION);
      }
    } else {
      this.vx *= (1 - PLAYER.FRICTION_LERP);
      this.vy *= (1 - PLAYER.FRICTION_LERP);
      if (Math.abs(this.vx) < 0.5) this.vx = 0;
      if (Math.abs(this.vy) < 0.5) this.vy = 0;
    }

    this._applyPosition();
    this.eyeDot.setPosition(PLAYER.RADIUS * 0.5 * this.facingX, -PLAYER.RADIUS * 0.3);
  }

  private _applyPosition(): void {
    this.x = Phaser.Math.Clamp(this.x + this.vx / 60, this.minX, this.maxX);
    this.y = Phaser.Math.Clamp(this.y + this.vy / 60, this.minY, this.maxY);
    this.gfx.setPosition(
      this.x + this.jitterOffset.x,
      this.y + this.jitterOffset.y
    );
  }

  // ── Visual update ─────────────────────────────────────────────────────────

  applyVisuals(
    auraNorm: number,
    pressureNorm: number,
    tierColorIndex: number,
    isUnstable: boolean,
    dangerIntensity: number,
    criticalIntensity: number
  ): void {
    const ringColor = RING_COLORS[Phaser.Math.Clamp(tierColorIndex, 0, RING_COLORS.length - 1)];
    const tv = TIER_VISUALS[Phaser.Math.Clamp(tierColorIndex, 0, TIER_VISUALS.length - 1)];
    const now = Date.now();
    const isChargeActive = this._isCharging && this.state !== "releasing";
    const levitationTarget = isChargeActive
      ? PLAYER.LEVITATION_BASE_Y +
        auraNorm * (PLAYER.LEVITATION_MAX_Y - PLAYER.LEVITATION_BASE_Y) +
        criticalIntensity * 4.5
      : 0;
    this.levitationY += (levitationTarget - this.levitationY) * (isChargeActive ? 0.10 : 0.26);
    const bobSpeed = Phaser.Math.Linear(
      PLAYER.LEVITATION_BOB_SPEED,
      PLAYER.LEVITATION_CRITICAL_BOB_SPEED,
      criticalIntensity
    );
    const bobAmp =
      Phaser.Math.Linear(PLAYER.LEVITATION_BOB_AMPLITUDE, PLAYER.LEVITATION_CRITICAL_BOB_AMPLITUDE, criticalIntensity) *
      (0.35 + auraNorm * 0.65);
    const bob = isChargeActive ? Math.sin(now * bobSpeed) * bobAmp : 0;
    const visualLift = this.levitationY + bob;
    this._applyVerticalOffsets(visualLift);
    this._updateShadow(auraNorm, pressureNorm, isUnstable, criticalIntensity);

    // Tier transition pulse — brief body flash when crossing into a new tier
    if (this._lastTierIndex !== tierColorIndex) {
      if (this._lastTierIndex >= 0) {
        this._playTierTransitionPulse();
      }
      this._lastTierIndex = tierColorIndex;
    }

    // Outer glow — bigger and faster per tier
    if (isChargeActive) {
      const outerPulse = 0.09 + auraNorm * 0.34 + Math.sin(now * tv.pulseSpeed) * 0.10;
      const outerScale = tv.outerScale + auraNorm * 0.55 + Math.sin(now * tv.pulseSpeed * 1.3) * 0.08;
      this.outerRing.setFillStyle(ringColor, outerPulse).setScale(outerScale);
    } else {
      // Idle: faint residual glow proportional to current aura (shows built charge)
      const idleAlpha = auraNorm * 0.18;
      this.outerRing.setFillStyle(ringColor, idleAlpha).setScale(0.85 + auraNorm * 0.45);
    }

    // Dominance shell: strong aura creates immediate silhouette presence.
    const dominantPulse = 0.08 + Math.max(0, auraNorm - 0.45) * 0.45;
    const dominantAlpha = Math.max(0, auraNorm - 0.20) * 0.30 + Math.sin(now * 0.0025) * 0.03;
    this.dominanceShell
      .setFillStyle(ringColor, Math.max(0, dominantAlpha))
      .setScale(0.85 + auraNorm * 1.15 + dominantPulse);

    // Pre-break danger tint — visible before unstable chaos starts.
    if (dangerIntensity > 0 && !isUnstable) {
      this.outerRing.setFillStyle(0xff6633, 0.12 + dangerIntensity * 0.20);
      this.dominanceShell.setFillStyle(0xff8855, Math.max(this.dominanceShell.fillAlpha, 0.08 + dangerIntensity * 0.16));
    }

    // Main aura ring — grows meaningfully per tier
    const ringAlpha = isChargeActive ? 0.44 + auraNorm * 0.50 : auraNorm * 0.36;
    const ringScale = 1 + auraNorm * tv.ringGrow + Math.sin(now * tv.pulseSpeed * 0.9) * 0.05;
    this.auraRing.setFillStyle(ringColor, ringAlpha).setScale(ringScale);

    // Body
    const bodyScale = isChargeActive ? 1.08 + auraNorm * 0.48 : 1.0 + auraNorm * 0.20;
    this.body.setScale(bodyScale);
    this.body.setFillStyle(isChargeActive ? tv.bodyBrightness : 0xccccee);

    // Unstable flicker + jitter — escalates hard with pressure
    if (isUnstable) {
      const danger = Math.max(0, (pressureNorm - 0.5) / 0.5); // 0..1 above threshold
      // Flicker gets faster and more violent near break
      const flickerFreq = 0.040 + danger * 0.085;
      const flickerMag  = 0.45 + danger * 0.55;
      const flicker = flickerMag * (0.5 + Math.sin(now * flickerFreq) * 0.5);
      const unstableScale = 1.05 + Math.sin(now * (0.020 + danger * 0.020)) * (0.18 + danger * 0.20);
      this.unstableOverlay
        .setFillStyle(0xff2222, Math.min(0.95, flicker))
        .setScale(unstableScale + criticalIntensity * 0.35);
      this.outerRing.setFillStyle(0xff5544, 0.18 + danger * 0.30);
      this.dominanceShell.setFillStyle(0xff3333, Math.max(0.10, this.dominanceShell.fillAlpha * 0.85));
      this.body.setFillStyle(Phaser.Display.Color.GetColor(255, 220 - danger * 80, 220 - danger * 120));

      // Physical jitter — faster interval + larger magnitude under high pressure
      this.jitterTimer -= 1 / 60;
      if (this.jitterTimer <= 0) {
        const jMag = 4.5 + danger * 11;
        this.jitterOffset = {
          x: (Math.random() - 0.5) * jMag,
          y: (Math.random() - 0.5) * jMag,
        };
        this.jitterTimer = 0.018 + (1 - danger) * 0.022; // shorter interval = faster shake
      }
      this.gfx.setAngle((Math.random() - 0.5) * (8 + danger * 15));
      this.gfx.setScale(1 + criticalIntensity * 0.08);
    } else {
      this.unstableOverlay.setFillStyle(0xff2222, 0);
      this.unstableOverlay.setScale(1);
      this.jitterOffset = { x: 0, y: 0 };
      this.jitterTimer = 0;
      this.gfx.setAngle(0);
      this.gfx.setScale(1);
    }
  }

  private _applyVerticalOffsets(lift: number): void {
    const y = -lift;
    this.outerRing.setY(y);
    this.dominanceShell.setY(y);
    this.auraRing.setY(y);
    this.unstableOverlay.setY(y);
    this.body.setY(y);
    this.eyeDot.setY(-PLAYER.RADIUS * 0.3 + y);
  }

  private _updateShadow(
    auraNorm: number,
    pressureNorm: number,
    isUnstable: boolean,
    criticalIntensity: number
  ): void {
    const liftNorm = Phaser.Math.Clamp(this.levitationY / Math.max(1, PLAYER.LEVITATION_MAX_Y), 0, 1);
    const alpha = 0.36 - liftNorm * 0.22 + (isUnstable ? 0.08 : 0);
    const jitterWobble = isUnstable ? Math.sin(Date.now() * 0.04) * (2 + criticalIntensity * 6) : 0;
    this.shadow
      .setY(0)
      .setDisplaySize(
        PLAYER.RADIUS * (2.6 + auraNorm * 0.8 + jitterWobble * 0.08),
        PLAYER.RADIUS * (1.35 - liftNorm * 0.45 + pressureNorm * 0.10)
      )
      .setFillStyle(0x000000, Phaser.Math.Clamp(alpha, 0.14, 0.42));
  }

  /** Brief scale-up pulse when crossing into a new aura tier. */
  private _playTierTransitionPulse(): void {
    this.scene.tweens.add({
      targets: this.gfx,
      scaleX: 1.35,
      scaleY: 1.35,
      duration: 80,
      ease: "Quad.easeOut",
      yoyo: true,
    });
  }

  // ── State animations ──────────────────────────────────────────────────────

  /**
   * Break animation: spin-wobble → squash → collapse → bounce back.
   * More expressively "wrong" than the old version — reads as public failure.
   */
  playBreak(scene: Phaser.Scene, onDone: () => void): void {
    this.state = "breaking";
    this.jitterOffset = { x: 0, y: 0 };
    this.vx = 0;
    this.vy = 0;
    this.releaseBufferFrames = 0;
    this.chargeBufferFrames = 0;
    this._chargeDurationSec = 0;
    this._lastTierIndex = -1;

    this.body.setFillStyle(0xff3333);
    this.auraRing.setFillStyle(0xff3333, 0.8);
    this.outerRing.setFillStyle(0xff4400, 0.6);
    this.unstableOverlay.setFillStyle(0xff2222, 0);

    scene.cameras.main.shake(BREAK.SHAKE_DURATION_MS, BREAK.SHAKE_INTENSITY);

    // Rotation wobble (separate tween — angle is on the container)
    scene.tweens.add({
      targets: this.gfx,
      angle: 720, // full spin = aura escaping dramatically
      duration: 500,
      ease: "Cubic.easeIn",
    });

    // Squash-stretch collapse chain
    scene.tweens.chain({
      targets: this.gfx,
      tweens: [
        { scaleX: 2.2, scaleY: 0.3,  duration: 110, ease: "Expo.Out" },
        { scaleX: 0.5, scaleY: 1.6,  duration:  90, ease: "Quad.Out" },
        { scaleX: 1.0, scaleY: 1.0,  duration: 260, ease: "Bounce.Out" },
        // Brief fade-in of "recovery" state — make it look embarrassed
        { alpha: 0.4, duration: 80, ease: "Linear" },
        { alpha: 1.0, duration: 120, ease: "Linear" },
      ],
      onComplete: () => {
        this.gfx.setAngle(0); // reset rotation
        this.body.setFillStyle(0xffffff);
        this.auraRing.setFillStyle(0x4488ff, 0);
        this.outerRing.setFillStyle(0x4488ff, 0);
        this.state = "idle";
        this._isCharging = false;
        onDone();
      },
    });
  }

  /** Release animation — strong leaves a bigger impact imprint. */
  playRelease(scene: Phaser.Scene, isStrong: boolean): void {
    this.state = "releasing";
    this.jitterOffset = { x: 0, y: 0 };
    this.releaseBufferFrames = 0;
    this.chargeBufferFrames = 0;
    this._lastTierIndex = -1;

    this.releaseLocked = true;
    this.snapToGround(scene);
    scene.time.delayedCall(PLAYER.RELEASE_LOCK_MS, () => {
      this.releaseLocked = false;
    });

    const shakeIntensity = isStrong ? RELEASE.STRONG_SHAKE_INTENSITY : RELEASE.WEAK_SHAKE_INTENSITY;
    const shakeDuration  = isStrong ? RELEASE.STRONG_SHAKE_DURATION_MS : RELEASE.WEAK_SHAKE_DURATION_MS;
    scene.cameras.main.shake(shakeDuration, shakeIntensity);

    const targetScale = isStrong ? 3.6 : 2.0;
    const duration    = isStrong ? 550 : 280;

    if (isStrong) {
      // Hit-stop: brief time freeze for impact
      scene.time.timeScale = 0.05;
      scene.time.delayedCall(1, () => { scene.time.timeScale = 1.0; });
    }

    scene.tweens.add({
      targets: this.gfx,
      scaleX: targetScale,
      scaleY: targetScale,
      alpha: 0,
      duration,
      ease: "Expo.Out",
      onComplete: () => {
        this._applyVerticalOffsets(0);
        this.gfx.setAlpha(1).setScale(1);
        this.state = "idle";
        this._isCharging = false;
      },
    });
  }

  snapToGround(scene: Phaser.Scene): void {
    this.levitationY = 0;
    this._applyVerticalOffsets(0);
    scene.tweens.add({
      targets: [this.body, this.auraRing],
      scaleX: "+=0.08",
      scaleY: "-=0.12",
      duration: RELEASE.GROUND_SNAP_SQUASH_MS,
      ease: "Quad.Out",
      yoyo: true,
    });
  }

  getPosition() {
    return { x: this.x, y: this.y };
  }

  getMovementNorm(): number {
    const speed = Math.hypot(this.vx, this.vy);
    const topSpeed = this._isCharging
      ? PLAYER.SPEED * PLAYER.CHARGE_SPEED_MULT
      : PLAYER.SPEED;
    return Phaser.Math.Clamp(speed / Math.max(1, topSpeed), 0, 1);
  }

  /**
   * Catapult movement used by rare chaos hazards.
   * Player becomes temporarily airborne and cannot charge/move until landing.
   */
  launch(
    scene: Phaser.Scene,
    targetX: number,
    targetY: number,
    durationMs: number,
    arcHeight: number,
    onLand?: () => void
  ): void {
    if (this.state === "breaking") return;

    this.launchTween?.remove();
    this._airborne = true;
    this.releaseLocked = true;
    this._isCharging = false;
    this._wantsRelease = false;
    this.releaseBufferFrames = 0;
    this.chargeBufferFrames = 0;
    this._chargeDurationSec = 0;
    this.vx = 0;
    this.vy = 0;
    this.state = "launched";
    this.gfx.setScale(1.1);

    const startX = this.x;
    const startY = this.y;
    const anim = { t: 0 };
    this.launchTween = scene.tweens.add({
      targets: anim,
      t: 1,
      duration: durationMs,
      ease: "Sine.easeOut",
      onUpdate: () => {
        const t = anim.t;
        const arc = Math.sin(t * Math.PI) * arcHeight;
        this.x = Phaser.Math.Linear(startX, targetX, t);
        this.y = Phaser.Math.Linear(startY, targetY, t);
        this.gfx.setPosition(this.x, this.y - arc);
      },
      onComplete: () => {
        this.gfx.setPosition(this.x, this.y).setScale(1);
        this._airborne = false;
        this.releaseLocked = false;
        this.state = "idle";
        onLand?.();
      },
    });
  }

  destroy(): void {
    this.launchTween?.remove();
    this.gfx.destroy();
  }
}
