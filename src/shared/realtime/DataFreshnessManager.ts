/**
 * DataFreshnessManager - Single source of truth for data freshness and polling decisions
 * 
 * This class centralizes all decisions about:
 * - Whether data is fresh (based on realtime events)
 * - What polling intervals React Query should use
 * - Realtime connection health status
 */

type RealtimeStatus = 'connected' | 'disconnected' | 'error';
type PollingInterval = number | false; // false = no polling

interface DataFreshnessState {
  realtimeStatus: RealtimeStatus;
  lastEventTimes: Map<string, number>;
  lastStatusChange: number;
}

export class DataFreshnessManager {
  private state: DataFreshnessState = {
    realtimeStatus: 'disconnected',
    lastEventTimes: new Map(),
    lastStatusChange: Date.now()
  };

  private subscribers = new Set<() => void>();

  /**
   * Report realtime connection status change
   */
  onRealtimeStatusChange(status: RealtimeStatus, reason?: string) {
    const previousStatus = this.state.realtimeStatus;
    this.state.realtimeStatus = status;
    this.state.lastStatusChange = Date.now();

    console.log(`[DataFreshness] 🔄 Status change: ${previousStatus} → ${status}${reason ? ` (${reason})` : ''}`, {
      timestamp: this.state.lastStatusChange,
      timeSinceLastChange: this.state.lastStatusChange - this.state.lastStatusChange
    });

    // Notify all subscribers that polling intervals may have changed
    this.notifySubscribers();
  }

  /**
   * Report that realtime events were received for specific queries
   */
  onRealtimeEvent(eventType: string, affectedQueries: string[][]) {
    const now = Date.now();
    let updatedQueries = 0;

    affectedQueries.forEach(queryKey => {
      const key = JSON.stringify(queryKey);
      this.state.lastEventTimes.set(key, now);
      updatedQueries++;
    });

    console.log(`[DataFreshness] 📨 Event received: ${eventType}`, {
      affectedQueries: affectedQueries.length,
      updatedQueries,
      timestamp: now,
      realtimeStatus: this.state.realtimeStatus
    });

    // Notify subscribers that data freshness has changed
    this.notifySubscribers();
  }

  /**
   * Get the appropriate polling interval for a query
   * Returns false to disable polling when realtime is working well
   */
  getPollingInterval(queryKey: string[]): PollingInterval {
    const key = JSON.stringify(queryKey);
    const lastEvent = this.state.lastEventTimes.get(key);
    const now = Date.now();
    const timeSinceStatusChange = now - this.state.lastStatusChange;

    // If realtime is connected and we have recent events, use reduced but still responsive polling
    if (this.state.realtimeStatus === 'connected' && lastEvent) {
      const eventAge = now - lastEvent;
      
      if (eventAge < 30000) { // Events within 30 seconds
        return 30000; // 30 seconds - recent events, but still check regularly
      } else if (eventAge < 2 * 60 * 1000) { // Events within 2 minutes
        return 15000; // 15 seconds - events are getting stale, check more often
      }
    }

    // If realtime just connected, give it some time before aggressive polling
    if (this.state.realtimeStatus === 'connected' && timeSinceStatusChange < 30000) {
      return 30000; // 30 seconds - wait for events to start flowing
    }

    // If realtime is disconnected or errored, use aggressive polling
    if (this.state.realtimeStatus === 'disconnected' || this.state.realtimeStatus === 'error') {
      return 5000; // 5 seconds - aggressive fallback
    }

    // Default case: realtime connected but no recent events
    return 10000; // 10 seconds - responsive polling when events are old/missing
  }

  /**
   * Check if data for a query is considered fresh
   */
  isDataFresh(queryKey: string[], freshnessThreshold: number = 30000): boolean {
    const key = JSON.stringify(queryKey);
    const lastEvent = this.state.lastEventTimes.get(key);
    
    if (!lastEvent) {
      return false; // No events recorded = not fresh
    }
    
    const age = Date.now() - lastEvent;
    return age < freshnessThreshold;
  }

  /**
   * Get current freshness state for debugging
   */
  getDiagnostics() {
    const now = Date.now();
    return {
      realtimeStatus: this.state.realtimeStatus,
      timeSinceStatusChange: now - this.state.lastStatusChange,
      trackedQueries: this.state.lastEventTimes.size,
      queryAges: Array.from(this.state.lastEventTimes.entries()).map(([key, time]) => ({
        query: JSON.parse(key),
        ageMs: now - time,
        ageSec: Math.round((now - time) / 1000)
      })),
      subscriberCount: this.subscribers.size,
      timestamp: now
    };
  }

  /**
   * Subscribe to freshness changes
   * Returns unsubscribe function
   */
  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Clear all event history (useful for testing or project changes)
   */
  reset() {
    console.log(`[DataFreshness] 🔄 Resetting state (had ${this.state.lastEventTimes.size} tracked queries)`);
    this.state.lastEventTimes.clear();
    this.state.realtimeStatus = 'disconnected';
    this.state.lastStatusChange = Date.now();
    this.notifySubscribers();
  }

  /**
   * Manually mark queries as fresh (useful for mutations)
   */
  markQueriesFresh(queryKeys: string[][]) {
    const now = Date.now();
    queryKeys.forEach(queryKey => {
      const key = JSON.stringify(queryKey);
      this.state.lastEventTimes.set(key, now);
    });

    console.log(`[DataFreshness] ✅ Manually marked ${queryKeys.length} queries as fresh`, {
      queries: queryKeys,
      timestamp: now
    });

    this.notifySubscribers();
  }

  private notifySubscribers() {
    // Notify all React components that polling intervals may have changed
    this.subscribers.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('[DataFreshness] Error in subscriber callback:', error);
      }
    });
  }
}

// Singleton instance - single source of truth for the entire app
export const dataFreshnessManager = new DataFreshnessManager();

// Export for debugging in browser console
if (typeof window !== 'undefined') {
  (window as any).__DATA_FRESHNESS_MANAGER__ = dataFreshnessManager;
}
