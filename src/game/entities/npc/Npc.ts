/**
 * Npc.ts
 * Single NPC entity — position, reaction state, and Phaser graphics.
 * AI decisions are made by NpcCrowdController; this class only applies them.
 */
import Phaser from "phaser";
import { NPC } from "../../config/GameConfig";
import { NpcReactionState, Vec2 } from "../../core/types";

// Per-state config: body color, emoji, scale multiplier
const REACTION_STYLE: Record<NpcReactionState, { color: number; emoji: string; scale: number }> = {
  wandering:     { color: -1,        emoji: "",   scale: 1.0 },
  glancing:      { color: -1,        emoji: "👀", scale: 1.08 },
  stepping_back: { color: 0xffcc55,  emoji: "😬", scale: 1.18 },
  fleeing:       { color: 0xff7722,  emoji: "😨", scale: 1.08 },
  dramatic_flee: { color: 0xff1111,  emoji: "😱", scale: 1.50 },
};

export class Npc {
  readonly id: number;
  x: number;
  y: number;
  reaction: NpcReactionState = "wandering";

  private gfx: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Ellipse;
  private eyeDot: Phaser.GameObjects.Ellipse;
  private reactionLabel: Phaser.GameObjects.Text;
  private attentionArrow: Phaser.GameObjects.Triangle;
  private stareRing: Phaser.GameObjects.Ellipse; // faint outline when staring
  private ownColor: number;
  private hesitatePhase: number = 0;

  // Wander
  private wanderTarget: Vec2;
  private wanderTimer: number = 0;

  constructor(scene: Phaser.Scene, id: number, x: number, y: number, color: number) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.ownColor = color;
    this.wanderTarget = { x, y };

    const R = NPC.RADIUS;

    this.body = scene.add.ellipse(0, 0, R * 2, R * 2, color);

    // Eye dot — shifts to indicate facing direction
    this.eyeDot = scene.add.ellipse(R * 0.4, -R * 0.3, 5, 5, 0x000000);

    // Small triangle above the NPC that swivels toward the player when glancing
    this.attentionArrow = scene.add.triangle(
      0, -R - 8,          // position: above body
      -5, 6,              // point left
      5, 6,               // point right
      0, -6,              // tip
      0xffffff, 0         // invisible until needed
    );

    this.reactionLabel = scene.add
      .text(0, R + 3, "", { fontFamily: "monospace", fontSize: "13px", color: "#ffffff" })
      .setOrigin(0.5, 0);

    // Highlight ring — shown when NPC is staring hard at player
    this.stareRing = scene.add.ellipse(0, 0, R * 3.2, R * 3.2, 0xffffff, 0);

    this.gfx = scene.add.container(x, y, [
      this.stareRing,
      this.body,
      this.eyeDot,
      this.attentionArrow,
      this.reactionLabel,
    ]);
    this.gfx.setDepth(2);
  }

  // ── Frame methods called by NpcCrowdController ──────────────────────────

  updateWander(dtSec: number, bounds: { minX: number; maxX: number; minY: number; maxY: number }): void {
    this.wanderTimer -= dtSec;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = NPC.WANDER_INTERVAL_SEC * (0.5 + Math.random());
      this.wanderTarget = {
        x: Phaser.Math.Between(bounds.minX, bounds.maxX),
        y: Phaser.Math.Between(bounds.minY, bounds.maxY),
      };
    }
    this._moveToward(this.wanderTarget, NPC.SPEED, dtSec);
  }

  /** Rotate eye dot and attention arrow toward the player. */
  facePlayer(playerPos: Vec2): void {
    const dx = playerPos.x - this.x;
    const dy = playerPos.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    // Eye: shift in full 2D toward player for stronger "watching" readability.
    this.eyeDot.setPosition(
      nx * NPC.RADIUS * 0.35,
      -NPC.RADIUS * 0.2 + ny * NPC.RADIUS * 0.28
    );

    // Attention arrow: rotate toward player
    const angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90; // +90 because triangle points up
    this.attentionArrow.setAngle(angle);
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

  /**
   * Visual hesitation loop for unstable-player moments.
   * No gameplay mutation here — this is presentation only.
   */
  hesitate(dtSec: number, intensity: number): void {
    this.hesitatePhase += dtSec * (10 + intensity * 18);
    const wobble = Math.sin(this.hesitatePhase) * (3 + intensity * 8);
    this.gfx.setAngle(wobble);
    this.stareRing.setFillStyle(0xff6666, 0.20 + intensity * 0.28);
    this.attentionArrow.setAlpha(0.55 + Math.abs(Math.sin(this.hesitatePhase * 2.3)) * 0.45);
  }

  clearHesitation(): void {
    this.gfx.setAngle(0);
  }

  setReaction(state: NpcReactionState): void {
    if (this.reaction === state) return;
    this.reaction = state;
    this._applyReactionStyle(state);
  }

  clampToBounds(bounds: { minX: number; maxX: number; minY: number; maxY: number }): void {
    this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
    this.y = Phaser.Math.Clamp(this.y, bounds.minY, bounds.maxY);
    this.gfx.setPosition(this.x, this.y);
  }

  /** Sync the container position to (this.x, this.y) after manual coordinate mutation. */
  syncGfxPosition(): void {
    this.gfx.setPosition(this.x, this.y);
  }

  getPosition(): Vec2 {
    return { x: this.x, y: this.y };
  }

  /** Pop scale flash — used on break/release crowd reaction. */
  flash(scene: Phaser.Scene): void {
    scene.tweens.add({
      targets: this.gfx,
      scaleX: 1.7,
      scaleY: 1.7,
      duration: 90,
      yoyo: true,
      ease: "Quad.easeOut",
    });
  }

  /** Bigger stumble — quick lean + shake, used on break reaction. */
  stumble(scene: Phaser.Scene): void {
    scene.tweens.killTweensOf(this.gfx);
    scene.tweens.chain({
      targets: this.gfx,
      tweens: [
        { angle:  35, scaleX: 1.3, scaleY: 0.8, duration:  70, ease: "Expo.Out" },
        { angle: -20, scaleX: 0.9, scaleY: 1.2, duration:  60, ease: "Quad.Out" },
        { angle:   8, scaleX: 1.1, scaleY: 0.95, duration: 80, ease: "Quad.Out" },
        { angle:   0, scaleX: 1.0, scaleY: 1.0,  duration: 140, ease: "Bounce.Out" },
      ],
    });
  }

  /** Flash + stumble combo — attention pop on any dramatic moment. */
  dramaticReact(scene: Phaser.Scene, isRelease: boolean): void {
    scene.tweens.killTweensOf(this.gfx);
    const peakScale = isRelease ? 1.9 : 1.5;
    scene.tweens.chain({
      targets: this.gfx,
      tweens: [
        { scaleX: peakScale, scaleY: peakScale, duration: 70,  ease: "Expo.Out" },
        { scaleX: 1.0,       scaleY: 1.0,       duration: 220, ease: "Bounce.Out" },
      ],
    });
    if (isRelease) {
      this.stumble(scene);
    }
  }

  destroy(): void {
    this.gfx.destroy();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _applyReactionStyle(state: NpcReactionState): void {
    const style = REACTION_STYLE[state];
    this.gfx.setScale(style.scale);
    this.body.setFillStyle(style.color === -1 ? this.ownColor : style.color);
    this.reactionLabel.setText(style.emoji);

    // Attention arrow: visible when actively noticing player
    const showArrow = state === "glancing" || state === "stepping_back";
    this.attentionArrow.setAlpha(showArrow ? 1.0 : 0);

    // Stare ring: glow outline when player has their full attention
    const stareIntensity = state === "stepping_back" ? 0.35
                         : state === "fleeing"       ? 0.20
                         : 0;
    this.stareRing.setFillStyle(0xffffff, stareIntensity);

    if (state !== "stepping_back" && state !== "fleeing") {
      this.clearHesitation();
    }
  }

  private _moveToward(target: Vec2, speed: number, dtSec: number): void {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 4) return;
    const step = Math.min(speed * dtSec, dist);
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    this.gfx.setPosition(this.x, this.y);
  }
}
