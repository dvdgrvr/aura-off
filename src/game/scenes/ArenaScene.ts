/**
 * ArenaScene.ts
 * Orchestration layer only.
 *
 * Wires together:
 *   Player ← input + visual
 *   NpcCrowdController ← crowd behavior
 *   AuraSystem / PressureSystem / BreakSystem / ReleaseSystem ← gameplay rules
 *   AuraModel / PressureModel / RunState ← state
 *   Hud ← display
 *
 * Rule: gameplay logic does NOT live here.
 * Rule: do not put pressure/aura math inside this file.
 */
import Phaser from "phaser";
import {
  ARENA,
  AURA,
  BREAK,
  RELEASE,
  CAMERA,
  HAZARD_NOISE_PULSE,
  VISUALS,
} from "../config/GameConfig";
import { CoreGameplaySnapshot, GameplaySyncEvent } from "../core/multiplayerContracts";
import { HazardScheduler } from "../systems/HazardScheduler";
import { GameplayStateCoordinator } from "../systems/GameplayStateCoordinator";
import { sessionLore } from "../systems/SessionLoreSystem";
import { LaunchPadChaos, LaunchPadPayload } from "../entities/hazards/LaunchPadChaos";
import { NoisePulse } from "../entities/hazards/NoisePulse";
import { Player } from "../entities/player/Player";
import { NpcCrowdController } from "../entities/npc/NpcCrowdController";
import { Hud } from "../ui/Hud";
import { RoundResult } from "../core/types";
import { MobileInput } from "../input/MobileInput";

export class ArenaScene extends Phaser.Scene {
  // --- Gameplay state coordinator ---
  private gameplay!: GameplayStateCoordinator;

  // --- Entities ---
  private player!: Player;
  private crowd!: NpcCrowdController;

  // --- UI ---
  private hud!: Hud;

  // --- Scene flags ---
  private breakLocked: boolean = false;
  private roundEnded: boolean = false;
  private playMode: "training" | "match" = "match";
  private trainingStep = 0;
  private sawUnstableInTraining = false;
  private trainingObjectiveText?: Phaser.GameObjects.Text;

  // --- Visual objects ---
  private _arenaFloor!: Phaser.GameObjects.Rectangle;
  private centerZone!: Phaser.GameObjects.Ellipse;
  private releaseRing!: Phaser.GameObjects.Ellipse;
  private releaseRing2!: Phaser.GameObjects.Ellipse;

  /**
   * Vignette: four gradient-like dark rectangles stacked at canvas edges.
   * setAlpha() on the group controls how much the edges darken.
   * Depth 40 — above game world but below HUD (20-30) for the HUD to stay readable.
   *
   * We use a Graphics object drawn once and then alpha-driven each frame.
   */
  private vignetteGfx!: Phaser.GameObjects.Graphics;

  /** Current camera zoom (lerped toward target each frame). */
  private currentZoom: number = CAMERA.ZOOM_DEFAULT;
  /**
   * When set, _updateCamera lerps toward this value instead of the aura-driven one.
   * Cleared (set to -1) when not in use.
   */
  private zoomOverrideTarget: number = -1;
  private zoomOverrideLerp: number = CAMERA.ZOOM_LERP;

  /** Floor pulse ellipse — glows under the player at high aura. Lives in the world layer (zooms with camera). */
  private floorPulse!: Phaser.GameObjects.Ellipse;

  // --- Hazards ---
  /** The single Noise Pulse hazard instance (reused each activation). */
  private noisePulse!: NoisePulse;
  /** Rare chaos hazard. */
  private launchPadChaos!: LaunchPadChaos;
  /** Scheduler decides when to fire the hazard. */
  private hazardScheduler!: HazardScheduler;

  constructor() {
    super({ key: "ArenaScene" });
  }

  init(data?: { mode?: "training" | "match" }): void {
    this.playMode = data?.mode ?? "match";
    this.trainingStep = 0;
    this.sawUnstableInTraining = false;
  }

  create(): void {
    this._buildArena();
    this._buildVignette();
    this._initSystems();
    this._initEntities();
    this.hud = new Hud(this);
    if (this.playMode === "training") {
      this.trainingObjectiveText = this.add
        .text(ARENA.WIDTH / 2, 26, "Training 1/3: Hold SPACE and build aura to Building tier", {
          fontFamily: "Verdana, sans-serif",
          fontSize: "16px",
          color: "#cbe2ff",
          stroke: "#041024",
          strokeThickness: 2,
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(31);
    }

    // Camera setup — keep player centered
    this.cameras.main.setZoom(CAMERA.ZOOM_DEFAULT);
    this.cameras.main.centerOn(ARENA.WIDTH / 2, ARENA.HEIGHT / 2);
    this.currentZoom = CAMERA.ZOOM_DEFAULT;

    this._startRound();

    // R = quick restart (skip result screen)
    if (this.input.keyboard) {
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R)
        .on("down", () => this.scene.start("ArenaScene"));
    }

    // Partition into world camera (zooms) and HUD camera (fixed zoom=1).
    // Must be called LAST — after all objects are created.
    this._setupCameras();

    // Set up scene lifecycle cleanup
    this.events.once("shutdown", () => this._cleanup());
    this.events.once("destroy", () => this._cleanup());
  }

  private _buildArena(): void {
    const { WIDTH: W, HEIGHT: H, BORDER } = ARENA;
    const hasArenaArt = this.textures.exists("arena_bg_futuristic");

    if (hasArenaArt) {
      this.add.image(W / 2, H / 2, "arena_bg_futuristic").setDisplaySize(W, H).setDepth(0);
      this.add.rectangle(W / 2, H / 2, W, H, 0x0d1324, 0.28).setDepth(0);
    } else {
      // Backdrop base
      this.add.rectangle(W / 2, H / 2, W, H, 0x0b0f1a).setDepth(0);
      // Large atmospheric floor gradients (cheap depth trick).
      this.add.ellipse(W / 2, H / 2 + 10, W * 0.92, H * 0.78, 0x141b2d, 0.78).setDepth(0);
      this.add.ellipse(W / 2, H / 2 - 36, W * 0.56, H * 0.38, 0x1d2b48, 0.24).setDepth(0);
    }

    this._arenaFloor = this.add
      .rectangle(W / 2, H / 2, W - BORDER * 2, H - BORDER * 2, 0x121a2b, hasArenaArt ? 0.16 : 1)
      .setDepth(1);

    if (!hasArenaArt) {
      // Subtle floor texture lines for visual richness without assets.
      const floorLines = this.add.graphics().setDepth(1);
      floorLines.lineStyle(1, 0x202d46, 0.24);
      const lineGap = 34;
      for (let x = BORDER; x <= W - BORDER; x += lineGap) {
        floorLines.lineBetween(x, BORDER, x - 46, H - BORDER);
      }
      floorLines.lineStyle(1, 0x162238, 0.2);
      for (let y = BORDER + 10; y <= H - BORDER; y += 44) {
        floorLines.lineBetween(BORDER, y, W - BORDER, y);
      }
    }

    // Border
    const border = this.add.graphics().setDepth(1);
    border.lineStyle(2, 0x324768, 0.95);
    border.strokeRect(BORDER, BORDER, W - BORDER * 2, H - BORDER * 2);
    border.lineStyle(1, 0x6287c2, 0.28);
    border.strokeRect(BORDER + 8, BORDER + 8, W - BORDER * 2 - 16, H - BORDER * 2 - 16);

    // Center zone
    this.centerZone = this.add
      .ellipse(W / 2, H / 2, ARENA.CENTER_ZONE_RADIUS * 2.3, ARENA.CENTER_ZONE_RADIUS * 1.56, 0x2845aa, 0.12)
      .setDepth(2);

    if (!hasArenaArt) {
      const cg = this.add.graphics().setDepth(2);
      cg.lineStyle(2, 0x4a70d6, 0.44);
      cg.strokeEllipse(
        W / 2,
        H / 2,
        ARENA.CENTER_ZONE_RADIUS * 2.1,
        ARENA.CENTER_ZONE_RADIUS * 1.42
      );
      cg.lineStyle(1, 0x6b8be0, 0.24);
      cg.strokeEllipse(
        W / 2,
        H / 2,
        ARENA.CENTER_ZONE_RADIUS * 1.34,
        ARENA.CENTER_ZONE_RADIUS * 0.9
      );
    }

    // Corner marks
    if (!hasArenaArt) {
      const corners = [
        [BORDER, BORDER], [W - BORDER, BORDER],
        [BORDER, H - BORDER], [W - BORDER, H - BORDER],
      ] as const;
      const cg2 = this.add.graphics().setDepth(1);
      cg2.lineStyle(3, 0x3e5f8f, 0.95);
      for (const [cx, cy] of corners) {
        const s = 28;
        const dx = cx < W / 2 ? s : -s;
        const dy = cy < H / 2 ? s : -s;
        cg2.strokePoints([{ x: cx, y: cy + dy }, { x: cx, y: cy }, { x: cx + dx, y: cy }], false);
        cg2.fillStyle(0x7ca7ff, 0.26);
        cg2.fillCircle(cx, cy, 2);
      }
    }

    // Release rings
    this.releaseRing = this.add.ellipse(W / 2, H / 2, 10, 10, 0xffffff, 0).setDepth(10);
    this.releaseRing2 = this.add.ellipse(W / 2, H / 2, 10, 10, 0xffffff, 0).setDepth(9);

    // Floor pulse — glow under player that grows with aura tier
    this.floorPulse = this.add.ellipse(W / 2, H / 2, 80, 80, 0x4488ff, 0).setDepth(3);
  }

  /**
   * Vignette is a full-canvas Graphics object drawn with four dark corner-to-edge fills.
   * We set alpha each frame from aura/pressure state.
   * setScrollFactor(0) so it stays fixed relative to camera.
   */
  private _buildVignette(): void {
    const W = ARENA.WIDTH;
    const H = ARENA.HEIGHT;
    const edgeSize = 220; // how wide the edge darkening is

    this.vignetteGfx = this.add.graphics().setDepth(40).setScrollFactor(0).setAlpha(0);

    // Draw dark semi-transparent edge fills (top, bottom, left, right)
    // Using fillRect with a dark color — simple and cheap
    const c = 0x000000;
    // Top band
    this.vignetteGfx.fillStyle(c, 1);
    this.vignetteGfx.fillRect(0, 0, W, edgeSize);
    // Bottom band
    this.vignetteGfx.fillRect(0, H - edgeSize, W, edgeSize);
    // Left band
    this.vignetteGfx.fillRect(0, 0, edgeSize, H);
    // Right band
    this.vignetteGfx.fillRect(W - edgeSize, 0, edgeSize, H);
  }

  private _initSystems(): void {
    this.gameplay = new GameplayStateCoordinator();
  }

  private _initEntities(): void {
    this.player = new Player(this, ARENA.WIDTH / 2, ARENA.HEIGHT / 2);
    this.crowd = new NpcCrowdController(this);
    // Hazard entities are created here so they exist before _setupCameras partitions cameras
    this.noisePulse = new NoisePulse(this);
    this.launchPadChaos = new LaunchPadChaos(this);
    this.hazardScheduler = new HazardScheduler(
      this.noisePulse,
      this.launchPadChaos,
      {
        onCoreTelegraph: () => this.hud.showCallout(this, "WARNING: NOISE PULSE", "#ff6600", 1200),
        onChaosTelegraph: () => this.hud.showCallout(this, "CHAOS: LAUNCH PAD", "#66ddff", 1300),
      }
    );
  }

  private _startRound(): void {
    this.gameplay.startRound();
    sessionLore.startRound();
    this.time.timeScale = 1; // Ensure time is moving normally
    this.breakLocked = false;
    this.roundEnded = false;
    this.currentZoom = CAMERA.ZOOM_DEFAULT;
    this.zoomOverrideTarget = -1;
    this.cameras.main.setZoom(CAMERA.ZOOM_DEFAULT);
    this.hazardScheduler.reset();
    this.hud.showCallout(this, this.playMode === "training" ? "TRAINING START" : "GO!", "#44ff88", 900);
  }

  update(_time: number, delta: number): void {
    MobileInput.update();
    const dtSec = delta / 1000;

    // Camera and vignette always update — even after round ends — so the zoom-out
    // animation plays smoothly during the transition window.
    this._updateArenaVfx();
    this._updateCamera(dtSec);

    if (this.roundEnded) return;

    this.player.update(dtSec);

    const playerPos = this.player.getPosition();
    const events = this.gameplay.step({
      dtSec,
      playerPos,
      npcPositions: this.crowd.getPositions(),
      isCharging: this.player.isCharging,
      movementNorm: this.player.getMovementNorm(),
      wantsRelease: this.player.wantsRelease,
      simulationLocked: this.breakLocked,
    });

    for (const event of events) {
      if (this._handleGameplayEvent(event)) {
        return;
      }
    }

    const sim = this._sim();
    sessionLore.tick(sim.pressureValue, this.player.isCharging, dtSec);
    this.crowd.update(
      this.player.getPosition(),
      sim.auraValue,
      sim.pressureNormalized,
      sim.pressureValue >= BREAK.UNSTABLE_VISUAL_THRESHOLD && this.player.isCharging,
      dtSec
    );
    this._applyPlayerVisuals();
    this._updateTrainingProgress();
    this._updateHud();

    // Hazard tick — runs after player/pressure update so hit pressure is applied this frame
    const hazardPaused = this.breakLocked;
    this.hazardScheduler.tick(dtSec, hazardPaused, this.player.getPosition());
    this.noisePulse.update(
      this,
      dtSec,
      this.player.getPosition(),
      this.player.isCharging,
      (pressureHit) => this._onNoisePulseHit(pressureHit)
    );
    this.launchPadChaos.update(
      dtSec,
      this.player.getPosition(),
      this.player.isAirborne,
      (payload) => this._onLaunchPadTrigger(payload)
    );
  }

  // ── Gameplay events ──────────────────────────────────────────────────────

  private _triggerBreak(): void {
    this.breakLocked = true;

    // Snap zoom back to default immediately; lerp handles the smooth settle
    this.currentZoom = CAMERA.ZOOM_DEFAULT;
    this.zoomOverrideTarget = -1;

    // Break hit-stop: brief pause to sell failure impact.
    this.time.timeScale = BREAK.HITSTOP_TIMESCALE;
    this.time.delayedCall(BREAK.HITSTOP_MS, () => {
      this.time.timeScale = 1;
    });

    const p = this.player.getPosition();
    this._playImpactBurst(p.x, p.y, 0xff3344, BREAK.IMPACT_RING_RADIUS, 420);
    this.hud.flashScreen(this, 0xff2200, 0.45, 600);
    this.crowd.triggerBreakDramatic(this, p);
    this.hud.showCallout(this, "COMPOSURE BROKE", "#ff4444", 1900);

    this.player.playBreak(this, () => {
      this.time.delayedCall(BREAK.EMBARRASSMENT_PAUSE_MS, () => {
        this.breakLocked = false;
      });
    });
  }

  private _triggerRelease(result: RoundResult, isStrong: boolean): void {
    const pos = this.player.getPosition();

    // Release zoom: snap out fast, then let lerp recover back to aura-driven value.
    // Use zoomOverrideTarget to drive _updateCamera without any zoomTo().
    const releaseZoom = isStrong ? 0.86 : 0.95;
    const recoverDelay = isStrong ? 380 : 200;
    this.currentZoom = releaseZoom;
    this.zoomOverrideTarget = releaseZoom;
    this.zoomOverrideLerp = isStrong ? 0.18 : 0.22;
    this.time.delayedCall(recoverDelay, () => {
      this.zoomOverrideTarget = -1; // release control back to aura-driven lerp
    });

    this._playReleaseRing(pos.x, pos.y, isStrong, false);
    if (isStrong) {
      this.time.delayedCall(RELEASE.STRONG_SECOND_RING_DELAY_MS, () => {
        this._playReleaseRing(pos.x, pos.y, isStrong, true);
      });
    }

    if (isStrong) {
      this.hud.flashScreen(this, 0xffffff, RELEASE.STRONG_FLASH_ALPHA, 800);
      this._playImpactBurst(pos.x, pos.y, 0xffee88, RELEASE.STRONG_SHOCKWAVE_SECONDARY, 720);
    } else {
      this._playImpactBurst(pos.x, pos.y, 0x99ddff, RELEASE.WEAK_SHOCKWAVE, 320);
    }

    if (result.perfectRelease) {
      this.hud.showCallout(this, "PERFECT RELEASE!", "#ffef66", 1250);
      this._playImpactBurst(pos.x, pos.y, 0xfff3a8, RELEASE.STRONG_SHOCKWAVE_PRIMARY, 520);
      this._playImpactBurst(pos.x, pos.y, VISUALS.PALETTE.AURA_RELEASE, RELEASE.STRONG_SHOCKWAVE_PRIMARY * 0.68, 420);
      this.cameras.main.shake(240, 0.012);
      this.time.timeScale = VISUALS.PLAYER.PERFECT_HUSH_TIMESCALE;
      this.time.delayedCall(VISUALS.PLAYER.PERFECT_HUSH_MS, () => {
        this.time.timeScale = 1;
      });
    }

    this.crowd.triggerReleaseDramatic(this, pos, isStrong);
    this.player.playRelease(this, isStrong);

    const label = isStrong ? "CONFIDENT FLEX" : "Composed release";
    const color = isStrong ? "#ffcc00" : "#aaddff";
    this.hud.showCallout(this, label, color, isStrong ? 2000 : 1000);

    this.time.delayedCall(isStrong ? RELEASE.POST_RELEASE_DELAY_STRONG_MS : RELEASE.POST_RELEASE_DELAY_WEAK_MS, () => {
      this._endRound(result);
    });
  }

  private _endRound(result: RoundResult | null): void {
    if (this.roundEnded) return;
    this.roundEnded = true;
    this.gameplay.stopRound();

    const sim = this._sim();

    const finalResult: RoundResult = result ?? {
      peakAura: sim.peakAuraValue,
      releaseAura: 0,
      score: 0,
      broke: sim.brokeThisRound,
    };
    finalResult.mode = this.playMode;
    if (!finalResult.outcomeReason) {
      finalResult.outcomeReason = finalResult.broke
        ? "Broke under pressure"
        : finalResult.releaseAura > 0
          ? "Release landed in time"
          : "Timer ended before release";
    }
    if (this.playMode === "training") {
      finalResult.trainingCompletedSteps = this.trainingStep;
      finalResult.trainingTotalSteps = 3;
      finalResult.outcomeReason =
        this.trainingStep >= 3
          ? "Training complete: timing fundamentals learned"
          : `Training progress: ${this.trainingStep}/3 steps completed`;
    }
    const lore = sessionLore.finalizeRound(finalResult);
    finalResult.loreTitle = lore.title;
    finalResult.loreTags = lore.tags;

    this.time.delayedCall(RELEASE.ROUND_END_DELAY_MS, () => {
      this.scene.start("ResultScene", { result: finalResult });
    });
  }

  private _updateTrainingProgress(): void {
    if (this.playMode !== "training" || this.roundEnded) return;
    const sim = this._sim();
    const isUnstable = sim.pressureValue >= BREAK.UNSTABLE_VISUAL_THRESHOLD && this.player.isCharging;

    if (this.trainingStep === 0 && sim.auraValue >= AURA.TIERS[1].min) {
      this.trainingStep = 1;
      this.hud.showCallout(this, "Step 1 complete: aura built", "#9ce6ff", 900);
      this.trainingObjectiveText?.setText("Training 2/3: Push until unstable warning appears");
    }
    if (this.trainingStep === 1 && isUnstable) {
      this.sawUnstableInTraining = true;
      this.trainingStep = 2;
      this.hud.showCallout(this, "Step 2 complete: unstable recognized", "#ffb7c3", 980);
      this.trainingObjectiveText?.setText("Training 3/3: Release before a break");
    }
  }

  // ── Per-frame visuals ────────────────────────────────────────────────────

  private _applyPlayerVisuals(): void {
    const sim = this._sim();
    let tierIndex = 0;
    for (let i = 0; i < AURA.TIERS.length; i++) {
      if (sim.auraValue >= AURA.TIERS[i].min) tierIndex = i;
    }
    const isUnstable =
      sim.pressureValue >= BREAK.UNSTABLE_VISUAL_THRESHOLD &&
      this.player.isCharging;
    const dangerIntensity = Phaser.Math.Clamp(
      (sim.pressureValue - BREAK.DANGER_ZONE_THRESHOLD) /
      (BREAK.DANGER_THRESHOLD - BREAK.DANGER_ZONE_THRESHOLD),
      0,
      1
    );
    const criticalIntensity = Phaser.Math.Clamp(
      (sim.pressureValue - BREAK.CRITICAL_VISUAL_THRESHOLD) /
      (100 - BREAK.CRITICAL_VISUAL_THRESHOLD),
      0,
      1
    );

    this.player.applyVisuals(
      sim.auraNormalized,
      sim.pressureNormalized,
      tierIndex,
      isUnstable,
      dangerIntensity,
      criticalIntensity
    );

    // Floor pulse: glow under player that grows with aura
    const pos = this.player.getPosition();
    this.floorPulse.setPosition(pos.x, pos.y);
    if (sim.auraNormalized > 0.08) {
      const tierColor = AURA.TIERS[Math.min(tierIndex, AURA.TIERS.length - 1)].color;
      const unstableBoost = isUnstable ? 0.14 + criticalIntensity * 0.18 : 0;
      const size = 56 + sim.auraNormalized * 250 + (isUnstable ? 22 : 0);
      const alphaBase = this.player.isCharging ? 0.10 : 0.04;
      const alphaPulse = Math.sin(Date.now() * (isUnstable ? 0.012 : 0.0038)) * (isUnstable ? 0.11 : 0.04);
      const alpha = alphaBase + sim.auraNormalized * 0.18 + unstableBoost + alphaPulse;
      this.floorPulse
        .setFillStyle(tierColor, Math.min(0.36, alpha))
        .setDisplaySize(size, size * 0.5); // squashed ellipse for perspective feel
    } else {
      this.floorPulse.setFillStyle(0x4488ff, 0);
    }
  }

  private _updateArenaVfx(): void {
    const sim = this._sim();
    // Center zone brightens with aura
    if (sim.auraValue > 20) {
      const pulse = 0.05 + sim.auraNormalized * 0.24 + Math.sin(Date.now() * 0.003) * 0.04;
      this.centerZone.setFillStyle(0x2244bb, pulse);
    } else {
      this.centerZone.setFillStyle(0x2233aa, 0.05);
    }

    // Vignette: dark edge overlay that intensifies with aura + pressure danger
    // Max alpha ~0.38 at full tension — readable but not oppressive
    const auraPart = Math.max(0, (sim.auraNormalized - CAMERA.ZOOM_AURA_START) / (1 - CAMERA.ZOOM_AURA_START));
    const pressurePart = sim.pressureDangerous && this.player.isCharging
      ? sim.pressureNormalized * 0.3
      : 0;
    const targetVigAlpha = Math.min(0.38, auraPart * 0.28 + pressurePart);

    // Lerp vignette alpha smoothly
    const currentAlpha = this.vignetteGfx.alpha;
    const nextAlpha = currentAlpha + (targetVigAlpha - currentAlpha) * 0.06;
    this.vignetteGfx.setAlpha(nextAlpha);

    // Critical near-break shake: communicates "you are pushing your luck" without UI.
    if (
      this.player.isCharging &&
      sim.pressureValue >= BREAK.CRITICAL_VISUAL_THRESHOLD &&
      !this.breakLocked
    ) {
      const intensity = Phaser.Math.Clamp(
        (sim.pressureValue - BREAK.CRITICAL_VISUAL_THRESHOLD) /
        (100 - BREAK.CRITICAL_VISUAL_THRESHOLD),
        0,
        1
      );
      this.cameras.main.shake(42, 0.0018 + intensity * 0.0030, true);
    }
  }

  /**
   * Camera zoom: lerps currentZoom toward a target each frame,
   * then applies it with setZoom(). No Phaser CameraEffect used —
   * we manage zoom entirely here to avoid ease-string lookup crashes.
   */
  private _updateCamera(_dtSec: number): void {
    const sim = this._sim();
    let targetZoom: number;

    if (this.zoomOverrideTarget >= 0) {
      // Short-lived override (e.g. release snap)
      targetZoom = this.zoomOverrideTarget;
      this.currentZoom += (targetZoom - this.currentZoom) * this.zoomOverrideLerp;
    } else {
      // Normal aura-driven zoom
      const auraPart = Math.max(
        0,
        (sim.auraNormalized - CAMERA.ZOOM_AURA_START) / (1 - CAMERA.ZOOM_AURA_START)
      );
      const pressureBonus = sim.pressureDangerous ? CAMERA.ZOOM_PRESSURE_BONUS : 0;
      targetZoom = CAMERA.ZOOM_DEFAULT +
        auraPart * (CAMERA.ZOOM_MAX - CAMERA.ZOOM_DEFAULT) +
        pressureBonus;
      this.currentZoom += (targetZoom - this.currentZoom) * CAMERA.ZOOM_LERP;
    }

    this.cameras.main.setZoom(this.currentZoom);
    this.cameras.main.centerOn(ARENA.WIDTH / 2, ARENA.HEIGHT / 2);
  }

  private _updateHud(): void {
    const sim = this._sim();
    this.hud.update(
      this,
      sim.auraNormalized,
      sim.auraTierLabel,
      sim.auraTierColor,
      sim.pressureNormalized,
      sim.pressureDangerous,
      sim.timeRemainingSec
    );
  }

  private _playReleaseRing(x: number, y: number, isStrong: boolean, isSecond: boolean): void {
    const ring = isSecond ? this.releaseRing2 : this.releaseRing;
    const maxSize = isStrong
      ? (isSecond ? RELEASE.STRONG_SHOCKWAVE_SECONDARY : RELEASE.STRONG_SHOCKWAVE_PRIMARY)
      : RELEASE.WEAK_SHOCKWAVE;
    const color = isStrong ? (isSecond ? 0xffaa00 : 0xffee44) : 0x88ccff;
    const startAlpha = isStrong ? 0.72 : 0.52;
    const duration = isStrong ? (isSecond ? 980 : 760) : 440;

    ring.setPosition(x, y).setFillStyle(color, startAlpha).setSize(20, 20).setAlpha(startAlpha);

    this.tweens.add({
      targets: ring,
      displayWidth: maxSize,
      displayHeight: maxSize,
      alpha: 0,
      duration,
      ease: "Expo.Out",
      onComplete: () => {
        ring.setAlpha(1).setSize(10, 10);
      },
    });
  }

  private _playImpactBurst(
    x: number,
    y: number,
    color: number,
    radius: number,
    durationMs: number
  ): void {
    const ring = this.add.circle(x, y, 22, color, 0.35).setDepth(12);
    this.tweens.add({
      targets: ring,
      radius,
      alpha: 0,
      duration: durationMs,
      ease: "Expo.Out",
      onComplete: () => ring.destroy(),
    });
  }

  /**
   * Split rendering into two cameras:
   *   cameras.main  — world (player, NPCs, arena, vignette). Zooms with aura.
   *   hudCam        — HUD only. Always zoom=1, fixed to canvas. Never clips.
   *
   * Strategy: collect HUD objects via hud.getObjects(), tell cameras.main to
   * ignore them, tell hudCam to ignore everything else (snapshot of children
   * at creation time). Any new world objects added later go to cameras.main only.
   */
  private _setupCameras(): void {
    const { WIDTH: W, HEIGHT: H } = ARENA;

    // HUD objects = everything Hud.ts created + vignette + hazard screen-space overlays
    const hudObjects: Phaser.GameObjects.GameObject[] = [
      ...this.hud.getObjects(),
      this.vignetteGfx,
      ...this.noisePulse.getScreenObjects(),
    ];
    const hudSet = new Set(hudObjects);

    // World objects = everything currently in the scene that isn't HUD
    const worldObjects = (this.children.list as Phaser.GameObjects.GameObject[])
      .filter((obj) => !hudSet.has(obj));

    // Main (world) camera ignores HUD objects
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.ignore(hudObjects);

    // HUD camera: zoom=1, no scroll — renders only HUD objects
    const hudCam = this.cameras.add(0, 0, W, H);
    hudCam.setScroll(0, 0);
    hudCam.setRoundPixels(true);
    hudCam.ignore(worldObjects);
  }

  /**
   * Noise Pulse hit callback — called by NoisePulse when wave crosses the player
   * while they are charging.
   *
   * Applies a pressure spike (multiplied if already in danger zone).
   * Fires a brief HUD callout warning.
   */
  private _onNoisePulseHit(basePressure: number): void {
    const snapshot = this._sim();
    const multiplier = snapshot.pressureDangerous
      ? HAZARD_NOISE_PULSE.DANGER_PRESSURE_MULTIPLIER
      : 1.0;
    const finalHit = basePressure * multiplier;
    this.gameplay.applyHazardPressure("noise_pulse", finalHit);

    // NPC crowd reacts to the noise burst
    this.crowd.triggerBreakDramatic(this, this.player.getPosition());

    // HUD callout — tells the player what just happened
    const msg = snapshot.pressureDangerous ? "NOISE PULSE! ⚠️" : "NOISE PULSE";
    const color = snapshot.pressureDangerous ? "#ff4400" : "#ff9900";
    this.hud.showCallout(this, msg, color, 1000);
  }

  private _onLaunchPadTrigger(payload: LaunchPadPayload): void {
    this.cameras.main.shake(280, 0.010);

    this.player.launch(
      this,
      payload.to.x,
      payload.to.y,
      payload.travelMs,
      payload.arcHeight,
      () => {
        this.hud.showCallout(this, "LANDED", "#cceeff", 700);
      }
    );

    this.gameplay.applyHazardPressure("launch_pad", payload.pressureHit);
    this.crowd.triggerBreakDramatic(this, payload.from);
    this.hud.showCallout(this, "CATAPULTED", "#99e6ff", 900);

    const landingBurst = this.add.circle(payload.to.x, payload.to.y, 20, 0xffffff, 0.4).setDepth(12);
    this.tweens.add({
      targets: landingBurst,
      radius: 110,
      alpha: 0,
      duration: 420,
      ease: "Expo.Out",
      onComplete: () => landingBurst.destroy(),
    });
  }

  private _handleGameplayEvent(event: GameplaySyncEvent): boolean {
    if (event.type === "break_triggered") {
      this._triggerBreak();
      return true;
    }

    if (event.type === "release_committed") {
      if (this.playMode === "training") {
        this.trainingStep = Math.max(this.trainingStep, 3);
      }
      this._triggerRelease(event.result, event.isStrong);
      return true;
    }

    if (event.type === "round_timeout") {
      this._endRound(event.result);
      return true;
    }

    return false;
  }

  private _sim(): CoreGameplaySnapshot {
    return this.gameplay.getSnapshot();
  }

  /**
   * Clean up resources when scene shuts down
   */
  private _cleanup(): void {
    // Clean up player if it exists
    if (this.player && typeof this.player.destroy === 'function') {
      this.player.destroy();
    }

    // Clean up crowd controller if it exists
    // Check for any cleanup method (destroy, cleanup, etc.)
    if (this.crowd) {
      if (typeof (this.crowd as any).destroy === 'function') {
        (this.crowd as any).destroy();
      } else if (typeof (this.crowd as any).cleanup === 'function') {
        (this.crowd as any).cleanup();
      }
    }

    // Stop all tweens and timers
    this.tweens.killAll();
    this.time.removeAllEvents();

    // Remove all input listeners
    if (this.input.keyboard) {
      this.input.keyboard.removeAllListeners();
    }

    // Don't destroy MobileInput - it's a singleton that persists for the game session
    // Just hide mobile controls if they're visible
    const controlsOverlay = document.getElementById("mobile-controls");
    if (controlsOverlay) {
      controlsOverlay.style.display = "none";
    }
  }
}
