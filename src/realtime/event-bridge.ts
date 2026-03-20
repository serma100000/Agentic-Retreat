/**
 * Bridges internal detection/consensus events to WebSocket channels.
 *
 * Provides rate limiting and throttling to prevent flooding clients
 * with high-frequency events (especially map reports).
 */

import type { ChannelManager } from './channel-manager.js';
import {
  createMapEvent,
  createOutageUpdate,
  createReportUpdate,
  createStatsUpdate,
} from './message-serializer.js';
import type {
  GlobalStats,
  MapReportReceivedEvent,
  OutageStateChangeEvent,
  ReportReceivedEvent,
} from './types.js';

export interface EventBridgeOptions {
  /** Maximum map report events per second. Default: 10. */
  maxMapEventsPerSecond?: number;
  /** Stats broadcast interval in milliseconds. Default: 5000. */
  statsBroadcastIntervalMs?: number;
}

/**
 * A simple token bucket rate limiter for throttling high-frequency events.
 */
class TokenBucket {
  private tokens: number;
  private lastRefillTime: number;

  constructor(
    private readonly maxTokens: number,
    private readonly refillRatePerSecond: number,
  ) {
    this.tokens = maxTokens;
    this.lastRefillTime = Date.now();
  }

  /** Try to consume a token. Returns true if allowed, false if rate-limited. */
  tryConsume(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefillTime) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRatePerSecond);
    this.lastRefillTime = now;
  }
}

export class EventBridge {
  private readonly channelManager: ChannelManager;
  private readonly mapEventLimiter: TokenBucket;
  private readonly statsBroadcastIntervalMs: number;

  private statsInterval: ReturnType<typeof setInterval> | null = null;
  private latestStats: GlobalStats | null = null;
  private droppedMapEvents = 0;

  constructor(channelManager: ChannelManager, options: EventBridgeOptions = {}) {
    this.channelManager = channelManager;

    const maxMapEventsPerSecond = options.maxMapEventsPerSecond ?? 10;
    this.mapEventLimiter = new TokenBucket(maxMapEventsPerSecond, maxMapEventsPerSecond);
    this.statsBroadcastIntervalMs = options.statsBroadcastIntervalMs ?? 5000;
  }

  /**
   * Handle an outage state change from the detection engine.
   * Broadcasts to both 'outages:*' wildcard subscribers and 'outages:{slug}' subscribers.
   */
  onOutageStateChange(event: OutageStateChangeEvent): void {
    const message = createOutageUpdate(event);

    // Broadcast to the specific service channel
    this.channelManager.broadcast(`outages:${event.slug}`, message);

    // Broadcast to wildcard subscribers
    this.channelManager.broadcast('outages:*', message);
  }

  /**
   * Handle a new user report.
   * Broadcasts to 'reports:{slug}'.
   */
  onReportReceived(event: ReportReceivedEvent): void {
    const message = createReportUpdate(event);
    this.channelManager.broadcast(`reports:${event.slug}`, message);
  }

  /**
   * Handle a map report event.
   * Throttled to prevent flooding clients (max N events/sec).
   */
  onMapReport(event: MapReportReceivedEvent): void {
    if (!this.mapEventLimiter.tryConsume()) {
      this.droppedMapEvents++;
      return;
    }

    const message = createMapEvent(event);
    this.channelManager.broadcast('map:reports', message);
  }

  /**
   * Update the latest global stats snapshot.
   * The stats will be broadcast on the next interval tick.
   */
  onStatsUpdate(stats: GlobalStats): void {
    this.latestStats = stats;
  }

  /**
   * Start periodic stats broadcasting.
   * Broadcasts the latest stats to 'stats:global' every statsBroadcastIntervalMs.
   */
  startStatsBroadcast(): void {
    if (this.statsInterval) return;

    this.statsInterval = setInterval(() => {
      if (this.latestStats) {
        const message = createStatsUpdate(this.latestStats);
        this.channelManager.broadcast('stats:global', message);
      }
    }, this.statsBroadcastIntervalMs);
  }

  /** Stop periodic stats broadcasting. */
  stopStatsBroadcast(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  /** Get the number of map events dropped by rate limiting. */
  getDroppedMapEventCount(): number {
    return this.droppedMapEvents;
  }

  /** Reset dropped event counters. */
  resetCounters(): void {
    this.droppedMapEvents = 0;
  }
}
