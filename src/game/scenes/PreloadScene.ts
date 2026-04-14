/**
 * PreloadScene
 *
 * Handles all asset loading before the game starts.
 * Assets (sprites, audio, tilemaps) will be queued here as they are created.
 * Transitions to ArenaScene once loading is complete.
 */
import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload(): void {
    this.load.image("arena_bg_futuristic", "assets/arena/arena_futuristic.png");
    this.load.image("mp_avatar_hoodie_cyan", "assets/characters/player_hoodie_cyan.png");
    this.load.image("mp_avatar_hoodie_red", "assets/characters/player_hoodie_red.png");
    this.load.image("mp_avatar_hoodie_violet", "assets/characters/player_hoodie_violet.png");
    this.load.image("mp_avatar_hoodie_green", "assets/characters/player_hoodie_green.png");
    this.load.spritesheet("player_anim_idle", "assets/characters/player_anim/player_idle_strip.png", {
      frameWidth: 192,
      frameHeight: 192,
    });
    this.load.spritesheet("player_anim_charge", "assets/characters/player_anim/player_charge_strip.png", {
      frameWidth: 192,
      frameHeight: 192,
    });
    this.load.spritesheet("player_anim_unstable", "assets/characters/player_anim/player_unstable_strip.png", {
      frameWidth: 192,
      frameHeight: 192,
    });
    this.load.spritesheet("player_anim_release", "assets/characters/player_anim/player_release_strip.png", {
      frameWidth: 192,
      frameHeight: 192,
    });
    this.load.spritesheet("player_anim_break", "assets/characters/player_anim/player_break_strip.png", {
      frameWidth: 192,
      frameHeight: 192,
    });
    for (let i = 1; i <= 8; i++) {
      const id = i.toString().padStart(2, "0");
      this.load.image(`npc_avatar_hoodie_${id}`, `assets/characters/npc/npc_hoodie_${id}.png`);
    }
  }

  create(): void {
    const params = new URLSearchParams(window.location.search);
    const mode = (params.get("mode") ?? "").toLowerCase();
    if (mode === "mp") {
      this.scene.start("MultiplayerArenaScene");
      return;
    }
    if (mode === "sp") {
      this.scene.start("ArenaScene");
      return;
    }
    this.scene.start("MainMenuScene");
  }
}
