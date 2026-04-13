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
    // Placeholder: no assets to load yet.
  }

  create(): void {
    const params = new URLSearchParams(window.location.search);
    const mode = (params.get("mode") ?? "").toLowerCase();
    if (mode === "mp") {
      this.scene.start("MultiplayerArenaScene");
      return;
    }
    this.scene.start('ArenaScene');
  }
}
