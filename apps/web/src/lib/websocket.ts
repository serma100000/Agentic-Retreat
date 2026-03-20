'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Outage {
  readonly id: string;
  readonly serviceId: string;
  readonly serviceName: string;
  readonly state: string;
  readonly severity: string;
  readonly title: string;
  readonly confidence: number;
  readonly affectedRegions: readonly string[];
  readonly startedAt: string;
  readonly resolvedAt: string | null;
  readonly reportCount: number;
  readonly lat?: number;
  readonly lng?: number;
}

export interface ReportUpdate {
  readonly id: string;
  readonly serviceSlug: string;
  readonly type: string;
  readonly description?: string;
  readonly submittedAt: string;
  readonly totalReports: number;
}

export interface GlobalStats {
  readonly totalServices: number;
  readonly activeOutages: number;
  readonly reportsToday: number;
  readonly reportsLastHour: number;
  readonly monitoredServices: number;
}

export interface MapReportEvent {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly type: 'outage' | 'degraded' | 'investigating';
  readonly serviceName: string;
  readonly timestamp: string;
  readonly intensity: number;
}

type Callback = (data: unknown) => void;

// ---------------------------------------------------------------------------
// WebSocketManager
// ---------------------------------------------------------------------------

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly subscribers = new Map<string, Set<Callback>>();
  private reconnectAttempts = 0;
  private readonly maxReconnectDelay = 30_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private intentionalClose = false;

  constructor(url: string = 'ws://localhost:3001/ws') {
    this.url = url;
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.intentionalClose = false;

    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.startHeartbeat();

      // Re-subscribe to all active channels
      for (const channel of this.subscribers.keys()) {
        this.sendSubscribe(channel);
      }

      this.notifyConnectionChange();
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as {
          channel?: string;
          type?: string;
          data?: unknown;
        };

        if (message.type === 'pong') {
          return;
        }

        if (message.channel) {
          this.dispatch(message.channel, message.data);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.stopHeartbeat();
      this.notifyConnectionChange();

      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onerror is always followed by onclose, so reconnect is handled there
    };
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
    this.notifyConnectionChange();
  }

  subscribe(channel: string, callback: Callback): () => void {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
      if (this.connected) {
        this.sendSubscribe(channel);
      }
    }

    const callbacks = this.subscribers.get(channel)!;
    callbacks.add(callback);

    return () => {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.subscribers.delete(channel);
        if (this.connected) {
          this.sendUnsubscribe(channel);
        }
      }
    };
  }

  unsubscribe(channel: string): void {
    this.subscribers.delete(channel);
    if (this.connected) {
      this.sendUnsubscribe(channel);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private dispatch(channel: string, data: unknown): void {
    // Exact channel match
    const exact = this.subscribers.get(channel);
    if (exact) {
      for (const cb of exact) {
        try {
          cb(data);
        } catch {
          // Protect against subscriber errors
        }
      }
    }

    // Wildcard match (e.g. "outages:*" matches "outages:123")
    for (const [pattern, callbacks] of this.subscribers.entries()) {
      if (pattern.endsWith(':*')) {
        const prefix = pattern.slice(0, -1);
        if (channel.startsWith(prefix) && pattern !== channel) {
          for (const cb of callbacks) {
            try {
              cb(data);
            } catch {
              // Protect against subscriber errors
            }
          }
        }
      }
    }
  }

  private sendSubscribe(channel: string): void {
    this.send({ type: 'subscribe', channel });
  }

  private sendUnsubscribe(channel: string): void {
    this.send({ type: 'unsubscribe', channel });
  }

  private send(data: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const baseDelay = 1_000;
    const delay = Math.min(
      baseDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay,
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private notifyConnectionChange(): void {
    this.dispatch('__connection__', { connected: this.connected });
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let managerInstance: WebSocketManager | null = null;

export function getWebSocketManager(): WebSocketManager {
  if (!managerInstance) {
    const wsUrl =
      typeof window !== 'undefined'
        ? (process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001/ws')
        : 'ws://localhost:3001/ws';
    managerInstance = new WebSocketManager(wsUrl);
  }
  return managerInstance;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useWebSocket<T = unknown>(channel: string): {
  data: T | null;
  isConnected: boolean;
  error: Error | null;
} {
  const [data, setData] = useState<T | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const manager = getWebSocketManager();

    // Track connection state
    const unsubConnection = manager.subscribe('__connection__', (payload) => {
      const p = payload as { connected: boolean };
      setIsConnected(p.connected);
    });

    setIsConnected(manager.isConnected());

    // Subscribe to the channel
    const unsubChannel = manager.subscribe(channel, (payload) => {
      try {
        setData(payload as T);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      }
    });

    // Ensure connection
    manager.connect();

    return () => {
      unsubConnection();
      unsubChannel();
    };
  }, [channel]);

  return { data, isConnected, error };
}

export function useRealtimeOutages(): Outage[] {
  const [outages, setOutages] = useState<Outage[]>([]);

  useEffect(() => {
    const manager = getWebSocketManager();

    const unsub = manager.subscribe('outages:*', (payload) => {
      const outage = payload as Outage;
      setOutages((prev) => {
        const idx = prev.findIndex((o) => o.id === outage.id);
        if (outage.resolvedAt && outage.state === 'resolved') {
          return prev.filter((o) => o.id !== outage.id);
        }
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = outage;
          return updated;
        }
        return [outage, ...prev];
      });
    });

    manager.connect();
    return unsub;
  }, []);

  return outages;
}

export function useRealtimeReports(slug: string): ReportUpdate | null {
  const { data } = useWebSocket<ReportUpdate>(`reports:${slug}`);
  return data;
}

export function useGlobalStats(): GlobalStats | null {
  const { data } = useWebSocket<GlobalStats>('stats:global');
  return data;
}
