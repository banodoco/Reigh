/**
 * VisibilityManager - Centralized page visibility and lifecycle management
 * 
 * Consolidates all visibility/page lifecycle listeners into a single manager
 * to prevent duplicated reactions, inconsistent timestamps, and multi-trigger invalidations.
 * 
 * Features:
 * - Single source of truth for visibility state
 * - Derived signals: justBecameVisible, justHidden
 * - Consistent timestamps across all subscribers
 * - Subscription-based pattern to replace direct listeners
 * - Comprehensive debug logging with unique identifiers
 */

export interface VisibilityState {
  /** Current visibility state */
  isVisible: boolean;
  /** Document visibility state ('visible' | 'hidden') */
  visibilityState: DocumentVisibilityState;
  /** Timestamp when visibility last changed */
  lastVisibilityChangeAt: number;
  /** Timestamp when page last became visible */
  lastBecameVisibleAt: number | null;
  /** Timestamp when page last became hidden */
  lastBecameHiddenAt: number | null;
  /** Number of visibility changes since manager started */
  changeCount: number;
}

export interface VisibilitySignals extends VisibilityState {
  /** True only during the event cycle when page just became visible */
  justBecameVisible: boolean;
  /** True only during the event cycle when page just became hidden */
  justHidden: boolean;
  /** Time since last visibility change in milliseconds */
  timeSinceLastChange: number;
  /** Time since last became visible in milliseconds (null if never visible) */
  timeSinceLastVisible: number | null;
  /** Time since last became hidden in milliseconds (null if never hidden) */
  timeSinceLastHidden: number | null;
}

export type VisibilityEventType = 'visibilitychange' | 'pageshow' | 'pagehide';

export interface VisibilitySubscription {
  /** Unique identifier for this subscription */
  id: string;
  /** Callback function called on visibility changes */
  callback: (signals: VisibilitySignals, eventType: VisibilityEventType, event: Event) => void;
  /** Optional filter for specific event types */
  eventTypes?: VisibilityEventType[];
  /** Whether this subscription should receive all events or only changes */
  includeNoChange?: boolean;
}

class VisibilityManagerImpl {
  private state: VisibilityState;
  private subscriptions = new Map<string, VisibilitySubscription>();
  private isInitialized = false;
  private subscriptionCounter = 0;

  constructor() {
    this.state = {
      isVisible: !document.hidden,
      visibilityState: document.visibilityState,
      lastVisibilityChangeAt: Date.now(),
      lastBecameVisibleAt: !document.hidden ? Date.now() : null,
      lastBecameHiddenAt: document.hidden ? Date.now() : null,
      changeCount: 0,
    };

    this.initialize();
  }

  private initialize() {
    if (this.isInitialized) return;
    
    });

    // Bind event handlers to preserve 'this' context
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handlePageShow = this.handlePageShow.bind(this);
    this.handlePageHide = this.handlePageHide.bind(this);

    // Add single set of listeners
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('pageshow', this.handlePageShow);
    window.addEventListener('pagehide', this.handlePageHide);

    // Set global timestamp for backward compatibility
    this.updateGlobalTimestamp();

    this.isInitialized = true;
  }

  private updateGlobalTimestamp() {
    // Maintain backward compatibility with existing code that uses __VIS_CHANGE_AT__
    try {
      (window as any).__VIS_CHANGE_AT__ = this.state.lastVisibilityChangeAt;
    } catch {}
  }

  private handleVisibilityChange(event: Event) {
    const now = Date.now();
    const wasVisible = this.state.isVisible;
    const nowVisible = !document.hidden;
    const visibilityState = document.visibilityState;

    // Only update state if visibility actually changed
    const actuallyChanged = wasVisible !== nowVisible;

    if (actuallyChanged) {
      this.state = {
        ...this.state,
        isVisible: nowVisible,
        visibilityState,
        lastVisibilityChangeAt: now,
        lastBecameVisibleAt: nowVisible ? now : this.state.lastBecameVisibleAt,
        lastBecameHiddenAt: !nowVisible ? now : this.state.lastBecameHiddenAt,
        changeCount: this.state.changeCount + 1,
      };

      this.updateGlobalTimestamp();

      }

    // Notify subscribers
    this.notifySubscribers('visibilitychange', event, actuallyChanged);
  }

  private handlePageShow(event: Event) {
    const now = Date.now();
    // Update last change timestamp for page lifecycle events as well
    this.state = {
      ...this.state,
      lastVisibilityChangeAt: now,
    };
    this.updateGlobalTimestamp();

    .persisted : false,
      timestamp: now,
      subscribers: this.subscriptions.size
    });

    this.notifySubscribers('pageshow', event, true);
  }

  private handlePageHide(event: Event) {
    const now = Date.now();
    // Update last change timestamp for page lifecycle events as well
    this.state = {
      ...this.state,
      lastVisibilityChangeAt: now,
    };
    this.updateGlobalTimestamp();

    .persisted : false,
      timestamp: now,
      subscribers: this.subscriptions.size
    });

    this.notifySubscribers('pagehide', event, true);
  }

  private notifySubscribers(eventType: VisibilityEventType, event: Event, hasChange: boolean) {
    const now = Date.now();
    const signals: VisibilitySignals = {
      ...this.state,
      justBecameVisible: eventType === 'visibilitychange' && this.state.isVisible && hasChange,
      justHidden: eventType === 'visibilitychange' && !this.state.isVisible && hasChange,
      timeSinceLastChange: now - this.state.lastVisibilityChangeAt,
      timeSinceLastVisible: this.state.lastBecameVisibleAt ? now - this.state.lastBecameVisibleAt : null,
      timeSinceLastHidden: this.state.lastBecameHiddenAt ? now - this.state.lastBecameHiddenAt : null,
    };

    let notifiedCount = 0;

    for (const [id, subscription] of this.subscriptions) {
      try {
        // Filter by event type if specified
        if (subscription.eventTypes && !subscription.eventTypes.includes(eventType)) {
          continue;
        }

        // Skip if no change and subscriber doesn't want no-change events
        if (!hasChange && !subscription.includeNoChange) {
          continue;
        }

        subscription.callback(signals, eventType, event);
        notifiedCount++;
      } catch (error) {
        console.error(`[VisibilityManager] Error in subscription ${id}:`, error);
      }
    }

    if (notifiedCount > 0) {
      }
  }

  /**
   * Subscribe to visibility changes
   */
  subscribe(
    callback: (signals: VisibilitySignals, eventType: VisibilityEventType, event: Event) => void,
    options: {
      id?: string;
      eventTypes?: VisibilityEventType[];
      includeNoChange?: boolean;
    } = {}
  ): string {
    const id = options.id || `sub_${++this.subscriptionCounter}`;
    
    if (this.subscriptions.has(id)) {
      console.warn(`[VisibilityManager] Subscription ${id} already exists, replacing it`);
    }

    const subscription: VisibilitySubscription = {
      id,
      callback,
      eventTypes: options.eventTypes,
      includeNoChange: options.includeNoChange ?? false,
    };

    this.subscriptions.set(id, subscription);

    // Return unsubscribe function
    return id;
  }

  /**
   * Unsubscribe from visibility changes
   */
  unsubscribe(id: string): boolean {
    const existed = this.subscriptions.delete(id);
    
    if (existed) {
      } else {
      console.warn(`[VisibilityManager] Attempted to remove non-existent subscription ${id}`);
    }

    return existed;
  }

  /**
   * Get current visibility state and signals
   */
  getState(): VisibilitySignals {
    const now = Date.now();
    return {
      ...this.state,
      justBecameVisible: false, // Only true during event cycles
      justHidden: false, // Only true during event cycles
      timeSinceLastChange: now - this.state.lastVisibilityChangeAt,
      timeSinceLastVisible: this.state.lastBecameVisibleAt ? now - this.state.lastBecameVisibleAt : null,
      timeSinceLastHidden: this.state.lastBecameHiddenAt ? now - this.state.lastBecameHiddenAt : null,
    };
  }

  /**
   * Get debug information about the manager
   */
  getDebugInfo() {
    return {
      state: this.getState(),
      subscriptions: Array.from(this.subscriptions.values()).map(sub => ({
        id: sub.id,
        eventTypes: sub.eventTypes || 'all',
        includeNoChange: sub.includeNoChange
      })),
      isInitialized: this.isInitialized,
    };
  }

  /**
   * Cleanup - remove all listeners and subscriptions
   */
  destroy() {
    if (!this.isInitialized) return;

    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('pageshow', this.handlePageShow);
    window.removeEventListener('pagehide', this.handlePageHide);

    this.subscriptions.clear();
    this.isInitialized = false;

    }
}

// Create singleton instance
export const VisibilityManager = new VisibilityManagerImpl();

// Make available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).__VISIBILITY_MANAGER__ = VisibilityManager;
}

// Export types for consumers
export type { VisibilityState, VisibilitySignals, VisibilityEventType, VisibilitySubscription };
