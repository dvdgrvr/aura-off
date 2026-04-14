import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { ARENA, AURA, BREAK, PLAYER, PRESSURE, RELEASE } from "../src/game/config/GameConfig";
import {
  ClientToServerMessage,
  DisruptPulseState,
  MultiplayerEvent,
  NetPlayerState,
  ReadabilityState,
  RoomSnapshot,
  ServerToClientMessage,
} from "../src/shared/protocol";
import {
  applyBreakCascade,
  applyReleaseRelief,
  buildAttentionPressureMapPerSec,
  proximityChargePressurePerSec,
  resolveBreakThresholdWithVariance,
  sharedPressureMultiplier,
} from "./socialInteraction";
import { createRoomCrowd, npcPressureForPlayerPerSec, updateRoomCrowd } from "./multiplayerCrowd";

const PORT = Number(process.env.PORT ?? 8787);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
const SERVER_WS_URL = process.env.SERVER_WS_URL ?? `ws://localhost:${PORT}`;
const TICK_RATE = 20;
const DT_SEC = 1 / TICK_RATE;
const ROUND_DURATION_SEC = 45;
const MAX_PLAYERS = 4;
const MIN_PLAYERS_TO_START = 2;
const PLAYER_SPEED_MP = PLAYER.SPEED * 0.95;
const PRESSURE_PLAYER_RADIUS = 240;
const ENABLE_NET_DEBUG = process.env.NET_DEBUG === "1";
const LAST_EVENTS_MAX = 3;
const DISRUPT_PULSE = {
  COOLDOWN_MS: 10_000,
  TELEGRAPH_MS: 650,
  RADIUS: 210,
  PRESSURE_BASE: 10,
  PRESSURE_CHARGING_BONUS: 10,
} as const;

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
  lastInputServerMs: number;
  lastClientSendMs?: number;
  lastDisruptUseMs: number;
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
  npcs: ReturnType<typeof createRoomCrowd>;
  lastEvents: MultiplayerEvent[];
  eventSeq: number;
  activeDisruptPulses: DisruptPulseState[];
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

function sanitizePlayerName(raw: string): string {
  const banned = ["fuck", "shit", "bitch", "cunt", "nigger", "fag"];
  const cleaned = raw
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 16);
  if (!cleaned) return `P${Math.floor(Math.random() * 90 + 10)}`;
  const lowered = cleaned.toLowerCase();
  if (banned.some((w) => lowered.includes(w))) {
    return `P${Math.floor(Math.random() * 90 + 10)}`;
  }
  return cleaned;
}

function readabilityStateForPlayer(player: RoomPlayer): ReadabilityState {
  if (player.pressure >= BREAK.CRITICAL_VISUAL_THRESHOLD && player.isCharging) return "critical";
  if (player.pressure >= BREAK.UNSTABLE_VISUAL_THRESHOLD && player.isCharging) return "unstable";
  if (player.pressure >= BREAK.DANGER_ZONE_THRESHOLD) return "danger";
  return "safe";
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
    npcs: createRoomCrowd(),
    lastEvents: [],
    eventSeq: 1,
    activeDisruptPulses: [],
  };
  rooms.set(roomCode, room);
  return room;
}

function pushRoomEvent(
  room: RoomState,
  event: Omit<MultiplayerEvent, "id" | "timerSec">
): void {
  room.lastEvents.push({
    id: room.eventSeq++,
    timerSec: room.timerSec,
    ...event,
  });
  if (room.lastEvents.length > LAST_EVENTS_MAX) {
    room.lastEvents.splice(0, room.lastEvents.length - LAST_EVENTS_MAX);
  }
}

function roomSnapshot(room: RoomState): RoomSnapshot {
  const serverNow = Date.now();
  return {
    mode: "party_ffa",
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
      readabilityState: readabilityStateForPlayer(p),
    })),
    npcs: room.npcs.map((n) => ({
      id: n.id,
      position: n.position,
      reaction: n.reaction,
      intensity: n.intensity,
    })),
    lastEvents: [...room.lastEvents],
    netDebug: ENABLE_NET_DEBUG
      ? {
          serverNowMs: serverNow,
          tickRate: TICK_RATE,
          players: [...room.players.values()].map((p) => ({
            playerId: p.id,
            lastInputAgeMs: Math.max(0, serverNow - p.lastInputServerMs),
            echoedClientSendMs: p.lastClientSendMs,
          })),
        }
      : undefined,
    activeDisruptPulses: room.activeDisruptPulses.map((p) => ({ ...p })),
    timerSec: room.timerSec,
    winnerPlayerId: room.winnerPlayerId,
    lastEndReason: room.lastEndReason,
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
  if (room.phase === "in_round" && room.players.size < MIN_PLAYERS_TO_START) {
    room.phase = "result";
    room.lastEndReason = "last_unbroken";
    room.winnerPlayerId = [...room.players.values()][0]?.id;
    broadcast(room, {
      type: "round_ended",
      payload: { winnerPlayerId: room.winnerPlayerId, reason: "last_unbroken" },
    });
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
    p.readabilityState = "safe";
    p.input = { moveX: 0, moveY: 0, isCharging: false, wantsRelease: false };
  }
}

function startRound(room: RoomState): void {
  room.phase = "in_round";
  room.timerSec = ROUND_DURATION_SEC;
  room.winnerPlayerId = undefined;
  room.lastEndReason = undefined;
  room.roundIndex += 1;
  room.lastEvents = [];
  room.activeDisruptPulses = [];
  resetRoundPlayers(room);
  broadcast(room, { type: "round_started", payload: { roundIndex: room.roundIndex, durationSec: ROUND_DURATION_SEC } });
}

function maybeEndRound(room: RoomState): void {
  if (room.phase !== "in_round") return;
  const active = [...room.players.values()].filter((p) => !p.isBroken && !p.isReleased);
  if (active.length <= 1 && room.players.size >= MIN_PLAYERS_TO_START) {
    room.phase = "result";
    room.activeDisruptPulses = [];
    room.winnerPlayerId = active[0]?.id;
    room.lastEndReason = "last_unbroken";
    broadcast(room, { type: "round_ended", payload: { winnerPlayerId: room.winnerPlayerId, reason: "last_unbroken" } });
    return;
  }
  if (room.timerSec <= 0) {
    room.phase = "result";
    room.activeDisruptPulses = [];
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
  updateRoomCrowd(room.npcs, players, DT_SEC);
  const chargingPlayers = players.filter((p) => p.input.isCharging && !p.isBroken && !p.isReleased);
  const chargingCount = chargingPlayers.length;
  const chargeSharedMultiplier = sharedPressureMultiplier(chargingCount);
  const attentionMap = buildAttentionPressureMapPerSec(players);
  const breakCascadeDeltas = new Map<string, number>();
  const releaseReliefDeltas = new Map<string, number>();

  // Resolve active disrupt pulses (telegraph first, then pressure burst).
  const pulsesToResolve: DisruptPulseState[] = [];
  for (const pulse of room.activeDisruptPulses) {
    if (pulse.phase === "telegraph") {
      pulse.telegraphMsRemaining = Math.max(0, pulse.telegraphMsRemaining - DT_SEC * 1000);
      if (pulse.telegraphMsRemaining <= 0) {
        pulse.phase = "resolving";
        pulsesToResolve.push(pulse);
      }
    }
  }
  if (pulsesToResolve.length > 0) {
    for (const pulse of pulsesToResolve) {
      const caster = room.players.get(pulse.casterPlayerId);
      for (const target of players) {
        if (target.id === pulse.casterPlayerId || target.isBroken || target.isReleased) continue;
        const dx = target.position.x - pulse.x;
        const dy = target.position.y - pulse.y;
        const dist = Math.hypot(dx, dy);
        if (dist > pulse.radius) continue;
        const pressureHit =
          DISRUPT_PULSE.PRESSURE_BASE + (target.input.isCharging ? DISRUPT_PULSE.PRESSURE_CHARGING_BONUS : 0);
        target.pressure = clamp(target.pressure + pressureHit, 0, PRESSURE.MAX);
      }
      pushRoomEvent(room, {
        type: "ability_resolve",
        actorPlayerId: pulse.casterPlayerId,
        actorName: caster?.name,
        abilityType: "disrupt_pulse",
      });
    }
    room.activeDisruptPulses = [];
  }

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

    // Multiplayer pressure stack:
    // - social proximity pressure (all players)
    // - shared charging multiplier (more simultaneous charging => more risk)
    // - close charging proximity pressure (high social tension when contesting space)
    // - crowd attention pressure biased by aura + charging
    // - center-zone bonus
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
    const proximityChargeExtra = proximityChargePressurePerSec(p, players);
    const attentionPressure = attentionMap.get(p.id) ?? 0;
    const npcPressure = npcPressureForPlayerPerSec(p, room.npcs);
    const centerDx = p.position.x - ARENA.WIDTH / 2;
    const centerDy = p.position.y - ARENA.HEIGHT / 2;
    const inCenter = Math.hypot(centerDx, centerDy) < ARENA.CENTER_ZONE_RADIUS;
    const centerMult = inCenter ? 1 + ARENA.CENTER_ZONE_PRESSURE_BONUS : 1;

    if (p.isCharging) {
      const sharedChargeExposure = PRESSURE.CHARGE_EXTRA_PER_SEC * chargeSharedMultiplier;
      p.pressure = clamp(
        p.pressure +
          ((sharedChargeExposure + nearbyPressure + proximityChargeExtra + attentionPressure) * centerMult -
            PRESSURE.DECAY_WHILE_CHARGING_PER_SEC) *
            DT_SEC +
          npcPressure * DT_SEC,
        0,
        PRESSURE.MAX
      );
      p.aura = clamp(
        p.aura + (AURA.BASE_GAIN_PER_SEC + p.pressure * AURA.PRESSURE_GAIN_MULTIPLIER) * DT_SEC,
        0,
        AURA.MAX
      );
    } else {
      p.pressure = clamp(
        p.pressure +
          (nearbyPressure + attentionPressure * 0.6) * DT_SEC -
          PRESSURE.DECAY_PER_SEC * DT_SEC +
          npcPressure * 0.65 * DT_SEC,
        0,
        PRESSURE.MAX
      );
      p.aura = clamp(p.aura - AURA.DECAY_PER_SEC * DT_SEC, 0, AURA.MAX);
    }

    // High-risk variance on break threshold to add slight unpredictability in dangerous states.
    const breakThreshold = resolveBreakThresholdWithVariance(p.pressure);
    if (p.isCharging && p.pressure >= breakThreshold) {
      p.isBroken = true;
      p.isCharging = false;
      p.aura = clamp(p.aura * (1 - BREAK.AURA_LOSS_FRACTION), 0, AURA.MAX);
      p.pressure = 0;

      // Cascade failure: nearby players get a pressure spike.
      const cascade = applyBreakCascade(p, players);
      let strongestCascadeTarget: RoomPlayer | undefined;
      let strongestCascadeAmount = 0;
      for (const [id, amt] of cascade) {
        breakCascadeDeltas.set(id, (breakCascadeDeltas.get(id) ?? 0) + amt);
        if (amt > strongestCascadeAmount) {
          strongestCascadeAmount = amt;
          strongestCascadeTarget = players.find((other) => other.id === id);
        }
      }

      pushRoomEvent(room, {
        type: "break",
        actorPlayerId: p.id,
        actorName: p.name,
      });
      if (strongestCascadeTarget && strongestCascadeAmount > 1.5) {
        pushRoomEvent(room, {
          type: "cascade",
          actorPlayerId: p.id,
          actorName: p.name,
          targetPlayerId: strongestCascadeTarget.id,
          targetName: strongestCascadeTarget.name,
        });
      }
    }

    if (!p.isBroken && p.input.wantsRelease && p.aura >= 5) {
      const wasPerfectReleaseWindow =
        p.pressure >= RELEASE.PERFECT_WINDOW_MIN_PRESSURE &&
        p.pressure <= RELEASE.PERFECT_WINDOW_MAX_PRESSURE;
      p.isReleased = true;
      p.isCharging = false;
      p.score += Math.round(p.aura * 100);
      p.aura = 0;
      p.pressure = 0;

      // Release interaction: nearby players get slight pressure relief.
      const relief = applyReleaseRelief(p, players);
      for (const [id, amt] of relief) {
        releaseReliefDeltas.set(id, (releaseReliefDeltas.get(id) ?? 0) + amt);
      }

      pushRoomEvent(room, {
        type: wasPerfectReleaseWindow ? "perfect_release" : "release",
        actorPlayerId: p.id,
        actorName: p.name,
      });
    }
    p.input.wantsRelease = false;
  }

  // Apply inter-player event effects after primary simulation pass.
  for (const p of players) {
    if (p.isBroken || p.isReleased) continue;
    const spike = breakCascadeDeltas.get(p.id) ?? 0;
    const relief = releaseReliefDeltas.get(p.id) ?? 0;
    if (spike > 0) {
      p.pressure = clamp(p.pressure + spike, 0, PRESSURE.MAX);
    }
    if (relief > 0) {
      p.pressure = clamp(p.pressure - relief, 0, PRESSURE.MAX);
    }
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
      const name = sanitizePlayerName(msg.payload.name);
      const room = getOrCreateRoom(msg.payload.roomCode);
      if (room.phase === "in_round") {
        send(ws, { type: "error", payload: { message: "Round in progress. Join after result." } });
        return;
      }
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
        readabilityState: "safe",
        socket: ws,
        connected: true,
        lastInputServerMs: Date.now(),
        lastDisruptUseMs: -999_999,
        input: { moveX: 0, moveY: 0, isCharging: false, wantsRelease: false },
      };
      room.players.set(playerId, player);
      playerToRoom.set(playerId, room.code);

      send(ws, {
        type: "welcome",
        payload: {
          playerId,
          roomCode: room.code,
          inviteUrl: `${CLIENT_ORIGIN}/?mode=mp&ws=${SERVER_WS_URL}&room=${room.code}`,
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
      player.lastInputServerMs = Date.now();
      if (typeof msg.payload.clientSendMs === "number") {
        player.lastClientSendMs = msg.payload.clientSendMs;
      }
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

    if (msg.type === "ability_use") {
      if (msg.payload.abilityType !== "disrupt_pulse") return;
      if (room.phase !== "in_round") {
        pushRoomEvent(room, {
          type: "ability_denied",
          actorPlayerId: player.id,
          actorName: player.name,
          abilityType: "disrupt_pulse",
          reason: "round_inactive",
        });
        return;
      }
      if (player.isBroken || player.isReleased) {
        pushRoomEvent(room, {
          type: "ability_denied",
          actorPlayerId: player.id,
          actorName: player.name,
          abilityType: "disrupt_pulse",
          reason: "player_inactive",
        });
        return;
      }

      const now = Date.now();
      const remaining = DISRUPT_PULSE.COOLDOWN_MS - (now - player.lastDisruptUseMs);
      if (remaining > 0) {
        pushRoomEvent(room, {
          type: "ability_denied",
          actorPlayerId: player.id,
          actorName: player.name,
          abilityType: "disrupt_pulse",
          reason: "cooldown",
        });
        return;
      }

      player.lastDisruptUseMs = now;
      const pulse: DisruptPulseState = {
        id: room.eventSeq,
        casterPlayerId: player.id,
        x: player.position.x,
        y: player.position.y,
        radius: DISRUPT_PULSE.RADIUS,
        phase: "telegraph",
        telegraphMsRemaining: DISRUPT_PULSE.TELEGRAPH_MS,
      };
      room.activeDisruptPulses.push(pulse);
      pushRoomEvent(room, {
        type: "ability_telegraph",
        actorPlayerId: player.id,
        actorName: player.name,
        abilityType: "disrupt_pulse",
      });
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
