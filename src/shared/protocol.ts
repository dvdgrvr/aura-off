import { Vec2 } from "../game/core/types";

export type RoomPhase = "lobby" | "in_round" | "result";
export type RoomMode = "party_ffa";
export type ReadabilityState = "safe" | "danger" | "unstable" | "critical";
export type AbilityType = "disrupt_pulse";

export interface NetPlayerState {
  id: string;
  name: string;
  position: Vec2;
  isCharging: boolean;
  isBroken: boolean;
  isReleased: boolean;
  aura: number;
  pressure: number;
  score: number;
  rematchReady: boolean;
  readabilityState: ReadabilityState;
}

export type NpcReaction = "idle" | "watching" | "hesitating" | "stepping_back";

export interface NpcState {
  id: string;
  position: Vec2;
  reaction: NpcReaction;
  intensity: number; // 0..1
}

export type MultiplayerEventType =
  | "break"
  | "release"
  | "perfect_release"
  | "cascade"
  | "ability_telegraph"
  | "ability_resolve"
  | "ability_denied";

export interface MultiplayerEvent {
  id: number;
  type: MultiplayerEventType;
  actorPlayerId?: string;
  actorName?: string;
  targetPlayerId?: string;
  targetName?: string;
  abilityType?: AbilityType;
  reason?: string;
  timerSec: number;
}

export interface DisruptPulseState {
  id: number;
  casterPlayerId: string;
  x: number;
  y: number;
  radius: number;
  phase: "telegraph" | "resolving";
  telegraphMsRemaining: number;
}

export interface RoomNetDebugPlayer {
  playerId: string;
  lastInputAgeMs: number;
  echoedClientSendMs?: number;
}

export interface RoomNetDebug {
  serverNowMs: number;
  tickRate: number;
  players: RoomNetDebugPlayer[];
}

export interface RoomSnapshot {
  mode: RoomMode;
  roomCode: string;
  hostId: string;
  phase: RoomPhase;
  players: NetPlayerState[];
  npcs: NpcState[];
  lastEvents: MultiplayerEvent[];
  netDebug?: RoomNetDebug;
  activeDisruptPulses: DisruptPulseState[];
  timerSec: number;
  winnerPlayerId?: string;
  lastEndReason?: "timer" | "last_unbroken";
  roundIndex: number;
}

export type ClientToServerMessage =
  | {
      type: "hello";
      payload: { name: string; roomCode?: string };
    }
  | {
      type: "input";
      payload: {
        moveX: number;
        moveY: number;
        isCharging: boolean;
        wantsRelease: boolean;
        clientSendMs?: number;
      };
    }
  | {
      type: "start_round";
      payload: {};
    }
  | {
      type: "rematch_ready";
      payload: { ready: boolean };
    }
  | {
      type: "ability_use";
      payload: { abilityType: AbilityType };
    }
  | {
      type: "leave_room";
      payload: {};
    };

export type ServerToClientMessage =
  | {
      type: "welcome";
      payload: {
        playerId: string;
        roomCode: string;
        inviteUrl: string;
      };
    }
  | {
      type: "room_snapshot";
      payload: RoomSnapshot;
    }
  | {
      type: "round_started";
      payload: { roundIndex: number; durationSec: number };
    }
  | {
      type: "round_ended";
      payload: {
        winnerPlayerId?: string;
        reason: "timer" | "last_unbroken";
      };
    }
  | {
      type: "error";
      payload: { message: string };
    };
