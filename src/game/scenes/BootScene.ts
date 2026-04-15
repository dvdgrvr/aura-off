/**
 * BootScene
 *
 * First scene in the pipeline.
 * Responsible for any async setup that must happen before preloading
 * (e.g. checking saved prefs, reading URL params).
 * Transitions immediately to PreloadScene for now.
 */
import Phaser from 'phaser';
import { MobileInput } from '../input/MobileInput';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    // Initialize global mobile input listeners once per game lifecycle
    MobileInput.init();

    // Placeholder: no setup needed yet.
    this.scene.start('PreloadScene');
  }
}
