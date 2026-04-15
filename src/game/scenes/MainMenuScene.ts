import Phaser from "phaser";
import { ARENA } from "../config/GameConfig";

type MenuField = "name" | "room" | "ws";

type MenuButton = {
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  onClick: () => void;
};

const STORAGE = {
  NAME: "aura_off_name",
  ROOM: "aura_off_last_room",
  WS: "aura_off_ws_url",
  ONBOARDING_SEEN: "aura_off_onboarding_seen_v1",
} as const;

export class MainMenuScene extends Phaser.Scene {
  private nameValue = "";
  private roomValue = "";
  private wsValue = "";
  private activeField: MenuField = "name";
  private errorText?: Phaser.GameObjects.Text;
  private fieldRows = new Map<MenuField, Phaser.GameObjects.Container>();
  private fieldValueTexts = new Map<MenuField, Phaser.GameObjects.Text>();
  private buttons: MenuButton[] = [];
  private keyHandler?: (ev: KeyboardEvent) => void;
  private onboardingStrip?: Phaser.GameObjects.Container;

  constructor() {
    super({ key: "MainMenuScene" });
  }

  create(): void {
    // Clear any existing button references from previous scene instances
    this.buttons = [];

    this._hydrateDefaults();
    this._buildBackdrop();
    this._buildLayout();
    this._buildOnboardingIfNeeded();
    this._refreshFieldVisuals();
    this._attachKeyboard();
    this.events.once("shutdown", () => {
      this._detachKeyboard();
      this._cleanup();
    });
    this.events.once("destroy", () => {
      this._detachKeyboard();
      this._cleanup();
    });
  }

  /**
   * Clean up scene resources before shutdown/destroy
   */
  private _cleanup(): void {
    // Clear all button references
    this.buttons = [];

    // Clear field references
    this.fieldRows.clear();
    this.fieldValueTexts.clear();

    // Clear error text reference
    this.errorText = undefined;

    // Clear onboarding strip reference
    if (this.onboardingStrip) {
      this.onboardingStrip = undefined;
    }
  }

  private _hydrateDefaults(): void {
    this.nameValue = (window.localStorage.getItem(STORAGE.NAME) ?? `P${Math.floor(Math.random() * 90 + 10)}`).slice(0, 16);
    this.roomValue = (window.localStorage.getItem(STORAGE.ROOM) ?? "").toUpperCase().slice(0, 6);
    this.wsValue =
      (window.localStorage.getItem(STORAGE.WS) ??
        `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:8787`).slice(0, 120);
  }

  private _buildBackdrop(): void {
    const w = ARENA.WIDTH;
    const h = ARENA.HEIGHT;
    this.add.rectangle(w / 2, h / 2, w, h, 0x071126).setDepth(0);
    this.add.ellipse(w / 2, h / 2 + 20, w * 0.9, h * 0.78, 0x0d2142, 0.95).setDepth(0);
    this.add.ellipse(w / 2, h / 2 - 84, w * 0.64, h * 0.36, 0x12315f, 0.5).setDepth(0);
    this.add.rectangle(w / 2, h / 2, w, h, 0x04070f, 0.36).setDepth(0);
  }

  private _buildLayout(): void {
    const w = ARENA.WIDTH;
    const h = ARENA.HEIGHT;
    const card = this.add.container(w / 2, h / 2).setDepth(10);

    const panel = this.add.rectangle(0, 0, 900, 560, 0x080f1f, 0.92).setStrokeStyle(2, 0x3e6ac8, 0.9);
    const title = this.add.text(0, -212, "AURA OFF", {
      fontFamily: "Verdana",
      fontSize: "58px",
      color: "#dff0ff",
      fontStyle: "bold",
    }).setOrigin(0.5);
    const subtitle = this.add.text(0, -166, "Train your aura timing, then face off in party chaos.", {
      fontFamily: "Verdana",
      fontSize: "18px",
      color: "#8bb0e4",
    }).setOrigin(0.5);

    const fields = this.add.container(0, -32);
    fields.add(this._createFieldRow("name", "Display Name", -68));
    fields.add(this._createFieldRow("room", "Room Code (optional: blank creates room)", 0));
    fields.add(this._createFieldRow("ws", "Server URL", 68));

    const buttonsY = 132;
    this.buttons.push(this._createButton(-140, buttonsY, 250, 54, "Train", () => this._startTraining()));
    this.buttons.push(this._createButton(160, buttonsY, 320, 54, "Party Match (2-4)", () => this._startPartyMatch()));
    const buttonsContainer = this.add.container(0, 0, this.buttons.flatMap((b) => [b.bg, b.label]));

    const hints = this.add.text(0, 178, "Tab switches fields • Enter quick-starts Party Match • Room blank = host new room", {
      fontFamily: "Verdana",
      fontSize: "14px",
      color: "#7f95be",
    }).setOrigin(0.5);

    this.errorText = this.add.text(0, 206, "", {
      fontFamily: "Verdana",
      fontSize: "15px",
      color: "#ff9ab1",
    }).setOrigin(0.5);

    card.add([panel, title, subtitle, fields, buttonsContainer, hints, this.errorText]);
  }

  private _buildOnboardingIfNeeded(): void {
    if (window.localStorage.getItem(STORAGE.ONBOARDING_SEEN) === "1") return;

    const card = this.add.container(ARENA.WIDTH / 2, ARENA.HEIGHT - 58).setDepth(14);
    const bg = this.add.rectangle(0, 0, 940, 74, 0x10264a, 0.94).setStrokeStyle(2, 0x7eb8ff, 0.9);
    const steps = this.add.text(
      -438,
      0,
      "Training: 1 Hold SPACE to build aura   2 Learn unstable warning   3 Release before break",
      {
        fontFamily: "Verdana",
        fontSize: "16px",
        color: "#e8f4ff",
      }
    ).setOrigin(0, 0.5);
    const close = this.add.rectangle(404, 0, 96, 40, 0x2b5ea9, 0.96).setStrokeStyle(2, 0xafd4ff, 0.95).setInteractive({ useHandCursor: true });
    const closeText = this.add.text(404, 0, "Got It", {
      fontFamily: "Verdana",
      fontSize: "16px",
      color: "#f3f9ff",
      fontStyle: "bold",
    }).setOrigin(0.5);

    close.on("pointerover", () => close.setFillStyle(0x3571c8, 1));
    close.on("pointerout", () => close.setFillStyle(0x2b5ea9, 0.96));
    close.on("pointerdown", () => {
      window.localStorage.setItem(STORAGE.ONBOARDING_SEEN, "1");
      this.tweens.add({
        targets: card,
        alpha: 0,
        y: ARENA.HEIGHT - 28,
        duration: 180,
        onComplete: () => card.destroy(),
      });
      this.onboardingStrip = undefined;
    });

    card.add([bg, steps, close, closeText]);
    this.onboardingStrip = card;
    this.tweens.add({
      targets: card,
      alpha: { from: 0, to: 1 },
      y: { from: ARENA.HEIGHT - 38, to: ARENA.HEIGHT - 58 },
      duration: 260,
      ease: "Quad.Out",
    });
  }

  private _createFieldRow(field: MenuField, label: string, y: number): Phaser.GameObjects.Container {
    const row = this.add.container(0, y);
    const bg = this.add.rectangle(0, 0, 720, 52, 0x0d1932, 0.94).setStrokeStyle(2, 0x35558f, 0.86).setInteractive({ useHandCursor: true });
    const lbl = this.add.text(-344, -18, label, {
      fontFamily: "Verdana",
      fontSize: "13px",
      color: "#95b1dc",
    }).setOrigin(0, 0.5);
    const value = this.add.text(-344, 6, "", {
      fontFamily: "Verdana",
      fontSize: "20px",
      color: "#f3f8ff",
    }).setOrigin(0, 0.5);

    bg.on("pointerdown", () => {
      this.activeField = field;
      this._refreshFieldVisuals();
    });
    row.add([bg, lbl, value]);
    this.fieldRows.set(field, row);
    this.fieldValueTexts.set(field, value);
    return row;
  }

  private _createButton(x: number, y: number, width: number, height: number, label: string, onClick: () => void): MenuButton {
    const bg = this.add.rectangle(x, y, width, height, 0x1d3b71, 0.95).setStrokeStyle(2, 0x8bc0ff, 0.92).setInteractive({ useHandCursor: true });
    const text = this.add.text(x, y, label, {
      fontFamily: "Verdana",
      fontSize: "20px",
      color: "#e8f5ff",
      fontStyle: "bold",
    }).setOrigin(0.5);

    bg.on("pointerover", () => bg.setFillStyle(0x28539e, 1));
    bg.on("pointerout", () => bg.setFillStyle(0x1d3b71, 0.95));
    bg.on("pointerdown", () => onClick());
    return { bg, label: text, onClick };
  }

  private _refreshFieldVisuals(): void {
    const values = {
      name: this.nameValue || "_",
      room: this.roomValue || "(blank: create room)",
      ws: this.wsValue || "_",
    } as const;
    (Object.keys(values) as MenuField[]).forEach((field) => {
      const row = this.fieldRows.get(field);
      const rowBg = row?.first as Phaser.GameObjects.Rectangle | undefined;
      const text = this.fieldValueTexts.get(field);
      if (!rowBg || !text) return;
      const active = this.activeField === field;
      rowBg.setStrokeStyle(active ? 2 : 2, active ? 0x9fcbff : 0x35558f, active ? 1 : 0.86);
      rowBg.setFillStyle(active ? 0x12274b : 0x0d1932, active ? 1 : 0.94);
      text.setText(`${active ? "> " : ""}${values[field]}`);
    });
  }

  private _attachKeyboard(): void {
    this.keyHandler = (ev: KeyboardEvent) => this._onKeyDown(ev);
    this.input.keyboard?.on("keydown", this.keyHandler);
  }

  private _detachKeyboard(): void {
    if (!this.keyHandler) return;
    this.input.keyboard?.off("keydown", this.keyHandler);
    this.keyHandler = undefined;
  }

  private _onKeyDown(ev: KeyboardEvent): void {
    if (ev.key === "Tab") {
      this.activeField = this.activeField === "name" ? "room" : this.activeField === "room" ? "ws" : "name";
      this._refreshFieldVisuals();
      ev.preventDefault();
      return;
    }

    if (ev.key === "Enter") {
      this.buttons[1].onClick();
      ev.preventDefault();
      return;
    }

    if (ev.key === "Escape") {
      this.errorText?.setText("");
      return;
    }

    if (ev.key === "Backspace") {
      if (this.activeField === "name") this.nameValue = this.nameValue.slice(0, -1);
      if (this.activeField === "room") this.roomValue = this.roomValue.slice(0, -1);
      if (this.activeField === "ws") this.wsValue = this.wsValue.slice(0, -1);
      this._refreshFieldVisuals();
      ev.preventDefault();
      return;
    }

    if (ev.key.length !== 1) return;
    if (this.activeField === "name") {
      if (this.nameValue.length < 16) this.nameValue += ev.key;
    } else if (this.activeField === "room") {
      if (/[a-zA-Z0-9]/.test(ev.key) && this.roomValue.length < 6) {
        this.roomValue += ev.key.toUpperCase();
      }
    } else {
      if (this.wsValue.length < 120) this.wsValue += ev.key;
    }
    this._refreshFieldVisuals();
  }

  private _startTraining(): void {
    this._persistMenuValues();
    this.scene.start("ArenaScene", { mode: "training" });
  }

  private _startPartyMatch(): void {
    this._persistMenuValues();
    const name = this.nameValue.trim().slice(0, 16);
    if (!name) {
      this.errorText?.setText("Please enter a display name.");
      return;
    }
    const roomCode = this.roomValue.trim().toUpperCase();
    this.scene.start("MultiplayerArenaScene", {
      menuConnect: {
        name,
        roomCode: roomCode || "",
        wsUrl: this.wsValue.trim(),
      },
    });
  }

  private _persistMenuValues(): void {
    window.localStorage.setItem(STORAGE.NAME, this.nameValue.trim().slice(0, 16));
    window.localStorage.setItem(STORAGE.ROOM, this.roomValue.trim().toUpperCase().slice(0, 6));
    window.localStorage.setItem(STORAGE.WS, this.wsValue.trim());
  }
}
