import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { ARENA, AURA, BREAK, PLAYER, PRESSURE } from "../src/game/config/GameConfig";
import { ClientToServerMessage, NetPlayerState, RoomSnapshot, ServerToClientMessage } from "../src/shared/protocol";

const PORT = Number(process.env.PORT ?? 8787);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
const TICK_RATE = 20;
const DT_SEC = 1 / TICK_RATE;
const ROUND_DURATION_SEC = 45;
const MAX_PLAYERS = 4;
const MIN_PLAYERS_TO_START = 2;
const PLAYER_SPEED_MP = PLAYER.SPEED * 0.95;
const PRESSURE_PLAYER_RADIUS = 240;

type InputIntent = {
  moveX: number;
  moveY: number;
  isCharging: boolean;
  wantsRelease: boolean;
};

type RoomPlayer = NetPlayerState & {
  socket: WebSocket;
  input: InputIntent;
  connected: boolean;
};

type RoomState = {
  code: string;
  hostId: string;
  phase: "lobby" | "in_round" | "result";
  players: Map<string, RoomPlayer>;
  timerSec: number;
  winnerPlayerId?: string;
  roundIndex: number;
  lastEndReason?: "timer" | "last_unbroken";
};

const rooms = new Map<string, RoomState>();
const playerToRoom = new Map<string, string>();

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, service: "aura-off-mp-server" }));
});

const wss = new WebSocketServer({ server: httpServer });

function send(ws: WebSocket, message: ServerToClientMessage): void {
  ws.send(JSON.stringify(message));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function getOrCreateRoom(code?: string): RoomState {
  const requested = code?.toUpperCase();
  if (requested && rooms.has(requested)) {
    return rooms.get(requested)!;
  }

  let roomCode = requested ?? randomCode();
  while (rooms.has(roomCode)) roomCode = randomCode();

  const room: RoomState = {
    code: roomCode,
    hostId: "",
    phase: "lobby",
    players: new Map(),
    timerSec: ROUND_DURATION_SEC,
    roundIndex: 0,
  };
  rooms.set(roomCode, room);
  return room;
}

function roomSnapshot(room: RoomState): RoomSnapshot {
  return {
    roomCode: room.code,
    hostId: room.hostId,
    phase: room.phase,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      isCharging: p.isCharging,
      isBroken: p.isBroken,
      isReleased: p.isReleased,
      aura: p.aura,
      pressure: p.pressure,
      score: p.score,
      rematchReady: p.rematchReady,
    })),
    timerSec: room.timerSec,
    winnerPlayerId: room.winnerPlayerId,
    roundIndex: room.roundIndex,
  };
}

function broadcast(room: RoomState, message: ServerToClientMessage): void {
  for (const player of room.players.values()) {
    if (player.connected) send(player.socket, message);
  }
}

function applyHostFallback(room: RoomState): void {
  if (room.players.size === 0) {
    rooms.delete(room.code);
    return;
  }
  if (!room.players.has(room.hostId)) {
    room.hostId = room.players.keys().next().value as string;
  }
}

function resetRoundPlayers(room: RoomState): void {
  const spawnPoints = [
    { x: ARENA.WIDTH * 0.25, y: ARENA.HEIGHT * 0.25 },
    { x: ARENA.WIDTH * 0.75, y: ARENA.HEIGHT * 0.25 },
    { x: ARENA.WIDTH * 0.25, y: ARENA.HEIGHT * 0.75 },
    { x: ARENA.WIDTH * 0.75, y: ARENA.HEIGHT * 0.75 },
  ];
  let idx = 0;
  for (const p of room.players.values()) {
    const spawn = spawnPoints[idx % spawnPoints.length];
    idx++;
    p.position = { ...spawn };
    p.isCharging = false;
    p.isBroken = false;
    p.isReleased = false;
    p.aura = 0;
    p.pressure = 0;
    p.rematchReady = false;
    p.input = { moveX: 0, moveY: 0, isCharging: false, wantsRelease: false };
  }
}

function startRound(room: RoomState): void {
  room.phase = "in_round";
  room.timerSec = ROUND_DURATION_SEC;
  room.winnerPlayerId = undefined;
  room.lastEndReason = undefined;
  room.roundIndex += 1;
  resetRoundPlayers(room);
  broadcast(room, { type: "round_started", payload: { roundIndex: room.roundIndex, durationSec: ROUND_DURATION_SEC } });
}

function maybeEndRound(room: RoomState): void {
  if (room.phase !== "in_round") return;
  const active = [...room.players.values()].filter((p) => !p.isBroken && !p.isReleased);
  if (active.length <= 1 && room.players.size >= MIN_PLAYERS_TO_START) {
    room.phase = "result";
    room.winnerPlayerId = active[0]?.id;
    room.lastEndReason = "last_unbroken";
    broadcast(room, { type: "round_ended", payload: { winnerPlayerId: room.winnerPlayerId, reason: "last_unbroken" } });
    return;
  }
  if (room.timerSec <= 0) {
    room.phase = "result";
    room.lastEndReason = "timer";
    const sorted = [...room.players.values()].sort((a, b) => b.aura - a.aura);
    room.winnerPlayerId = sorted[0]?.id;
    broadcast(room, { type: "round_ended", payload: { winnerPlayerId: room.winnerPlayerId, reason: "timer" } });
  }
}

function tickRoom(room: RoomState): void {
  if (room.phase !== "in_round") return;

  room.timerSec = Math.max(0, room.timerSec - DT_SEC);
  const players = [...room.players.values()];

  for (const p of players) {
    if (p.isBroken || p.isReleased) continue;

    let moveX = clamp(p.input.moveX, -1, 1);
    let moveY = clamp(p.input.moveY, -1, 1);
    const len = Math.hypot(moveX, moveY);
    if (len > 0.001) {
      moveX /= len;
      moveY /= len;
    }
    const speed = p.input.isCharging ? PLAYER_SPEED_MP * PLAYER.CHARGE_SPEED_MULT : PLAYER_SPEED_MP;
    p.position.x = clamp(
      p.position.x + moveX * speed * DT_SEC,
      ARENA.BORDER + PLAYER.RADIUS,
      ARENA.WIDTH - ARENA.BORDER - PLAYER.RADIUS
    );
    p.position.y = clamp(
      p.position.y + moveY * speed * DT_SEC,
      ARENA.BORDER + PLAYER.RADIUS,
      ARENA.HEIGHT - ARENA.BORDER - PLAYER.RADIUS
    );

    p.isCharging = !!p.input.isCharging;

    // Simplified deterministic pressure for multiplayer:
    // self-exposure while charging + nearby-player social pressure + center bonus.
    let nearbyPressure = 0;
    for (const other of players) {
      if (other.id === p.id) continue;
      const dx = other.position.x - p.position.x;
      const dy = other.position.y - p.position.y;
      const d = Math.hypot(dx, dy);
      if (d < PRESSURE_PLAYER_RADIUS) {
        nearbyPressure += (1 - d / PRESSURE_PLAYER_RADIUS) * 10;
      }
    }
    const centerDx = p.position.x - ARENA.WIDTH / 2;
    const centerDy = p.position.y - ARENA.HEIGHT / 2;
    const inCenter = Math.hypot(centerDx, centerDy) < ARENA.CENTER_ZONE_RADIUS;
    const centerMult = inCenter ? 1 + ARENA.CENTER_ZONE_PRESSURE_BONUS : 1;

    if (p.isCharging) {
      p.pressure = clamp(
        p.pressure +
          ((PRESSURE.CHARGE_EXTRA_PER_SEC + nearbyPressure) * centerMult - PRESSURE.DECAY_WHILE_CHARGING_PER_SEC) *
            DT_SEC,
        0,
        PRESSURE.MAX
      );
      p.aura = clamp(
        p.aura + (AURA.BASE_GAIN_PER_SEC + p.pressure * AURA.PRESSURE_GAIN_MULTIPLIER) * DT_SEC,
        0,
        AURA.MAX
      );
    } else {
      p.pressure = clamp(p.pressure + nearbyPressure * DT_SEC - PRESSURE.DECAY_PER_SEC * DT_SEC, 0, PRESSURE.MAX);
      p.aura = clamp(p.aura - AURA.DECAY_PER_SEC * DT_SEC, 0, AURA.MAX);
    }

    // Deterministic break threshold for cleaner net sync.
    if (p.isCharging && p.pressure >= BREAK.DANGER_THRESHOLD + 35) {
      p.isBroken = true;
      p.isCharging = false;
      p.aura = clamp(p.aura * (1 - BREAK.AURA_LOSS_FRACTION), 0, AURA.MAX);
      p.pressure = 0;
    }

    if (!p.isBroken && p.input.wantsRelease && p.aura >= 5) {
      p.isReleased = true;
      p.isCharging = false;
      p.score += Math.round(p.aura * 100);
      p.aura = 0;
      p.pressure = 0;
    }
    p.input.wantsRelease = false;
  }

  maybeEndRound(room);
}

function tryAutoRematch(room: RoomState): void {
  if (room.phase !== "result") return;
  if (room.players.size < MIN_PLAYERS_TO_START) return;
  for (const p of room.players.values()) {
    if (!p.rematchReady) return;
  }
  startRound(room);
}

wss.on("connection", (ws) => {
  let playerId = "";

  ws.on("message", (raw) => {
    let msg: ClientToServerMessage;
    try {
      msg = JSON.parse(String(raw)) as ClientToServerMessage;
    } catch {
      send(ws, { type: "error", payload: { message: "Bad message payload." } });
      return;
    }

    if (msg.type === "hello") {
      const name = msg.payload.name.trim().slice(0, 16) || "Player";
      const room = getOrCreateRoom(msg.payload.roomCode);
      if (room.players.size >= MAX_PLAYERS) {
        send(ws, { type: "error", payload: { message: "Room is full (max 4)." } });
        return;
      }

      playerId = randomId();
      if (!room.hostId) room.hostId = playerId;
      const spawn = { x: ARENA.WIDTH / 2, y: ARENA.HEIGHT / 2 };
      const player: RoomPlayer = {
        id: playerId,
        name,
        position: spawn,
        isCharging: false,
        isBroken: false,
        isReleased: false,
        aura: 0,
        pressure: 0,
        score: 0,
        rematchReady: false,
        socket: ws,
        connected: true,
        input: { moveX: 0, moveY: 0, isCharging: false, wantsRelease: false },
      };
      room.players.set(playerId, player);
      playerToRoom.set(playerId, room.code);

      send(ws, {
        type: "welcome",
        payload: {
          playerId,
          roomCode: room.code,
          inviteUrl: `${CLIENT_ORIGIN}/?mode=mp&room=${room.code}`,
        },
      });
      broadcast(room, { type: "room_snapshot", payload: roomSnapshot(room) });
      return;
    }

    if (!playerId) {
      send(ws, { type: "error", payload: { message: "Send hello first." } });
      return;
    }
    const roomCode = playerToRoom.get(playerId);
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;
    const player = room.players.get(playerId);
    if (!player) return;

    if (msg.type === "input") {
      player.input.moveX = msg.payload.moveX;
      player.input.moveY = msg.payload.moveY;
      player.input.isCharging = msg.payload.isCharging;
      player.input.wantsRelease = msg.payload.wantsRelease || player.input.wantsRelease;
      return;
    }

    if (msg.type === "start_round") {
      if (playerId !== room.hostId) {
        send(ws, { type: "error", payload: { message: "Only host can start round." } });
        return;
      }
      if (room.players.size < MIN_PLAYERS_TO_START) {
        send(ws, { type: "error", payload: { message: "Need at least 2 players." } });
        return;
      }
      if (room.phase === "lobby" || room.phase === "result") {
        startRound(room);
      }
      return;
    }

    if (msg.type === "rematch_ready") {
      player.rematchReady = msg.payload.ready;
      tryAutoRematch(room);
      return;
    }

    if (msg.type === "leave_room") {
      room.players.delete(playerId);
      playerToRoom.delete(playerId);
      applyHostFallback(room);
      broadcast(room, { type: "room_snapshot", payload: roomSnapshot(room) });
    }
  });

  ws.on("close", () => {
    if (!playerId) return;
    const roomCode = playerToRoom.get(playerId);
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;
    room.players.delete(playerId);
    playerToRoom.delete(playerId);
    applyHostFallback(room);
    broadcast(room, { type: "room_snapshot", payload: roomSnapshot(room) });
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    tickRoom(room);
    broadcast(room, { type: "room_snapshot", payload: roomSnapshot(room) });
  }
}, 1000 / TICK_RATE);

httpServer.listen(PORT, () => {
  console.log(`Aura Off multiplayer server listening on :${PORT}`);
});

