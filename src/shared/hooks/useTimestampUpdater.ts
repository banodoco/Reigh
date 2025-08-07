import { useState, useEffect, useRef } from 'react';

/**
 * Smart timestamp updater hook that provides live-updating relative timestamps
 * with performance optimizations for galleries and task lists.
 * 
 * Features:
 * - Automatic updates with smart intervals (30s for recent, 60s for older)
 * - Only updates when component is visible (IntersectionObserver)
 * - Batched updates to prevent excessive re-renders
 * - Efficient memory management with cleanup
 */

interface TimestampUpdateOptions {
  /** Date to track */
  date: Date | string | null;
  /** Update interval in seconds (default: smart intervals based on age) */
  updateInterval?: number;
  /** Whether this timestamp is currently visible (default: true) */
  isVisible?: boolean;
  /** Disable automatic updates (default: false) */
  disabled?: boolean;
}

// Global timestamp manager to coordinate updates across all components
class TimestampManager {
  private intervals = new Map<number, Set<() => void>>();
  private timers = new Map<number, NodeJS.Timeout>();
  
  // Smart interval selection based on timestamp age
  private getUpdateInterval(date: Date): number {
    const now = Date.now();
    const age = now - date.getTime();
    
    // Less than 5 minutes old: update every 30 seconds
    if (age < 5 * 60 * 1000) return 30;
    
    // Less than 1 hour old: update every 60 seconds  
    if (age < 60 * 60 * 1000) return 60;
    
    // Less than 1 day old: update every 5 minutes
    if (age < 24 * 60 * 60 * 1000) return 300;
    
    // Older: update every 30 minutes
    return 1800;
  }
  
  subscribe(date: Date, callback: () => void, isVisible: boolean = true): () => void {
    if (!isVisible) {
      // Return no-op unsubscribe for invisible timestamps
      return () => {};
    }
    
    const interval = this.getUpdateInterval(date);
    
    // Get or create interval group
    if (!this.intervals.has(interval)) {
      this.intervals.set(interval, new Set());
    }
    
    const callbacks = this.intervals.get(interval)!;
    callbacks.add(callback);
    
    // Start timer if this is the first callback for this interval
    if (callbacks.size === 1) {
      console.log(`[TimestampManager] Starting timer for ${interval}s interval`);
      const timer = setInterval(() => {
        console.log(`[TimestampManager] Timer tick for ${interval}s interval, ${callbacks.size} callbacks`);
        // Batch all callbacks for this interval
        callbacks.forEach(cb => cb());
      }, interval * 1000);
      
      this.timers.set(interval, timer);
    }
    
    // Return unsubscribe function
    return () => {
      callbacks.delete(callback);
      
      // Clean up timer if no more callbacks
      if (callbacks.size === 0) {
        const timer = this.timers.get(interval);
        if (timer) {
          clearInterval(timer);
          this.timers.delete(interval);
        }
        this.intervals.delete(interval);
      }
    };
  }
  
  // Get current update interval for a date (for debugging)
  getIntervalForDate(date: Date): number {
    return this.getUpdateInterval(date);
  }
}

// Global singleton
const timestampManager = new TimestampManager();

/**
 * Hook that provides a timestamp that automatically updates at smart intervals
 */
export function useTimestampUpdater({ 
  date, 
  updateInterval, 
  isVisible = true, 
  disabled = false 
}: TimestampUpdateOptions) {
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const dateRef = useRef<Date | null>(null);
  
  // Parse and validate date
  if (date && dateRef.current?.getTime() !== (typeof date === 'string' ? new Date(date) : date)?.getTime()) {
    dateRef.current = typeof date === 'string' ? new Date(date) : date;
  }
  
  useEffect(() => {
    if (!dateRef.current || disabled || !isVisible) {
      return;
    }
    
    // Subscribe to timestamp updates
    const unsubscribe = timestampManager.subscribe(
      dateRef.current,
      () => setUpdateTrigger(prev => prev + 1),
      isVisible
    );
    
    return unsubscribe;
  }, [dateRef.current?.getTime(), isVisible, disabled]);
  
  return {
    /** Current update trigger - changes when timestamp should be recalculated */
    updateTrigger,
    /** The date being tracked */
    date: dateRef.current,
    /** Current update interval for this timestamp (for debugging) */
    currentInterval: dateRef.current ? timestampManager.getIntervalForDate(dateRef.current) : null,
  };
}

/**
 * Hook for components that need to track visibility for performance
 * Uses IntersectionObserver to detect when timestamps are visible
 */
export function useTimestampVisibility(ref: React.RefObject<HTMLElement>) {
  const [isVisible, setIsVisible] = useState(true); // Default to visible
  
  useEffect(() => {
    const element = ref.current;
    if (!element || !('IntersectionObserver' in window)) {
      return;
    }
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        // Consider visible when 10% is showing
        threshold: 0.1,
        // Add some margin to start updating before fully visible
        rootMargin: '50px'
      }
    );
    
    observer.observe(element);
    
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  
  return isVisible;
}

// Export the manager for debugging
export const debugTimestampManager = {
  getActiveIntervals: () => Array.from(timestampManager['intervals'].keys()),
  getCallbackCount: (interval: number) => timestampManager['intervals'].get(interval)?.size || 0,
};
