import { Vec2 } from "../game/core/types";

export type RoomPhase = "lobby" | "in_round" | "result";

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
}

export interface RoomSnapshot {
  roomCode: string;
  hostId: string;
  phase: RoomPhase;
  players: NetPlayerState[];
  timerSec: number;
  winnerPlayerId?: string;
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

