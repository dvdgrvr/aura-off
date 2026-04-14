import Phaser from "phaser";
import { AURA, ARENA, BREAK, MULTIPLAYER_NET, PLAYER, PRESSURE } from "../config/GameConfig";
import { MultiplayerClient } from "../net/MultiplayerClient";
import { MultiplayerEvent, NetPlayerState, NpcState, RoomSnapshot } from "../../shared/protocol";
import { Hud } from "../ui/Hud";
import { AuraTier } from "../core/types";

type RenderPlayer = {
  body: Phaser.GameObjects.Ellipse;
  aura: Phaser.GameObjects.Ellipse;
  name: Phaser.GameObjects.Text;
};

type RenderNpc = {
  body: Phaser.GameObjects.Ellipse;
};

type TimedSnapshot = {
  receivedAt: number;
  snapshot: RoomSnapshot;
};

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
  private predictedLocalPos?: { x: number; y: number };

  private hud!: Hud;
  private statusText?: Phaser.GameObjects.Text;
  private roomText?: Phaser.GameObjects.Text;
  private hintText?: Phaser.GameObjects.Text;
  private errorText?: Phaser.GameObjects.Text;

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

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW?: Phaser.Input.Keyboard.Key;
  private keyA?: Phaser.Input.Keyboard.Key;
  private keyS?: Phaser.Input.Keyboard.Key;
  private keyD?: Phaser.Input.Keyboard.Key;
  private keySpace?: Phaser.Input.Keyboard.Key;
  private keyEnter?: Phaser.Input.Keyboard.Key;
  private keyR?: Phaser.Input.Keyboard.Key;
  private releaseQueued = false;

  constructor() {
    super({ key: "MultiplayerArenaScene" });
  }

  create(): void {
    this._buildArena();
    this.hud = new Hud(this);
    this._buildOverlay();
    this._buildJoinModal();
    this._setupInput();
  }

  update(_time: number, delta: number): void {
    const dtSec = delta / 1000;
    if (this.joinModal) return;
    if (!this.joinConnected) return;

    this._sendInput();
    this._updatePredictedLocal(dtSec);
    this._renderFromSnapshots();
    this._handleRoundControls();
  }

  private _buildArena(): void {
    this.add.rectangle(ARENA.WIDTH / 2, ARENA.HEIGHT / 2, ARENA.WIDTH, ARENA.HEIGHT, 0x0f1020).setDepth(0);
    this.add.rectangle(ARENA.WIDTH / 2, ARENA.HEIGHT / 2, ARENA.WIDTH - 120, ARENA.HEIGHT - 120, 0x1a1f34, 1).setDepth(1);
    this.add
      .ellipse(ARENA.WIDTH / 2, ARENA.HEIGHT / 2, ARENA.CENTER_ZONE_RADIUS * 2, ARENA.CENTER_ZONE_RADIUS * 2, 0x2244aa, 0.16)
      .setDepth(1);
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
    window.localStorage.setItem("aura_off_name", name);

    this.joinModal?.destroy();
    this.joinModal = undefined;
    this.statusText?.setText("Connecting...");
    this.errorText?.setText("");

    this.client = new MultiplayerClient({
      onOpen: () => {
        this.client.send({ type: "hello", payload: { name, roomCode: room } });
      },
      onWelcome: (payload) => {
        this.playerId = payload.playerId;
        this.roomCode = payload.roomCode;
        this.inviteUrl = payload.inviteUrl;
        this.roomText?.setText(`Room: ${this.roomCode}`);
        this.joinConnected = true;
      },
      onSnapshot: (snap) => this._onSnapshot(snap),
      onError: (message) => this.errorText?.setText(message),
      onClose: () => {
        this.joinConnected = false;
        this.statusText?.setText("Disconnected from server.");
      },
    });
    this.client.connect(this.joinWsValue);

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

    for (const p of sampled.players) {
      const rp = this.renderPlayers.get(p.id);
      if (!rp) continue;
      const target = { ...p.position };

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

      rp.body.x += (target.x - rp.body.x) * MULTIPLAYER_NET.REMOTE_POSITION_LERP;
      rp.body.y += (target.y - rp.body.y) * MULTIPLAYER_NET.REMOTE_POSITION_LERP;
      rp.aura.x += (target.x - rp.aura.x) * MULTIPLAYER_NET.REMOTE_AURA_LERP;
      rp.aura.y += (target.y - rp.aura.y) * MULTIPLAYER_NET.REMOTE_AURA_LERP;
      rp.name.x += (target.x - rp.name.x) * MULTIPLAYER_NET.REMOTE_NAME_LERP;
      rp.name.y += (target.y - 32 - rp.name.y) * MULTIPLAYER_NET.REMOTE_NAME_LERP;

      const auraAlpha = p.isCharging ? 0.20 + (p.aura / 100) * 0.45 : (p.aura / 100) * 0.15;
      rp.aura.setFillStyle(p.isReleased ? 0x88ffd1 : 0x66aaff, auraAlpha);
      rp.aura.setDisplaySize(58 + p.aura * 0.9, 58 + p.aura * 0.9);
      rp.body.setStrokeStyle(p.id === this.playerId ? 3 : 2, p.id === this.playerId ? 0xffffff : 0x111222, 0.85);

      if (p.isBroken) rp.body.setFillStyle(0xff5577, 1);
      else if (p.isReleased) rp.body.setFillStyle(0x99ffd6, 1);
      else rp.body.setFillStyle(0xdde6ff, 1);
    }

    for (const n of sampled.npcs) {
      const rn = this.renderNpcs.get(n.id);
      if (!rn) continue;
      rn.body.x += (n.position.x - rn.body.x) * 0.42;
      rn.body.y += (n.position.y - rn.body.y) * 0.42;
      const c =
        n.reaction === "stepping_back" ? 0xffb266 :
        n.reaction === "hesitating" ? 0xff8899 :
        n.reaction === "watching" ? 0xbad7ff : 0xc9cedb;
      const alpha = 0.50 + n.intensity * 0.45;
      rn.body.setFillStyle(c, alpha);
      rn.body.setScale(1 + n.intensity * 0.22);
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
        rp.body.destroy();
        rp.aura.destroy();
        rp.name.destroy();
        this.renderPlayers.delete(id);
      }
    }
    for (const p of players) {
      if (this.renderPlayers.has(p.id)) continue;
      const aura = this.add.ellipse(p.position.x, p.position.y, 58, 58, 0x66aaff, 0).setDepth(6);
      const body = this.add.ellipse(p.position.x, p.position.y, 34, 34, 0xdde6ff, 1).setDepth(7);
      const name = this.add.text(p.position.x, p.position.y - 32, p.name, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#dce6ff",
        stroke: "#08111e",
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(8);
      this.renderPlayers.set(p.id, { body, aura, name });
    }
  }

  private _reconcileRenderNpcs(npcs: NpcState[]): void {
    const liveIds = new Set(npcs.map((n) => n.id));
    for (const [id, rn] of this.renderNpcs.entries()) {
      if (!liveIds.has(id)) {
        rn.body.destroy();
        this.renderNpcs.delete(id);
      }
    }
    for (const n of npcs) {
      if (this.renderNpcs.has(n.id)) continue;
      const body = this.add.ellipse(n.position.x, n.position.y, 24, 24, 0xc9cedb, 0.6).setDepth(4);
      this.renderNpcs.set(n.id, { body });
    }
  }

  private _updateOverlay(snapshot: RoomSnapshot): void {
    const me = snapshot.players.find((p) => p.id === this.playerId);
    const isHost = this.playerId && snapshot.hostId === this.playerId;
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
      this.statusText?.setText(`Lobby ${snapshot.roomCode} • ${snapshot.players.length}/4 players`);
      this.hintText?.setText(`${isHost ? "[ENTER] start round" : "Waiting for host..."}   Invite: ${this.inviteUrl || "-"}`);
    } else if (snapshot.phase === "in_round") {
      this.statusText?.setText("Round live");
      const danger = me && me.pressure >= BREAK.DANGER_ZONE_THRESHOLD ? "  •  Danger rising" : "";
      this.hintText?.setText(me ? `${me.name}  Aura ${me.aura.toFixed(0)}  Pressure ${me.pressure.toFixed(0)}${danger}` : "Round live");
    } else {
      const winner = snapshot.players.find((p) => p.id === snapshot.winnerPlayerId);
      this.statusText?.setText(winner ? `Round over • Winner: ${winner.name}` : "Round over • No winner");
      this.hintText?.setText("[R] toggle rematch ready   [ENTER] host can also start");
    }
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
      } else if (event.type === "break") {
        this.hud.showCallout(this, event.actorName ? `Public break: ${event.actorName}` : "Public break", "#ff8aa0", 1100);
      } else if (event.type === "cascade") {
        const label = event.targetName
          ? `${event.targetName} felt the shock`
          : "Cascade pressure";
        this.hud.showCallout(this, label, "#ffbf8a", 950);
      } else if (event.type === "release") {
        this.hud.showCallout(this, event.actorName ? `${event.actorName} held nerve` : "Release landed", "#8ce7ff", 900);
      }
    }
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
}
