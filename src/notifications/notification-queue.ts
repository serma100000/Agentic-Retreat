/**
 * In-memory notification queue for reliable delivery.
 *
 * Designed as an MVP that can be replaced by Redis/Bull queue.
 * Includes a dead letter queue for items that fail max retries.
 */

import type {
  DeliveryResult,
  NotificationPayload,
  NotificationPreference,
  QueueItem,
} from './types.js';
import type { NotificationDispatcher } from './notification-dispatcher.js';

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 10;

export class NotificationQueue {
  private queue: Map<string, QueueItem>;
  private deadLetterQueue: Map<string, QueueItem>;
  private dispatcher: NotificationDispatcher;

  constructor(dispatcher: NotificationDispatcher) {
    this.queue = new Map();
    this.deadLetterQueue = new Map();
    this.dispatcher = dispatcher;
  }

  /**
   * Add a notification to the queue for delivery.
   * Returns the queue item ID.
   */
  enqueue(
    payload: NotificationPayload,
    preference: NotificationPreference,
  ): string {
    const id = crypto.randomUUID();

    const item: QueueItem = {
      id,
      payload,
      preference,
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      status: 'pending',
      createdAt: new Date(),
    };

    this.queue.set(id, item);
    return id;
  }

  /**
   * Process the next batch of pending items from the queue.
   */
  async process(): Promise<void> {
    const pending = this.getPendingItems(BATCH_SIZE);

    for (const item of pending) {
      item.status = 'processing';
      item.attempts++;
      item.lastAttemptAt = new Date();

      try {
        const results = await this.dispatcher.dispatch(item.payload, [
          item.preference,
        ]);

        const result = results[0];
        if (result && result.success) {
          this.queue.delete(item.id);
        } else {
          this.handleFailure(item, result?.error ?? 'No delivery result');
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err);
        this.handleFailure(item, errorMessage);
      }
    }
  }

  /**
   * Retry a specific failed item by its ID.
   */
  async retry(itemId: string): Promise<void> {
    const item = this.queue.get(itemId) ?? this.deadLetterQueue.get(itemId);
    if (!item) {
      throw new Error(`Queue item not found: ${itemId}`);
    }

    // Move back from dead letter queue if necessary
    if (this.deadLetterQueue.has(itemId)) {
      this.deadLetterQueue.delete(itemId);
      item.attempts = 0;
      item.status = 'pending';
      this.queue.set(itemId, item);
    } else {
      item.status = 'pending';
    }

    item.attempts++;
    item.lastAttemptAt = new Date();
    item.status = 'processing';

    try {
      const results = await this.dispatcher.dispatch(item.payload, [
        item.preference,
      ]);

      const result = results[0];
      if (result && result.success) {
        this.queue.delete(item.id);
      } else {
        this.handleFailure(item, result?.error ?? 'No delivery result');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.handleFailure(item, errorMessage);
    }
  }

  /**
   * Get the number of items in the active queue.
   */
  getQueueDepth(): number {
    return this.queue.size;
  }

  /**
   * Get all items in the failed (but not dead letter) state.
   */
  getFailedItems(): QueueItem[] {
    const failed: QueueItem[] = [];
    for (const item of this.queue.values()) {
      if (item.status === 'failed') {
        failed.push({ ...item });
      }
    }
    return failed;
  }

  /**
   * Get all items in the dead letter queue.
   */
  getDeadLetterItems(): QueueItem[] {
    return Array.from(this.deadLetterQueue.values()).map((item) => ({
      ...item,
    }));
  }

  private getPendingItems(limit: number): QueueItem[] {
    const items: QueueItem[] = [];
    for (const item of this.queue.values()) {
      if (item.status === 'pending' || item.status === 'failed') {
        items.push(item);
        if (items.length >= limit) break;
      }
    }
    return items;
  }

  private handleFailure(item: QueueItem, error: string): void {
    item.error = error;

    if (item.attempts >= item.maxAttempts) {
      item.status = 'dead';
      this.queue.delete(item.id);
      this.deadLetterQueue.set(item.id, item);
    } else {
      item.status = 'failed';
    }
  }
}
