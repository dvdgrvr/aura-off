/**
 * main.ts — application entry point
 *
 * Initializes Phaser with the base game config and the scene pipeline.
 * No gameplay logic lives here — this is wiring only.
 *
 * Scene order:
 *   BootScene → PreloadScene → ArenaScene
 */
import Phaser from "phaser";
import { BootScene } from "./game/scenes/BootScene";
import { PreloadScene } from "./game/scenes/PreloadScene";
import { ArenaScene } from "./game/scenes/ArenaScene";
import { MultiplayerArenaScene } from "./game/scenes/MultiplayerArenaScene";
import { ResultScene } from "./game/scenes/ResultScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  backgroundColor: "#1a1a2e",
  parent: "game-container",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, PreloadScene, ArenaScene, MultiplayerArenaScene, ResultScene],
};

const game = new Phaser.Game(config);

// Expose for debugging in development
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__AURA_OFF__ = game;
}
