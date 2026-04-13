/**
 * LaunchPadChaos.ts
 * Rare chaos hazard: a launch pad appears with a loud telegraph, then catapults
 * the player if they are still standing on it when it triggers.
 *
 * Lifecycle:
 *   idle      -> waiting for scheduler roll
 *   telegraph -> pulsing pad marker + warning arrows
 *   active    -> burst + optional launch + quick fade
 *   idle
 */
import Phaser from "phaser";
import { ARENA, HAZARD_CHAOS_LAUNCHPAD, PLAYER } from "../../config/GameConfig";
import { HazardPhase, Vec2 } from "../../core/types";

const CFG = HAZARD_CHAOS_LAUNCHPAD;

export interface LaunchPadPayload {
  from: Vec2;
  to: Vec2;
  travelMs: number;
  arcHeight: number;
  pressureHit: number;
}

export class LaunchPadChaos {
  phase: HazardPhase = "idle";

  private telegraphGfx: Phaser.GameObjects.Graphics;
  private burstGfx: Phaser.GameObjects.Graphics;

  private telegraphTimer: number = 0;
  private activeTimer: number = 0;
  private padPos: Vec2 = { x: ARENA.WIDTH / 2, y: ARENA.HEIGHT / 2 };
  private launchDelivered: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.telegraphGfx = scene.add.graphics().setDepth(16).setAlpha(0);
    this.burstGfx = scene.add.graphics().setDepth(17).setAlpha(0);
  }

  getWorldObjects(): Phaser.GameObjects.GameObject[] {
    return [this.telegraphGfx, this.burstGfx];
  }

  fire(targetPos: Vec2): void {
    if (this.phase !== "idle") return;

    this.phase = "telegraph";
    this.telegraphTimer = 0;
    this.activeTimer = 0;
    this.launchDelivered = false;
    this.padPos = {
      x: Phaser.Math.Clamp(
        targetPos.x,
        ARENA.BORDER + PLAYER.RADIUS + CFG.PAD_RADIUS,
        ARENA.WIDTH - ARENA.BORDER - PLAYER.RADIUS - CFG.PAD_RADIUS
      ),
      y: Phaser.Math.Clamp(
        targetPos.y,
        ARENA.BORDER + PLAYER.RADIUS + CFG.PAD_RADIUS,
        ARENA.HEIGHT - ARENA.BORDER - PLAYER.RADIUS - CFG.PAD_RADIUS
      ),
    };
    this.telegraphGfx.setAlpha(1);
    this.burstGfx.setAlpha(0);
  }

  update(
    dtSec: number,
    playerPos: Vec2,
    playerAirborne: boolean,
    onLaunch: (payload: LaunchPadPayload) => void
  ): void {
    if (this.phase === "idle") {
      this._clearVisuals();
      return;
    }

    if (this.phase === "telegraph") {
      this._updateTelegraph(dtSec);
      if (this.telegraphTimer >= CFG.TELEGRAPH_MS / 1000) {
        this.phase = "active";
        this.activeTimer = 0;
        this.telegraphGfx.clear().setAlpha(0);
      }
      return;
    }

    if (this.phase === "active") {
      this._updateBurst(dtSec);

      if (!this.launchDelivered && !playerAirborne) {
        this.launchDelivered = true;
        const dx = playerPos.x - this.padPos.x;
        const dy = playerPos.y - this.padPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= CFG.HIT_RADIUS) {
          onLaunch({
            from: { ...this.padPos },
            to: this._pickLandingTarget(),
            travelMs: CFG.LAUNCH_TRAVEL_MS,
            arcHeight: CFG.LAUNCH_ARC_HEIGHT,
            pressureHit: CFG.PRESSURE_HIT_ON_LAUNCH,
          });
        }
      }

      if (this.activeTimer >= CFG.ACTIVE_MS / 1000) {
        this._clearVisuals();
        this.phase = "idle";
      }
    }
  }

  reset(): void {
    this.phase = "idle";
    this._clearVisuals();
  }

  destroy(): void {
    this.telegraphGfx.destroy();
    this.burstGfx.destroy();
  }

  // -- Private --------------------------------------------------------------

  private _updateTelegraph(dtSec: number): void {
    this.telegraphTimer += dtSec;
    const t = Math.min(1, this.telegraphTimer / (CFG.TELEGRAPH_MS / 1000));
    const pulse = 0.45 + Math.abs(Math.sin(this.telegraphTimer * Math.PI * 7.5)) * 0.55;

    this.telegraphGfx.clear();

    // Base launch pad marker.
    this.telegraphGfx.fillStyle(CFG.COLOR_PAD, 0.20 + t * 0.20);
    this.telegraphGfx.fillCircle(this.padPos.x, this.padPos.y, CFG.PAD_RADIUS * (0.88 + t * 0.1));

    // Outer warning ring.
    const ringR = CFG.PAD_RADIUS + 10 + Math.sin(this.telegraphTimer * Math.PI * 5) * 7;
    this.telegraphGfx.lineStyle(3, CFG.COLOR_TELEGRAPH, pulse);
    this.telegraphGfx.strokeCircle(this.padPos.x, this.padPos.y, ringR);

    // Arrow shards to imply vertical force.
    this.telegraphGfx.lineStyle(2, CFG.COLOR_TELEGRAPH, 0.45 + pulse * 0.4);
    const shardCount = 6;
    for (let i = 0; i < shardCount; i++) {
      const angle = (i / shardCount) * Math.PI * 2;
      const innerR = CFG.PAD_RADIUS * 1.1;
      const len = 16 + t * 28;
      const x1 = this.padPos.x + Math.cos(angle) * innerR;
      const y1 = this.padPos.y + Math.sin(angle) * innerR;
      const x2 = this.padPos.x + Math.cos(angle) * (innerR + len);
      const y2 = this.padPos.y + Math.sin(angle) * (innerR + len);
      this.telegraphGfx.lineBetween(x1, y1, x2, y2);
    }
  }

  private _updateBurst(dtSec: number): void {
    this.activeTimer += dtSec;
    const t = Math.min(1, this.activeTimer / (CFG.ACTIVE_MS / 1000));
    const burstR = CFG.PAD_RADIUS + t * 120;

    this.burstGfx.clear().setAlpha(1);
    this.burstGfx.fillStyle(CFG.COLOR_BURST, 0.30 * (1 - t));
    this.burstGfx.fillCircle(this.padPos.x, this.padPos.y, burstR * 0.65);
    this.burstGfx.lineStyle(Math.max(1, 5 - t * 4), CFG.COLOR_BURST, 0.7 * (1 - t * 0.6));
    this.burstGfx.strokeCircle(this.padPos.x, this.padPos.y, burstR);
  }

  private _pickLandingTarget(): Vec2 {
    const angle = Math.random() * Math.PI * 2;
    const dist = Phaser.Math.Between(CFG.LAUNCH_DISTANCE_MIN, CFG.LAUNCH_DISTANCE_MAX);
    const tx = this.padPos.x + Math.cos(angle) * dist;
    const ty = this.padPos.y + Math.sin(angle) * dist;
    return {
      x: Phaser.Math.Clamp(tx, ARENA.BORDER + PLAYER.RADIUS, ARENA.WIDTH - ARENA.BORDER - PLAYER.RADIUS),
      y: Phaser.Math.Clamp(ty, ARENA.BORDER + PLAYER.RADIUS, ARENA.HEIGHT - ARENA.BORDER - PLAYER.RADIUS),
    };
  }

  private _clearVisuals(): void {
    this.telegraphGfx.clear().setAlpha(0);
    this.burstGfx.clear().setAlpha(0);
  }
}
