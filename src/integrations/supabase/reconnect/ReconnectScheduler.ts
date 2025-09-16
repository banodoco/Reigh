// Network status integration can be added later if needed

/**
 * ReconnectScheduler - Centralized manager for realtime reconnection intents
 * 
 * Prevents race conditions between multiple sources (AuthManager, warn interceptor, 
 * visibility changes) by coalescing reconnection requests and enforcing debouncing.
 */

export interface ReconnectIntent {
  source: string;
  reason: string;
  timestamp: number;
  priority: 'low' | 'medium' | 'high';
}

export class ReconnectScheduler {
  private pendingIntents: ReconnectIntent[] = [];
  private lastReconnectAt = 0;
  private debounceTimeout: NodeJS.Timeout | null = null;
  private isProcessing = false;
  // Network status integration removed for simplicity

  private readonly DEBOUNCE_MS = 1000; // 1 second debounce
  private readonly MIN_INTERVAL_MS = 5000; // Minimum 5 seconds between reconnects
  private readonly OFFLINE_RETRY_INTERVAL_MS = 10000; // Check network status every 10s when offline

  constructor() {
    // Simple constructor - network status integration can be added later
  }

  /**
   * Request a reconnection with specified intent
   */
  requestReconnect(intent: Omit<ReconnectIntent, 'timestamp'>) {
    const fullIntent: ReconnectIntent = {
      ...intent,
      timestamp: Date.now()
    };

    console.log('[ReconnectScheduler] Request received:', {
      source: fullIntent.source,
      reason: fullIntent.reason,
      priority: fullIntent.priority,
      pendingIntentsCount: this.pendingIntents.length,
      isProcessing: this.isProcessing,
      timeSinceLastReconnect: Date.now() - this.lastReconnectAt,
      schedulerState: this.getState()
    });

    // Add to pending intents
    this.pendingIntents.push(fullIntent);

    // Clear existing debounce timer
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
      console.log('[ReconnectScheduler] Cleared existing debounce timer');
    }

    // Set new debounce timer
    this.debounceTimeout = setTimeout(() => {
      this.processReconnectIntents();
    }, this.DEBOUNCE_MS);
    
    console.log('[ReconnectScheduler] Debounce timer set:', {
      debounceMs: this.DEBOUNCE_MS,
      willProcessAt: Date.now() + this.DEBOUNCE_MS
    });
  }

  private processReconnectIntents() {
    console.log('[ReconnectScheduler] Processing intents:', {
      isProcessing: this.isProcessing,
      pendingIntentsCount: this.pendingIntents.length,
      pendingIntents: this.pendingIntents.map(i => ({ source: i.source, reason: i.reason, priority: i.priority }))
    });

    if (this.isProcessing || this.pendingIntents.length === 0) {
      console.log('[ReconnectScheduler] Skipping processing:', {
        reason: this.isProcessing ? 'already processing' : 'no pending intents'
      });
      return;
    }

    const now = Date.now();
    const timeSinceLastReconnect = now - this.lastReconnectAt;

    // Enforce minimum interval
    if (timeSinceLastReconnect < this.MIN_INTERVAL_MS) {
      const remainingWait = this.MIN_INTERVAL_MS - timeSinceLastReconnect;
      
      console.log('[ReconnectScheduler] Enforcing minimum interval:', {
        timeSinceLastReconnect,
        minIntervalMs: this.MIN_INTERVAL_MS,
        remainingWait,
        willRetryAt: now + remainingWait
      });
      
      // Reschedule after the remaining wait time
      this.debounceTimeout = setTimeout(() => {
        this.processReconnectIntents();
      }, remainingWait);
      return;
    }

    this.isProcessing = true;

    // Sort intents by priority and timestamp
    const sortedIntents = [...this.pendingIntents].sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.timestamp - b.timestamp; // Earlier timestamp first
    });

    const primaryIntent = sortedIntents[0];
    const allSources = sortedIntents.map(i => i.source);
    const allReasons = [...new Set(sortedIntents.map(i => i.reason))];

    console.log('[ReconnectScheduler] Coalescing intents:', {
      totalIntents: sortedIntents.length,
      primaryIntent: {
        source: primaryIntent.source,
        reason: primaryIntent.reason,
        priority: primaryIntent.priority,
        timestamp: primaryIntent.timestamp
      },
      allSources,
      allReasons,
      eventWillDispatch: true
    });

    // Clear pending intents
    this.pendingIntents = [];

    // Update last reconnect time
    this.lastReconnectAt = now;

    try {
      console.log('[ReconnectScheduler] Dispatching realtime:auth-heal event...');
      
      // Dispatch the single, coalesced reconnect event
      window.dispatchEvent(new CustomEvent('realtime:auth-heal', {
        detail: {
          source: primaryIntent.source,
          reason: primaryIntent.reason,
          priority: primaryIntent.priority,
          coalescedSources: allSources,
          coalescedReasons: allReasons,
          timestamp: now
        }
      }));
      
      console.log('[ReconnectScheduler] ✅ Event dispatched successfully');
    } catch (error) {
      console.error('[ReconnectScheduler] ❌ FAILED TO DISPATCH RECONNECT:', {
        error,
        errorMessage: error?.message,
        errorStack: error?.stack,
        eventDetails: {
          source: primaryIntent.source,
          reason: primaryIntent.reason,
          priority: primaryIntent.priority,
          coalescedSources: allSources,
          coalescedReasons: allReasons,
          timestamp: now
        }
      });
    } finally {
      this.isProcessing = false;
      console.log('[ReconnectScheduler] Processing complete, isProcessing set to false');
    }
  }

  // Network status handling removed for simplicity

  /**
   * Clean up resources
   */
  destroy() {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = null;
    }
    
    // Network status cleanup removed
    
    this.pendingIntents = [];
    this.isProcessing = false;
  }

  /**
   * Get current scheduler state for debugging
   */
  getState() {
    return {
      pendingIntents: this.pendingIntents.length,
      lastReconnectAt: this.lastReconnectAt,
      isProcessing: this.isProcessing,
      timeSinceLastReconnect: Date.now() - this.lastReconnectAt
    };
  }
}

// Global instance
let reconnectScheduler: ReconnectScheduler;

export function getReconnectScheduler(): ReconnectScheduler {
  if (!reconnectScheduler) {
    reconnectScheduler = new ReconnectScheduler();
    
    // Make it globally accessible for debugging
    if (typeof window !== 'undefined') {
      (window as any).__RECONNECT_SCHEDULER__ = reconnectScheduler;
    }
  }
  
  return reconnectScheduler;
}
