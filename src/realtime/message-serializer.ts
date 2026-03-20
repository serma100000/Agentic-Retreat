/**
 * Efficient message serialization and deserialization for WebSocket messages.
 *
 * Provides factory functions for creating typed messages
 * with unique IDs for client-side deduplication.
 */

import { randomUUID } from 'node:crypto';

import type {
  GlobalStats,
  MapReportEvent,
  MapReportReceivedEvent,
  OutageStateChangeEvent,
  OutageUpdate,
  ReportReceivedEvent,
  ReportUpdate,
  WebSocketMessage,
} from './types.js';
import { MessageType } from './types.js';

/**
 * Serialize a WebSocketMessage to a JSON string with consistent field ordering
 * for better compression ratios.
 */
export function serializeMessage(msg: WebSocketMessage): string {
  const ordered: Record<string, unknown> = {
    type: msg.type,
  };

  if (msg.id !== undefined) {
    ordered.id = msg.id;
  }
  if (msg.channel !== undefined) {
    ordered.channel = msg.channel;
  }
  if (msg.payload !== undefined) {
    ordered.payload = msg.payload;
  }

  return JSON.stringify(ordered);
}

/**
 * Deserialize a raw string into a validated WebSocketMessage.
 * Throws on invalid JSON or missing required fields.
 */
export function deserializeMessage(data: string): WebSocketMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new Error('Invalid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Message must be a JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.type !== 'string') {
    throw new Error('Message must have a string "type" field');
  }

  const validTypes = new Set<string>(Object.values(MessageType));
  if (!validTypes.has(obj.type)) {
    throw new Error(`Unknown message type: ${obj.type}`);
  }

  const message: WebSocketMessage = {
    type: obj.type as WebSocketMessage['type'],
  };

  if (typeof obj.channel === 'string') {
    message.channel = obj.channel;
  }

  if (obj.payload !== undefined) {
    message.payload = obj.payload;
  }

  if (typeof obj.id === 'string') {
    message.id = obj.id;
  }

  return message;
}

/** Generate a unique message ID for deduplication. */
export function generateMessageId(): string {
  return randomUUID();
}

/** Create a data message wrapping an OutageUpdate. */
export function createOutageUpdate(event: OutageStateChangeEvent): WebSocketMessage {
  const payload: OutageUpdate = {
    serviceId: event.serviceId,
    serviceSlug: event.slug,
    serviceName: event.name,
    state: event.state,
    previousState: event.prevState,
    confidence: event.confidence,
    affectedRegions: event.regions,
    timestamp: new Date(),
  };

  return {
    type: MessageType.DATA,
    id: generateMessageId(),
    channel: `outages:${event.slug}`,
    payload,
  };
}

/** Create a data message wrapping a ReportUpdate. */
export function createReportUpdate(event: ReportReceivedEvent): WebSocketMessage {
  const payload: ReportUpdate = {
    serviceId: event.serviceId,
    serviceSlug: event.slug,
    reportCount: event.count,
    reportType: event.type,
    region: event.region,
    timestamp: new Date(),
  };

  return {
    type: MessageType.DATA,
    id: generateMessageId(),
    channel: `reports:${event.slug}`,
    payload,
  };
}

/** Create a data message wrapping a MapReportEvent. */
export function createMapEvent(event: MapReportReceivedEvent): WebSocketMessage {
  const payload: MapReportEvent = {
    latitude: event.lat,
    longitude: event.lon,
    serviceSlug: event.slug,
    serviceName: event.name,
    reportType: event.type,
    region: event.region,
    timestamp: new Date(),
  };

  return {
    type: MessageType.DATA,
    id: generateMessageId(),
    channel: 'map:reports',
    payload,
  };
}

/** Create a data message wrapping GlobalStats. */
export function createStatsUpdate(stats: GlobalStats): WebSocketMessage {
  return {
    type: MessageType.DATA,
    id: generateMessageId(),
    channel: 'stats:global',
    payload: stats,
  };
}

/** Create an error message. */
export function createError(code: string, message: string): WebSocketMessage {
  return {
    type: MessageType.ERROR,
    id: generateMessageId(),
    payload: { code, message },
  };
}
