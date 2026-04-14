import { BREAK, SESSION_LORE } from "../config/GameConfig";
import { RoundResult } from "../core/types";

type SessionLoreStats = {
  roundsPlayed: number;
  brokeFirstRound?: number;
  highestPeakAura: number;
  earlyReleaseCount: number;
  almostHadItCount: number;
  ruinedMomentCount: number;
  longestDangerSurvivalSec: number;
};

type SessionLoreRoundState = {
  dangerSurvivalSec: number;
  releasedEarlyThisRound: boolean;
  almostHadItThisRound: boolean;
  brokeThisRound: boolean;
  newPeakThisRound: boolean;
};

export type SessionLoreRoundOutput = {
  title: string;
  tags: string[];
};

/**
 * Centralized session-lore tracking and summary generation.
 * Session-scoped only: module singleton survives round restarts, resets on page reload.
 */
export class SessionLoreSystem {
  private stats: SessionLoreStats = {
    roundsPlayed: 0,
    highestPeakAura: 0,
    earlyReleaseCount: 0,
    almostHadItCount: 0,
    ruinedMomentCount: 0,
    longestDangerSurvivalSec: 0,
  };

  private round: SessionLoreRoundState = {
    dangerSurvivalSec: 0,
    releasedEarlyThisRound: false,
    almostHadItThisRound: false,
    brokeThisRound: false,
    newPeakThisRound: false,
  };
  private lastTitle = "";
  private lastTags: string[] = [];

  startRound(): void {
    this.round = {
      dangerSurvivalSec: 0,
      releasedEarlyThisRound: false,
      almostHadItThisRound: false,
      brokeThisRound: false,
      newPeakThisRound: false,
    };
  }

  tick(pressureValue: number, isCharging: boolean, dtSec: number): void {
    if (!SESSION_LORE.ENABLED) return;
    if (isCharging && pressureValue >= BREAK.DANGER_ZONE_THRESHOLD) {
      this.round.dangerSurvivalSec += dtSec;
    }
  }

  /**
   * Explicit hook for future multiplayer/social interactions.
   * Not used by single-player now, but keeps extension surface centralized.
   */
  recordRuinedMoment(): void {
    if (!SESSION_LORE.ENABLED) return;
    this.stats.ruinedMomentCount += 1;
  }

  finalizeRound(result: RoundResult): SessionLoreRoundOutput {
    if (!SESSION_LORE.ENABLED) return { title: "", tags: [] };

    this.stats.roundsPlayed += 1;

    if (result.peakAura > this.stats.highestPeakAura) {
      this.stats.highestPeakAura = result.peakAura;
      this.round.newPeakThisRound = true;
    }

    if (result.broke) {
      this.round.brokeThisRound = true;
      if (!this.stats.brokeFirstRound) {
        this.stats.brokeFirstRound = this.stats.roundsPlayed;
      }
      if (result.peakAura >= SESSION_LORE.ALMOST_HAD_IT_PEAK_AURA_THRESHOLD) {
        this.round.almostHadItThisRound = true;
        this.stats.almostHadItCount += 1;
      }
    }

    if (
      !result.broke &&
      result.releaseAura > 0 &&
      result.releaseAura <= SESSION_LORE.EARLY_RELEASE_AURA_THRESHOLD
    ) {
      this.round.releasedEarlyThisRound = true;
      this.stats.earlyReleaseCount += 1;
    }

    if (this.round.dangerSurvivalSec > this.stats.longestDangerSurvivalSec) {
      this.stats.longestDangerSurvivalSec = this.round.dangerSurvivalSec;
    }

    const title = this._dedupeTitle(this._buildTitle(result));
    const tags = this._dedupeTags(this._buildTags());
    this.lastTitle = title;
    this.lastTags = [...tags];

    return { title, tags };
  }

  getStats(): SessionLoreStats {
    return { ...this.stats };
  }

  private _buildTitle(result: RoundResult): string {
    if (result.perfectRelease) return "Suspiciously Well Timed";
    if (result.broke && this.round.almostHadItThisRound) return "Almost Legendary";
    if (result.broke) return "Public Composure Issue";
    if (result.releaseAura === 0) return "Clock Wins By Decision";
    if (this.round.newPeakThisRound) return "New Personal Myth";
    if (this.round.releasedEarlyThisRound) return "Cashed Out Early";
    return "Technically Acceptable Aura";
  }

  private _buildTags(): string[] {
    const tags: string[] = [];

    if (this.round.brokeThisRound && this.stats.brokeFirstRound === this.stats.roundsPlayed) {
      tags.push("broke first");
    }
    if (this.round.newPeakThisRound) {
      tags.push("highest peak aura");
    }
    if (this.round.releasedEarlyThisRound) {
      tags.push("released too early");
    }
    if (this.round.almostHadItThisRound) {
      tags.push("almost had it");
    }
    if (
      this.round.dangerSurvivalSec >= SESSION_LORE.DANGER_SURVIVAL_MIN_SEC &&
      Math.abs(this.round.dangerSurvivalSec - this.stats.longestDangerSurvivalSec) < 0.001
    ) {
      tags.push("survived longest under pressure");
    }
    if (this.stats.ruinedMomentCount > 0) {
      tags.push("ruined someone else's moment");
    }

    return tags.slice(0, SESSION_LORE.MAX_TAGS_PER_ROUND);
  }

  private _dedupeTitle(title: string): string {
    if (title !== this.lastTitle) return title;
    if (title === "Public Composure Issue") return "Public Composure, Again";
    if (title === "Technically Acceptable Aura") return "Still Technically Acceptable";
    return "A Familiar Outcome";
  }

  private _dedupeTags(tags: string[]): string[] {
    const filtered = tags.filter((tag) => !this.lastTags.includes(tag));
    return (filtered.length > 0 ? filtered : tags).slice(0, SESSION_LORE.MAX_TAGS_PER_ROUND);
  }
}

export const sessionLore = new SessionLoreSystem();
