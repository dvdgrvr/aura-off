/**
 * Npc.ts
 * Single NPC entity — manages its position, reaction state, and Phaser graphics.
 * AI decisions are driven by NpcCrowdController; this class just applies them.
 */
import Phaser from "phaser";
import { NPC } from "../../config/GameConfig";
import { NpcReactionState, Vec2 } from "../../core/types";

export class Npc {
  readonly id: number;
  x: number;
  y: number;
  reaction: NpcReactionState = "wandering";

  private gfx: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Ellipse;
  private eyeDot: Phaser.GameObjects.Ellipse;
  private label: Phaser.GameObjects.Text;
  private color: number;

  // Wander state
  private wanderTarget: Vec2 = { x: 0, y: 0 };
  private wanderTimer: number = 0;

  constructor(
    scene: Phaser.Scene,
    id: number,
    x: number,
    y: number,
    color: number
  ) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.color = color;

    // ---- Visuals ----
    this.body = scene.add.ellipse(0, 0, NPC.RADIUS * 2, NPC.RADIUS * 2, color);
    this.eyeDot = scene.add.ellipse(NPC.RADIUS * 0.4, -NPC.RADIUS * 0.3, 5, 5, 0x000000);
    this.label = scene.add
      .text(0, NPC.RADIUS + 4, "", {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#ffffff88",
      })
      .setOrigin(0.5, 0);

    this.gfx = scene.add.container(x, y, [this.body, this.eyeDot, this.label]);
    this.gfx.setDepth(2);

    this.wanderTarget = { x, y };
  }

  // ---------- Called each frame by NpcCrowdController ----------

  updateWander(dtSec: number, bounds: { minX: number; maxX: number; minY: number; maxY: number }): void {
    this.wanderTimer -= dtSec;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = NPC.WANDER_INTERVAL_SEC * (0.6 + Math.random() * 0.8);
      this.wanderTarget = {
        x: Phaser.Math.Between(bounds.minX, bounds.maxX),
        y: Phaser.Math.Between(bounds.minY, bounds.maxY),
      };
    }

    this.moveToward(this.wanderTarget, NPC.SPEED, dtSec);
  }

  facePlayer(playerPos: Vec2): void {
    const dx = playerPos.x - this.x;
    // Shift eye dot toward player direction
    const dir = dx > 0 ? 1 : -1;
    this.eyeDot.setPosition(NPC.RADIUS * 0.4 * dir, -NPC.RADIUS * 0.3);
  }

  fleeFrom(playerPos: Vec2, speed: number, dtSec: number): void {
    const dx = this.x - playerPos.x;
    const dy = this.y - playerPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    this.x += (dx / dist) * speed * dtSec;
    this.y += (dy / dist) * speed * dtSec;
    this.gfx.setPosition(this.x, this.y);
  }

  dramaticFlee(playerPos: Vec2, dtSec: number): void {
    this.fleeFrom(playerPos, NPC.DRAMATIC_FLEE_SPEED, dtSec);
  }

  setReaction(state: NpcReactionState): void {
    if (this.reaction === state) return;
    this.reaction = state;
    this.applyVisualReaction(state);
  }

  private applyVisualReaction(state: NpcReactionState): void {
    // Reset scale first
    this.gfx.setScale(1);

    switch (state) {
      case "wandering":
        this.body.setFillStyle(this.color);
        this.label.setText("");
        break;
      case "glancing":
        this.body.setFillStyle(this.color);
        this.label.setText("👀");
        break;
      case "stepping_back":
        this.body.setFillStyle(0xffaa33);
        this.label.setText("😬");
        break;
      case "fleeing":
        this.body.setFillStyle(0xff4444);
        this.label.setText("😨");
        break;
      case "dramatic_flee":
        this.body.setFillStyle(0xff0000);
        this.label.setText("😱");
        this.gfx.setScale(1.3);
        break;
    }
  }

  private moveToward(target: Vec2, speed: number, dtSec: number): void {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 4) return;
    const step = Math.min(speed * dtSec, dist);
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    this.gfx.setPosition(this.x, this.y);
  }

  /** Clamp position into bounds — called after movement. */
  clampToBounds(bounds: { minX: number; maxX: number; minY: number; maxY: number }): void {
    this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
    this.y = Phaser.Math.Clamp(this.y, bounds.minY, bounds.maxY);
    this.gfx.setPosition(this.x, this.y);
  }

  getPosition(): Vec2 {
    return { x: this.x, y: this.y };
  }

  /** Flash the NPC for a reaction moment. */
  flash(scene: Phaser.Scene): void {
    scene.tweens.add({
      targets: this.gfx,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 120,
      yoyo: true,
      ease: "Quad.easeOut",
    });
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
