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
  // REMOVED: Don't update ref here - it breaks page change detection
  
  // Create a stable identifier for the image set to detect changes
  // This prevents the bug where server pagination with same-length pages wouldn't trigger
  // Using first 3 images provides enough uniqueness while being performant
  const imageSetId = React.useMemo(() => {
    return images.slice(0, 3).map(img => img?.id).join(',');
  }, [images]);
  
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
      return;
    }
    
    // Prevent rapid re-triggers (debounce for 50ms unless it's a page change)
    const prevPage = currentPageRef.current;
    const isPageChange = prevPage !== page;
    if (!isPageChange && timeSinceLastTrigger < 50) {
      console.log(`⏸️ [PAGELOADINGDEBUG] [PROG] Effect DEBOUNCED (${timeSinceLastTrigger}ms since last trigger, isPageChange: ${isPageChange})`);
      return;
    }

    lastTriggerTimeRef.current = now;

    // Generate unique session ID for this progressive loading session
    const sessionId = `prog-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    let isCurrentPage = true; // Track if this effect is still current
    const timeouts: NodeJS.Timeout[] = [];

    // Update current page ref for race condition checks
    currentPageRef.current = page;
    
    console.log(`🎬 [PAGELOADINGDEBUG] [PROG:${sessionId}] Starting progressive load: ${images.length} images (${isPageChange ? 'page change' : 'image set change'})`);

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
    
    setShowImageIndices(initialIndices);
    
    // Notify that initial images are ready
    if (onImagesReady) {
      if (firstBatchCached) {
        // Immediate callback for cached images to prevent loading flicker
        console.log(`⚡ [PAGELOADINGDEBUG] [PROG:${sessionId}] Ready callback: IMMEDIATE (all cached)`);
        onImagesReady();
      } else {
        // Small delay for non-cached images to avoid layout thrashing
        console.log(`⏱️ [PAGELOADINGDEBUG] [PROG:${sessionId}] Ready callback: DELAYED 16ms (${actualInitialBatch - cachedCount} uncached)`);
        const readyTimeout = setTimeout(() => {
          // Simplified check - just verify we're still on the current session
          if (isCurrentPage) {
            console.log(`✅ [PAGELOADINGDEBUG] [PROG:${sessionId}] Ready callback executed`);
            onImagesReady();
          } else {
            console.log(`❌ [PAGELOADINGDEBUG] [PROG:${sessionId}] Ready callback cancelled (stale session)`);
          }
        }, 16); // Next frame timing for smoother transitions
        timeouts.push(readyTimeout);
      }
    }

    // Phase 2: Optimized staggered loading using single interval instead of multiple timeouts
    if (images.length > actualInitialBatch) {
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
      
      // Single interval to process the reveal schedule
      const revealInterval = setInterval(() => {
        if (!isCurrentPage || scheduleIndex >= revealSchedule.length) {
          clearInterval(revealInterval);
          return;
        }
        
        const currentTime = Date.now() - startTime;
        const currentItem = revealSchedule[scheduleIndex];
        
        if (currentTime >= currentItem.delay) {
          setShowImageIndices(prev => {
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
          
          scheduleIndex++;
        }
      }, 16); // Check every frame (16ms)
      
      timeouts.push(revealInterval as any); // Store for cleanup
    } else {
      console.log(`✅ [PAGELOADINGDEBUG] [PROG:${sessionId}] Complete - all images in initial batch`);
    }
    
    // Cleanup function that runs when dependencies change or component unmounts
    return () => {
      console.log(`🧹 [PAGELOADINGDEBUG] [PROG:${sessionId}] Cleanup - canceling ${timeouts.length} timers`);
      isCurrentPage = false; // Mark this effect as stale
      timeouts.forEach(timeout => clearTimeout(timeout));
      // Don't clear showImageIndices here - let the new effect handle setting them
    };
  }, [imageSetId, page, enabled, isMobile, useIntersectionObserver]);
  
  // Debug: Track when images prop changes
  useEffect(() => {
    console.log(`📝 [PAGELOADINGDEBUG] [PROG] Images prop changed: ${images.length} images, first ID: ${images[0]?.id?.substring(0, 8)}...`);
  }, [images]);
  
  // Debug: Track when page prop changes
  useEffect(() => {
    console.log(`📄 [PAGELOADINGDEBUG] [PROG] Page prop changed: ${page}`);
  }, [page]);

  return { showImageIndices };
};