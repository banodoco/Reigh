/**
 * WebSocket Failure Tracker - Precisely tracks WebSocket failures during tab suspension
 */

import { VisibilityManager, type VisibilitySignals, type VisibilityEventType } from './VisibilityManager';

let tabSuspensionStartTime: number | null = null;
let tabResumeTime: number | null = null;
let webSocketFailures: Array<{
  timestamp: number;
  url: string;
  error: string;
  readyState: number;
  timeSinceTabResume: number;
  visibilityState: string;
}> = [];

let visibilitySubscriptionId: string | null = null;

// Track tab suspension/resume timing using VisibilityManager
if (typeof window !== 'undefined') {
  visibilitySubscriptionId = VisibilityManager.subscribe((signals: VisibilitySignals, eventType: VisibilityEventType, event: Event) => {
    const now = Date.now();
    
    if (eventType === 'visibilitychange') {
      if (signals.justHidden) {
        tabSuspensionStartTime = now;
        console.error('[WebSocketDebug] 📱 TAB SUSPENDED:', {
          timestamp: now,
          suspensionTime: new Date(now).toISOString(),
          changeCount: signals.changeCount
        });
      } else if (signals.justBecameVisible) {
        tabResumeTime = now;
        const suspensionDuration = tabSuspensionStartTime ? now - tabSuspensionStartTime : 0;
        
        console.error('[WebSocketDebug] 📱 TAB RESUMED:', {
          timestamp: now,
          resumeTime: new Date(now).toISOString(),
          suspensionDuration,
          suspensionDurationText: suspensionDuration > 0 ? `${Math.round(suspensionDuration / 1000)}s` : 'unknown',
          changeCount: signals.changeCount
        });
        
        // Clear old failures (keep only last 10)
        webSocketFailures = webSocketFailures.slice(-10);
      }
    } else if (eventType === 'pagehide') {
      console.error('[WebSocketDebug] 📱 PAGE HIDE EVENT:', {
        timestamp: now,
        persisted: event && 'persisted' in event ? (event as PageTransitionEvent).persisted : false
      });
    } else if (eventType === 'pageshow') {
      console.error('[WebSocketDebug] 📱 PAGE SHOW EVENT:', {
        timestamp: now,
        persisted: event && 'persisted' in event ? (event as PageTransitionEvent).persisted : false
      });
    }
  }, {
    id: 'websocket-failure-tracker',
    eventTypes: ['visibilitychange', 'pageshow', 'pagehide']
  });
}

/**
 * Track WebSocket failures with context about tab state
 */
export function trackWebSocketFailure(url: string, error: string, readyState: number) {
  const now = Date.now();
  const timeSinceTabResume = tabResumeTime ? now - tabResumeTime : -1;
  
  const failure = {
    timestamp: now,
    url: url.slice(0, 100),
    error,
    readyState,
    timeSinceTabResume,
    visibilityState: document.visibilityState
  };
  
  webSocketFailures.push(failure);
  
  console.error('[WebSocketDebug] 💥 WEBSOCKET FAILURE TRACKED:', {
    ...failure,
    readyStateText: readyState === 0 ? 'CONNECTING' : 
                   readyState === 1 ? 'OPEN' : 
                   readyState === 2 ? 'CLOSING' : 
                   readyState === 3 ? 'CLOSED' : `UNKNOWN(${readyState})`,
    timeSinceTabResumeText: timeSinceTabResume > 0 ? `${Math.round(timeSinceTabResume / 1000)}s` : 'N/A',
    isWithin30SecondsOfResume: timeSinceTabResume > 0 && timeSinceTabResume < 30000,
    totalFailures: webSocketFailures.length
  });
}

/**
 * Get failure summary for debugging
 */
export function getWebSocketFailureSummary() {
  const visibilityState = VisibilityManager.getState();
  
  return {
    totalFailures: webSocketFailures.length,
    recentFailures: webSocketFailures.filter(f => Date.now() - f.timestamp < 60000).length,
    failuresAfterTabResume: webSocketFailures.filter(f => f.timeSinceTabResume > 0 && f.timeSinceTabResume < 30000).length,
    lastFailure: webSocketFailures[webSocketFailures.length - 1],
    tabState: {
      currentVisibility: visibilityState.visibilityState,
      isVisible: visibilityState.isVisible,
      lastSuspensionTime: tabSuspensionStartTime,
      lastResumeTime: tabResumeTime,
      timeSinceLastResume: tabResumeTime ? Date.now() - tabResumeTime : -1,
      changeCount: visibilityState.changeCount,
      lastVisibilityChangeAt: visibilityState.lastVisibilityChangeAt,
      timeSinceLastChange: visibilityState.timeSinceLastChange
    }
  };
}

/**
 * Initialize failure tracking
 */
export function initWebSocketFailureTracker() {
  console.error('[WebSocketDebug] 🚀 WebSocket failure tracker initialized');
  
  // Log summary every 30 seconds if there are failures
  setInterval(() => {
    if (webSocketFailures.length > 0) {
      console.error('[WebSocketDebug] 📊 FAILURE SUMMARY:', getWebSocketFailureSummary());
    }
  }, 30000);
}

/**
 * Cleanup failure tracking
 */
export function cleanupWebSocketFailureTracker() {
  if (visibilitySubscriptionId) {
    VisibilityManager.unsubscribe(visibilitySubscriptionId);
    visibilitySubscriptionId = null;
    console.error('[WebSocketDebug] 🧹 WebSocket failure tracker cleaned up');
  }
}


