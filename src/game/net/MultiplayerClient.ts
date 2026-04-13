import { ClientToServerMessage, RoomSnapshot, ServerToClientMessage } from "../../shared/protocol";

type Handlers = {
  onWelcome?: (payload: { playerId: string; roomCode: string; inviteUrl: string }) => void;
  onSnapshot?: (snapshot: RoomSnapshot) => void;
  onRoundStarted?: (roundIndex: number, durationSec: number) => void;
  onRoundEnded?: (winnerPlayerId: string | undefined, reason: "timer" | "last_unbroken") => void;
  onError?: (message: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

export class MultiplayerClient {
  private socket?: WebSocket;
  private handlers: Handlers;

  constructor(handlers: Handlers) {
    this.handlers = handlers;
  }

  connect(serverUrl: string): void {
    this.socket = new WebSocket(serverUrl);
    this.socket.onopen = () => this.handlers.onOpen?.();
    this.socket.onclose = () => this.handlers.onClose?.();
    this.socket.onmessage = (ev) => {
      let msg: ServerToClientMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerToClientMessage;
      } catch {
        this.handlers.onError?.("Bad server message.");
        return;
      }
      if (msg.type === "welcome") this.handlers.onWelcome?.(msg.payload);
      if (msg.type === "room_snapshot") this.handlers.onSnapshot?.(msg.payload);
      if (msg.type === "round_started") this.handlers.onRoundStarted?.(msg.payload.roundIndex, msg.payload.durationSec);
      if (msg.type === "round_ended") this.handlers.onRoundEnded?.(msg.payload.winnerPlayerId, msg.payload.reason);
      if (msg.type === "error") this.handlers.onError?.(msg.payload.message);
    };
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = undefined;
  }

  send(msg: ClientToServerMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(msg));
  }
}

