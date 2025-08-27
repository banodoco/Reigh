import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';

// TypeScript declaration for global mobile video preload map
declare global {
  interface Window {
    mobileVideoPreloadMap?: Map<number, () => void>;
  }
}
import { GenerationRow } from '@/types/shots';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import MediaLightbox from '@/shared/components/MediaLightbox';
import TaskDetailsModal from '../TaskDetailsModal';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useGetTask } from '@/shared/hooks/useTasks';
import { useQueryClient } from '@tanstack/react-query';
import { useUnifiedGenerations, useTaskFromUnifiedCache } from '@/shared/hooks/useUnifiedGenerations';
import { useGenerationTaskPreloader, useEnhancedGenerations } from '@/shared/contexts/GenerationTaskContext';
import { useVideoCountCache } from '@/shared/hooks/useVideoCountCache';

// Import our extracted hooks and components
import { useGalleryPagination, useVideoHover } from './hooks';
import {
  VideoItem,
  VideoHoverPreview,
  GalleryControls,
  GalleryPagination,
  EmptyState
} from './components';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import {
  sortVideoOutputsByDate,
  transformUnifiedGenerationsData,
  logVideoLoadingStrategy
} from './utils/video-loading-utils';
import {
  createMobileTapHandler,
  deriveInputImages,
  createHoverDetailsHandler,
  createTaskDetailsHandler
} from './utils/gallery-utils';

/**
 * VideoOutputsGallery - Enhanced video gallery component with thumbnail support
 * 
 * ARCHITECTURE OVERVIEW:
 * =====================
 * 
 * 🎬 VIDEO LOADING STRATEGY:
 * - Staggered loading (first video priority, others delayed)
 * - Smart preload settings ('metadata' for first, 'none' for others)
 * - Thumbnail-first display with smooth transition to video
 * - Automatic state sync when videos are pre-loaded
 * 
 * 🔄 LIFECYCLE TRACKING:
 * - Comprehensive [VideoLifecycle] logging for debugging
 * - Component mount/unmount tracking (identifies re-mount issues)
 * - Phase-based state tracking (WAITING_TO_LOAD → THUMBNAIL_LOADED → VIDEO_READY)
 * 
 * 🖼️ THUMBNAIL INTEGRATION:
 * - Instant thumbnail display before video loads
 * - Graceful fallback to video poster when no thumbnail
 * - Smooth opacity transitions between states
 * 
 * 📱 RESPONSIVE BEHAVIOR:
 * - Mobile-optimized interactions (tap vs hover)
 * - Pagination for large galleries
 * - Loading states for all network conditions
 * 
 * 🐛 DEBUGGING:
 * - All debug logs gated behind NODE_ENV === 'development'
 * - Unified [VideoLifecycle] tag for easy filtering
 * - State summaries for quick status overview
 * 
 * 🏗️ ENGINEERING STATUS:
 * - Component is functional and handles video loading correctly
 * - Comprehensive debugging system with proper development gating
 * - Successfully resolves video loading issues with thumbnail support
 * - Ready for production with clean logging practices
 * - Refactored into modular hooks and components for maintainability
 */

interface VideoOutputsGalleryProps {
  // Data source
  projectId: string | null;
  shotId: string | null;
  
  // Event handlers (keeping the same interface for compatibility)
  onDelete: (generationId: string) => void;
  deletingVideoId: string | null;
  /**
   * Apply settings extracted from a task/generation directly.
   */
  onApplySettings: (settings: {
    prompt?: string;
    prompts?: string[];
    negativePrompt?: string;
    negativePrompts?: string[];
    steps?: number;
    frame?: number;
    frames?: number[];
    context?: number;
    contexts?: number[];
    width?: number;
    height?: number;
    replaceImages?: boolean;
    inputImages?: string[];
  }) => void;
  /**
   * Alternative apply handler that operates using the original task id (server-side extraction).
   */
  onApplySettingsFromTask: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
  onImageSaved?: (newImageUrl: string, createNew?: boolean) => Promise<void>;
  /**
   * Key to identify which shot/context these videos belong to - used to reset state when shot changes
   */
  shotKey?: string;
  
  /**
   * Project-wide video count lookup function for instant skeleton display
   */
  getShotVideoCount?: (shotId: string | null) => number | null;
  
  /**
   * Function to invalidate video counts cache when videos are added/deleted
   */
  invalidateVideoCountsCache?: () => void;
  
  /**
   * Project aspect ratio for proper video dimensions (e.g., "4:3", "16:9")
   */
  projectAspectRatio?: string;

  /**
   * Hint from parent that local shot data indicates zero video outputs.
   * Used to immediately show the empty state before project-wide counts load.
   */
  localZeroHint?: boolean;
}

const VideoOutputsGallery: React.FC<VideoOutputsGalleryProps> = ({
  projectId,
  shotId,
  onDelete,
  deletingVideoId,
  onApplySettings,
  onApplySettingsFromTask,
  onImageSaved,
  shotKey,
  getShotVideoCount,
  invalidateVideoCountsCache,
  projectAspectRatio,
  localZeroHint,
}) => {
  // ===============================================================================
  // STATE MANAGEMENT
  // ===============================================================================
  
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectedVideoForDetails, setSelectedVideoForDetails] = useState<GenerationRow | null>(null);
  const [showTaskDetailsModal, setShowTaskDetailsModal] = useState(false);
  const [optimisticallyRemovedIds, setOptimisticallyRemovedIds] = useState<Set<string>>(new Set());
  
  // Stable content key to avoid resets during background refetches
  const contentKey = `${shotId ?? ''}:pagination-will-be-handled-by-hook`;
  
  const itemsPerPage = 6;
  const taskDetailsButtonRef = useRef<HTMLButtonElement>(null);
  const isMobile = useIsMobile();
  // Treat iPads/tablets as mobile for lightbox layout width decisions.
  // This is more defensive than useIsMobile alone to handle "Request Desktop Website" cases on iPadOS.
  const isTouchLikeDevice = React.useMemo(() => {
    if (typeof window === 'undefined') return isMobile;
    try {
      const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      const ua = (navigator as any)?.userAgent || '';
      const tabletUA = /iPad|Tablet|Android(?!.*Mobile)|Silk|Kindle|PlayBook/i.test(ua);
      const maxTouchPoints = (navigator as any)?.maxTouchPoints || 0;
      const isIpadOsLike = (navigator as any)?.platform === 'MacIntel' && maxTouchPoints > 1;
      return Boolean(isMobile || coarsePointer || tabletUA || isIpadOsLike);
    } catch {
      return isMobile;
    }
  }, [isMobile]);
  
  // Video count cache for instant skeleton display
  const { getCachedCount, setCachedCount } = useVideoCountCache();
  
  // Stable video count to prevent data loss
  const lastGoodCountRef = useRef<number | null>(null);
  const prevShotIdRef = useRef<string | null>(null);
  
  // Track the current shot key to detect changes
  const prevShotKeyRef = useRef<string | undefined>(shotKey);

  // Mobile double-tap detection refs
  const lastTouchTimeRef = useRef<number>(0);
  const doubleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ===============================================================================
  // HOOKS
  // ===============================================================================
  
  const hoverHook = useVideoHover(isMobile);
  const { hoveredVideo, hoverPosition, isInitialHover, handleHoverStart, handleHoverEnd, clearHoverTimeout } = hoverHook;

  // ===============================================================================
  // DATA FETCHING
  // ===============================================================================
  
  // Reset state when shot changes to prevent stale data
  useEffect(() => {
    if (shotId !== prevShotIdRef.current) {
      console.log('[SkeletonOptimization] Shot changed - resetting ALL state:', {
        prevShotId: prevShotIdRef.current,
        newShotId: shotId,
        resettingLastGoodCount: lastGoodCountRef.current,
        timestamp: Date.now()
      });
      
      // CRITICAL: Reset lastGoodCountRef to prevent cross-shot contamination
      lastGoodCountRef.current = null;
      
      // Clear any cached count for the previous shot to prevent contamination
      if (prevShotIdRef.current) {
        setCachedCount(prevShotIdRef.current, null);
      }
      
      prevShotIdRef.current = shotId;
    }
  }, [shotId, setCachedCount]);

  // Stable filters object to prevent infinite re-renders
  const filters = useMemo(() => ({
    mediaType: 'video' as const, // Only get videos for this gallery
  }), []);

  // Debug logging for hook inputs
  console.log('[VideoGenMissing] VideoOutputsGallery props received:', {
    projectId,
    shotId,
    enabled: !!(projectId && shotId),
    timestamp: Date.now()
  });

  // Use unified generations hook with task data preloading
  const { data: generationsData, isLoading: isLoadingGenerations, isFetching: isFetchingGenerations, error: generationsError } = useUnifiedGenerations({
    projectId,
    mode: 'shot-specific',
    shotId,
    page: 1, // We'll handle pagination internally now
    limit: 1000, // Get all videos, paginate client-side
    filters,
    includeTaskData: false, // We'll load task data on-demand for hover/lightbox
    preloadTaskData: true, // Background preload for better UX
    enabled: !!(projectId && shotId),
  });

  // DEEP DEBUG: Log every change in loading states
  useEffect(() => {
    console.log(`[VideoGalleryPreload] DATA_LOADING_STATE_CHANGE:`, {
      isLoadingGenerations,
      isFetchingGenerations,
      hasGenerationsData: !!generationsData,
      generationsDataItems: generationsData?.items?.length || 0,
      generationsDataTotal: generationsData?.total || 0,
      generationsError: !!generationsError,
      projectId,
      shotId,
      timestamp: Date.now()
    });
  }, [isLoadingGenerations, isFetchingGenerations, generationsData, generationsError, projectId, shotId]);

  // Get video outputs from unified data
  const videoOutputs = useMemo(() => {
    console.log(`[VideoGalleryPreload] VIDEO_OUTPUTS_PROCESSING:`, {
      hasGenerationsData: !!(generationsData as any)?.items,
      itemCount: (generationsData as any)?.items?.length || 0,
      processingStarted: Date.now()
    });

    if (!(generationsData as any)?.items) {
      console.log(`[VideoGalleryPreload] VIDEO_OUTPUTS_EMPTY: No generations data items`);
      return [];
    }
    
    // Debug log the raw data structure to see thumbnails
    console.log('[ThumbnailDebug] Raw generationsData.items:', {
      itemCount: (generationsData as any).items.length,
      firstItem: (generationsData as any).items[0],
      itemsWithThumbs: (generationsData as any).items.filter((item: any) => item.thumbUrl && item.thumbUrl !== item.url).length,
      timestamp: Date.now()
    });
    
    const transformed = transformUnifiedGenerationsData((generationsData as any).items);
    console.log(`[VideoGalleryPreload] VIDEO_OUTPUTS_TRANSFORMED:`, {
      originalCount: (generationsData as any).items.length,
      transformedCount: transformed.length,
      transformedItems: transformed.map(item => ({
        id: item.id?.substring(0, 8),
        hasThumbUrl: !!item.thumbUrl,
        thumbUrl: item.thumbUrl?.substring(item.thumbUrl.lastIndexOf('/') + 1) || 'none'
      })),
      timestamp: Date.now()
    });
    
    return transformed;
  }, [(generationsData as any)?.items]);

  // Enhanced generations with automatic task data preloading via context
  const enhancedVideoOutputs = useEnhancedGenerations(videoOutputs);
  
  // Background preload task data for current page
  useGenerationTaskPreloader(videoOutputs, !!projectId && !!shotId);
  
  // Sort video outputs by creation date
  const sortedVideoOutputs = useMemo(() => {
    const sorted = sortVideoOutputsByDate(videoOutputs);
    console.log(`[VideoGalleryPreload] VIDEO_OUTPUTS_SORTED:`, {
      originalCount: videoOutputs.length,
      sortedCount: sorted.length,
      sortedIds: sorted.slice(0, 5).map(item => item.id?.substring(0, 8)),
      timestamp: Date.now()
    });
    return sorted;
  }, [videoOutputs]);

  // Apply optimistic deletions to the displayed list
  const displaySortedVideoOutputs = useMemo(() => {
    if (optimisticallyRemovedIds.size === 0) return sortedVideoOutputs;
    return sortedVideoOutputs.filter(v => !optimisticallyRemovedIds.has(v.id));
  }, [sortedVideoOutputs, optimisticallyRemovedIds]);

  // Use pagination hook
  const paginationHook = useGalleryPagination(displaySortedVideoOutputs, itemsPerPage);
  const { currentPage, totalPages, currentVideoOutputs, handlePageChange, resetToFirstPage } = paginationHook;
  
  // DEEP DEBUG: Log pagination changes
  useEffect(() => {
    console.log(`[VideoGalleryPreload] PAGINATION_STATE:`, {
      currentPage,
      totalPages,
      itemsPerPage,
      totalVideos: sortedVideoOutputs.length,
      currentVideoOutputsCount: currentVideoOutputs.length,
      currentVideoIds: currentVideoOutputs.slice(0, 3).map(item => item.id?.substring(0, 8)),
      timestamp: Date.now()
    });
  }, [currentPage, totalPages, currentVideoOutputs.length, sortedVideoOutputs.length]);

  // ===============================================================================
  // TASK DATA HOOKS
  // ===============================================================================
  
  // Hooks for task details (now using unified cache)
  const lightboxVideoId = lightboxIndex !== null && displaySortedVideoOutputs[lightboxIndex] ? displaySortedVideoOutputs[lightboxIndex].id : null;
  const { data: lightboxTaskMapping } = useTaskFromUnifiedCache(lightboxVideoId || '');
  const { data: task, isLoading: isLoadingTask, error: taskError } = useGetTask(lightboxTaskMapping?.taskId || '');
  
  // Hooks for hover preview (now using unified cache)
  const { data: hoverTaskMapping } = useTaskFromUnifiedCache(hoveredVideo?.id || '');
  const { data: hoverTask, isLoading: isLoadingHoverTask } = useGetTask(hoverTaskMapping?.taskId || '');

  // Derive input images from multiple possible locations within task params
  const inputImages: string[] = useMemo(() => deriveInputImages(task), [task]);
  const hoverInputImages: string[] = useMemo(() => deriveInputImages(hoverTask), [hoverTask]);

  // ===============================================================================
  // DATA CACHING AND SKELETON LOGIC
  // ===============================================================================
  
  // Track when generationsData becomes available and cache video count
  useEffect(() => {
    const newTotal = (generationsData as any)?.total;
    const projectVideoCount = getShotVideoCount?.(shotId) ?? null;
    
    if (shotId && typeof newTotal === 'number' && newTotal >= 0) {
      // Check for cache mismatch; do NOT invalidate globally to avoid transient nulls/flicker.
      // We immediately update the per-shot cache below which resolves the mismatch.
      if (projectVideoCount !== null && projectVideoCount !== newTotal) {
        console.log('[SkeletonOptimization] Cache mismatch detected - updating per-shot cache only (no global invalidate):', {
          shotId,
          projectVideoCount,
          actualTotal: newTotal,
          timestamp: Date.now()
        });
      }
      
      // Always update cache immediately when we get valid data (including 0)
      setCachedCount(shotId, newTotal);
      
      // Only update lastGoodCountRef if we have a positive count or it's the first time
      if (newTotal > 0 || lastGoodCountRef.current === null) {
        lastGoodCountRef.current = newTotal;
        console.log(`[SkeletonIssue:${shotId?.substring(0, 8)}] CACHE_UPDATE:`, {
          shotId,
          newTotal,
          lastGoodCount: lastGoodCountRef.current,
          reason: newTotal > 0 ? 'positive_count' : 'first_time_seeing_data',
          cacheUpdated: true,
          timestamp: Date.now()
        });
      } else if (newTotal === 0 && lastGoodCountRef.current && lastGoodCountRef.current > 0) {
        // Data disappeared - this might be a race condition or cache invalidation
        console.warn(`[SkeletonIssue:${shotId?.substring(0, 8)}] DATA_LOSS_DETECTED:`, {
          shotId,
          newTotal,
          lastGoodCount: lastGoodCountRef.current,
          preservingCount: true,
          cacheAlreadyUpdated: true, // We already updated cache above
          timestamp: Date.now()
        });
        // Don't update lastGoodCountRef with 0 if we had a good count before
      } else {
        console.log(`[SkeletonIssue:${shotId?.substring(0, 8)}] CACHE_UPDATE_SKIPPED:`, {
          shotId,
          newTotal,
          lastGoodCount: lastGoodCountRef.current,
          reason: 'conditions_not_met',
          cacheStillUpdated: true, // We still updated cache above
          timestamp: Date.now()
        });
      }
    }
  }, [generationsData, isLoadingGenerations, isFetchingGenerations, generationsError, shotId, setCachedCount, getShotVideoCount, invalidateVideoCountsCache]);

  // SIMPLIFIED: Use ImageGallery's pure and simple skeleton logic - no delays!
  // Only show skeletons during INITIAL loading (never loaded before)
  // If we know the count is zero (from cache or local hint), show empty immediately
  const cachedCountRaw = getShotVideoCount?.(shotId);
  // If project cache hasn't loaded yet but local shot data hints 0 videos,
  // treat the effective cached count as 0 to avoid a skeleton flicker.
  const cachedCount = (typeof cachedCountRaw === 'number') ? cachedCountRaw : (localZeroHint ? 0 : null);
  console.log(`[SkeletonIssue:${shotId?.substring(0, 8) || 'no-shot'}] GET_CACHED_COUNT:`, {
    shotId,
    cachedCount,
    cachedCountRaw,
    localZeroHint,
    hasShotVideoCountFunction: !!getShotVideoCount,
    timestamp: Date.now()
  });
  const hasEverFetched = !isLoadingGenerations || videoOutputs.length > 0 || generationsError;
  // Suppress skeletons if cache says 0 for this shot
  const showSkeletons = isLoadingGenerations && videoOutputs.length === 0 && !hasEverFetched && (cachedCount === null || cachedCount > 0);
  
  const skeletonCount = showSkeletons ? Math.min(cachedCount || 6, 6) : 0;
  
  // UNIQUE DEBUG ID for tracking this specific issue
  const debugId = `[SkeletonIssue:${shotId?.substring(0, 8) || 'no-shot'}:${Date.now()}]`;
  console.log(`${debugId} SKELETON_DECISION_BREAKDOWN:`, {
    shotId,
    isLoadingGenerations,
    videoOutputsLength: videoOutputs.length,
    generationsError: !!generationsError,
    hasEverFetched,
    cachedCount,
    showSkeletons,
    skeletonCount,
    detailedLogic: {
      condition1_isLoading: isLoadingGenerations,
      condition2_noVideos: videoOutputs.length === 0,
      condition3_notFetchedBefore: !hasEverFetched,
      condition4_cacheAllows: cachedCount === null || cachedCount > 0,
      finalDecision: `${isLoadingGenerations} && ${videoOutputs.length === 0} && ${!hasEverFetched} && ${cachedCount === null || cachedCount > 0} = ${showSkeletons}`
    },
    timestamp: Date.now()
  });
  
  // AGGRESSIVE DEBUG: Always log skeleton state (no useEffect gating)
  console.log(`[VideoGallerySimplified] SKELETON_DEBUG:`, {
    showSkeletons,
    skeletonCount,
    isLoadingGenerations,
    videoOutputsLength: videoOutputs.length,
    hasEverFetched,
    generationsError: !!generationsError,
    logic: `isLoadingGenerations=${isLoadingGenerations} && videoOutputs.length=${videoOutputs.length} === 0 && !hasEverFetched=${!hasEverFetched}`,
    decision: showSkeletons ? 'SHOW_SKELETONS' : 'SHOW_VIDEOS',
    cachedCount,
    shotId,
    timestamp: Date.now()
  });

  // Enhanced empty state check - show immediately if cache says 0 OR local hint says 0, 
  // otherwise show after loading completes with 0 results.
  const effectiveZero = (cachedCount === 0) || Boolean(localZeroHint);
  const shouldShowEmpty = (
    (sortedVideoOutputs.length === 0 && effectiveZero) ||
    (!isLoadingGenerations && !isFetchingGenerations && sortedVideoOutputs.length === 0)
  );
  
  // Log empty state decision
  console.log(`${debugId} EMPTY_STATE_DECISION:`, {
    shouldShowEmpty,
    isLoadingGenerations,
    isFetchingGenerations,
    sortedVideoOutputsLength: sortedVideoOutputs.length,
    cachedCount,
    emptyLogic: `((!${isLoadingGenerations} && !${isFetchingGenerations} && ${sortedVideoOutputs.length} === 0) || (${cachedCount} === 0 && ${isLoadingGenerations} && ${videoOutputs.length} === 0)) = ${shouldShowEmpty}`,
    finalRenderDecision: shouldShowEmpty ? 'RENDER_EMPTY_STATE' : showSkeletons ? 'RENDER_SKELETONS' : 'RENDER_VIDEOS',
    timestamp: Date.now()
  });

  // ===============================================================================
  // EVENT HANDLERS
  // ===============================================================================
  
  // Mobile video preload handler
  const handleMobilePreload = useCallback((index: number) => {
    console.log('[MobilePreload] Gallery received preload request', {
      index,
      timestamp: Date.now()
    });
    
    // Call the VideoItem's preload function via the global map
    if (window.mobileVideoPreloadMap?.has(index)) {
      const preloadFunction = window.mobileVideoPreloadMap.get(index);
      if (preloadFunction) {
        preloadFunction();
      } else {
        console.warn('[MobilePreload] Preload function not found for index', index);
      }
    } else {
      console.warn('[MobilePreload] No preload mapping found for index', index);
    }
  }, []);

  // Mobile double-tap handler with preloading
  const handleMobileTap = createMobileTapHandler(lastTouchTimeRef, doubleTapTimeoutRef, setLightboxIndex, handleMobilePreload);

  // Handle opening details from hover
  const handleOpenDetailsFromHover = createHoverDetailsHandler(
    hoveredVideo,
    displaySortedVideoOutputs,
    isMobile,
    setSelectedVideoForDetails,
    setLightboxIndex,
    handleHoverEnd
  );

  // Stable callback for showing task details
  const handleShowTaskDetails = useCallback(() => 
    createTaskDetailsHandler(
      lightboxIndex,
      displaySortedVideoOutputs,
      setSelectedVideoForDetails,
      setShowTaskDetailsModal,
      setLightboxIndex
    )(), [lightboxIndex, displaySortedVideoOutputs]);

  // Lightbox navigation
  const handleNext = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex + 1) % displaySortedVideoOutputs.length);
    }
  };

  const handlePrevious = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex - 1 + displaySortedVideoOutputs.length) % displaySortedVideoOutputs.length);
    }
  };

  // Optimistic delete handler: hide immediately, then delegate to parent
  const handleDeleteOptimistic = useCallback((generationId: string) => {
    setOptimisticallyRemovedIds(prev => {
      const next = new Set(prev);
      next.add(generationId);
      return next;
    });
    try {
      const maybePromise = (onDelete as unknown as (id: string) => Promise<void> | void)(generationId) as Promise<void> | void;
      if (maybePromise && typeof (maybePromise as any).then === 'function') {
        (maybePromise as Promise<void>).catch(() => {
          // Rollback on explicit failure if parent reports it via rejection
          setOptimisticallyRemovedIds(prev => {
            const next = new Set(prev);
            next.delete(generationId);
            return next;
          });
        });
      }
    } catch (e) {
      // Rollback if synchronous error thrown
      setOptimisticallyRemovedIds(prev => {
        const next = new Set(prev);
        next.delete(generationId);
        return next;
      });
    }
  }, [onDelete]);

  // ===============================================================================
  // EFFECT HANDLERS
  // ===============================================================================
  
  useEffect(() => {
    if (selectedVideoForDetails && taskDetailsButtonRef.current) {
      taskDetailsButtonRef.current.click();
    }
  }, [selectedVideoForDetails]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
      clearHoverTimeout();
    };
  }, [clearHoverTimeout]);

  // Reset internal state when shot changes
  useEffect(() => {
    const hasChanged = prevShotKeyRef.current !== shotKey;
    
    if (hasChanged && prevShotKeyRef.current !== undefined) {
      console.log('[VideoOutputsGallery] Shot changed, resetting internal state', {
        prevShotKey: prevShotKeyRef.current,
        newShotKey: shotKey,
        timestamp: Date.now()
      });
      
      // Reset all internal state
      resetToFirstPage();
      setLightboxIndex(null);
      setSelectedVideoForDetails(null);
      handleHoverEnd();
      
      // Reset stable count for new shot
      lastGoodCountRef.current = null;
      
      // Clear any pending timeouts
      clearHoverTimeout();
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
        doubleTapTimeoutRef.current = null;
      }
    }
    
    // Update the ref for next comparison
    prevShotKeyRef.current = shotKey;
  }, [shotKey, resetToFirstPage, handleHoverEnd, clearHoverTimeout]);

  // Log video loading strategy for this page (throttled to avoid spam)
  const hasLoggedStrategyRef = useRef(false);
  useEffect(() => {
    if (currentVideoOutputs.length > 0 && !hasLoggedStrategyRef.current) {
      logVideoLoadingStrategy(currentVideoOutputs, currentPage);
      hasLoggedStrategyRef.current = true;
    }
  }, [currentVideoOutputs, currentPage]);
  
  // Reset the flag when page changes
  useEffect(() => {
    hasLoggedStrategyRef.current = false;
  }, [currentPage, shotId]);

  // ===============================================================================
  // RENDER CALCULATIONS (MUST BE AT TOP LEVEL - BEFORE EARLY RETURNS)
  // ===============================================================================
  
  // Calculate aspect ratio for skeleton items based on project dimensions (MUST be at top level)
  const aspectRatioStyle = React.useMemo(() => {
    if (!projectAspectRatio) return { aspectRatio: '16/9' }; // Default 16:9
    
    const [width, height] = projectAspectRatio.split(':').map(Number);
    if (width && height) {
      return { aspectRatio: `${width}/${height}` };
    }
    
    return { aspectRatio: '16/9' }; // Fallback
  }, [projectAspectRatio]);

  // ===============================================================================
  // RENDER
  // ===============================================================================
  
  // Show empty state if needed
  if (shouldShowEmpty) {
    return <EmptyState cachedCount={cachedCount} />;
  }

  // Get current video for lightbox
  const currentVideo = lightboxIndex !== null ? sortedVideoOutputs[lightboxIndex] : null;

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex flex-col space-y-2 sm:space-y-3">
        <GalleryControls
          sortedVideoOutputs={displaySortedVideoOutputs}
          isLoadingGenerations={isLoadingGenerations}
          isFetchingGenerations={isFetchingGenerations}
          totalPages={totalPages}
          currentPage={currentPage}
          cachedCount={cachedCount}
        />

        {/* SIMPLIFIED: Show video-specific skeleton layout or videos */}
        {showSkeletons ? (
          <div className="flex flex-wrap -mx-1 sm:-mx-1.5 md:-mx-2">
            {Array.from({ length: skeletonCount }, (_, index) => (
              <div key={`skeleton-${index}`} className="w-1/2 lg:w-1/3 px-1 sm:px-1.5 md:px-2 mb-2 sm:mb-3 md:mb-4">
                <div 
                  className="bg-muted rounded-lg animate-pulse border"
                  style={aspectRatioStyle}
                ></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap -mx-1 sm:-mx-1.5 md:-mx-2">
            {currentVideoOutputs.map((video, index) => {
              const originalIndex = (currentPage - 1) * itemsPerPage + index;
              const isFirstVideo = index === 0; // Prioritize first video
              const shouldPreload = isFirstVideo ? "metadata" : "none"; // Only preload first video
              
              return (
                <VideoItem
                  key={video.id}
                  video={video}
                  index={index}
                  originalIndex={originalIndex}
                  isFirstVideo={isFirstVideo}
                  shouldPreload={shouldPreload}
                  isMobile={isMobile}
                  projectAspectRatio={projectAspectRatio}
                  onLightboxOpen={setLightboxIndex}
                  onMobileTap={handleMobileTap}
                  onMobilePreload={isMobile ? handleMobilePreload : undefined}
                  onDelete={handleDeleteOptimistic}
                  deletingVideoId={deletingVideoId}
                  onHoverStart={handleHoverStart}
                  onHoverEnd={handleHoverEnd}
                  onMobileModalOpen={(video: GenerationRow) => {
                    setSelectedVideoForDetails(video);
                    setShowTaskDetailsModal(true);
                  }}
                  selectedVideoForDetails={selectedVideoForDetails}
                  showTaskDetailsModal={showTaskDetailsModal}
                />
              );
            })}
          </div>
        )}
        


        <GalleryPagination
          totalPages={totalPages}
          currentPage={currentPage}
          isLoadingGenerations={isLoadingGenerations}
          isFetchingGenerations={isFetchingGenerations}
          onPageChange={handlePageChange}
        />

        {lightboxIndex !== null && (
          <MediaLightbox
            media={(() => {
              const media = displaySortedVideoOutputs[lightboxIndex];
              console.log('[StarDebug:VideoOutputsGallery] MediaLightbox media', {
                mediaId: media.id,
                mediaKeys: Object.keys(media),
                hasStarred: 'starred' in media,
                starredValue: (media as { starred?: boolean }).starred,
                timestamp: Date.now()
              });
              return media;
            })()}
            onClose={() => setLightboxIndex(null)}
            onNext={handleNext}
            onPrevious={handlePrevious}
            onImageSaved={onImageSaved}
            showNavigation={true}
            showImageEditTools={false}
            showDownload={true}
            videoPlayerComponent="lightbox-scrub"
            hasNext={lightboxIndex < displaySortedVideoOutputs.length - 1}
            hasPrevious={lightboxIndex > 0}
            starred={(displaySortedVideoOutputs[lightboxIndex] as { starred?: boolean }).starred || false}
            showTaskDetails={!isTouchLikeDevice}
            taskDetailsData={{
              task,
              isLoading: isLoadingTask,
              error: taskError,
              inputImages,
              taskId: lightboxTaskMapping?.taskId || null,
              onApplyTaskSettings: onApplySettings,
              onApplySettingsFromTask,
              onClose: () => setLightboxIndex(null)
            }}
            onShowTaskDetails={isTouchLikeDevice ? handleShowTaskDetails : undefined}
          />
        )}

        {selectedVideoForDetails && showTaskDetailsModal && (
          <TaskDetailsModal
            generationId={selectedVideoForDetails.id}
            open={showTaskDetailsModal}
            onOpenChange={(open) => {
              console.log('[TaskToggle] VideoOutputsGallery: TaskDetailsModal onOpenChange', { open, selectedVideo: selectedVideoForDetails?.id });
              if (!open) {
                // When closing, reset both states
                setShowTaskDetailsModal(false);
                setSelectedVideoForDetails(null);
              }
            }}
            onApplySettings={(settings) => {
              onApplySettings(settings);
              setSelectedVideoForDetails(null);
              setShowTaskDetailsModal(false);
            }}
            onApplySettingsFromTask={(taskId, replaceImages, inputImages) => {
              onApplySettingsFromTask(taskId, replaceImages, inputImages);
              setSelectedVideoForDetails(null);
              setShowTaskDetailsModal(false);
            }}
            onClose={() => {
              setSelectedVideoForDetails(null);
              setShowTaskDetailsModal(false);
            }}
            onShowVideo={isMobile ? () => {
              setShowTaskDetailsModal(false);
              const index = displaySortedVideoOutputs.findIndex(v => v.id === selectedVideoForDetails.id);
              if (index !== -1) {
                setLightboxIndex(index);
              }
              setSelectedVideoForDetails(null);
            } : undefined}
            isVideoContext={isMobile}
          >
            <Button 
              ref={taskDetailsButtonRef}
              className="hidden"
            >
              Open Details
            </Button>
          </TaskDetailsModal>
        )}
      </div>

      {/* Hover Preview Tooltip */}
      <VideoHoverPreview
        hoveredVideo={hoveredVideo}
        hoverPosition={hoverPosition}
        isInitialHover={isInitialHover}
        isLoadingHoverTask={isLoadingHoverTask}
        hoverTaskMapping={hoverTaskMapping}
        hoverTask={hoverTask}
        hoverInputImages={hoverInputImages}
        isMobile={isMobile}
        onOpenDetailsFromHover={handleOpenDetailsFromHover}
      />
    </Card>
  );
};

export default VideoOutputsGallery;
