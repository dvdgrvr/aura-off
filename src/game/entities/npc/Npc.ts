/**
 * Npc.ts
 * Single NPC entity — position, reaction state, and Phaser graphics.
 * AI decisions are made by NpcCrowdController; this class only applies them.
 */
import Phaser from "phaser";
import { NPC, VISUALS } from "../../config/GameConfig";
import { NpcReactionState, Vec2 } from "../../core/types";

const REACTION_STYLE: Record<
  NpcReactionState,
  { bodyTint: number; ringTint: number; scale: number; lean: number }
> = {
  wandering: { bodyTint: VISUALS.PALETTE.NPC_CORE, ringTint: VISUALS.PALETTE.NPC_RING, scale: 1.0, lean: 0 },
  glancing: { bodyTint: 0x474f60, ringTint: 0x8795aa, scale: 1.05, lean: 4 },
  stepping_back: { bodyTint: 0x584f59, ringTint: 0xa494a1, scale: 1.12, lean: 10 },
  fleeing: { bodyTint: VISUALS.PALETTE.NPC_ALERT, ringTint: 0xae8b96, scale: 1.08, lean: 14 },
  dramatic_flee: { bodyTint: 0x6b3a49, ringTint: 0xc06f7f, scale: 1.24, lean: 18 },
};

export class Npc {
  readonly id: number;
  x: number;
  y: number;
  reaction: NpcReactionState = "wandering";

  private gfx: Phaser.GameObjects.Container;
  private shadow: Phaser.GameObjects.Ellipse;
  private groundRing: Phaser.GameObjects.Ellipse;
  private stareRing: Phaser.GameObjects.Ellipse;
  private avatar?: Phaser.GameObjects.Image;
  private bodyRim: Phaser.GameObjects.Ellipse;
  private bodyTorso: Phaser.GameObjects.Ellipse;
  private bodyHead: Phaser.GameObjects.Ellipse;
  private lookMarker: Phaser.GameObjects.Ellipse;
  private ownColor: number;
  private hesitatePhase: number = 0;
  private swayPhase: number;
  private variantScale: number;

  private wanderTarget: Vec2;
  private wanderTimer: number = 0;

  constructor(scene: Phaser.Scene, id: number, x: number, y: number, color: number) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.ownColor = color;
    this.wanderTarget = { x, y };
    this.swayPhase = Math.random() * Math.PI * 2;
    this.variantScale = 1 + (Math.random() - 0.5) * VISUALS.NPC.VARIANT_SCALE_JITTER;

    const R = NPC.RADIUS;
    const nv = VISUALS.NPC;

    this.shadow = scene.add.ellipse(0, 0, R * nv.SHADOW_WIDTH, R * nv.SHADOW_HEIGHT, 0x000000, nv.SHADOW_ALPHA);
    this.groundRing = scene.add.ellipse(0, 0, R * 2.5, R * 1.18, VISUALS.PALETTE.NPC_RING, nv.RING_IDLE_ALPHA);
    this.stareRing = scene.add.ellipse(0, 0, R * 3.3, R * 1.85, 0xffffff, 0);
    const avatarKey = this._avatarKeyForId(id);
    if (scene.textures.exists(avatarKey)) {
      this.avatar = scene.add
        .image(0, 2, avatarKey)
        .setOrigin(0.5, 0.84)
        .setDisplaySize(R * 3.6, R * 3.6);
    }

    this.bodyRim = scene.add.ellipse(0, -R * 0.22, R * nv.BODY_RIM_WIDTH, R * nv.BODY_RIM_HEIGHT, 0xffffff, nv.BODY_RIM_ALPHA);
    this.bodyTorso = scene.add.ellipse(0, -R * 0.2, R * nv.BODY_WIDTH, R * nv.BODY_HEIGHT, this._blendBodyColor(VISUALS.PALETTE.NPC_CORE), 1);
    this.bodyHead = scene.add.ellipse(0, -R * 0.72, R * nv.HEAD_WIDTH, R * nv.HEAD_HEIGHT, this._blendBodyColor(VISUALS.PALETTE.NPC_CORE), 1);

    this.lookMarker = scene.add.ellipse(0, -R - 4, 3.5, 3.5, 0xd2d9e6, 0);

    this.gfx = scene.add.container(x, y, [
      this.shadow,
      this.groundRing,
      this.stareRing,
      ...(this.avatar ? [this.avatar] : []),
      this.bodyRim,
      this.bodyTorso,
      this.bodyHead,
      this.lookMarker,
    ]);
    this.gfx.setDepth(4);
    this.gfx.setScale(nv.BASE_SCALE * this.variantScale);
    if (this.avatar) {
      this.bodyRim.setAlpha(0.06);
      this.bodyTorso.setAlpha(0.05);
      this.bodyHead.setAlpha(0.05);
    }
  }

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
    this._applyIdleSway(dtSec, 0.55);
  }

  facePlayer(playerPos: Vec2): void {
    const dx = playerPos.x - this.x;
    const dy = playerPos.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    this.bodyHead.setX(nx * NPC.RADIUS * 0.22);
    this.bodyHead.setY(-NPC.RADIUS * 0.72 + ny * NPC.RADIUS * 0.13);
    this.bodyTorso.setAngle(nx * VISUALS.NPC.MAX_LEAN_DEG * 0.6);
    this.bodyRim.setAngle(nx * VISUALS.NPC.MAX_LEAN_DEG * 0.42);
    this.avatar?.setX(nx * NPC.RADIUS * 0.08);

    this.lookMarker.setPosition(
      nx * (NPC.RADIUS * 0.38),
      -NPC.RADIUS * 0.92 + ny * (NPC.RADIUS * 0.22)
    );
    this._applyIdleSway(1 / 60, 0.25);
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

  hesitate(dtSec: number, intensity: number): void {
    this.hesitatePhase += dtSec * (10 + intensity * 18);
    const wobble = Math.sin(this.hesitatePhase) * (2 + intensity * 9);
    this.gfx.setAngle(wobble);

    this.stareRing
      .setFillStyle(0xff7e88, 0.14 + intensity * 0.34)
      .setDisplaySize(
        NPC.RADIUS * (3.2 + intensity * 1.25),
        NPC.RADIUS * (1.85 + intensity * 0.7)
      );

    this.lookMarker.setAlpha(0.45 + Math.abs(Math.sin(this.hesitatePhase * 2.2)) * 0.5);
    this.avatar?.setAngle(wobble * 0.25);
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

  syncGfxPosition(): void {
    this.gfx.setPosition(this.x, this.y);
  }

  getPosition(): Vec2 {
    return { x: this.x, y: this.y };
  }

  flash(scene: Phaser.Scene): void {
    scene.tweens.add({
      targets: [this.groundRing, this.stareRing],
      scaleX: 1.35,
      scaleY: 1.35,
      alpha: 0,
      duration: 110,
      yoyo: true,
      ease: "Quad.easeOut",
    });
  }

  stumble(scene: Phaser.Scene): void {
    scene.tweens.killTweensOf(this.gfx);
    scene.tweens.chain({
      targets: this.gfx,
      tweens: [
        { angle: 28, scaleX: 1.18, scaleY: 0.86, duration: 70, ease: "Expo.Out" },
        { angle: -18, scaleX: 0.92, scaleY: 1.14, duration: 60, ease: "Quad.Out" },
        { angle: 6, scaleX: 1.06, scaleY: 0.94, duration: 80, ease: "Quad.Out" },
        { angle: 0, scaleX: 1.0, scaleY: 1.0, duration: 140, ease: "Bounce.Out" },
      ],
    });
  }

  dramaticReact(scene: Phaser.Scene, isRelease: boolean): void {
    scene.tweens.killTweensOf(this.gfx);
    const peakScale = isRelease ? 1.8 : 1.42;
    scene.tweens.chain({
      targets: this.gfx,
      tweens: [
        { scaleX: peakScale, scaleY: peakScale, duration: 70, ease: "Expo.Out" },
        { scaleX: 1.0, scaleY: 1.0, duration: 220, ease: "Bounce.Out" },
      ],
    });
    if (isRelease) this.stumble(scene);
  }

  destroy(): void {
    this.gfx.destroy();
  }

  private _applyReactionStyle(state: NpcReactionState): void {
    const style = REACTION_STYLE[state];
    this.gfx.setScale(style.scale * VISUALS.NPC.BASE_SCALE * this.variantScale);
    this.bodyTorso.setFillStyle(this._blendBodyColor(style.bodyTint));
    this.bodyHead.setFillStyle(this._blendBodyColor(style.bodyTint));
    this.bodyRim.setFillStyle(style.ringTint, VISUALS.NPC.BODY_RIM_ALPHA + (state === "stepping_back" || state === "fleeing" || state === "dramatic_flee" ? 0.05 : 0));
    this.bodyTorso.setAngle(style.lean);
    this.bodyRim.setAngle(style.lean * 0.72);
    if (this.avatar) {
      if (state === "fleeing" || state === "dramatic_flee") {
        this.avatar.setTint(0xe8d8dc);
      } else if (state === "stepping_back") {
        this.avatar.setTint(0xdee5ec);
      } else {
        this.avatar.clearTint();
      }
    }

    const isWatching = state === "glancing" || state === "stepping_back";
    const isAlert = state === "stepping_back" || state === "fleeing" || state === "dramatic_flee";

    this.lookMarker.setAlpha(isWatching || isAlert ? VISUALS.NPC.LOOK_MARKER_ALPHA : 0);
    this.lookMarker.setScale(isAlert ? 1.16 : 1.0);

    const ringAlpha =
      state === "stepping_back"
        ? VISUALS.NPC.RING_ALERT_ALPHA
        : state === "fleeing" || state === "dramatic_flee"
          ? VISUALS.NPC.RING_ALERT_ALPHA * 0.9
          : state === "glancing"
            ? VISUALS.NPC.RING_ATTENTION_ALPHA
            : VISUALS.NPC.RING_IDLE_ALPHA;

    this.groundRing
      .setFillStyle(style.ringTint, ringAlpha)
      .setDisplaySize(
        NPC.RADIUS * (2.45 + (isAlert ? 0.45 : isWatching ? 0.2 : 0)),
        NPC.RADIUS * (1.16 + (isAlert ? 0.15 : 0.08))
      );

    const stareAlpha = state === "stepping_back" ? 0.22 : state === "fleeing" ? 0.15 : state === "glancing" ? 0.1 : 0;
    this.stareRing
      .setFillStyle(style.ringTint, stareAlpha)
      .setDisplaySize(
        NPC.RADIUS * (3.1 + (state === "fleeing" || state === "dramatic_flee" ? 0.7 : 0.2)),
        NPC.RADIUS * (1.8 + (state === "fleeing" || state === "dramatic_flee" ? 0.4 : 0.15))
      );

    if (state !== "stepping_back" && state !== "fleeing") this.clearHesitation();
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

  private _blendBodyColor(baseColor: number): number {
    const source = Phaser.Display.Color.IntegerToColor(baseColor);
    const own = Phaser.Display.Color.IntegerToColor(this.ownColor);
    const mix = VISUALS.NPC.TINT_MIX;
    const r = Math.round(source.red * (1 - mix) + own.red * mix);
    const g = Math.round(source.green * (1 - mix) + own.green * mix);
    const b = Math.round(source.blue * (1 - mix) + own.blue * mix);
    return Phaser.Display.Color.GetColor(r, g, b);
  }

  private _applyIdleSway(dtSec: number, intensity: number): void {
    this.swayPhase += dtSec * (2.8 + intensity * 1.6);
    const sway = Math.sin(this.swayPhase) * VISUALS.NPC.IDLE_SWAY_DEG * intensity;
    this.bodyTorso.setAngle(this.bodyTorso.angle * 0.7 + sway * 0.3);
    this.bodyRim.setAngle(this.bodyRim.angle * 0.7 + sway * 0.22);
    this.bodyHead.setY(-NPC.RADIUS * 0.72 + Math.sin(this.swayPhase * 1.7) * 0.8 * intensity);
    this.avatar?.setY(2 + Math.sin(this.swayPhase * 1.5) * 0.6 * intensity);
  }

  private _avatarKeyForId(id: number): string {
    const idx = (id % 8) + 1;
    return `npc_avatar_hoodie_${idx.toString().padStart(2, "0")}`;
  }
}
