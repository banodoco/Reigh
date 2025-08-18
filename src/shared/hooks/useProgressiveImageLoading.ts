import React, { useState, useEffect, useRef } from 'react';
import { isImageCached } from './useAdjacentPagePreloading';
import { getBatchConfig, shouldIncludeInInitialBatch } from '@/shared/lib/imageLoadingPriority';

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
  currentPageRef.current = page;
  
  useEffect(() => {
    if (!enabled || images.length === 0) return;

    let isCurrentPage = true; // Track if this effect is still current
    const timeouts: NodeJS.Timeout[] = [];

    // Update current page ref for race condition checks
    currentPageRef.current = page;

    // Get unified batch configuration
    const batchConfig = getBatchConfig(isMobile);
    const actualInitialBatch = Math.min(batchConfig.initialBatchSize, images.length);
    
    // Debug logging for pagination issues
    if (page > 2) { // Only log for page 3+ where issues occur
      console.log(`[ProgressiveLoading] Page ${page + 1}:`, {
        imagesLength: images.length,
        actualInitialBatch,
        batchConfig,
        enabled,
        isCurrentPage
      });
    }

    // Reset and show first batch immediately (visible-first approach)
    // Only include images that should be in the initial batch according to unified system
    const initialIndices = new Set(
      Array.from({ length: images.length }, (_, i) => i)
        .filter(i => shouldIncludeInInitialBatch(i, isMobile))
        .slice(0, actualInitialBatch)
    );
    setShowImageIndices(initialIndices);
    
    // Check if first batch of images are already cached
    const firstBatchCached = images.slice(0, actualInitialBatch)
      .every(img => isImageCached(img));
    
    // Notify that initial images are ready
    if (onImagesReady) {
      if (firstBatchCached) {
        // Immediate callback for cached images to prevent loading flicker
        onImagesReady();
      } else {
        // Small delay for non-cached images to avoid layout thrashing
        const readyTimeout = setTimeout(() => {
          if (isCurrentPage && currentPageRef.current === page) {
            onImagesReady();
          }
        }, 16); // Next frame timing for smoother transitions
        timeouts.push(readyTimeout);
      }
    }

    // Staggered loading for remaining images (one by one for smooth progression)
    if (images.length > actualInitialBatch) {
      // Load remaining images one by one with unified staggered timing
      for (let i = actualInitialBatch; i < images.length; i++) {
        const imageIndex = i;
        const delay = batchConfig.staggerDelay * (i - actualInitialBatch + 1);
        
        const timeout = setTimeout(() => {
          // Enhanced race condition check - make sure we're still on the same page
          if (isCurrentPage && currentPageRef.current === page) {
            setShowImageIndices(prev => {
              // Only add if we don't already have this index (avoid duplicates)
              if (!prev.has(imageIndex)) {
                const newSet = new Set(prev);
                newSet.add(imageIndex);
                return newSet;
              }
              return prev;
            });
          }
        }, delay);
        
        timeouts.push(timeout);
      }
    }
    
    // Cleanup function that runs when dependencies change or component unmounts
    return () => {
      isCurrentPage = false; // Mark this effect as stale
      timeouts.forEach(timeout => clearTimeout(timeout));
      // Don't clear showImageIndices here - let the new effect handle setting them
    };
  }, [images, page, enabled, isMobile, useIntersectionObserver]);

  return { showImageIndices };
};