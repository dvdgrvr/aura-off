import Phaser from "phaser";
import { ARENA } from "../config/GameConfig";
import { MultiplayerClient } from "../net/MultiplayerClient";
import { NetPlayerState, RoomSnapshot } from "../../shared/protocol";

type RenderPlayer = {
  body: Phaser.GameObjects.Ellipse;
  aura: Phaser.GameObjects.Ellipse;
  name: Phaser.GameObjects.Text;
};

export class MultiplayerArenaScene extends Phaser.Scene {
  private client!: MultiplayerClient;
  private playerId: string = "";
  private roomCode: string = "";
  private inviteUrl: string = "";
  private snapshot?: RoomSnapshot;
  private renderPlayers = new Map<string, RenderPlayer>();
  private errorText?: Phaser.GameObjects.Text;
  private statusText?: Phaser.GameObjects.Text;
  private timerText?: Phaser.GameObjects.Text;
  private roomText?: Phaser.GameObjects.Text;
  private hintText?: Phaser.GameObjects.Text;
  private keyEnter?: Phaser.Input.Keyboard.Key;
  private keyR?: Phaser.Input.Keyboard.Key;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW?: Phaser.Input.Keyboard.Key;
  private keyA?: Phaser.Input.Keyboard.Key;
  private keyS?: Phaser.Input.Keyboard.Key;
  private keyD?: Phaser.Input.Keyboard.Key;
  private keySpace?: Phaser.Input.Keyboard.Key;
  private releaseQueued: boolean = false;

  constructor() {
    super({ key: "MultiplayerArenaScene" });
  }

  create(): void {
    this.add.rectangle(ARENA.WIDTH / 2, ARENA.HEIGHT / 2, ARENA.WIDTH, ARENA.HEIGHT, 0x0f1020).setDepth(0);
    this.add
      .rectangle(ARENA.WIDTH / 2, ARENA.HEIGHT / 2, ARENA.WIDTH - 120, ARENA.HEIGHT - 120, 0x1a1f34, 1)
      .setDepth(1);
    this.add
      .ellipse(ARENA.WIDTH / 2, ARENA.HEIGHT / 2, ARENA.CENTER_ZONE_RADIUS * 2, ARENA.CENTER_ZONE_RADIUS * 2, 0x2244aa, 0.16)
      .setDepth(1);

    this.statusText = this.add
      .text(ARENA.WIDTH / 2, 28, "Connecting...", {
        fontFamily: "monospace",
        fontSize: "20px",
        color: "#b8d6ff",
      })
      .setOrigin(0.5, 0)
      .setDepth(30);

    this.timerText = this.add
      .text(ARENA.WIDTH - 22, 18, "--", {
        fontFamily: "monospace",
        fontSize: "24px",
        color: "#ffffff",
      })
      .setOrigin(1, 0)
      .setDepth(30);

    this.roomText = this.add
      .text(18, 18, "Room: ----", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#99bbee",
      })
      .setDepth(30);

    this.hintText = this.add
      .text(ARENA.WIDTH / 2, ARENA.HEIGHT - 18, "", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#8fa0bb",
      })
      .setOrigin(0.5, 1)
      .setDepth(30);

    this.errorText = this.add
      .text(ARENA.WIDTH / 2, ARENA.HEIGHT - 52, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#ff8899",
      })
      .setOrigin(0.5, 1)
      .setDepth(30);

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
      this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
      this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.keyEnter = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
      this.keyR = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    }

    const params = new URLSearchParams(window.location.search);
    const room = (params.get("room") ?? "").toUpperCase();
    const name = params.get("name") ?? `P${Math.floor(Math.random() * 90 + 10)}`;
    const wsUrl =
      params.get("ws") ??
      `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:8787`;

    this.client = new MultiplayerClient({
      onOpen: () => {
        this.client.send({ type: "hello", payload: { name, roomCode: room || undefined } });
      },
      onWelcome: (payload) => {
        this.playerId = payload.playerId;
        this.roomCode = payload.roomCode;
        this.inviteUrl = payload.inviteUrl;
        if (this.roomText) this.roomText.setText(`Room: ${this.roomCode}`);
      },
      onSnapshot: (snap) => this._applySnapshot(snap),
      onRoundStarted: (_idx, _duration) => {
        this.errorText?.setText("");
      },
      onRoundEnded: (_winner, _reason) => {
        // handled by snapshot phase + winner
      },
      onError: (message) => {
        this.errorText?.setText(message);
      },
      onClose: () => {
        this.statusText?.setText("Disconnected from server.");
      },
    });
    this.client.connect(wsUrl);

    this.events.once("shutdown", () => this.client.disconnect());
    this.events.once("destroy", () => this.client.disconnect());
  }

  update(): void {
    if (!this.snapshot) return;
    this._sendInput();

    if (this.keyEnter && Phaser.Input.Keyboard.JustDown(this.keyEnter)) {
      this.client.send({ type: "start_round", payload: {} });
    }
    if (this.keyR && Phaser.Input.Keyboard.JustDown(this.keyR)) {
      const me = this.snapshot.players.find((p) => p.id === this.playerId);
      if (!me) return;
      this.client.send({ type: "rematch_ready", payload: { ready: !me.rematchReady } });
    }
  }

  private _sendInput(): void {
    if (this.snapshot?.phase !== "in_round") return;
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
      },
    });
    this.releaseQueued = false;
  }

  private _applySnapshot(snapshot: RoomSnapshot): void {
    this.snapshot = snapshot;
    this._reconcileRenderPlayers(snapshot.players);
    this._renderPlayers(snapshot.players);

    const me = snapshot.players.find((p) => p.id === this.playerId);
    const isHost = this.playerId && snapshot.hostId === this.playerId;

    const mins = Math.floor(snapshot.timerSec / 60);
    const secs = Math.floor(snapshot.timerSec % 60);
    this.timerText?.setText(`${mins}:${secs.toString().padStart(2, "0")}`);

    if (snapshot.phase === "lobby") {
      this.statusText?.setText(
        `Lobby ${snapshot.roomCode} • ${snapshot.players.length}/4 players`
      );
      this.hintText?.setText(
        `${isHost ? "[ENTER] start round" : "Waiting for host..."}   Invite: ${this.inviteUrl || "-"}`
      );
    } else if (snapshot.phase === "in_round") {
      this.statusText?.setText("Round live • hold SPACE to charge, release SPACE to cash out");
      const auraTxt = me ? `Aura ${me.aura.toFixed(0)}  Pressure ${me.pressure.toFixed(0)}` : "";
      this.hintText?.setText(auraTxt);
    } else {
      const winner = snapshot.players.find((p) => p.id === snapshot.winnerPlayerId);
      this.statusText?.setText(
        winner ? `Round over • Winner: ${winner.name}` : "Round over • No winner"
      );
      this.hintText?.setText("[R] toggle rematch ready   [ENTER] host can also start");
    }
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
      const aura = this.add.ellipse(p.position.x, p.position.y, 58, 58, 0x66aaff, 0.0).setDepth(6);
      const body = this.add.ellipse(p.position.x, p.position.y, 34, 34, 0xdde6ff, 1).setDepth(7);
      const name = this.add
        .text(p.position.x, p.position.y - 32, p.name, {
          fontFamily: "monospace",
          fontSize: "12px",
          color: "#dce6ff",
        })
        .setOrigin(0.5)
        .setDepth(8);
      this.renderPlayers.set(p.id, { aura, body, name });
    }
  }

  private _renderPlayers(players: NetPlayerState[]): void {
    for (const p of players) {
      const rp = this.renderPlayers.get(p.id);
      if (!rp) continue;
      rp.body.setPosition(p.position.x, p.position.y);
      rp.aura.setPosition(p.position.x, p.position.y);
      rp.name.setPosition(p.position.x, p.position.y - 32);

      const auraAlpha = p.isCharging ? 0.20 + (p.aura / 100) * 0.45 : (p.aura / 100) * 0.15;
      rp.aura.setFillStyle(p.isReleased ? 0x88ffd1 : 0x66aaff, auraAlpha);
      rp.aura.setDisplaySize(58 + p.aura * 0.9, 58 + p.aura * 0.9);

      if (p.id === this.playerId) {
        rp.body.setStrokeStyle(3, 0xffffff, 0.95);
      } else {
        rp.body.setStrokeStyle(2, 0x111222, 0.8);
      }

      if (p.isBroken) {
        rp.body.setFillStyle(0xff5577, 1);
      } else if (p.isReleased) {
        rp.body.setFillStyle(0x99ffd6, 1);
      } else {
        rp.body.setFillStyle(0xdde6ff, 1);
      }
    }
  }
}

