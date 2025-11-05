/**
 * CRITICAL RACE CONDITION FIXES IMPLEMENTED:
 * 
 * 1. Session Management: Each loading session has a unique ID and AbortController
 * 2. Proper Cancellation: All timeouts and operations are properly canceled when superseded
 * 3. Reconciliation Tracking: Uses reconciliation IDs to prevent stale state updates
 * 4. Safe State Updates: All setState calls check if the session is still active
 * 5. Memory Leak Prevention: Comprehensive cleanup on unmount and session changes
 * 
 * This addresses the mobile stalling issues caused by competing progressive loading sessions.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { isImageCached } from '@/shared/lib/imageCacheManager';
import { getUnifiedBatchConfig, getImageLoadingStrategy } from '@/shared/lib/imageLoadingPriority';

interface ImageWithId {
  id: string;
  url?: string;
  thumbUrl?: string;
  [key: string]: any;
}

interface UseProgressiveImageLoadingProps {
  images: ImageWithId[];
  page: number;
  enabled?: boolean;
  onImagesReady?: () => void; // Callback when first batch is ready
  isMobile: boolean; // Mobile context for adaptive behavior
  useIntersectionObserver?: boolean; // Optional: use intersection observer for lazy loading
  isLightboxOpen?: boolean; // Pause loading when lightbox is open
  instanceId?: string; // Unique instance ID to prevent state conflicts
}

// Session management for proper cleanup and race condition prevention
interface LoadingSession {
  id: string;
  abortController: AbortController;
  timeouts: (NodeJS.Timeout | number)[];
  isActive: boolean;
  startTime: number;
}

export const useProgressiveImageLoading = ({ 
  images, 
  page, 
  enabled = true,
  onImagesReady,
  isMobile,
  useIntersectionObserver = false, // Disable by default for compatibility
  isLightboxOpen = false, // Pause loading when lightbox is open
  instanceId = 'default' // Default instance ID
}: UseProgressiveImageLoadingProps) => {
  const [showImageIndices, setShowImageIndices] = useState<Set<number>>(new Set());
  const currentPageRef = useRef(page);
  const lastTriggerTimeRef = useRef<number>(0);
  const activeSessionRef = useRef<LoadingSession | null>(null);
  const reconciliationIdRef = useRef<number>(0);
  
  // Create a stable identifier for the image set to detect changes
  // This prevents the bug where server pagination with same-length pages wouldn't trigger
  // Using first 3 images provides enough uniqueness while being performant
  const imageSetId = React.useMemo(() => {
    return images.slice(0, 3).map(img => img?.id).join(',');
  }, [images]);
  
  // Helper function to safely cancel a loading session
  const cancelActiveSession = (reason: string) => {
    if (activeSessionRef.current?.isActive) {
      // Abort any ongoing operations
      activeSessionRef.current.abortController.abort();
      
      // Clear all timeouts
      activeSessionRef.current.timeouts.forEach(timeout => clearTimeout(timeout));
      
      // Mark as inactive
      activeSessionRef.current.isActive = false;
      activeSessionRef.current = null;
    }
  };

  // Stabilize onImagesReady reference to prevent effect re-runs
  const stableOnImagesReady = useRef(onImagesReady);
  useEffect(() => {
    stableOnImagesReady.current = onImagesReady;
  }, [onImagesReady]);

  useEffect(() => {
    const now = Date.now();
    const timeSinceLastTrigger = now - lastTriggerTimeRef.current;
    
    }...`);
    
    if (!enabled || images.length === 0 || isLightboxOpen) {
      // Call onImagesReady even for empty images to clear loading states
      if (images.length === 0 && stableOnImagesReady.current) {
        stableOnImagesReady.current();
      }
      cancelActiveSession('disabled, no images, or lightbox open');
      return;
    }
    
    // Prevent rapid re-triggers (debounce for 50ms unless it's a page change)
    const prevPage = currentPageRef.current;
    const isPageChange = prevPage !== page;
    if (!isPageChange && timeSinceLastTrigger < 50) {
      `);
      return;
    }

    // Cancel any previous session before starting new one
    cancelActiveSession('new session starting');
    
    lastTriggerTimeRef.current = now;
    reconciliationIdRef.current += 1;
    const currentReconciliationId = reconciliationIdRef.current;

    // Create new loading session with proper cancellation support
    const sessionId = `prog-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const abortController = new AbortController();
    const timeouts: (NodeJS.Timeout | number)[] = [];
    
    const session: LoadingSession = {
      id: sessionId,
      abortController,
      timeouts,
      isActive: true,
      startTime: now
    };
    
    activeSessionRef.current = session;
    currentPageRef.current = page;
    
    `);

    // Helper to check if this session is still active
    const isSessionActive = () => {
      return activeSessionRef.current?.id === sessionId && 
             activeSessionRef.current?.isActive && 
             !abortController.signal.aborted &&
             currentReconciliationId === reconciliationIdRef.current;
    };

    // Helper to safely update state if session is still active
    const safeSetShowImageIndices = (updater: (prev: Set<number>) => Set<number>) => {
      if (isSessionActive()) {
        setShowImageIndices(updater);
        return true;
      }
      return false;
    };

    // Show all images immediately
    const allIndices = new Set<number>();
    for (let i = 0; i < images.length; i++) {
      allIndices.add(i);
    }
    
    // Set all immediately
    if (!safeSetShowImageIndices(() => allIndices)) {
      return; // Session was canceled during setup
    }
    
    // Check if all images are already cached
    const allCached = images.every(img => isImageCached(img));
    const cachedCount = images.filter(img => isImageCached(img)).length;
      
    `);
    
    // Notify that images are ready
    if (stableOnImagesReady.current && isSessionActive()) {
      if (allCached) {
        // Immediate callback for cached images
        `);
        stableOnImagesReady.current();
      } else {
        // Small delay for non-cached images
        `);
        const readyTimeout = setTimeout(() => {
          if (isSessionActive()) {
            stableOnImagesReady.current?.();
          } else {
            `);
          }
        }, 16);
        timeouts.push(readyTimeout);
      }
    }
    
    // Cleanup function that runs when dependencies change or component unmounts
    return () => {
      if (activeSessionRef.current?.id === sessionId) {
        cancelActiveSession('effect cleanup');
      }
    };
  }, [imageSetId, page, enabled, isMobile, useIntersectionObserver, isLightboxOpen]);
  
  // Debug: Track when images prop changes
  useEffect(() => {
    }...`);
  }, [images]);
  
  // Debug: Track when page prop changes
  useEffect(() => {
    }, [page]);

  // Cleanup on unmount - ensure all sessions are properly canceled
  useEffect(() => {
    return () => {
      cancelActiveSession('component unmount');
    };
  }, []);

  return { showImageIndices };
};