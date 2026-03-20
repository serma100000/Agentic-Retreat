/**
 * Types for the OpenPulse real-time WebSocket gateway.
 *
 * Covers subscription channels, WebSocket messages,
 * outage/report/map events, global stats, and client connections.
 */

export const SubscriptionChannelPattern = {
  OUTAGES_ALL: 'outages:*',
  OUTAGES_SERVICE: 'outages:{slug}',
  REPORTS_SERVICE: 'reports:{slug}',
  MAP_REPORTS: 'map:reports',
  STATS_GLOBAL: 'stats:global',
} as const;

export type SubscriptionChannel =
  | 'outages:*'
  | `outages:${string}`
  | `reports:${string}`
  | 'map:reports'
  | 'stats:global';

export const MessageType = {
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
  PING: 'ping',
  PONG: 'pong',
  DATA: 'data',
  ERROR: 'error',
  WELCOME: 'welcome',
  SUBSCRIBED: 'subscribed',
  UNSUBSCRIBED: 'unsubscribed',
} as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

export interface WebSocketMessage {
  type: MessageTypeValue;
  channel?: string;
  payload?: unknown;
  id?: string;
}

export interface OutageUpdate {
  serviceId: string;
  serviceSlug: string;
  serviceName: string;
  state: string;
  previousState: string;
  confidence: number;
  affectedRegions: string[];
  timestamp: Date;
}

export interface ReportUpdate {
  serviceId: string;
  serviceSlug: string;
  reportCount: number;
  reportType: string;
  region: string;
  timestamp: Date;
}

export interface MapReportEvent {
  latitude: number;
  longitude: number;
  serviceSlug: string;
  serviceName: string;
  reportType: string;
  region: string;
  timestamp: Date;
}

export interface GlobalStats {
  totalServices: number;
  activeOutages: number;
  reportsToday: number;
  reportsThisHour: number;
}

export interface ClientConnection {
  id: string;
  socket: WebSocketLike;
  subscriptions: Set<string>;
  authenticatedAt?: Date;
  lastPingAt: Date;
}

/**
 * Minimal WebSocket interface for decoupling from a specific WS library.
 */
export interface WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readyState: number;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeAllListeners?(): void;
}

/**
 * Event types emitted internally for bridging to WebSocket channels.
 */
export interface OutageStateChangeEvent {
  serviceId: string;
  slug: string;
  name: string;
  state: string;
  prevState: string;
  confidence: number;
  regions: string[];
}

export interface ReportReceivedEvent {
  serviceId: string;
  slug: string;
  type: string;
  region: string;
  count: number;
}

export interface MapReportReceivedEvent {
  lat: number;
  lon: number;
  slug: string;
  name: string;
  type: string;
  region: string;
}
