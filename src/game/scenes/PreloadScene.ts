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
    this.scene.start('ArenaScene');
  }
}
