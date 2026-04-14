import Phaser from "phaser";
import { AURA, ARENA, BREAK, MULTIPLAYER_NET, MULTIPLAYER_READABILITY, PLAYER, PRESSURE } from "../config/GameConfig";
import { MultiplayerClient } from "../net/MultiplayerClient";
import { DisruptPulseState, MultiplayerEvent, NetPlayerState, NpcState, RoomSnapshot } from "../../shared/protocol";
import { Hud } from "../ui/Hud";
import { AuraTier } from "../core/types";
import { MobileInput } from "../input/MobileInput";

type RenderPlayer = {
  shadow: Phaser.GameObjects.Ellipse;
  dominantShell: Phaser.GameObjects.Ellipse;
  unstable: Phaser.GameObjects.Ellipse;
  leaderBeacon: Phaser.GameObjects.Ellipse;
  avatar: Phaser.GameObjects.Image;
  avatarBaseSize: number;
  aura: Phaser.GameObjects.Ellipse;
  name: Phaser.GameObjects.Text;
};

type RenderNpc = {
  shadow: Phaser.GameObjects.Ellipse;
  avatar: Phaser.GameObjects.Image;
  avatarBaseSize: number;
  ring: Phaser.GameObjects.Ellipse;
};

type RenderDisruptPulse = {
  ring: Phaser.GameObjects.Ellipse;
};

type TimedSnapshot = {
  receivedAt: number;
  snapshot: RoomSnapshot;
};

const MP_AVATAR_KEYS = [
  "mp_avatar_hoodie_cyan",
  "mp_avatar_hoodie_red",
  "mp_avatar_hoodie_violet",
  "mp_avatar_hoodie_green",
] as const;

const MP_NPC_AVATAR_KEYS = [
  "npc_avatar_hoodie_01",
  "npc_avatar_hoodie_02",
  "npc_avatar_hoodie_03",
  "npc_avatar_hoodie_04",
  "npc_avatar_hoodie_05",
  "npc_avatar_hoodie_06",
  "npc_avatar_hoodie_07",
  "npc_avatar_hoodie_08",
] as const;

export class MultiplayerArenaScene extends Phaser.Scene {
  private client!: MultiplayerClient;
  private playerId: string = "";
  private roomCode: string = "";
  private inviteUrl: string = "";

  private snapshots: TimedSnapshot[] = [];
  private interpolationDelayMs = MULTIPLAYER_NET.INTERPOLATION_DELAY_MS;
  private maxExtrapolationMs = MULTIPLAYER_NET.MAX_EXTRAPOLATION_MS;

  private renderPlayers = new Map<string, RenderPlayer>();
  private renderNpcs = new Map<string, RenderNpc>();
  private renderDisruptPulses = new Map<number, RenderDisruptPulse>();
  private predictedLocalPos?: { x: number; y: number };

  private hud!: Hud;
  private statusText?: Phaser.GameObjects.Text;
  private roomText?: Phaser.GameObjects.Text;
  private hintText?: Phaser.GameObjects.Text;
  private errorText?: Phaser.GameObjects.Text;
  private lobbyCard?: Phaser.GameObjects.Container;
  private lobbyRoomValueText?: Phaser.GameObjects.Text;
  private lobbyInviteValueText?: Phaser.GameObjects.Text;
  private lobbyCopyBtn?: Phaser.GameObjects.Rectangle;
  private lobbyCopyBtnText?: Phaser.GameObjects.Text;

  private joinModal?: Phaser.GameObjects.Container;
  private joinNameText?: Phaser.GameObjects.Text;
  private joinRoomText?: Phaser.GameObjects.Text;
  private joinActiveField: "name" | "room" = "name";
  private joinNameValue = "";
  private joinRoomValue = "";
  private joinWsValue = "";
  private joinConnected = false;
  private typedListenerBound = false;
  private phaseLast?: RoomSnapshot["phase"];
  private seenEventIds = new Set<number>();
  private lastEventType?: MultiplayerEvent["type"];
  private lastEventCalloutMs = 0;
  private correctionCount = 0;
  private correctionCountWindow = 0;
  private correctionWindowStartMs = 0;
  private netDebugText?: Phaser.GameObjects.Text;
  private menuConnectData?: { name: string; roomCode?: string; wsUrl: string };

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW?: Phaser.Input.Keyboard.Key;
  private keyA?: Phaser.Input.Keyboard.Key;
  private keyS?: Phaser.Input.Keyboard.Key;
  private keyD?: Phaser.Input.Keyboard.Key;
  private keySpace?: Phaser.Input.Keyboard.Key;
  private keyEnter?: Phaser.Input.Keyboard.Key;
  private keyR?: Phaser.Input.Keyboard.Key;
  private keyQ?: Phaser.Input.Keyboard.Key;
  private releaseQueued = false;

  constructor() {
    super({ key: "MultiplayerArenaScene" });
  }

  init(data?: { menuConnect?: { name: string; roomCode?: string; wsUrl: string } }): void {
    this.menuConnectData = data?.menuConnect;
  }

  create(): void {
    this._buildArena();
    this.hud = new Hud(this);
    this._buildOverlay();
    this._setupInput();
    if (this.menuConnectData) {
      this._connectUsing(
        this.menuConnectData.name,
        this.menuConnectData.roomCode,
        this.menuConnectData.wsUrl
      );
    } else {
      this._buildJoinModal();
    }
  }

  update(_time: number, delta: number): void {
    MobileInput.update();
    const dtSec = delta / 1000;
    if (this.joinModal) return;
    if (!this.joinConnected) return;

    this._sendInput();
    this._updatePredictedLocal(dtSec);
    this._renderFromSnapshots();
    this._handleRoundControls();
  }

  private _buildArena(): void {
    const hasArenaArt = this.textures.exists("arena_bg_futuristic");
    if (hasArenaArt) {
      this.add.image(ARENA.WIDTH / 2, ARENA.HEIGHT / 2, "arena_bg_futuristic").setDisplaySize(ARENA.WIDTH, ARENA.HEIGHT).setDepth(0);
      this.add.rectangle(ARENA.WIDTH / 2, ARENA.HEIGHT / 2, ARENA.WIDTH, ARENA.HEIGHT, 0x0d1324, 0.32).setDepth(0);
    } else {
      this.add.rectangle(ARENA.WIDTH / 2, ARENA.HEIGHT / 2, ARENA.WIDTH, ARENA.HEIGHT, 0x0f1020).setDepth(0);
      this.add.rectangle(ARENA.WIDTH / 2, ARENA.HEIGHT / 2, ARENA.WIDTH - 120, ARENA.HEIGHT - 120, 0x1a1f34, 1).setDepth(1);
      this.add
        .ellipse(ARENA.WIDTH / 2, ARENA.HEIGHT / 2, ARENA.CENTER_ZONE_RADIUS * 2, ARENA.CENTER_ZONE_RADIUS * 2, 0x2244aa, 0.16)
        .setDepth(1);
    }
  }

  private _buildOverlay(): void {
    this.statusText = this.add
      .text(ARENA.WIDTH / 2, 28, "Join a room to begin.", {
        fontFamily: "monospace",
        fontSize: "20px",
        color: "#b8d6ff",
      })
      .setOrigin(0.5, 0)
      .setDepth(40);

    this.roomText = this.add
      .text(18, 18, "Room: ----", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#99bbee",
      })
      .setDepth(40);

    this._buildLobbyCard();

    this.hintText = this.add
      .text(ARENA.WIDTH / 2, ARENA.HEIGHT - 18, "", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#8fa0bb",
      })
      .setOrigin(0.5, 1)
      .setDepth(40);

    this.errorText = this.add
      .text(ARENA.WIDTH / 2, ARENA.HEIGHT - 50, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#ff8899",
      })
      .setOrigin(0.5, 1)
      .setDepth(40);

    if (import.meta.env.DEV) {
      this.netDebugText = this.add
        .text(ARENA.WIDTH - 16, ARENA.HEIGHT - 64, "", {
          fontFamily: "monospace",
          fontSize: "11px",
          color: "#85f8c0",
        })
        .setOrigin(1, 1)
        .setDepth(40);
    }
  }

  private _buildLobbyCard(): void {
    const x = ARENA.WIDTH - 220;
    const y = 56;
    const panel = this.add.rectangle(x, y, 408, 108, 0x081226, 0.92).setStrokeStyle(2, 0x4269ad, 0.86).setDepth(41);
    const roomLabel = this.add.text(x - 188, y - 30, "Room", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#85a2d1",
    }).setOrigin(0, 0.5).setDepth(42);
    this.lobbyRoomValueText = this.add.text(x - 188, y - 12, "----", {
      fontFamily: "monospace",
      fontSize: "18px",
      color: "#e8f2ff",
    }).setOrigin(0, 0.5).setDepth(42);
    const inviteLabel = this.add.text(x - 188, y + 16, "Invite", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#85a2d1",
    }).setOrigin(0, 0.5).setDepth(42);
    this.lobbyInviteValueText = this.add.text(x - 188, y + 34, "-", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#d4e8ff",
    }).setOrigin(0, 0.5).setDepth(42);
    this.lobbyCopyBtn = this.add.rectangle(x + 146, y + 34, 84, 28, 0x1d3f76, 0.95).setStrokeStyle(2, 0x90c0ff, 0.9).setDepth(42).setInteractive({ useHandCursor: true });
    this.lobbyCopyBtnText = this.add.text(x + 146, y + 34, "Copy", {
      fontFamily: "monospace",
      fontSize: "13px",
      color: "#eef7ff",
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(43);

    this.lobbyCopyBtn.on("pointerover", () => this.lobbyCopyBtn?.setFillStyle(0x2a579a, 1));
    this.lobbyCopyBtn.on("pointerout", () => this.lobbyCopyBtn?.setFillStyle(0x1d3f76, 0.95));
    this.lobbyCopyBtn.on("pointerdown", () => this._copyInviteToClipboard());

    this.lobbyCard = this.add.container(0, 0, [
      panel,
      roomLabel,
      this.lobbyRoomValueText,
      inviteLabel,
      this.lobbyInviteValueText,
      this.lobbyCopyBtn,
      this.lobbyCopyBtnText,
    ]).setDepth(41);
  }

  private async _copyInviteToClipboard(): Promise<void> {
    const raw = this.inviteUrl || this.roomCode;
    if (!raw) {
      this.hud.showCallout(this, "No invite yet", "#ff9ab1", 700);
      return;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(raw);
      } else {
        const ta = document.createElement("textarea");
        ta.value = raw;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      this.hud.showCallout(this, "Invite copied", "#9affde", 850);
      this.lobbyCopyBtnText?.setText("Copied");
      this.time.delayedCall(900, () => this.lobbyCopyBtnText?.setText("Copy"));
    } catch (_err) {
      this.hud.showCallout(this, "Clipboard blocked", "#ff9ab1", 900);
    }
  }

  private _buildJoinModal(): void {
    const params = new URLSearchParams(window.location.search);
    const prefillName =
      params.get("name") ??
      window.localStorage.getItem("aura_off_name") ??
      `P${Math.floor(Math.random() * 90 + 10)}`;
    const prefillRoom = (params.get("room") ?? "").toUpperCase();
    const prefillWs =
      params.get("ws") ??
      `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:8787`;

    this.joinNameValue = prefillName.slice(0, 16);
    this.joinRoomValue = prefillRoom.slice(0, 6);
    this.joinWsValue = prefillWs;

    const panel = this.add.container(ARENA.WIDTH / 2, ARENA.HEIGHT / 2).setDepth(80);
    const bg = this.add.rectangle(0, 0, 620, 340, 0x050811, 0.93).setStrokeStyle(2, 0x4560a8, 0.8);
    const title = this.add
      .text(0, -128, "Multiplayer Join", {
        fontFamily: "monospace",
        fontSize: "28px",
        color: "#d4e7ff",
      })
      .setOrigin(0.5);
    const help = this.add
      .text(0, -88, "Type name + optional room code, then press ENTER", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#9ab4dd",
      })
      .setOrigin(0.5);
    this.joinNameText = this.add
      .text(-260, -24, "", {
        fontFamily: "monospace",
        fontSize: "20px",
        color: "#ffffff",
      })
      .setOrigin(0, 0.5);
    this.joinRoomText = this.add
      .text(-260, 42, "", {
        fontFamily: "monospace",
        fontSize: "20px",
        color: "#ffffff",
      })
      .setOrigin(0, 0.5);
    const wsText = this.add
      .text(0, 104, `WS: ${this.joinWsValue}`, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#8ca2cc",
      })
      .setOrigin(0.5);

    panel.add([bg, title, help, this.joinNameText, this.joinRoomText, wsText]);
    this.joinModal = panel;
    this._refreshJoinLabels();

    if (!this.typedListenerBound) {
      this.input.keyboard?.on("keydown", (ev: KeyboardEvent) => this._onJoinKey(ev));
      this.typedListenerBound = true;
    }
  }

  private _onJoinKey(ev: KeyboardEvent): void {
    if (!this.joinModal) return;

    if (ev.key === "Tab") {
      this.joinActiveField = this.joinActiveField === "name" ? "room" : "name";
      this._refreshJoinLabels();
      ev.preventDefault();
      return;
    }

    if (ev.key === "Enter") {
      this._beginConnect();
      ev.preventDefault();
      return;
    }

    if (ev.key === "Backspace") {
      if (this.joinActiveField === "name") {
        this.joinNameValue = this.joinNameValue.slice(0, -1);
      } else {
        this.joinRoomValue = this.joinRoomValue.slice(0, -1);
      }
      this._refreshJoinLabels();
      ev.preventDefault();
      return;
    }

    if (ev.key.length === 1) {
      if (this.joinActiveField === "name") {
        if (this.joinNameValue.length < 16) this.joinNameValue += ev.key;
      } else {
        if (/[a-zA-Z0-9]/.test(ev.key) && this.joinRoomValue.length < 6) {
          this.joinRoomValue += ev.key.toUpperCase();
        }
      }
      this._refreshJoinLabels();
    }
  }

  private _refreshJoinLabels(): void {
    if (!this.joinNameText || !this.joinRoomText) return;
    const namePrefix = this.joinActiveField === "name" ? "> " : "  ";
    const roomPrefix = this.joinActiveField === "room" ? "> " : "  ";
    this.joinNameText.setText(`${namePrefix}Name: ${this.joinNameValue || "_"}`);
    this.joinRoomText.setText(`${roomPrefix}Room: ${this.joinRoomValue || "(new)"}`);
  }

  private _beginConnect(): void {
    const name = this.joinNameValue.trim().slice(0, 16) || `P${Math.floor(Math.random() * 90 + 10)}`;
    const room = this.joinRoomValue.trim().toUpperCase() || undefined;
    this._connectUsing(name, room, this.joinWsValue);
  }

  private _connectUsing(name: string, roomCode: string | undefined, wsUrl: string): void {
    window.localStorage.setItem("aura_off_name", name);
    window.localStorage.setItem("aura_off_ws_url", wsUrl);
    window.localStorage.setItem("aura_off_last_room", roomCode ?? "");

    this.joinModal?.destroy();
    this.joinModal = undefined;
    this.statusText?.setText("Connecting...");
    this.errorText?.setText("");

    this.client = new MultiplayerClient({
      onOpen: () => {
        this.client.send({ type: "hello", payload: { name, roomCode } });
      },
      onWelcome: (payload) => {
        this.playerId = payload.playerId;
        this.roomCode = payload.roomCode;
        this.inviteUrl = payload.inviteUrl;
        this.roomText?.setText(`Room: ${this.roomCode}`);
        this.lobbyRoomValueText?.setText(this.roomCode || "----");
        this.lobbyInviteValueText?.setText(this._shortInviteLabel(this.inviteUrl));
        this.joinConnected = true;
      },
      onSnapshot: (snap) => this._onSnapshot(snap),
      onError: (message) => this.errorText?.setText(message),
      onClose: () => {
        this.joinConnected = false;
        this.statusText?.setText("Disconnected from server.");
      },
    });
    this.client.connect(wsUrl);

    this.events.once("shutdown", () => this.client.disconnect());
    this.events.once("destroy", () => this.client.disconnect());
  }

  private _setupInput(): void {
    if (!this.input.keyboard) return;
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyQ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.keyEnter = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.keyR = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
  }

  private _sendInput(): void {
    const latest = this.snapshots[this.snapshots.length - 1]?.snapshot;
    if (!latest || latest.phase !== "in_round") return;

    let moveX = 0;
    let moveY = 0;
    if (this.keyA?.isDown || this.cursors?.left.isDown) moveX -= 1;
    if (this.keyD?.isDown || this.cursors?.right.isDown) moveX += 1;
    if (this.keyW?.isDown || this.cursors?.up.isDown) moveY -= 1;
    if (this.keyS?.isDown || this.cursors?.down.isDown) moveY += 1;

    const isCharging = !!this.keySpace?.isDown;
    if (this.keySpace && Phaser.Input.Keyboard.JustUp(this.keySpace)) {
      this.releaseQueued = true;
    }
    if ((this.keyQ && Phaser.Input.Keyboard.JustDown(this.keyQ)) || MobileInput.skillJustDown) {
      this.client.send({
        type: "ability_use",
        payload: { abilityType: "disrupt_pulse" },
      });
    }

    this.client.send({
      type: "input",
      payload: {
        moveX,
        moveY,
        isCharging,
        wantsRelease: this.releaseQueued,
        clientSendMs: import.meta.env.DEV ? Date.now() : undefined,
      },
    });
    this.releaseQueued = false;
  }

  private _updatePredictedLocal(dtSec: number): void {
    const latest = this.snapshots[this.snapshots.length - 1]?.snapshot;
    if (!latest || latest.phase !== "in_round") return;
    const me = latest.players.find((p) => p.id === this.playerId);
    if (!me) return;

    if (!this.predictedLocalPos) {
      this.predictedLocalPos = { ...me.position };
    }

    let moveX = 0;
    let moveY = 0;
    if (this.keyA?.isDown || this.cursors?.left.isDown) moveX -= 1;
    if (this.keyD?.isDown || this.cursors?.right.isDown) moveX += 1;
    if (this.keyW?.isDown || this.cursors?.up.isDown) moveY -= 1;
    if (this.keyS?.isDown || this.cursors?.down.isDown) moveY += 1;
    const len = Math.hypot(moveX, moveY);
    if (len > 0.001) {
      moveX /= len;
      moveY /= len;
    }

    const speed = (this.keySpace?.isDown ? PLAYER.SPEED * PLAYER.CHARGE_SPEED_MULT : PLAYER.SPEED) * 0.95;
    this.predictedLocalPos.x = Phaser.Math.Clamp(
      this.predictedLocalPos.x + moveX * speed * dtSec,
      ARENA.BORDER + PLAYER.RADIUS,
      ARENA.WIDTH - ARENA.BORDER - PLAYER.RADIUS
    );
    this.predictedLocalPos.y = Phaser.Math.Clamp(
      this.predictedLocalPos.y + moveY * speed * dtSec,
      ARENA.BORDER + PLAYER.RADIUS,
      ARENA.HEIGHT - ARENA.BORDER - PLAYER.RADIUS
    );
  }

  private _onSnapshot(snapshot: RoomSnapshot): void {
    this.snapshots.push({ receivedAt: performance.now(), snapshot });
    if (this.snapshots.length > 30) {
      this.snapshots.splice(0, this.snapshots.length - 30);
    }
    this._updateOverlay(snapshot);
  }

  private _renderFromSnapshots(): void {
    if (this.snapshots.length === 0) return;
    const renderTime = performance.now() - this.interpolationDelayMs;
    const sampled = this._sampleSnapshot(renderTime);
    this._reconcileRenderPlayers(sampled.players);
    this._reconcileRenderNpcs(sampled.npcs);
    this._reconcileDisruptPulses(sampled.activeDisruptPulses);
    const leader = this._currentLeader(sampled.players);

    for (const p of sampled.players) {
      const rp = this.renderPlayers.get(p.id);
      if (!rp) continue;
      const target = { ...p.position };
      const preX = rp.avatar.x;
      const preY = rp.avatar.y;

      if (p.id === this.playerId && this.predictedLocalPos) {
        const err = Phaser.Math.Distance.Between(
          this.predictedLocalPos.x,
          this.predictedLocalPos.y,
          p.position.x,
          p.position.y
        );
        if (err > MULTIPLAYER_NET.LOCAL_HARD_SNAP_ERROR_PX) {
          this.predictedLocalPos = { ...p.position };
          this.correctionCount += 1;
        } else {
          this.predictedLocalPos.x +=
            (p.position.x - this.predictedLocalPos.x) * MULTIPLAYER_NET.LOCAL_SOFT_RECONCILE_LERP;
          this.predictedLocalPos.y +=
            (p.position.y - this.predictedLocalPos.y) * MULTIPLAYER_NET.LOCAL_SOFT_RECONCILE_LERP;
        }
        target.x = this.predictedLocalPos.x;
        target.y = this.predictedLocalPos.y;
      }

      rp.shadow.x += (target.x - rp.shadow.x) * MULTIPLAYER_NET.REMOTE_POSITION_LERP;
      rp.shadow.y += (target.y + 6 - rp.shadow.y) * MULTIPLAYER_NET.REMOTE_POSITION_LERP;
      rp.avatar.x += (target.x - rp.avatar.x) * MULTIPLAYER_NET.REMOTE_POSITION_LERP;
      rp.avatar.y += (target.y + 2 - rp.avatar.y) * MULTIPLAYER_NET.REMOTE_POSITION_LERP;
      rp.dominantShell.x += (target.x - rp.dominantShell.x) * MULTIPLAYER_NET.REMOTE_AURA_LERP;
      rp.dominantShell.y += (target.y - rp.dominantShell.y) * MULTIPLAYER_NET.REMOTE_AURA_LERP;
      rp.unstable.x += (target.x - rp.unstable.x) * MULTIPLAYER_NET.REMOTE_AURA_LERP;
      rp.unstable.y += (target.y - rp.unstable.y) * MULTIPLAYER_NET.REMOTE_AURA_LERP;
      rp.leaderBeacon.x += (target.x - rp.leaderBeacon.x) * MULTIPLAYER_NET.REMOTE_AURA_LERP;
      rp.leaderBeacon.y += (target.y - rp.leaderBeacon.y) * MULTIPLAYER_NET.REMOTE_AURA_LERP;
      rp.aura.x += (target.x - rp.aura.x) * MULTIPLAYER_NET.REMOTE_AURA_LERP;
      rp.aura.y += (target.y - rp.aura.y) * MULTIPLAYER_NET.REMOTE_AURA_LERP;
      rp.name.x += (target.x - rp.name.x) * MULTIPLAYER_NET.REMOTE_NAME_LERP;
      rp.name.y += (target.y - 56 - rp.name.y) * MULTIPLAYER_NET.REMOTE_NAME_LERP;

      const auraNorm = Phaser.Math.Clamp(p.aura / AURA.MAX, 0, 1);
      const isLeader = leader?.id === p.id;
      const isUnstable = p.isCharging && p.pressure >= BREAK.UNSTABLE_VISUAL_THRESHOLD && !p.isBroken && !p.isReleased;
      const isDominant = auraNorm >= 0.66 && !p.isBroken && !p.isReleased;
      const pulse = 0.5 + Math.sin(performance.now() * 0.008) * 0.5;
      const motionDx = target.x - preX;
      const motionDy = (target.y + 2) - preY;
      const motionMag = Math.hypot(motionDx, motionDy);
      const moving = motionMag >= MULTIPLAYER_READABILITY.REMOTE_MOVE_THRESHOLD_PX_PER_SEC;
      const moveTilt = Phaser.Math.Clamp(motionDx * 0.12, -MULTIPLAYER_READABILITY.REMOTE_MOVE_TILT_DEG, MULTIPLAYER_READABILITY.REMOTE_MOVE_TILT_DEG);
      const moveBob = moving ? Math.sin(performance.now() * MULTIPLAYER_READABILITY.REMOTE_MOVE_BOB_SPEED) * MULTIPLAYER_READABILITY.REMOTE_MOVE_BOB_AMPLITUDE : 0;
      const auraScaleBoost = isLeader ? MULTIPLAYER_READABILITY.LEADER_AURA_BOOST_SCALE : 1;
      const auraAlpha = p.isCharging ? 0.24 + auraNorm * 0.52 : auraNorm * 0.14;

      const jitter = isUnstable ? (Math.random() - 0.5) * MULTIPLAYER_READABILITY.UNSTABLE_JITTER_PX : 0;
      rp.avatar.x += jitter;
      rp.avatar.y += jitter * 0.6;

      rp.shadow
        .setFillStyle(0x000000, 0.28 + auraNorm * 0.12)
        .setDisplaySize(30 + auraNorm * 18, 14 + auraNorm * 8);

      rp.aura.setFillStyle(p.isReleased ? 0x99ffe1 : 0x6caeff, auraAlpha);
      rp.aura.setDisplaySize((58 + p.aura * 0.92) * auraScaleBoost, (58 + p.aura * 0.92) * auraScaleBoost);
      rp.dominantShell
        .setFillStyle(
          isDominant ? 0xffd37a : 0x6aa9ff,
          isDominant ? 0.10 + auraNorm * 0.16 : auraNorm * 0.06
        )
        .setDisplaySize(64 + p.aura * 1.15, 64 + p.aura * 1.15);

      rp.unstable
        .setDisplaySize(44 + auraNorm * 48, 44 + auraNorm * 48)
        .setFillStyle(
          0xff4466,
          isUnstable
            ? Phaser.Math.Linear(
                MULTIPLAYER_READABILITY.UNSTABLE_FLICKER_MIN,
                MULTIPLAYER_READABILITY.UNSTABLE_FLICKER_MAX,
                pulse
              )
            : 0
        );

      rp.leaderBeacon
        .setDisplaySize(84 + auraNorm * 120 + pulse * 18, 84 + auraNorm * 120 + pulse * 18)
        .setFillStyle(0xffdc8a, isLeader ? MULTIPLAYER_READABILITY.LEADER_BEACON_ALPHA : 0);

      if (p.isBroken) {
        rp.avatar
          .setTint(0xff6888)
          .setAngle(0)
          .setDisplaySize(
            rp.avatarBaseSize * 1.06,
            rp.avatarBaseSize * MULTIPLAYER_READABILITY.BROKEN_SQUASH_Y
          );
        rp.name.setColor("#ff91a8").setText(`${p.name}  [BROKE]`);
      } else if (p.isReleased) {
        rp.avatar
          .setTint(0xa8ffe2)
          .setAngle(0)
          .setDisplaySize(
            rp.avatarBaseSize * MULTIPLAYER_READABILITY.RELEASED_BLOOM_SCALE,
            rp.avatarBaseSize * MULTIPLAYER_READABILITY.RELEASED_BLOOM_SCALE
          );
        rp.name.setColor("#9affda").setText(`${p.name}  [RELEASED]`);
      } else if (isUnstable) {
        const s = 1.02 + pulse * 0.1;
        rp.avatar
          .setTint(0xffb2b2)
          .setAngle(moveTilt)
          .setY(rp.avatar.y + moveBob)
          .setDisplaySize(rp.avatarBaseSize * s, rp.avatarBaseSize * s);
        rp.name.setColor("#ffb3b3").setText(`${p.name}  [UNSTABLE]`);
      } else if (isDominant) {
        rp.avatar
          .setTint(0xffefc4)
          .setAngle(moveTilt)
          .setY(rp.avatar.y + moveBob)
          .setDisplaySize(rp.avatarBaseSize * 1.08, rp.avatarBaseSize * 1.08);
        rp.name.setColor(isLeader ? MULTIPLAYER_READABILITY.LEADER_NAME_COLOR : "#ffe5b8").setText(`${p.name}  [DOMINANT]`);
      } else if (auraNorm >= 0.30) {
        rp.avatar
          .setTint(0xe4f0ff)
          .setAngle(moveTilt)
          .setY(rp.avatar.y + moveBob)
          .setDisplaySize(rp.avatarBaseSize * 1.02, rp.avatarBaseSize * 1.02);
        rp.name.setColor("#cde4ff").setText(`${p.name}  [BUILDING]`);
      } else {
        rp.avatar.clearTint().setAngle(moveTilt).setY(rp.avatar.y + moveBob).setDisplaySize(rp.avatarBaseSize, rp.avatarBaseSize);
        rp.name.setColor("#dce6ff").setText(`${p.name}`);
      }
      if (p.id === this.playerId && !p.isBroken && !p.isReleased && !isUnstable) {
        rp.avatar.setTint(0xf4faff);
      }
      if (!p.isBroken && !p.isReleased && p.readabilityState === "critical") {
        rp.name.setColor("#ff8da1").setText(`${p.name}  [CRITICAL]`);
      } else if (!p.isBroken && !p.isReleased && p.readabilityState === "danger" && !isUnstable) {
        rp.name.setColor("#ffd3a8").setText(`${p.name}  [DANGER]`);
      }
      if (isLeader && !p.isBroken && !p.isReleased) {
        rp.name.setText(`${p.name}  [LEADING]`);
      }
    }

    for (const n of sampled.npcs) {
      const rn = this.renderNpcs.get(n.id);
      if (!rn) continue;
      rn.shadow.x += (n.position.x - rn.shadow.x) * 0.42;
      rn.shadow.y += (n.position.y + 4 - rn.shadow.y) * 0.42;
      rn.avatar.x += (n.position.x - rn.avatar.x) * 0.42;
      rn.avatar.y += (n.position.y + 2 - rn.avatar.y) * 0.42;
      rn.ring.x += (n.position.x - rn.ring.x) * 0.42;
      rn.ring.y += (n.position.y - rn.ring.y) * 0.42;
      rn.shadow
        .setFillStyle(0x000000, 0.17 + n.intensity * 0.12)
        .setDisplaySize(20 + n.intensity * 12, 10 + n.intensity * 5);
      const npcScale = 0.72 + n.intensity * 0.14;
      rn.avatar.setDisplaySize(rn.avatarBaseSize * npcScale, rn.avatarBaseSize * npcScale);
      if (n.reaction === "stepping_back") {
        rn.avatar.setTint(0xf4e3cf);
      } else if (n.reaction === "hesitating") {
        rn.avatar.setTint(0xf2cad5);
      } else if (n.reaction === "watching") {
        rn.avatar.setTint(0xdce9f6);
      } else {
        rn.avatar.clearTint();
      }
      const ringColor =
        n.reaction === "stepping_back" ? 0xffb85f :
        n.reaction === "hesitating" ? 0xff6d88 :
        n.reaction === "watching" ? 0x8cc9ff : 0x9ba9bf;
      const ringAlpha =
        n.reaction === "stepping_back"
          ? MULTIPLAYER_READABILITY.NPC_BACKOFF_RING_ALPHA * n.intensity
          : n.reaction === "watching" || n.reaction === "hesitating"
            ? MULTIPLAYER_READABILITY.NPC_ATTENTION_RING_ALPHA * n.intensity
            : 0.07;
      rn.ring
        .setFillStyle(ringColor, ringAlpha)
        .setDisplaySize(34 + n.intensity * 46, 34 + n.intensity * 46);
    }

    const me = sampled.players.find((p) => p.id === this.playerId);
    if (me) {
      const auraNorm = Phaser.Math.Clamp(me.aura / AURA.MAX, 0, 1);
      const pressureNorm = Phaser.Math.Clamp(me.pressure / PRESSURE.MAX, 0, 1);
      const tier = this._tierForAura(me.aura);
      this.hud.update(
        this,
        auraNorm,
        tier.label,
        tier.color,
        pressureNorm,
        me.pressure >= BREAK.DANGER_ZONE_THRESHOLD,
        sampled.timerSec
      );
    }

    if (import.meta.env.DEV) {
      this._updateNetDebug(sampled);
    }
  }

  private _sampleSnapshot(renderTime: number): RoomSnapshot {
    if (this.snapshots.length === 1) return this.snapshots[0].snapshot;
    const latest = this.snapshots[this.snapshots.length - 1];
    if (performance.now() - latest.receivedAt > MULTIPLAYER_NET.STALE_SNAPSHOT_MS) {
      return latest.snapshot;
    }

    let older = this.snapshots[0];
    let newer = this.snapshots[this.snapshots.length - 1];
    for (let i = 0; i < this.snapshots.length - 1; i++) {
      const a = this.snapshots[i];
      const b = this.snapshots[i + 1];
      if (a.receivedAt <= renderTime && b.receivedAt >= renderTime) {
        older = a;
        newer = b;
        break;
      }
      if (renderTime > b.receivedAt) {
        older = b;
        newer = b;
      }
    }

    if (older === newer) {
      const prev = this.snapshots[Math.max(0, this.snapshots.length - 2)];
      const last = this.snapshots[this.snapshots.length - 1];
      return this._extrapolateSnapshot(prev, last, Math.min(this.maxExtrapolationMs, renderTime - last.receivedAt));
    }

    const span = Math.max(1, newer.receivedAt - older.receivedAt);
    const t = Phaser.Math.Clamp((renderTime - older.receivedAt) / span, 0, 1);
    return this._interpolateSnapshots(older.snapshot, newer.snapshot, t);
  }

  private _interpolateSnapshots(a: RoomSnapshot, b: RoomSnapshot, t: number): RoomSnapshot {
    return {
      ...b,
      players: b.players.map((pb) => {
        const pa = a.players.find((p) => p.id === pb.id) ?? pb;
        return {
          ...pb,
          position: {
            x: Phaser.Math.Linear(pa.position.x, pb.position.x, t),
            y: Phaser.Math.Linear(pa.position.y, pb.position.y, t),
          },
        };
      }),
      npcs: b.npcs.map((nb) => {
        const na = a.npcs.find((n) => n.id === nb.id) ?? nb;
        return {
          ...nb,
          position: {
            x: Phaser.Math.Linear(na.position.x, nb.position.x, t),
            y: Phaser.Math.Linear(na.position.y, nb.position.y, t),
          },
        };
      }),
    };
  }

  private _extrapolateSnapshot(prev: TimedSnapshot, last: TimedSnapshot, dtMs: number): RoomSnapshot {
    const dtSec = Math.max(0, dtMs / 1000);
    const spanSec = Math.max(0.001, (last.receivedAt - prev.receivedAt) / 1000);
    return {
      ...last.snapshot,
      players: last.snapshot.players.map((p2) => {
        const p1 = prev.snapshot.players.find((p) => p.id === p2.id) ?? p2;
        const vx = (p2.position.x - p1.position.x) / spanSec;
        const vy = (p2.position.y - p1.position.y) / spanSec;
        return {
          ...p2,
          position: {
            x: Phaser.Math.Clamp(p2.position.x + vx * dtSec, ARENA.BORDER + PLAYER.RADIUS, ARENA.WIDTH - ARENA.BORDER - PLAYER.RADIUS),
            y: Phaser.Math.Clamp(p2.position.y + vy * dtSec, ARENA.BORDER + PLAYER.RADIUS, ARENA.HEIGHT - ARENA.BORDER - PLAYER.RADIUS),
          },
        };
      }),
      npcs: last.snapshot.npcs.map((n2) => {
        const n1 = prev.snapshot.npcs.find((n) => n.id === n2.id) ?? n2;
        const vx = (n2.position.x - n1.position.x) / spanSec;
        const vy = (n2.position.y - n1.position.y) / spanSec;
        return {
          ...n2,
          position: {
            x: Phaser.Math.Clamp(n2.position.x + vx * dtSec, ARENA.BORDER + 18, ARENA.WIDTH - ARENA.BORDER - 18),
            y: Phaser.Math.Clamp(n2.position.y + vy * dtSec, ARENA.BORDER + 18, ARENA.HEIGHT - ARENA.BORDER - 18),
          },
        };
      }),
    };
  }

  private _reconcileRenderPlayers(players: NetPlayerState[]): void {
    const liveIds = new Set(players.map((p) => p.id));
    for (const [id, rp] of this.renderPlayers.entries()) {
      if (!liveIds.has(id)) {
        rp.shadow.destroy();
        rp.dominantShell.destroy();
        rp.unstable.destroy();
        rp.leaderBeacon.destroy();
        rp.avatar.destroy();
        rp.aura.destroy();
        rp.name.destroy();
        this.renderPlayers.delete(id);
      }
    }
    for (const p of players) {
      if (this.renderPlayers.has(p.id)) continue;
      const shadow = this.add.ellipse(p.position.x, p.position.y + 6, 32, 14, 0x000000, 0.3).setDepth(4);
      const leaderBeacon = this.add.ellipse(p.position.x, p.position.y, 90, 90, 0xffdc8a, 0).setDepth(5);
      const dominantShell = this.add.ellipse(p.position.x, p.position.y, 66, 66, 0x7eb3ff, 0.04).setDepth(6);
      const aura = this.add.ellipse(p.position.x, p.position.y, 58, 58, 0x66aaff, 0).setDepth(7);
      const unstable = this.add.ellipse(p.position.x, p.position.y, 44, 44, 0xff4466, 0).setDepth(8);
      const avatar = this.add
        .image(p.position.x, p.position.y + 2, this._avatarKeyForPlayer(p.id))
        .setOrigin(0.5, 0.82)
        .setDisplaySize(62, 62)
        .setDepth(9);
      const name = this.add.text(p.position.x, p.position.y - 56, p.name, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#dce6ff",
        stroke: "#08111e",
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(10);
      this.renderPlayers.set(p.id, {
        shadow,
        dominantShell,
        unstable,
        leaderBeacon,
        avatar,
        avatarBaseSize: 62,
        aura,
        name,
      });
    }
  }

  private _reconcileRenderNpcs(npcs: NpcState[]): void {
    const liveIds = new Set(npcs.map((n) => n.id));
    for (const [id, rn] of this.renderNpcs.entries()) {
      if (!liveIds.has(id)) {
        rn.shadow.destroy();
        rn.avatar.destroy();
        rn.ring.destroy();
        this.renderNpcs.delete(id);
      }
    }
    for (const n of npcs) {
      if (this.renderNpcs.has(n.id)) continue;
      const shadow = this.add.ellipse(n.position.x, n.position.y + 4, 22, 10, 0x000000, 0.2).setDepth(3);
      const ring = this.add.ellipse(n.position.x, n.position.y, 34, 34, 0x9ba9bf, 0.08).setDepth(3);
      const avatar = this.add
        .image(n.position.x, n.position.y + 2, this._npcAvatarKeyForId(n.id))
        .setOrigin(0.5, 0.84)
        .setDisplaySize(48, 48)
        .setDepth(4);
      this.renderNpcs.set(n.id, { shadow, avatar, avatarBaseSize: 48, ring });
    }
  }

  private _reconcileDisruptPulses(pulses: DisruptPulseState[]): void {
    const liveIds = new Set(pulses.map((p) => p.id));
    for (const [id, rp] of this.renderDisruptPulses.entries()) {
      if (!liveIds.has(id)) {
        rp.ring.destroy();
        this.renderDisruptPulses.delete(id);
      }
    }
    for (const pulse of pulses) {
      let rp = this.renderDisruptPulses.get(pulse.id);
      if (!rp) {
        const ring = this.add
          .ellipse(pulse.x, pulse.y, 12, 12, 0xff9f73, 0.06)
          .setStrokeStyle(3, 0xff9f73, 0.95)
          .setDepth(8);
        rp = { ring };
        this.renderDisruptPulses.set(pulse.id, rp);
      }
      const t = Phaser.Math.Clamp(pulse.telegraphMsRemaining / 650, 0, 1);
      const build = 1 - t;
      rp.ring
        .setPosition(pulse.x, pulse.y)
        .setDisplaySize(36 + pulse.radius * build, 36 + pulse.radius * build)
        .setStrokeStyle(3, 0xff9f73, 0.65 + build * 0.35)
        .setFillStyle(0xff9f73, 0.04 + build * 0.06);
    }
  }

  private _updateOverlay(snapshot: RoomSnapshot): void {
    const me = snapshot.players.find((p) => p.id === this.playerId);
    const isHost = this.playerId && snapshot.hostId === this.playerId;
    const stateText = me ? me.readabilityState.toUpperCase() : "SAFE";
    if (snapshot.phase !== this.phaseLast) {
      if (snapshot.phase === "in_round") this.hud.showCallout(this, "ROUND START", "#88e5ff", 700);
      if (snapshot.phase === "result") {
        const winner = snapshot.players.find((p) => p.id === snapshot.winnerPlayerId);
        this.hud.showCallout(this, winner ? `WINNER: ${winner.name}` : "ROUND OVER", "#ffd980", 1200);
      }
      this.phaseLast = snapshot.phase;
    }
    this._emitEventCallouts(snapshot);

    if (snapshot.phase === "lobby") {
      this.statusText?.setText(`Party Lobby ${snapshot.roomCode} • ${snapshot.players.length}/4`);
      this.hintText?.setText(`${isHost ? "[ENTER] start round" : "Waiting for host..."}   Invite: ${this.inviteUrl || "-"}`);
      this.lobbyCard?.setVisible(true);
    } else if (snapshot.phase === "in_round") {
      const leader = this._currentLeader(snapshot.players);
      this.statusText?.setText(leader ? `Party Match • Leader: ${leader.name}` : "Party Match");
      this.hintText?.setText(`State ${stateText} • Q disrupt pulse • Watch unstable flicker and crowd reactions`);
      this.lobbyCard?.setVisible(true);
    } else {
      const winner = snapshot.players.find((p) => p.id === snapshot.winnerPlayerId);
      this.statusText?.setText(winner ? `Party Over • Winner: ${winner.name}` : "Party Over • No winner");
      const reasonText = snapshot.lastEndReason === "timer" ? "Timer aura lead" : "Last composure standing";
      this.hintText?.setText(`${reasonText} • [R] rematch ready • [ENTER] host starts`);
      this.lobbyCard?.setVisible(true);
    }
    this.lobbyRoomValueText?.setText(snapshot.roomCode || this.roomCode || "----");
    this.lobbyInviteValueText?.setText(this._shortInviteLabel(this.inviteUrl));
  }

  private _shortInviteLabel(url: string): string {
    if (!url) return "-";
    return url.length > 28 ? `${url.slice(0, 25)}...` : url;
  }

  private _emitEventCallouts(snapshot: RoomSnapshot): void {
    for (const event of snapshot.lastEvents) {
      if (this.seenEventIds.has(event.id)) continue;
      this.seenEventIds.add(event.id);
      const now = performance.now();
      if (
        this.lastEventType === event.type &&
        now - this.lastEventCalloutMs < MULTIPLAYER_NET.CALL_OUT_DUPLICATE_SUPPRESS_MS
      ) {
        continue;
      }
      this.lastEventType = event.type;
      this.lastEventCalloutMs = now;
      if (event.type === "perfect_release") {
        this.hud.showCallout(this, "Perfect timing", "#9affde", 1100);
        this._emitWorldBurstForEvent(snapshot, event, 0x9affde, 180);
      } else if (event.type === "break") {
        this.hud.showCallout(this, event.actorName ? `Public break: ${event.actorName}` : "Public break", "#ff8aa0", 1100);
        this._emitWorldBurstForEvent(snapshot, event, 0xff6d8b, 160);
      } else if (event.type === "cascade") {
        const label = event.targetName
          ? `${event.targetName} felt the shock`
          : "Cascade pressure";
        this.hud.showCallout(this, label, "#ffbf8a", 950);
        this._emitWorldBurstForEvent(snapshot, event, 0xffbf8a, 140);
      } else if (event.type === "release") {
        this.hud.showCallout(this, event.actorName ? `${event.actorName} held nerve` : "Release landed", "#8ce7ff", 900);
        this._emitWorldBurstForEvent(snapshot, event, 0x8ce7ff, 150);
      } else if (event.type === "ability_telegraph") {
        this.hud.showCallout(
          this,
          event.actorName ? `${event.actorName} charging disrupt pulse` : "Disrupt pulse telegraph",
          "#ffbf8a",
          760
        );
      } else if (event.type === "ability_resolve") {
        this.hud.showCallout(
          this,
          event.actorName ? `${event.actorName} disrupt pulse hit` : "Disrupt pulse hit",
          "#ff9f73",
          700
        );
        this._emitWorldBurstForEvent(snapshot, event, 0xff9f73, 220);
      } else if (event.type === "ability_denied" && event.actorPlayerId === this.playerId) {
        this.hud.showCallout(this, "Disrupt pulse unavailable", "#ff9ab1", 650);
      }
    }
  }

  private _emitWorldBurstForEvent(
    snapshot: RoomSnapshot,
    event: MultiplayerEvent,
    color: number,
    maxRadius: number
  ): void {
    const actor = event.actorPlayerId
      ? snapshot.players.find((p) => p.id === event.actorPlayerId)
      : undefined;
    const target = event.targetPlayerId
      ? snapshot.players.find((p) => p.id === event.targetPlayerId)
      : undefined;
    if (actor) this._playWorldBurst(actor.position.x, actor.position.y, color, maxRadius);
    if (target && target.id !== actor?.id) {
      this._playWorldBurst(target.position.x, target.position.y, color, Math.max(80, maxRadius * 0.72));
    }
  }

  private _playWorldBurst(x: number, y: number, color: number, maxRadius: number): void {
    const burst = this.add.ellipse(x, y, 22, 22, color, 0.36).setDepth(11);
    this.tweens.add({
      targets: burst,
      displayWidth: maxRadius,
      displayHeight: maxRadius,
      alpha: 0,
      duration: MULTIPLAYER_READABILITY.EVENT_WORLD_BURST_DURATION_MS,
      ease: "Expo.Out",
      onComplete: () => burst.destroy(),
    });
  }

  private _currentLeader(players: NetPlayerState[]): NetPlayerState | undefined {
    const alive = players.filter((p) => !p.isBroken && !p.isReleased);
    if (alive.length === 0) return players[0];
    return [...alive].sort((a, b) => b.aura - a.aura)[0];
  }

  private _updateNetDebug(sampled: RoomSnapshot): void {
    if (!this.netDebugText) return;
    const latest = this.snapshots[this.snapshots.length - 1];
    const snapshotAgeMs = latest ? Math.max(0, performance.now() - latest.receivedAt) : 0;
    const now = performance.now();
    if (now - this.correctionWindowStartMs >= 1000) {
      this.correctionCountWindow = this.correctionCount;
      this.correctionCount = 0;
      this.correctionWindowStartMs = now;
    }

    let rttText = "RTT --";
    const meDebug = sampled.netDebug?.players.find((p) => p.playerId === this.playerId);
    if (meDebug?.echoedClientSendMs) {
      const rtt = Math.max(0, Date.now() - meDebug.echoedClientSendMs);
      rttText = `RTT ${Math.round(rtt)}ms`;
    }
    this.netDebugText.setText(
      `${rttText}  •  SnapAge ${Math.round(snapshotAgeMs)}ms  •  Corrections/s ${this.correctionCountWindow}`
    );
  }

  private _handleRoundControls(): void {
    const latest = this.snapshots[this.snapshots.length - 1]?.snapshot;
    if (!latest) return;
    if (this.keyEnter && Phaser.Input.Keyboard.JustDown(this.keyEnter)) {
      this.client.send({ type: "start_round", payload: {} });
    }
    if (this.keyR && Phaser.Input.Keyboard.JustDown(this.keyR)) {
      const me = latest.players.find((p) => p.id === this.playerId);
      if (!me) return;
      this.client.send({ type: "rematch_ready", payload: { ready: !me.rematchReady } });
    }
  }

  private _tierForAura(aura: number): AuraTier {
    let tier: AuraTier = AURA.TIERS[0];
    for (const t of AURA.TIERS) {
      if (aura >= t.min) tier = t;
    }
    return tier;
  }

  private _avatarKeyForPlayer(playerId: string): string {
    let hash = 0;
    for (let i = 0; i < playerId.length; i++) {
      hash = ((hash << 5) - hash + playerId.charCodeAt(i)) | 0;
    }
    const idx = Math.abs(hash) % MP_AVATAR_KEYS.length;
    return MP_AVATAR_KEYS[idx];
  }

  private _npcAvatarKeyForId(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
    }
    const idx = Math.abs(hash) % MP_NPC_AVATAR_KEYS.length;
    return MP_NPC_AVATAR_KEYS[idx];
  }
}
