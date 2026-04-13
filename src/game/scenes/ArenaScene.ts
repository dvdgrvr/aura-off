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
} from "../config/GameConfig";
import { CoreGameplaySnapshot, GameplaySyncEvent } from "../core/multiplayerContracts";
import { HazardScheduler } from "../systems/HazardScheduler";
import { GameplayStateCoordinator } from "../systems/GameplayStateCoordinator";
import { LaunchPadChaos, LaunchPadPayload } from "../entities/hazards/LaunchPadChaos";
import { NoisePulse } from "../entities/hazards/NoisePulse";
import { Player } from "../entities/player/Player";
import { NpcCrowdController } from "../entities/npc/NpcCrowdController";
import { Hud } from "../ui/Hud";
import { RoundResult } from "../core/types";

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

  create(): void {
    this._buildArena();
    this._buildVignette();
    this._initSystems();
    this._initEntities();
    this.hud = new Hud(this);

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
  }

  private _buildArena(): void {
    const { WIDTH: W, HEIGHT: H, BORDER } = ARENA;

    this.add.rectangle(W / 2, H / 2, W, H, 0x0e0e1a).setDepth(0);

    this._arenaFloor = this.add
      .rectangle(W / 2, H / 2, W - BORDER * 2, H - BORDER * 2, 0x181830)
      .setDepth(1);

    // Border
    const border = this.add.graphics().setDepth(1);
    border.lineStyle(2, 0x2a3a5a, 1);
    border.strokeRect(BORDER, BORDER, W - BORDER * 2, H - BORDER * 2);

    // Center zone
    this.centerZone = this.add
      .ellipse(W / 2, H / 2, ARENA.CENTER_ZONE_RADIUS * 2, ARENA.CENTER_ZONE_RADIUS * 2, 0x2233aa, 0.10)
      .setDepth(2);

    const cg = this.add.graphics().setDepth(2);
    cg.lineStyle(1, 0x4466cc, 0.35);
    cg.strokeCircle(W / 2, H / 2, ARENA.CENTER_ZONE_RADIUS);

    // Corner marks
    const corners = [
      [BORDER, BORDER], [W - BORDER, BORDER],
      [BORDER, H - BORDER], [W - BORDER, H - BORDER],
    ] as const;
    const cg2 = this.add.graphics().setDepth(1);
    cg2.lineStyle(3, 0x334466, 0.9);
    for (const [cx, cy] of corners) {
      const s = 18;
      const dx = cx < W / 2 ? s : -s;
      const dy = cy < H / 2 ? s : -s;
      cg2.strokePoints([{ x: cx, y: cy + dy }, { x: cx, y: cy }, { x: cx + dx, y: cy }], false);
    }

    // Release rings
    this.releaseRing  = this.add.ellipse(W / 2, H / 2, 10, 10, 0xffffff, 0).setDepth(10);
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
    this.breakLocked = false;
    this.roundEnded = false;
    this.currentZoom = CAMERA.ZOOM_DEFAULT;
    this.zoomOverrideTarget = -1;
    this.cameras.main.setZoom(CAMERA.ZOOM_DEFAULT);
    this.hazardScheduler.reset();
    this.hud.showCallout(this, "GO!", "#44ff88", 900);
  }

  update(_time: number, delta: number): void {
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
      wantsRelease: this.player.wantsRelease,
      simulationLocked: this.breakLocked,
    });

    for (const event of events) {
      if (this._handleGameplayEvent(event)) {
        return;
      }
    }

    const sim = this._sim();
    this.crowd.update(
      this.player.getPosition(),
      sim.auraValue,
      sim.pressureNormalized,
      sim.pressureValue >= BREAK.UNSTABLE_VISUAL_THRESHOLD && this.player.isCharging,
      dtSec
    );
    this._applyPlayerVisuals();
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
    setTimeout(() => {
      if (this.scene.isActive("ArenaScene")) {
        this.time.timeScale = 1;
      }
    }, BREAK.HITSTOP_MS);

    const p = this.player.getPosition();
    this._playImpactBurst(p.x, p.y, 0xff3344, BREAK.IMPACT_RING_RADIUS, 420);
    this.hud.flashScreen(this, 0xff2200, 0.45, 600);
    this.crowd.triggerBreakDramatic(this, p);
    this.hud.showCallout(this, "BROKE! 💀", "#ff4444", 1800);

    this.player.playBreak(this, () => {
      this.breakLocked = false;
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

    this.crowd.triggerReleaseDramatic(this, pos, isStrong);
    this.player.playRelease(this, isStrong);

    const label = isStrong ? "AURA RELEASED! ✨" : "Released.";
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

    this.time.delayedCall(RELEASE.ROUND_END_DELAY_MS, () => {
      this.scene.start("ResultScene", { result: finalResult });
    });
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

    this.player.applyVisuals(
      sim.auraNormalized,
      sim.pressureNormalized,
      tierIndex,
      isUnstable
    );

    // Floor pulse: glow under player that grows with aura
    const pos = this.player.getPosition();
    this.floorPulse.setPosition(pos.x, pos.y);
    if (this.player.isCharging && sim.auraNormalized > 0.25) {
      const tierColor = AURA.TIERS[Math.min(tierIndex, AURA.TIERS.length - 1)].color;
      const size = 50 + sim.auraNormalized * 240;
      const alpha = 0.08 + sim.auraNormalized * 0.22 + Math.sin(Date.now() * 0.003) * 0.05;
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
    if (sim.auraValue > 35) {
      const pulse = 0.07 + sim.auraNormalized * 0.22 + Math.sin(Date.now() * 0.003) * 0.05;
      this.centerZone.setFillStyle(0x2244bb, pulse);
    } else {
      this.centerZone.setFillStyle(0x2233aa, 0.07);
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
    this.cameras.main.ignore(hudObjects);

    // HUD camera: zoom=1, no scroll — renders only HUD objects
    const hudCam = this.cameras.add(0, 0, W, H);
    hudCam.setScroll(0, 0);
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
}
