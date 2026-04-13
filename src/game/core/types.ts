/**
 * types.ts
 * Shared TypeScript types for gameplay state.
 * No logic here — only contracts.
 */

export type AuraTier = {
  label: string;
  min: number;
  color: number;
};

export type PlayerState =
  | "idle"
  | "moving"
  | "charging"
  | "unstable"
  | "breaking"
  | "releasing";

export type NpcReactionState =
  | "wandering"
  | "glancing"
  | "stepping_back"
  | "fleeing"
  | "dramatic_flee";

export interface Vec2 {
  x: number;
  y: number;
}

export interface RoundResult {
  peakAura: number;
  releaseAura: number;
  score: number;
  broke: boolean;
}
