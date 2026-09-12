/**
 * Directive 12: Real-time telemetry tracker
 * Accurately tracks injection scan counts (last 24h), rate limit status,
 * model ladder position, and fallback events.
 */

export interface FallbackEvent {
  timestamp: number;
  fromModel: string;
  toModel: string;
  reason: string;
}

export interface InjectionScanEvent {
  timestamp: number;
  score: number;
  flagged: boolean;
  ruleCount: number;
}

class SecurityTelemetry {
  private injectionScans: InjectionScanEvent[] = [];
  private lastFallbackEvent: FallbackEvent | null = null;
  private currentLadderPosition: number = 0; // 0 = primary (gemini-3.6-flash)

  recordInjectionScan(score: number, flagged: boolean, ruleCount: number) {
    this.injectionScans.push({
      timestamp: Date.now(),
      score,
      flagged,
      ruleCount,
    });
    // Prune events older than 24 hours
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    this.injectionScans = this.injectionScans.filter((e) => e.timestamp >= oneDayAgo);
  }

  getInjectionStats24h() {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const scans24h = this.injectionScans.filter((e) => e.timestamp >= oneDayAgo);
    const flaggedScans = scans24h.filter((e) => e.flagged);
    const avgScore =
      scans24h.length > 0
        ? Math.round(scans24h.reduce((acc, s) => acc + s.score, 0) / scans24h.length)
        : 0;

    return {
      totalScans: scans24h.length,
      flaggedScans: flaggedScans.length,
      neutralizedScans: flaggedScans.length,
      avgScore,
    };
  }

  recordFallback(fromModel: string, toModel: string, position: number, reason: string) {
    this.currentLadderPosition = position;
    this.lastFallbackEvent = {
      timestamp: Date.now(),
      fromModel,
      toModel,
      reason,
    };
  }

  recordLadderReset() {
    this.currentLadderPosition = 0;
  }

  getLastFallbackEvent(): FallbackEvent | null {
    return this.lastFallbackEvent;
  }

  getCurrentLadderPosition(): number {
    return this.currentLadderPosition;
  }
}

export const securityTelemetry = new SecurityTelemetry();
