/**
 * MessageQueue - Manages incoming WebSocket messages with filtering and waiting
 * 
 * Provides:
 * - Message queue with history
 * - Async waiting for specific message patterns
 * - Timeout handling
 * - Message filtering
 */

export class MessageQueue {
  constructor() {
    this.messages = [];
    this.waiters = [];
    this.maxSize = 1000;
  }

  /**
   * Push a message onto the queue
   */
  push(message) {
    this.messages.push({
      timestamp: Date.now(),
      message,
    });

    // Trim old messages
    if (this.messages.length > this.maxSize) {
      this.messages = this.messages.slice(-this.maxSize);
    }

    // Check if any waiters match this message
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const waiter = this.waiters[i];
      if (waiter.filter(message)) {
        waiter.resolve(message);
        this.waiters.splice(i, 1);
      }
    }
  }

  /**
   * Wait for a message matching the filter
   */
  async waitForMessage(filter, timeout = 5000) {
    // Check existing messages first
    for (const item of this.messages) {
      if (filter(item.message)) {
        return item.message;
      }
    }

    // Wait for new message
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) {
          this.waiters.splice(idx, 1);
        }
        reject(new Error('Timeout waiting for message'));
      }, timeout);

      this.waiters.push({
        filter,
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        },
        reject,
      });
    });
  }

  /**
   * Get message history with optional filtering
   */
  getHistory(filter = null, limit = 100) {
    let history = this.messages;
    if (filter) {
      history = history.filter((item) => filter(item.message));
    }
    return history.slice(-limit);
  }

  /**
   * Clear all messages
   */
  clear() {
    this.messages = [];
  }

  /**
   * Get count of messages
   */
  get length() {
    return this.messages.length;
  }
}




