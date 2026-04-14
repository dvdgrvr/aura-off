/**
 * Player.ts
 * Player entity — movement, charge input, visual state.
 * Does NOT own gameplay state (aura/pressure live in models).
 * Receives state back from ArenaScene to drive visuals.
 */
import Phaser from "phaser";
import { PLAYER, ARENA, BREAK, RELEASE, VISUALS } from "../../config/GameConfig";
import { PlayerState } from "../../core/types";

const RING_COLORS = [0x6688cc, 0x44aaff, 0xffcc22, 0xff6600];

const TIER_VISUALS = [
  { pulseSpeed: 0.0013, auraGrowth: 0.75, rimAlpha: 0.18 },
  { pulseSpeed: 0.0020, auraGrowth: 1.0, rimAlpha: 0.24 },
  { pulseSpeed: 0.0028, auraGrowth: 1.32, rimAlpha: 0.30 },
  { pulseSpeed: 0.0040, auraGrowth: 1.66, rimAlpha: 0.38 },
];

export class Player {
  x: number;
  y: number;
  state: PlayerState = "idle";

  private scene: Phaser.Scene;
  private gfx: Phaser.GameObjects.Container;

  // Grounded layers.
  private shadow: Phaser.GameObjects.Ellipse;
  private shadowCore: Phaser.GameObjects.Ellipse;
  private groundAnchor: Phaser.GameObjects.Ellipse;
  private anchorCore: Phaser.GameObjects.Ellipse;
  private anchorPulse: Phaser.GameObjects.Ellipse;

  // Lifted layers.
  private auraOuter: Phaser.GameObjects.Ellipse;
  private auraMid: Phaser.GameObjects.Ellipse;
  private auraCore: Phaser.GameObjects.Ellipse;
  private unstableCorona: Phaser.GameObjects.Ellipse;
  private avatar?: Phaser.GameObjects.Sprite;
  private avatarBaseScale: number = 1;
  private avatarAnimState: "idle" | "move" | "charge" | "unstable" = "idle";
  private avatarOneShotActive: boolean = false;
  private bodyShell: Phaser.GameObjects.Ellipse;
  private bodyTorso: Phaser.GameObjects.Ellipse;
  private bodyHead: Phaser.GameObjects.Ellipse;
  private bodyRim: Phaser.GameObjects.Ellipse;
  private bodyChest: Phaser.GameObjects.Ellipse;
  private liftedLayers: Phaser.GameObjects.Shape[];

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyX!: Phaser.Input.Keyboard.Key;

  // Movement
  private vx: number = 0;
  private vy: number = 0;
  private facingX: number = 1;

  // Charge state
  private _isCharging: boolean = false;
  private _chargeDurationSec: number = 0;
  private chargeBufferFrames: number = 0;

  // Release state
  private _wantsRelease: boolean = false;
  private releaseBufferFrames: number = 0;
  private releaseLocked: boolean = false;
  private _airborne: boolean = false;
  private launchTween?: Phaser.Tweens.Tween;

  private jitterOffset: { x: number; y: number } = { x: 0, y: 0 };
  private jitterTimer: number = 0;
  private _lastTierIndex: number = -1;
  private levitationY: number = 0;
  private idlePhase: number = Math.random() * Math.PI * 2;

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
    const pv = VISUALS.PLAYER;

    this.shadow = scene.add.ellipse(0, 0, R * pv.SHADOW_WIDTH, R * pv.SHADOW_HEIGHT, 0x000000, pv.SHADOW_BASE_ALPHA);
    this.shadowCore = scene.add.ellipse(0, 0, R * pv.SHADOW_CORE_WIDTH, R * pv.SHADOW_CORE_HEIGHT, 0x000000, pv.SHADOW_CORE_ALPHA);
    this.groundAnchor = scene.add.ellipse(0, 0, R * 2.7, R * 1.35, VISUALS.PALETTE.AURA_COOL, pv.ANCHOR_BASE_ALPHA);
    this.anchorCore = scene.add.ellipse(0, 0, R * 1.84, R * 0.92, VISUALS.PALETTE.AURA_RELEASE, pv.ANCHOR_CORE_ALPHA);
    this.anchorPulse = scene.add.ellipse(0, 0, R * 2.7, R * 1.35, VISUALS.PALETTE.AURA_RELEASE, 0);

    this.auraOuter = scene.add.ellipse(0, 0, R * pv.AURA_OUTER_SIZE, R * pv.AURA_OUTER_SIZE, VISUALS.PALETTE.AURA_COOL, 0);
    this.auraMid = scene.add.ellipse(0, 0, R * pv.AURA_MID_SIZE, R * pv.AURA_MID_SIZE, VISUALS.PALETTE.AURA_COOL, 0);
    this.auraCore = scene.add.ellipse(0, 0, R * pv.AURA_CORE_SIZE, R * pv.AURA_CORE_SIZE, VISUALS.PALETTE.AURA_RELEASE, 0);
    this.unstableCorona = scene.add.ellipse(0, 0, R * 5.2, R * 5.2, VISUALS.PALETTE.AURA_UNSTABLE, 0);
    if (scene.textures.exists("player_anim_idle")) {
      this._ensureAvatarAnimations(scene);
      this.avatar = scene.add
        .sprite(0, 4, "player_anim_idle", 0)
        .setOrigin(0.5, 0.84)
        .setDisplaySize(R * 2.9, R * 2.9);
      this.avatarBaseScale = this.avatar.scaleX;
      this.avatar.play("player_avatar_idle_anim");
    } else if (scene.textures.exists("mp_avatar_hoodie_cyan")) {
      this.avatar = scene.add
        .sprite(0, 4, "mp_avatar_hoodie_cyan", 0)
        .setOrigin(0.5, 0.84)
        .setDisplaySize(R * 2.9, R * 2.9);
      this.avatarBaseScale = this.avatar.scaleX;
    }

    // Minimal capsule-like silhouette from torso + head + rim.
    this.bodyShell = scene.add.ellipse(
      0,
      -R * 0.04,
      R * pv.BODY_SHELL_WIDTH,
      R * pv.BODY_SHELL_HEIGHT,
      pv.BODY_SHELL_COLOR,
      1
    );
    this.bodyTorso = scene.add.ellipse(
      0,
      0,
      R * pv.BODY_TORSO_WIDTH,
      R * pv.BODY_TORSO_HEIGHT,
      pv.BODY_BASE_COLOR,
      1
    );
    this.bodyHead = scene.add.ellipse(0, -R * 0.62, R * pv.BODY_HEAD_WIDTH, R * pv.BODY_HEAD_HEIGHT, pv.BODY_BASE_COLOR, 1);
    this.bodyRim = scene.add.ellipse(0, -R * 0.2, R * 1.08, R * 1.68, pv.RIM_COLOR, pv.RIM_BASE_ALPHA);
    this.bodyChest = scene.add.ellipse(0, -R * 0.34, R * pv.BODY_CHEST_WIDTH, R * pv.BODY_CHEST_HEIGHT, pv.BODY_CHEST_COLOR, 0.12);

    this.liftedLayers = [
      this.auraOuter,
      this.auraMid,
      this.auraCore,
      this.unstableCorona,
      this.bodyShell,
      this.bodyTorso,
      this.bodyHead,
      this.bodyRim,
      this.bodyChest,
    ];

    this.gfx = scene.add.container(x, y, [
      this.shadow,
      this.shadowCore,
      this.groundAnchor,
      this.anchorCore,
      this.anchorPulse,
      this.auraOuter,
      this.auraMid,
      this.auraCore,
      this.unstableCorona,
      ...(this.avatar ? [this.avatar] : []),
      this.bodyShell,
      this.bodyTorso,
      this.bodyHead,
      this.bodyRim,
      this.bodyChest,
    ]);
    this.gfx.setDepth(8);
    if (this.avatar) {
      // Keep the old silhouette layers as a faint compositional backplate under the avatar art.
      this.bodyShell.setAlpha(0.08);
      this.bodyTorso.setAlpha(0.08);
      this.bodyHead.setAlpha(0.08);
      this.bodyRim.setAlpha(0.05);
      this.bodyChest.setAlpha(0);
    }

    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
      this.keyW = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.keyA = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyS = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
      this.keyD = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
      this.keySpace = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.keyX = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
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

  private _updateMovement(_dtSec: number): void {
    let inputX = 0;
    let inputY = 0;
    if (this.keyA?.isDown || this.cursors?.left.isDown) inputX -= 1;
    if (this.keyD?.isDown || this.cursors?.right.isDown) inputX += 1;
    if (this.keyW?.isDown || this.cursors?.up.isDown) inputY -= 1;
    if (this.keyS?.isDown || this.cursors?.down.isDown) inputY += 1;

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
  }

  private _applyPosition(): void {
    this.x = Phaser.Math.Clamp(this.x + this.vx / 60, this.minX, this.maxX);
    this.y = Phaser.Math.Clamp(this.y + this.vy / 60, this.minY, this.maxY);
    this.gfx.setPosition(this.x + this.jitterOffset.x, this.y + this.jitterOffset.y);
  }

  private _ensureAvatarAnimations(scene: Phaser.Scene): void {
    if (!scene.anims.exists("player_avatar_idle_anim")) {
      scene.anims.create({
        key: "player_avatar_idle_anim",
        frames: scene.anims.generateFrameNumbers("player_anim_idle", { start: 0, end: 5 }),
        frameRate: 7,
        repeat: -1,
      });
    }
    if (!scene.anims.exists("player_avatar_charge_anim")) {
      scene.anims.create({
        key: "player_avatar_charge_anim",
        frames: scene.anims.generateFrameNumbers("player_anim_charge", { start: 0, end: 7 }),
        frameRate: 10,
        repeat: -1,
      });
    }
    if (!scene.anims.exists("player_avatar_move_anim")) {
      scene.anims.create({
        key: "player_avatar_move_anim",
        frames: scene.anims.generateFrameNumbers("player_anim_idle", { start: 0, end: 5 }),
        frameRate: 13,
        repeat: -1,
      });
    }
    if (!scene.anims.exists("player_avatar_unstable_anim")) {
      scene.anims.create({
        key: "player_avatar_unstable_anim",
        frames: scene.anims.generateFrameNumbers("player_anim_unstable", { start: 0, end: 7 }),
        frameRate: 14,
        repeat: -1,
      });
    }
    if (!scene.anims.exists("player_avatar_release_anim")) {
      scene.anims.create({
        key: "player_avatar_release_anim",
        frames: scene.anims.generateFrameNumbers("player_anim_release", { start: 0, end: 7 }),
        frameRate: 14,
        repeat: 0,
      });
    }
    if (!scene.anims.exists("player_avatar_break_anim")) {
      scene.anims.create({
        key: "player_avatar_break_anim",
        frames: scene.anims.generateFrameNumbers("player_anim_break", { start: 0, end: 7 }),
        frameRate: 16,
        repeat: 0,
      });
    }
  }

  private _setAvatarAnim(state: "idle" | "move" | "charge" | "unstable"): void {
    if (!this.avatar || this.avatarOneShotActive || this.avatarAnimState === state || this.avatar.texture.key === "mp_avatar_hoodie_cyan") {
      return;
    }
    this.avatarAnimState = state;
    const key =
      state === "unstable"
        ? "player_avatar_unstable_anim"
        : state === "move"
          ? "player_avatar_move_anim"
        : state === "charge"
          ? "player_avatar_charge_anim"
          : "player_avatar_idle_anim";
    this.avatar.play(key, true);
  }

  applyVisuals(
    auraNorm: number,
    pressureNorm: number,
    tierColorIndex: number,
    isUnstable: boolean,
    dangerIntensity: number,
    criticalIntensity: number
  ): void {
    const tier = Phaser.Math.Clamp(tierColorIndex, 0, RING_COLORS.length - 1);
    const ringColor = RING_COLORS[tier];
    const tv = TIER_VISUALS[tier];
    const now = Date.now();
    const isChargeActive = this._isCharging && this.state !== "releasing";
    const movementNorm = this.getMovementNorm();
    const isMoving = movementNorm >= VISUALS.PLAYER.MOVE_ANIM_THRESHOLD && !isChargeActive;
    if (!this.avatarOneShotActive) {
      this._setAvatarAnim(isUnstable ? "unstable" : isChargeActive ? "charge" : isMoving ? "move" : "idle");
    }

    const levitationTarget = isChargeActive
      ? PLAYER.LEVITATION_BASE_Y +
      auraNorm * (PLAYER.LEVITATION_MAX_Y - PLAYER.LEVITATION_BASE_Y) +
      criticalIntensity * 5.2
      : 0;
    this.levitationY += (levitationTarget - this.levitationY) * (isChargeActive ? 0.1 : 0.28);

    const bobSpeed = Phaser.Math.Linear(
      PLAYER.LEVITATION_BOB_SPEED,
      PLAYER.LEVITATION_CRITICAL_BOB_SPEED,
      criticalIntensity
    );
    const bobAmp = Phaser.Math.Linear(
      PLAYER.LEVITATION_BOB_AMPLITUDE,
      PLAYER.LEVITATION_CRITICAL_BOB_AMPLITUDE,
      criticalIntensity
    ) * (0.35 + auraNorm * 0.65);
    const bob = isChargeActive ? Math.sin(now * bobSpeed) * bobAmp : 0;
    const visualLift = this.levitationY + bob;

    this._applyVerticalOffsets(visualLift);
    this._updateShadowAndAnchor(auraNorm, pressureNorm, isUnstable, criticalIntensity);

    if (this._lastTierIndex !== tierColorIndex) {
      if (this._lastTierIndex >= 0) this._playTierTransitionPulse();
      this._lastTierIndex = tierColorIndex;
    }

    const lowAuraFactor = Phaser.Math.Clamp(auraNorm / 0.3, 0, 1);
    const auraPulse = Math.sin(now * tv.pulseSpeed);
    const unevenPulse = Math.sin(now * (tv.pulseSpeed * 1.7) + 0.8);
    const idleBreathe = Math.sin(now * 0.0016 + this.idlePhase);
    const heartbeatGate = Phaser.Math.Clamp(
      (criticalIntensity - VISUALS.PLAYER.HEARTBEAT_START_CRITICAL) /
      (1 - VISUALS.PLAYER.HEARTBEAT_START_CRITICAL),
      0,
      1
    );
    const heartbeatWave = Math.sin(now * VISUALS.PLAYER.HEARTBEAT_FREQ);
    const heartbeatSpike = heartbeatWave > 0.82
      ? (heartbeatWave - 0.82) / 0.18
      : 0;
    const heartbeatKick = heartbeatSpike * VISUALS.PLAYER.HEARTBEAT_SPIKE_SCALE * heartbeatGate;
    const baseOuterScale = 0.82 + auraNorm * (0.95 + tv.auraGrowth);
    const baseMidScale = 0.76 + auraNorm * (0.82 + tv.auraGrowth * 0.6);
    const baseCoreScale = 0.74 + auraNorm * (0.64 + tv.auraGrowth * 0.4);

    if (isChargeActive) {
      this.auraOuter
        .setFillStyle(ringColor, VISUALS.PLAYER.AURA_OUTER_STABLE_ALPHA * (0.32 + lowAuraFactor * 0.48 + auraNorm * 0.72 + auraPulse * 0.18))
        .setScale(baseOuterScale + auraPulse * 0.06 + unevenPulse * 0.03 + heartbeatKick);
      this.auraMid
        .setFillStyle(ringColor, VISUALS.PLAYER.AURA_MID_STABLE_ALPHA * (0.35 + lowAuraFactor * 0.44 + auraNorm * 0.75 + unevenPulse * 0.2))
        .setScale(baseMidScale + auraPulse * 0.05 + heartbeatKick * 0.75);
      this.auraCore
        .setFillStyle(ringColor, VISUALS.PLAYER.AURA_CORE_STABLE_ALPHA * (0.3 + lowAuraFactor * 0.42 + auraNorm * 0.85))
        .setScale(baseCoreScale + auraPulse * 0.04 + heartbeatKick * 0.55);
    } else {
      const lowAuraAlpha = VISUALS.PLAYER.LOW_AURA_ALPHA_MULT;
      this.auraOuter
        .setFillStyle(ringColor, auraNorm * VISUALS.PLAYER.AURA_OUTER_STABLE_ALPHA * 0.58 * lowAuraAlpha)
        .setScale(0.74 + auraNorm * 0.72 + idleBreathe * 0.015);
      this.auraMid
        .setFillStyle(ringColor, auraNorm * VISUALS.PLAYER.AURA_MID_STABLE_ALPHA * 0.56 * lowAuraAlpha)
        .setScale(0.72 + auraNorm * 0.55 + idleBreathe * 0.01);
      this.auraCore
        .setFillStyle(ringColor, auraNorm * VISUALS.PLAYER.AURA_CORE_STABLE_ALPHA * 0.52 * lowAuraAlpha)
        .setScale(0.68 + auraNorm * 0.42 + idleBreathe * 0.008);
    }

    const moveLean = (this.vx / Math.max(1, PLAYER.SPEED)) * VISUALS.PLAYER.MOVE_LEAN_DEG * movementNorm;
    const bodyLean = (this.vx / Math.max(1, PLAYER.SPEED)) * 8 + moveLean;
    const movePulse = isMoving ? Math.sin(now * VISUALS.PLAYER.MOVE_BOB_SPEED) : 0;
    const moveScale = isMoving ? VISUALS.PLAYER.MOVE_SCALE_BOOST * movementNorm : 0;
    const bodyScale = isChargeActive
      ? 1.03 + auraNorm * 0.26
      : 1.0 + auraNorm * 0.1 + moveScale + movePulse * 0.012;
    this.bodyShell.setScale(1.02 + auraNorm * 0.18).setAngle(bodyLean * 0.3);
    this.bodyTorso.setScale(bodyScale).setAngle(bodyLean * 0.4);
    this.bodyHead
      .setX(this.facingX * (1.2 + auraNorm * 1.6))
      .setScale(1 + auraNorm * 0.06)
      .setAngle(bodyLean * 0.7);
    this.bodyRim
      .setScale(1 + auraNorm * 0.28)
      .setX(this.facingX * VISUALS.PLAYER.RIM_FACING_SHIFT)
      .setAlpha(VISUALS.PLAYER.RIM_BASE_ALPHA + tv.rimAlpha + auraNorm * 0.12 + (isChargeActive ? 0.05 : 0));
    this.bodyChest
      .setX(this.facingX * (0.9 + auraNorm * 0.6))
      .setScale(1 + auraNorm * 0.08)
      .setAlpha(0.1 + auraNorm * 0.16 + (isChargeActive ? 0.08 : 0));
    if (this.avatar) {
      const avatarScale = this.avatarBaseScale * (1 + auraNorm * 0.03 + (isChargeActive ? 0.02 : 0) + moveScale);
      this.avatar
        .setFlipX(this.facingX < 0)
        .setScale(avatarScale)
        .setAngle(bodyLean * 0.3)
        .setY(this.avatar.y + movePulse * VISUALS.PLAYER.MOVE_BOB_AMPLITUDE * movementNorm);
      this.bodyShell.setAlpha(0.08);
      this.bodyTorso.setAlpha(0.08);
      this.bodyHead.setAlpha(0.08);
      this.bodyRim.setAlpha(0.05);
      this.bodyChest.setAlpha(0);
    }

    if (dangerIntensity > 0 && !isUnstable) {
      const warm = Phaser.Math.Clamp(dangerIntensity, 0, 1);
      this.bodyShell.setFillStyle(VISUALS.PLAYER.BODY_SHELL_COLOR);
      this.bodyTorso.setFillStyle(Phaser.Display.Color.GetColor(54 + warm * 30, 34 + warm * 10, 47 - warm * 8));
      this.bodyHead.setFillStyle(VISUALS.PLAYER.BODY_DANGER_COLOR);
      this.auraMid.setFillStyle(VISUALS.PALETTE.AURA_WARM, Math.max(this.auraMid.fillAlpha, 0.14 + warm * 0.2));
      this.avatar?.setTint(0xffd9cf);
    } else if (isChargeActive) {
      this.bodyShell.setFillStyle(VISUALS.PLAYER.BODY_SHELL_COLOR);
      this.bodyTorso.setFillStyle(VISUALS.PLAYER.BODY_CHARGE_COLOR);
      this.bodyHead.setFillStyle(VISUALS.PLAYER.BODY_CHARGE_COLOR);
      this.avatar?.setTint(0xe8f4ff);
    } else {
      this.bodyShell.setFillStyle(VISUALS.PLAYER.BODY_SHELL_COLOR);
      this.bodyTorso.setFillStyle(VISUALS.PLAYER.BODY_BASE_COLOR);
      this.bodyHead.setFillStyle(VISUALS.PLAYER.BODY_BASE_COLOR);
      this.avatar?.clearTint();
    }

    if (isUnstable) {
      const danger = Math.max(0, (pressureNorm - 0.5) / 0.5);
      const flicker = 0.32 + (0.5 + Math.sin(now * (0.046 + danger * 0.094)) * 0.5) * (0.52 + danger * 0.44);
      const warp = Math.sin(now * (0.032 + danger * 0.05));
      this.unstableCorona
        .setFillStyle(VISUALS.PALETTE.AURA_UNSTABLE, Math.min(0.95, flicker))
        .setScale(1.04 + auraNorm * 0.48 + Math.sin(now * 0.024) * (0.12 + danger * 0.24))
        .setAngle(Math.sin(now * 0.03) * (7 + danger * 14));

      this.auraOuter.setFillStyle(VISUALS.PALETTE.AURA_UNSTABLE, Math.max(this.auraOuter.fillAlpha, VISUALS.PLAYER.AURA_OUTER_UNSTABLE_ALPHA + danger * 0.22));
      this.auraOuter.setX(warp * (VISUALS.PLAYER.UNSTABLE_AURA_OFFSET + danger * 4));
      this.auraMid
        .setFillStyle(VISUALS.PALETTE.AURA_UNSTABLE, Math.max(this.auraMid.fillAlpha, VISUALS.PLAYER.AURA_MID_UNSTABLE_ALPHA + danger * 0.16))
        .setX(-warp * (VISUALS.PLAYER.UNSTABLE_AURA_OFFSET * 0.7 + danger * 2.2));
      this.auraCore
        .setFillStyle(VISUALS.PALETTE.AURA_UNSTABLE, Math.max(this.auraCore.fillAlpha, VISUALS.PLAYER.AURA_CORE_UNSTABLE_ALPHA + danger * 0.12))
        .setAngle(warp * VISUALS.PLAYER.UNSTABLE_WARP_DEGREES + heartbeatKick * 24)
        .setScale(this.auraCore.scaleX + heartbeatKick * 0.3, this.auraCore.scaleY + heartbeatKick * 0.3);
      this.bodyShell.setFillStyle(Phaser.Display.Color.GetColor(18 + danger * 18, 16 + danger * 8, 24 + danger * 10));
      this.bodyTorso.setFillStyle(Phaser.Display.Color.GetColor(84 + danger * 84, 42 + danger * 22, 50 + danger * 12));
      this.bodyHead.setFillStyle(Phaser.Display.Color.GetColor(96 + danger * 72, 44 + danger * 18, 52 + danger * 8));
      this.bodyChest.setAlpha(0.18 + danger * 0.24);
      this.avatar?.setTint(0xffb4bd);

      this.jitterTimer -= 1 / 60;
      if (this.jitterTimer <= 0) {
        const jMag = 3.8 + danger * 10.4;
        this.jitterOffset = {
          x: (Math.random() - 0.5) * jMag,
          y: (Math.random() - 0.5) * jMag,
        };
        this.jitterTimer = 0.018 + (1 - danger) * 0.024;
      }
      this.gfx.setScale(1 + criticalIntensity * 0.08);
    } else {
      this.unstableCorona.setFillStyle(VISUALS.PALETTE.AURA_UNSTABLE, 0).setScale(1).setAngle(0);
      this.auraOuter.setX(0);
      this.auraMid.setX(0);
      this.auraCore.setAngle(0);
      this.jitterOffset = { x: 0, y: 0 };
      this.jitterTimer = 0;
      this.gfx.setScale(1);
    }
  }

  private _applyVerticalOffsets(lift: number): void {
    const y = -lift;
    if (this.avatar) {
      this.avatar.setY(y + 4);
    }
    for (const layer of this.liftedLayers) {
      if (layer === this.bodyHead) {
        layer.setY(y - PLAYER.RADIUS * 0.62);
      } else if (layer === this.bodyChest) {
        layer.setY(y - PLAYER.RADIUS * 0.34);
      } else if (layer === this.bodyShell) {
        layer.setY(y - PLAYER.RADIUS * 0.04);
      } else {
        layer.setY(y);
      }
    }
  }

  private _updateShadowAndAnchor(
    auraNorm: number,
    pressureNorm: number,
    isUnstable: boolean,
    criticalIntensity: number
  ): void {
    const pv = VISUALS.PLAYER;
    const liftNorm = Phaser.Math.Clamp(this.levitationY / Math.max(1, PLAYER.LEVITATION_MAX_Y), 0, 1);
    const alpha = pv.SHADOW_BASE_ALPHA - liftNorm * 0.2 + (isUnstable ? 0.08 : 0);
    const jitterWobble = isUnstable ? Math.sin(Date.now() * 0.036) * (2 + criticalIntensity * 7) : 0;
    const shadowDesync = isUnstable
      ? Math.sin(Date.now() * VISUALS.PLAYER.HEARTBEAT_FREQ * 0.76) *
      VISUALS.PLAYER.SHADOW_UNSTABLE_DESYNC_Y * (0.35 + criticalIntensity * 0.65)
      : 0;
    this.shadow
      .setDisplaySize(
        PLAYER.RADIUS * (pv.SHADOW_WIDTH + auraNorm * pv.SHADOW_AURA_GROWTH + jitterWobble * 0.06),
        PLAYER.RADIUS * (pv.SHADOW_HEIGHT - liftNorm * 0.34 + pressureNorm * 0.12)
      )
      .setFillStyle(0x000000, Phaser.Math.Clamp(alpha, pv.SHADOW_MIN_ALPHA, pv.SHADOW_MAX_ALPHA))
      .setY(1.4 + liftNorm * 2.2 + shadowDesync);
    this.shadowCore
      .setDisplaySize(
        PLAYER.RADIUS * (pv.SHADOW_CORE_WIDTH + auraNorm * 0.2),
        PLAYER.RADIUS * (pv.SHADOW_CORE_HEIGHT - liftNorm * 0.16 + pressureNorm * 0.04)
      )
      .setFillStyle(0x000000, pv.SHADOW_CORE_ALPHA + (isUnstable ? 0.05 : 0))
      .setY(1.0 + liftNorm * 1.8 + shadowDesync * 0.6);

    const pulse = 0.5 + Math.sin(Date.now() * 0.006) * 0.5;
    const chargeAlpha = this._isCharging ? VISUALS.PLAYER.ANCHOR_CHARGE_ALPHA : VISUALS.PLAYER.ANCHOR_BASE_ALPHA;
    this.groundAnchor
      .setFillStyle(VISUALS.PALETTE.AURA_COOL, chargeAlpha * (0.84 + auraNorm * 0.4))
      .setDisplaySize(
        PLAYER.RADIUS * 2.7 * (pv.ANCHOR_BASE_SCALE + auraNorm * 0.35),
        PLAYER.RADIUS * 1.35 * (pv.ANCHOR_BASE_SCALE + auraNorm * 0.25)
      );
    this.anchorCore
      .setFillStyle(VISUALS.PALETTE.AURA_RELEASE, pv.ANCHOR_CORE_ALPHA * (0.65 + auraNorm * 0.5 + (this._isCharging ? 0.22 : 0)))
      .setDisplaySize(
        PLAYER.RADIUS * 1.84 * (pv.ANCHOR_BASE_SCALE + auraNorm * 0.2 + pulse * 0.1),
        PLAYER.RADIUS * 0.92 * (pv.ANCHOR_BASE_SCALE + auraNorm * 0.14 + pulse * 0.06)
      );
    this.anchorPulse
      .setFillStyle(VISUALS.PALETTE.AURA_RELEASE, this._isCharging ? 0.04 + auraNorm * 0.2 + pulse * 0.08 : 0)
      .setDisplaySize(
        PLAYER.RADIUS * 2.7 * (1.0 + auraNorm * 0.42 + pulse * (pv.ANCHOR_PULSE_SCALE - pv.ANCHOR_BASE_SCALE)),
        PLAYER.RADIUS * 1.35 * (1.0 + auraNorm * 0.25 + pulse * 0.2)
      );
  }

  private _playTierTransitionPulse(): void {
    this.scene.tweens.add({
      targets: [this.auraMid, this.auraCore],
      scaleX: "+=0.18",
      scaleY: "+=0.18",
      duration: 85,
      ease: "Quad.easeOut",
      yoyo: true,
    });
  }

  playBreak(scene: Phaser.Scene, onDone: () => void): void {
    this.state = "breaking";
    this.jitterOffset = { x: 0, y: 0 };
    this.vx = 0;
    this.vy = 0;
    this.releaseBufferFrames = 0;
    this.chargeBufferFrames = 0;
    this._chargeDurationSec = 0;
    this._lastTierIndex = -1;

    scene.cameras.main.shake(BREAK.SHAKE_DURATION_MS, BREAK.SHAKE_INTENSITY);

    if (this.avatar && this.avatar.texture.key !== "mp_avatar_hoodie_cyan") {
      this.avatarOneShotActive = true;
      this.avatar.play("player_avatar_break_anim", true);
    }
    this.unstableCorona.setFillStyle(VISUALS.PALETTE.AURA_UNSTABLE, 0.7);
    this.avatar?.setTint(0xff8da1).setScale(this.avatarBaseScale * 1.04);
    this.bodyShell.setFillStyle(0x1d0f17);
    this.auraOuter.setFillStyle(VISUALS.PALETTE.AURA_BREAK, Math.max(0.25, this.auraOuter.fillAlpha));
    this.auraMid.setFillStyle(VISUALS.PALETTE.AURA_BREAK, Math.max(0.35, this.auraMid.fillAlpha));
    this.bodyTorso.setFillStyle(0x5a1c24);
    this.bodyHead.setFillStyle(0x5a1c24);
    this.bodyChest.setAlpha(0.28);
    this.anchorPulse.setFillStyle(VISUALS.PLAYER.BREAK_COLLAPSE_COLOR, 0.42);

    const breakCollapse = scene.add.ellipse(this.x, this.y, 150, 82, VISUALS.PLAYER.BREAK_COLLAPSE_COLOR, 0.45).setDepth(11);
    scene.tweens.add({
      targets: breakCollapse,
      displayWidth: 34,
      displayHeight: 20,
      alpha: 0,
      duration: 260,
      ease: "Expo.In",
      onComplete: () => breakCollapse.destroy(),
    });

    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 * i) / 7 + Math.random() * 0.6;
      const startX = this.x + Math.cos(angle) * (26 + Math.random() * 14);
      const startY = this.y + Math.sin(angle) * (16 + Math.random() * 10);
      const mote = scene.add.ellipse(startX, startY, 8, 5, VISUALS.PALETTE.AURA_BREAK, 0.6).setDepth(11);
      scene.tweens.add({
        targets: mote,
        x: this.x + (Math.random() - 0.5) * 12,
        y: this.y + (Math.random() - 0.5) * 9,
        scaleX: 0.35,
        scaleY: 0.35,
        alpha: 0,
        duration: 220 + Math.random() * 110,
        ease: "Cubic.easeIn",
        onComplete: () => mote.destroy(),
      });
    }

    scene.tweens.chain({
      targets: this.gfx,
      tweens: [
        { scaleX: 1.42, scaleY: 0.54, duration: 90, ease: "Expo.Out" },
        { scaleX: 0.62, scaleY: 1.38, duration: 95, ease: "Quad.Out" },
        { scaleX: 0.84, scaleY: 0.84, duration: 120, ease: "Quad.In" },
        { scaleX: 1.0, scaleY: 1.0, duration: 220, ease: "Bounce.Out" },
      ],
      onComplete: () => {
        this.unstableCorona.setFillStyle(VISUALS.PALETTE.AURA_UNSTABLE, 0);
        this.auraOuter.setFillStyle(VISUALS.PALETTE.AURA_COOL, 0);
        this.auraMid.setFillStyle(VISUALS.PALETTE.AURA_COOL, 0);
        this.auraCore.setFillStyle(VISUALS.PALETTE.AURA_RELEASE, 0);
        this.bodyShell.setFillStyle(VISUALS.PLAYER.BODY_SHELL_COLOR);
        this.bodyTorso.setFillStyle(VISUALS.PLAYER.BODY_BASE_COLOR);
        this.bodyHead.setFillStyle(VISUALS.PLAYER.BODY_BASE_COLOR);
        this.bodyChest.setAlpha(0.12);
        this.avatar?.clearTint().setScale(this.avatarBaseScale);
        this.avatarOneShotActive = false;
        this._setAvatarAnim("idle");
        this.anchorPulse.setFillStyle(VISUALS.PALETTE.AURA_RELEASE, 0);
        this.state = "idle";
        this._isCharging = false;
        onDone();
      },
    });
  }

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
    const shakeDuration = isStrong ? RELEASE.STRONG_SHAKE_DURATION_MS : RELEASE.WEAK_SHAKE_DURATION_MS;
    scene.cameras.main.shake(shakeDuration, shakeIntensity);

    if (isStrong) {
      scene.time.timeScale = 0.05;
      scene.time.delayedCall(1, () => { scene.time.timeScale = 1.0; });
    }
    if (this.avatar && this.avatar.texture.key !== "mp_avatar_hoodie_cyan") {
      this.avatarOneShotActive = true;
      this.avatar.play("player_avatar_release_anim", true);
    }

    scene.tweens.add({
      targets: [this.auraOuter, this.auraMid, this.auraCore],
      scaleX: isStrong ? 2.1 : 1.55,
      scaleY: isStrong ? 2.1 : 1.55,
      alpha: 0,
      duration: isStrong ? 360 : 220,
      ease: "Expo.Out",
    });

    const releaseBloom = scene
      .add.ellipse(this.x, this.y, 42, 22, VISUALS.PLAYER.RELEASE_BLOOM_COLOR, isStrong ? 0.52 : 0.34)
      .setDepth(11);
    scene.tweens.add({
      targets: releaseBloom,
      displayWidth: isStrong ? 520 : 260,
      displayHeight: isStrong ? 280 : 140,
      alpha: 0,
      duration: isStrong ? 360 : 240,
      ease: "Expo.Out",
      onComplete: () => releaseBloom.destroy(),
    });

    scene.tweens.add({
      targets: [this.bodyTorso, this.bodyHead],
      scaleX: isStrong ? 1.2 : 1.1,
      scaleY: isStrong ? 0.8 : 0.9,
      duration: 95,
      yoyo: true,
      ease: "Quad.Out",
      onComplete: () => {
        this._applyVerticalOffsets(0);
        this.auraOuter.setFillStyle(VISUALS.PALETTE.AURA_COOL, 0).setScale(1);
        this.auraMid.setFillStyle(VISUALS.PALETTE.AURA_COOL, 0).setScale(1);
        this.auraCore.setFillStyle(VISUALS.PALETTE.AURA_RELEASE, 0).setScale(1);
        this.avatar?.clearTint().setScale(this.avatarBaseScale);
        this.avatarOneShotActive = false;
        this._setAvatarAnim("idle");
        this.state = "idle";
        this._isCharging = false;
      },
    });
  }

  snapToGround(scene: Phaser.Scene): void {
    this.levitationY = 0;
    this._applyVerticalOffsets(0);
    scene.tweens.add({
      targets: [this.bodyTorso, this.bodyHead],
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
