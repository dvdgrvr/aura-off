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
import { ARENA, AURA } from "../config/GameConfig";
import { AuraModel } from "../state/AuraModel";
import { PressureModel } from "../state/PressureModel";
import { RunState } from "../state/RunState";
import { AuraSystem } from "../systems/AuraSystem";
import { PressureSystem } from "../systems/PressureSystem";
import { BreakSystem } from "../systems/BreakSystem";
import { ReleaseSystem } from "../systems/ReleaseSystem";
import { Player } from "../entities/player/Player";
import { NpcCrowdController } from "../entities/npc/NpcCrowdController";
import { Hud } from "../ui/Hud";
import { RoundResult } from "../core/types";

export class ArenaScene extends Phaser.Scene {
  // --- State ---
  private aura!: AuraModel;
  private pressure!: PressureModel;
  private runState!: RunState;

  // --- Systems ---
  private auraSystem!: AuraSystem;
  private pressureSystem!: PressureSystem;
  private breakSystem!: BreakSystem;
  private releaseSystem!: ReleaseSystem;

  // --- Entities ---
  private player!: Player;
  private crowd!: NpcCrowdController;

  // --- UI ---
  private hud!: Hud;

  // --- Scene state flags ---
  private breakLocked: boolean = false; // true during break animation
  private roundEnded: boolean = false;

  // --- Visual objects ---
  private _arenaFloor!: Phaser.GameObjects.Rectangle;
  private centerZone!: Phaser.GameObjects.Ellipse;
  private releaseRing!: Phaser.GameObjects.Ellipse;

  constructor() {
    super({ key: "ArenaScene" });
  }

  create(): void {
    this._buildArena();
    this._initSystems();
    this._initEntities();
    this.hud = new Hud(this);
    this._startRound();
  }

  private _buildArena(): void {
    const { WIDTH: W, HEIGHT: H, BORDER } = ARENA;

    // Background
    this.add.rectangle(W / 2, H / 2, W, H, 0x141420).setDepth(0);

    // Arena floor
    this._arenaFloor = this.add
      .rectangle(W / 2, H / 2, W - BORDER * 2, H - BORDER * 2, 0x1e1e3a)
      .setDepth(1);

    // Arena border line
    const border = this.add.graphics().setDepth(1);
    border.lineStyle(2, 0x334466, 0.8);
    border.strokeRect(BORDER, BORDER, W - BORDER * 2, H - BORDER * 2);

    // Center zone (subtle)
    this.centerZone = this.add
      .ellipse(
        W / 2, H / 2,
        ARENA.CENTER_ZONE_RADIUS * 2, ARENA.CENTER_ZONE_RADIUS * 2,
        0x2233aa, 0.12
      )
      .setDepth(2);

    // Center zone ring
    const cg = this.add.graphics().setDepth(2);
    cg.lineStyle(1, 0x4455bb, 0.4);
    cg.strokeCircle(W / 2, H / 2, ARENA.CENTER_ZONE_RADIUS);

    // Release ring (hidden until release)
    this.releaseRing = this.add
      .ellipse(W / 2, H / 2, 10, 10, 0xffffff, 0)
      .setDepth(10);
  }

  private _initSystems(): void {
    this.aura = new AuraModel();
    this.pressure = new PressureModel();
    this.runState = new RunState();
    this.auraSystem = new AuraSystem();
    this.pressureSystem = new PressureSystem();
    this.breakSystem = new BreakSystem();
    this.releaseSystem = new ReleaseSystem();
  }

  private _initEntities(): void {
    const cx = ARENA.WIDTH / 2;
    const cy = ARENA.HEIGHT / 2;
    this.player = new Player(this, cx, cy);
    this.crowd = new NpcCrowdController(this);
  }

  private _startRound(): void {
    this.aura.resetForNewRound();
    this.pressure.reset();
    this.runState.startRound();
    this.breakLocked = false;
    this.roundEnded = false;
    this.hud.showCallout(this, "GO!", "#44ff88", 900);
  }

  update(_time: number, delta: number): void {
    if (this.roundEnded) return;

    const dtSec = delta / 1000;

    // --- Input ---
    this.player.update(dtSec);

    // --- Timer ---
    this.runState.tick(dtSec);
    if (this.runState.isOver) {
      this._endRound(null);
      return;
    }

    // --- Systems (only tick if not in break animation) ---
    if (!this.breakLocked) {
      const playerPos = this.player.getPosition();
      const npcPositions = this.crowd.getPositions();
      const isCharging = this.player.isCharging;

      this.pressureSystem.tick(
        this.pressure, playerPos, npcPositions, isCharging, dtSec
      );
      this.auraSystem.tick(this.aura, this.pressure, isCharging, dtSec);

      // Break check
      if (
        this.breakSystem.tryBreak(
          this.pressure, this.aura, isCharging, dtSec
        )
      ) {
        this._triggerBreak();
        return;
      }

      // Release check
      if (this.player.wantsRelease) {
        this._triggerRelease();
        return;
      }
    }

    // --- NPC crowd ---
    this.crowd.update(
      this.player.getPosition(),
      this.aura.value,
      dtSec
    );

    // --- Visuals ---
    this._applyPlayerVisuals();
    this._updateArenaVfx();
    this._updateHud();
  }

  private _triggerBreak(): void {
    this.breakLocked = true;
    this.runState.recordBreak();
    this.breakSystem.applyBreak(this.aura);
    this.pressure.reset();

    // Crowd reacts
    this.crowd.triggerDramatic(this, this.player.getPosition(), 250);

    this.hud.showCallout(this, "BROKE! 💀", "#ff4444", 1600);

    this.player.playBreak(this, () => {
      this.breakLocked = false;
    });
  }

  private _triggerRelease(): void {
    const peakAura = this.aura.peakValue;
    const result = this.releaseSystem.release(
      this.aura, this.pressure, peakAura
    );
    if (!result) return; // not enough aura

    const isStrong = this.releaseSystem.isStrong(result.releaseAura);

    // Flash release ring at player position
    this._playReleaseRing(
      this.player.getPosition().x,
      this.player.getPosition().y,
      isStrong
    );

    this.crowd.triggerDramatic(
      this,
      this.player.getPosition(),
      isStrong ? 400 : 200
    );

    this.player.playRelease(this, isStrong);

    const label = isStrong
      ? "AURA RELEASED! ✨"
      : "Released.";
    const color = isStrong ? "#ffcc00" : "#aaddff";
    this.hud.showCallout(this, label, color, isStrong ? 1800 : 1000);

    // After a strong release end the round with the result
    this.time.delayedCall(600, () => {
      this._endRound({
        ...result,
        broke: this.runState.broke,
      });
    });
  }

  private _endRound(result: RoundResult | null): void {
    if (this.roundEnded) return;
    this.roundEnded = true;
    this.runState.roundActive = false;

    const finalResult: RoundResult = result ?? {
      peakAura: this.aura.peakValue,
      releaseAura: 0,
      score: 0,
      broke: this.runState.broke,
    };

    // Brief pause then go to result screen
    this.time.delayedCall(800, () => {
      this.scene.start("ResultScene", { result: finalResult });
    });
  }

  // ---------- Visuals ----------

  private _applyPlayerVisuals(): void {
    // Find highest tier the current aura qualifies for
    let tierIndex = 0;
    for (let i = 0; i < AURA.TIERS.length; i++) {
      if (this.aura.value >= AURA.TIERS[i].min) tierIndex = i;
    }
    this.player.applyVisuals(
      this.aura.normalized,
      this.pressure.normalized,
      tierIndex,
      this.pressure.isDangerous && this.player.isCharging
    );
  }

  private _updateArenaVfx(): void {
    // Center zone pulses gently at high aura
    if (this.aura.value > 40) {
      const pulse = 0.08 + this.aura.normalized * 0.18 +
        Math.sin(Date.now() * 0.003) * 0.04;
      this.centerZone.setFillStyle(0x2233aa, pulse);
    } else {
      this.centerZone.setFillStyle(0x2233aa, 0.08);
    }
  }

  private _updateHud(): void {
    this.hud.update(
      this.aura.normalized,
      this.aura.tier.label,
      this.aura.tier.color,
      this.pressure.normalized,
      this.pressure.isDangerous,
      this.runState.timeRemaining
    );
  }

  private _playReleaseRing(
    x: number,
    y: number,
    isStrong: boolean
  ): void {
    const maxSize = isStrong ? 600 : 300;
    const color = isStrong ? 0xffcc22 : 0x88ccff;
    this.releaseRing.setPosition(x, y);
    this.releaseRing.setFillStyle(color, 0.5);
    this.releaseRing.setSize(20, 20);

    this.tweens.add({
      targets: this.releaseRing,
      displayWidth: maxSize,
      displayHeight: maxSize,
      alpha: 0,
      duration: isStrong ? 700 : 400,
      ease: "Expo.Out",
      onComplete: () => {
        this.releaseRing.setAlpha(1).setSize(10, 10);
      },
    });
  }
}
