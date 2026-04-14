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
import { MainMenuScene } from "./game/scenes/MainMenuScene";
import { ArenaScene } from "./game/scenes/ArenaScene";
import { MultiplayerArenaScene } from "./game/scenes/MultiplayerArenaScene";
import { ResultScene } from "./game/scenes/ResultScene";
import { MobileInput } from "./game/input/MobileInput";

MobileInput.init();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  autoRound: true,
  backgroundColor: "#1a1a2e",
  parent: "game-container",
  render: {
    antialias: true,
    antialiasGL: true,
    roundPixels: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, PreloadScene, MainMenuScene, ArenaScene, MultiplayerArenaScene, ResultScene],
};

const game = new Phaser.Game(config);

// Expose for debugging in development
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__AURA_OFF__ = game;
}
