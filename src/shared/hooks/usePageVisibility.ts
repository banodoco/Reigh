import { useEffect, useState, useRef } from 'react';
import { VisibilityManager, type VisibilitySignals, type VisibilityEventType } from '@/shared/lib/VisibilityManager';

/**
 * Hook to track page visibility and provide debugging for polling issues
 * This helps understand when polling might be paused due to background state
 * 
 * Now uses centralized VisibilityManager to prevent duplicate listeners
 */
export function usePageVisibility() {
  const [state, setState] = useState(() => {
    const initialState = VisibilityManager.getState();
    return {
      isVisible: initialState.isVisible,
      visibilityChangeCount: initialState.changeCount,
      lastVisibilityChange: new Date(initialState.lastVisibilityChangeAt),
    };
  });

  useEffect(() => {
    // Subscribe to VisibilityManager instead of direct DOM events
    const subscriptionId = VisibilityManager.subscribe((signals: VisibilitySignals, eventType: VisibilityEventType) => {
      if (eventType === 'visibilitychange') {
        const now = new Date(signals.lastVisibilityChangeAt);
        
        // Update state
        setState(prevState => ({
          isVisible: signals.isVisible,
          visibilityChangeCount: signals.changeCount,
          lastVisibilityChange: now,
        }));
        
        // Debug logging for polling breakage issue (only on actual changes)
        if (signals.justBecameVisible || signals.justHidden) {
          console.log(`[PollingBreakageIssue] Page visibility changed:`, {
            from: signals.justBecameVisible ? 'hidden' : 'visible',
            to: signals.justBecameVisible ? 'visible' : 'hidden',
            visibilityState: signals.visibilityState,
            changeCount: signals.changeCount,
            timestamp: signals.lastVisibilityChangeAt,
            timeISOString: now.toISOString(),
            timeSinceLastChange: signals.timeSinceLastChange
          });

          // Additional context for React Query behavior
          if (signals.justHidden) {
            console.warn(`[PollingBreakageIssue] ⚠️ Page became hidden - React Query will pause refetchInterval polling unless refetchIntervalInBackground is enabled`);
          } else if (signals.justBecameVisible) {
            console.log(`[PollingBreakageIssue] ✅ Page became visible - React Query will resume normal polling behavior`);
          }
        }
      }
    }, {
      id: 'use-page-visibility',
      eventTypes: ['visibilitychange'],
      includeNoChange: false // Only get actual changes
    });

    // Initial log
    const initialState = VisibilityManager.getState();
    console.log(`[PollingBreakageIssue] Page visibility hook initialized:`, {
      initialVisibility: initialState.isVisible ? 'visible' : 'hidden',
      visibilityState: initialState.visibilityState,
      changeCount: initialState.changeCount,
      timestamp: Date.now()
    });

    return () => {
      VisibilityManager.unsubscribe(subscriptionId);
    };
  }, []);

  return state;
}
