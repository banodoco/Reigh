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
  useIntersectionObserver = false // Disable by default for compatibility
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
      console.log(`🧹 [PAGELOADINGDEBUG] [PROG:${activeSessionRef.current.id}] Canceling session: ${reason}`);
      
      // Abort any ongoing operations
      activeSessionRef.current.abortController.abort();
      
      // Clear all timeouts
      activeSessionRef.current.timeouts.forEach(timeout => clearTimeout(timeout));
      
      // Mark as inactive
      activeSessionRef.current.isActive = false;
      activeSessionRef.current = null;
    }
  };

  useEffect(() => {
    const now = Date.now();
    const timeSinceLastTrigger = now - lastTriggerTimeRef.current;
    
    console.log(`🔍 [PAGELOADINGDEBUG] [PROG] Effect triggered - imageSetId: ${imageSetId.substring(0, 20)}...`);
    
    if (!enabled || images.length === 0) {
      console.log(`❌ [PAGELOADINGDEBUG] [PROG] Effect skipped:`, {
        enabled,
        imagesLength: images.length,
        reason: !enabled ? 'disabled' : 'no images'
      });
      cancelActiveSession('disabled or no images');
      return;
    }
    
    // Prevent rapid re-triggers (debounce for 50ms unless it's a page change)
    const prevPage = currentPageRef.current;
    const isPageChange = prevPage !== page;
    if (!isPageChange && timeSinceLastTrigger < 50) {
      console.log(`⏸️ [PAGELOADINGDEBUG] [PROG] Effect DEBOUNCED (${timeSinceLastTrigger}ms since last trigger, isPageChange: ${isPageChange})`);
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
    
    console.log(`🎬 [PAGELOADINGDEBUG] [PROG:${sessionId}] Starting progressive load: ${images.length} images (${isPageChange ? 'page change' : 'image set change'})`);

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
      console.log(`❌ [PAGELOADINGDEBUG] [PROG:${sessionId}] State update skipped - session inactive`);
      return false;
    };

    // Get unified batch configuration
    const batchConfig = getUnifiedBatchConfig(isMobile);
    const actualInitialBatch = Math.min(batchConfig.initialBatchSize, images.length);
    
    // Phase 1: Show initial batch immediately
    const initialIndices = new Set<number>();
    for (let i = 0; i < actualInitialBatch; i++) {
      initialIndices.add(i);
    }
    
    // Check if first batch of images are already cached
    const firstBatchCached = images.slice(0, actualInitialBatch)
      .every(img => isImageCached(img));
    const cachedCount = images.slice(0, actualInitialBatch).filter(img => isImageCached(img)).length;
      
    console.log(`📦 [PAGELOADINGDEBUG] [PROG:${sessionId}] Initial batch: ${actualInitialBatch} images (${cachedCount}/${actualInitialBatch} cached)`);
    
    // Set initial batch immediately
    if (!safeSetShowImageIndices(() => initialIndices)) {
      return; // Session was canceled during setup
    }
    
    // Notify that initial images are ready
    if (onImagesReady && isSessionActive()) {
      if (firstBatchCached) {
        // Immediate callback for cached images to prevent loading flicker
        console.log(`⚡ [PAGELOADINGDEBUG] [PROG:${sessionId}] Ready callback: IMMEDIATE (all cached)`);
        onImagesReady();
      } else {
        // Small delay for non-cached images to avoid layout thrashing
        console.log(`⏱️ [PAGELOADINGDEBUG] [PROG:${sessionId}] Ready callback: DELAYED 16ms (${actualInitialBatch - cachedCount} uncached)`);
        const readyTimeout = setTimeout(() => {
          if (isSessionActive()) {
            console.log(`✅ [PAGELOADINGDEBUG] [PROG:${sessionId}] Ready callback executed`);
            onImagesReady();
          } else {
            console.log(`❌ [PAGELOADINGDEBUG] [PROG:${sessionId}] Ready callback cancelled (session inactive)`);
          }
        }, 16); // Next frame timing for smoother transitions
        timeouts.push(readyTimeout);
      }
    }

    // Phase 2: Optimized staggered loading with cancellation support
    if (images.length > actualInitialBatch && isSessionActive()) {
      const remainingImages = images.length - actualInitialBatch;
      console.log(`🔄 [PAGELOADINGDEBUG] [PROG:${sessionId}] Staggered load: ${remainingImages} remaining images (${batchConfig.staggerDelay}ms intervals)`);
      
      // Pre-calculate all reveal times for better performance
      const revealSchedule: Array<{ index: number; delay: number; tier: string }> = [];
      for (let i = actualInitialBatch; i < images.length; i++) {
        const strategy = getImageLoadingStrategy(i, {
          isMobile,
          totalImages: images.length,
          isPreloaded: isImageCached(images[i])
        });
        revealSchedule.push({ 
          index: i, 
          delay: strategy.progressiveDelay, 
          tier: strategy.tier 
        });
      }
      
      // Sort by delay for efficient processing
      revealSchedule.sort((a, b) => a.delay - b.delay);
      
      let scheduleIndex = 0;
      const startTime = Date.now();
      
      // Single interval to process the reveal schedule with cancellation support
      const revealInterval = setInterval(() => {
        if (!isSessionActive() || scheduleIndex >= revealSchedule.length) {
          clearInterval(revealInterval);
          if (scheduleIndex >= revealSchedule.length) {
            console.log(`✅ [PAGELOADINGDEBUG] [PROG:${sessionId}] Staggered loading complete`);
          }
          return;
        }
        
        const currentTime = Date.now() - startTime;
        const currentItem = revealSchedule[scheduleIndex];
        
        if (currentTime >= currentItem.delay) {
          const updated = safeSetShowImageIndices(prev => {
            if (!prev.has(currentItem.index)) {
              const newSet = new Set(prev);
              newSet.add(currentItem.index);
              // Only log every 5th image or the last one to reduce noise
              if (currentItem.index % 5 === 0 || scheduleIndex === revealSchedule.length - 1) {
                console.log(`🖼️ [PAGELOADINGDEBUG] [PROG:${sessionId}] Revealed image ${currentItem.index} (${newSet.size}/${images.length} total)`);
              }
              return newSet;
            }
            return prev;
          });
          
          if (updated) {
            scheduleIndex++;
          } else {
            // Session was canceled, stop the interval
            clearInterval(revealInterval);
          }
        }
      }, 16); // Check every frame (16ms)
      
      timeouts.push(revealInterval);
    } else if (isSessionActive()) {
      console.log(`✅ [PAGELOADINGDEBUG] [PROG:${sessionId}] Complete - all images in initial batch`);
    }
    
    // Cleanup function that runs when dependencies change or component unmounts
    return () => {
      if (activeSessionRef.current?.id === sessionId) {
        console.log(`🧹 [PAGELOADINGDEBUG] [PROG:${sessionId}] Cleanup - canceling ${timeouts.length} timers`);
        cancelActiveSession('effect cleanup');
      }
    };
  }, [imageSetId, page, enabled, isMobile, useIntersectionObserver, onImagesReady]);
  
  // Debug: Track when images prop changes
  useEffect(() => {
    console.log(`📝 [PAGELOADINGDEBUG] [PROG] Images prop changed: ${images.length} images, first ID: ${images[0]?.id?.substring(0, 8)}...`);
  }, [images]);
  
  // Debug: Track when page prop changes
  useEffect(() => {
    console.log(`📄 [PAGELOADINGDEBUG] [PROG] Page prop changed: ${page}`);
  }, [page]);

  // Cleanup on unmount - ensure all sessions are properly canceled
  useEffect(() => {
    return () => {
      cancelActiveSession('component unmount');
    };
  }, []);

  return { showImageIndices };
};