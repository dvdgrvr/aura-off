/**
 * BootScene
 *
 * First scene in the pipeline.
 * Responsible for any async setup that must happen before preloading
 * (e.g. checking saved prefs, reading URL params).
 * Transitions immediately to PreloadScene for now.
 */
import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    // Placeholder: no setup needed yet.
    this.scene.start('PreloadScene');
  }
}
