import { useEffect, useState, useRef } from 'react';

/**
 * Hook to track page visibility and provide debugging for polling issues
 * This helps understand when polling might be paused due to background state
 */
export function usePageVisibility() {
  const [isVisible, setIsVisible] = useState(!document.hidden);
  const visibilityChangeCountRef = useRef(0);
  const lastVisibilityChangeRef = useRef<Date>(new Date());

  useEffect(() => {
    const handleVisibilityChange = () => {
      const wasVisible = isVisible;
      const nowVisible = !document.hidden;
      const now = new Date();
      
      visibilityChangeCountRef.current += 1;
      lastVisibilityChangeRef.current = now;
      
      setIsVisible(nowVisible);
      
      // Debug logging for polling breakage issue
      console.log(`[PollingBreakageIssue] Page visibility changed:`, {
        from: wasVisible ? 'visible' : 'hidden',
        to: nowVisible ? 'visible' : 'hidden',
        visibilityState: document.visibilityState,
        changeCount: visibilityChangeCountRef.current,
        timestamp: now.getTime(),
        timeISOString: now.toISOString()
      });

      // Additional context for React Query behavior
      if (!nowVisible) {
        console.warn(`[PollingBreakageIssue] ⚠️ Page became hidden - React Query will pause refetchInterval polling unless refetchIntervalInBackground is enabled`);
      } else {
        console.log(`[PollingBreakageIssue] ✅ Page became visible - React Query will resume normal polling behavior`);
      }
    };

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial log
    console.log(`[PollingBreakageIssue] Page visibility hook initialized:`, {
      initialVisibility: isVisible ? 'visible' : 'hidden',
      visibilityState: document.visibilityState,
      timestamp: Date.now()
    });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isVisible]);

  return {
    isVisible,
    visibilityChangeCount: visibilityChangeCountRef.current,
    lastVisibilityChange: lastVisibilityChangeRef.current,
  };
}
