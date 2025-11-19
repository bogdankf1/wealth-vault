/**
 * Event bus for inter-module communication (pub/sub pattern)
 */

export type EventHandler<T = unknown> = (data: T) => void | Promise<void>;

export interface EventSubscription {
  unsubscribe: () => void;
}

class EventBus {
  private events: Map<string, Set<EventHandler>>;

  constructor() {
    this.events = new Map();
  }

  /**
   * Subscribe to an event
   */
  on<T = unknown>(event: string, handler: EventHandler<T>): EventSubscription {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }

    const handlers = this.events.get(event)!;
    handlers.add(handler as EventHandler);

    // Return unsubscribe function
    return {
      unsubscribe: () => {
        handlers.delete(handler as EventHandler);
        if (handlers.size === 0) {
          this.events.delete(event);
        }
      },
    };
  }

  /**
   * Publish an event
   */
  async emit<T = unknown>(event: string, data?: T): Promise<void> {
    const handlers = this.events.get(event);

    if (!handlers || handlers.size === 0) {
      return;
    }

    // Execute all handlers
    const promises = Array.from(handlers).map((handler) => {
      try {
        return Promise.resolve(handler(data));
      } catch (error) {
        // Silently handle errors in event handlers
        return Promise.resolve();
      }
    });

    await Promise.all(promises);
  }

  /**
   * Subscribe to an event once
   */
  once<T = unknown>(event: string, handler: EventHandler<T>): EventSubscription {
    const wrappedHandler: EventHandler<T> = async (data) => {
      subscription.unsubscribe();
      await handler(data);
    };

    const subscription = this.on(event, wrappedHandler);
    return subscription;
  }

  /**
   * Remove all handlers for an event
   */
  off(event: string): void {
    this.events.delete(event);
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.events.clear();
  }

  /**
   * Get list of registered events
   */
  getEvents(): string[] {
    return Array.from(this.events.keys());
  }
}

// Export singleton instance
export const eventBus = new EventBus();

// Common event names (convention: module:action)
export const Events = {
  // Income events
  INCOME_SOURCE_CREATED: 'income:source:created',
  INCOME_SOURCE_UPDATED: 'income:source:updated',
  INCOME_SOURCE_DELETED: 'income:source:deleted',
  INCOME_TRANSACTION_CREATED: 'income:transaction:created',

  // Expense events (future)
  EXPENSE_CREATED: 'expenses:transaction:created',
  EXPENSE_UPDATED: 'expenses:transaction:updated',
  EXPENSE_DELETED: 'expenses:transaction:deleted',

  // Savings events (future)
  SAVINGS_ACCOUNT_UPDATED: 'savings:account:updated',

  // Portfolio events (future)
  PORTFOLIO_UPDATED: 'portfolio:updated',

  // Goal events (future)
  GOAL_PROGRESS_UPDATED: 'goals:progress:updated',
  GOAL_COMPLETED: 'goals:completed',
} as const;
