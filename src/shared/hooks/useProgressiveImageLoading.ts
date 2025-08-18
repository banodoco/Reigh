import React, { useState, useEffect, useRef } from 'react';
import { isImageCached } from '@/shared/lib/imageCacheManager';
import { getUnifiedBatchConfig, getImageLoadingStrategy } from '@/shared/lib/imageLoadingPriority';

interface UseProgressiveImageLoadingProps {
  images: any[];
  page: number;
  enabled?: boolean;
  onImagesReady?: () => void; // Callback when first batch is ready
  isMobile: boolean; // Mobile context for adaptive behavior
  useIntersectionObserver?: boolean; // Optional: use intersection observer for lazy loading
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
  currentPageRef.current = page;
  
  useEffect(() => {
    const now = Date.now();
    const timeSinceLastTrigger = now - lastTriggerTimeRef.current;
    
    if (!enabled || images.length === 0) {
      console.log(`[ProgressiveDebug] Effect skipped:`, {
        enabled,
        imagesLength: images.length,
        reason: !enabled ? 'disabled' : 'no images'
      });
      return;
    }
    
    // Prevent rapid re-triggers (debounce for 50ms unless it's a page change)
    const prevPage = currentPageRef.current;
    const isPageChange = prevPage !== page;
    if (!isPageChange && timeSinceLastTrigger < 50) {
      console.log(`[ProgressiveDebug] 🚫 Effect DEBOUNCED (${timeSinceLastTrigger}ms since last trigger)`);
      return;
    }

    lastTriggerTimeRef.current = now;

    // Generate unique session ID for this progressive loading session
    const sessionId = `prog-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    let isCurrentPage = true; // Track if this effect is still current
    const timeouts: NodeJS.Timeout[] = [];

    // Update current page ref for race condition checks
    currentPageRef.current = page;
    
    console.log(`[ProgressiveDebug:${sessionId}] 🔄 Effect triggered:`, {
      page,
      prevPage,
      imagesLength: images.length,
      enabled,
      isMobile,
      pageChanged: isPageChange,
      firstImageId: images[0]?.id?.substring(0, 8),
      trigger: isPageChange ? 'PAGE_CHANGE' : 'OTHER_DEPENDENCY',
      timeSinceLastTrigger,
      timestamp: new Date().toISOString()
    });

    // Get unified batch configuration
    const batchConfig = getUnifiedBatchConfig(isMobile);
    const actualInitialBatch = Math.min(batchConfig.initialBatchSize, images.length);
    
    console.log(`[ImageLoadingDebug][ProgressiveLoading:${sessionId}] Starting progressive load session:`, {
      page: page + 1,
      imagesLength: images.length,
      actualInitialBatch,
      batchConfig,
      enabled,
      isMobile,
      timestamp: new Date().toISOString()
    });

    // Phase 1: Show initial batch immediately
    const initialIndices = new Set<number>();
    for (let i = 0; i < actualInitialBatch; i++) {
      initialIndices.add(i);
    }
    
    console.log(`[ImageLoadingDebug][ProgressiveLoading:${sessionId}] Phase 1 - Initial batch reveal:`, {
      initialIndicesCount: initialIndices.size,
      initialIndices: Array.from(initialIndices),
      timestamp: new Date().toISOString()
    });
    
    setShowImageIndices(initialIndices);
    
    // Check if first batch of images are already cached
    const firstBatchCached = images.slice(0, actualInitialBatch)
      .every(img => isImageCached(img));
      
    console.log(`[ImageLoadingDebug][ProgressiveLoading:${sessionId}] Initial batch cache status:`, {
      firstBatchCached,
      cachedCount: images.slice(0, actualInitialBatch).filter(img => isImageCached(img)).length,
      totalInBatch: actualInitialBatch
    });
    
    // Notify that initial images are ready
    if (onImagesReady) {
      if (firstBatchCached) {
        // Immediate callback for cached images to prevent loading flicker
        console.log(`[ProgressiveDebug:${sessionId}] 🚀 IMMEDIATE onImagesReady (cached)`);
        onImagesReady();
      } else {
        // Small delay for non-cached images to avoid layout thrashing
        console.log(`[ProgressiveDebug:${sessionId}] ⏱️ DELAYED onImagesReady (16ms) - ${actualInitialBatch - images.slice(0, actualInitialBatch).filter(img => isImageCached(img)).length} uncached`);
        const readyTimeout = setTimeout(() => {
          if (isCurrentPage && currentPageRef.current === page) {
            console.log(`[ProgressiveDebug:${sessionId}] ✅ EXECUTED delayed onImagesReady callback`);
            onImagesReady();
          } else {
            console.log(`[ProgressiveDebug:${sessionId}] ❌ CANCELLED delayed callback - page changed (${currentPageRef.current} !== ${page})`);
          }
        }, 16); // Next frame timing for smoother transitions
        timeouts.push(readyTimeout);
      }
    } else {
      console.log(`[ProgressiveDebug:${sessionId}] ⚠️ No onImagesReady callback provided`);
    }

    // Phase 2: Staggered loading for remaining images using unified delay system
    if (images.length > actualInitialBatch) {
      console.log(`[ImageLoadingDebug][ProgressiveLoading:${sessionId}] Phase 2 - Staggered loading:`, {
        remainingImages: images.length - actualInitialBatch,
        staggerDelay: batchConfig.staggerDelay,
        totalImages: images.length
      });
      
      // Load remaining images using individual delay calculations
      for (let i = actualInitialBatch; i < images.length; i++) {
        const imageIndex = i;
        
        // Use unified loading strategy for delay calculation
        const strategy = getImageLoadingStrategy(imageIndex, {
          isMobile,
          totalImages: images.length, // Use actual count, not approximation
          isPreloaded: isImageCached(images[imageIndex])
        });
        
        const timeout = setTimeout(() => {
          // Enhanced race condition check - make sure we're still on the same page
          if (isCurrentPage && currentPageRef.current === page) {
            console.log(`[ProgressiveDebug:${sessionId}] 🖼️ REVEALING image ${imageIndex} (delay: ${strategy.progressiveDelay}ms, tier: ${strategy.tier})`);
            setShowImageIndices(prev => {
              // Only add if we don't already have this index (avoid duplicates)
              if (!prev.has(imageIndex)) {
                const newSet = new Set(prev);
                newSet.add(imageIndex);
                console.log(`[ProgressiveDebug:${sessionId}] 📈 Updated showImageIndices: size ${newSet.size}, latest: ${Array.from(newSet).slice(-3)}`);
                return newSet;
              }
              console.log(`[ProgressiveDebug:${sessionId}] ⚠️ Image ${imageIndex} already in set`);
              return prev;
            });
          } else {
            console.log(`[ProgressiveDebug:${sessionId}] ❌ CANCELLED image ${imageIndex} - page changed (${currentPageRef.current} !== ${page})`);
          }
        }, strategy.progressiveDelay);
        
        timeouts.push(timeout);
      }
    } else {
      console.log(`[ImageLoadingDebug][ProgressiveLoading:${sessionId}] No additional images to stagger - all in initial batch`);
    }
    
    // Cleanup function that runs when dependencies change or component unmounts
    return () => {
      console.log(`[ProgressiveDebug:${sessionId}] 🧹 CLEANUP - canceling ${timeouts.length} pending timeouts, stale: ${!isCurrentPage}`);
      isCurrentPage = false; // Mark this effect as stale
      timeouts.forEach(timeout => clearTimeout(timeout));
      // Don't clear showImageIndices here - let the new effect handle setting them
    };
  }, [images.length, images[0]?.id, page, enabled, isMobile, useIntersectionObserver]);

  return { showImageIndices };
};