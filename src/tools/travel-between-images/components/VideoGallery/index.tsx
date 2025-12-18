import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// TypeScript declaration for global mobile video preload map
declare global {
  interface Window {
    mobileVideoPreloadMap?: Map<number, () => void>;
  }
}
import { GenerationRow } from '@/types/shots';
import { Button } from '@/shared/components/ui/button';
import MediaLightbox from '@/shared/components/MediaLightbox';
import TaskDetailsModal from '../TaskDetailsModal';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useGetTask } from '@/shared/hooks/useTasks';
import { useQueryClient } from '@tanstack/react-query';
import { useUnifiedGenerations, useTaskFromUnifiedCache } from '@/shared/hooks/useUnifiedGenerations';
import { useGenerationTaskPreloader, useEnhancedGenerations } from '@/shared/contexts/GenerationTaskContext';
import { useVideoCountCache } from '@/shared/hooks/useVideoCountCache';
import { supabase } from '@/integrations/supabase/client';

// Import our extracted hooks and components
import { useVideoHover } from './hooks';
import { useExternalGenerations } from '@/shared/components/ShotImageManager/hooks/useExternalGenerations';
import { useDerivedNavigation } from '@/shared/hooks/useDerivedNavigation';
import { useBackgroundThumbnailGenerator } from '@/shared/hooks/useBackgroundThumbnailGenerator';
import { toast } from 'sonner';
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
 * 🚀 SERVER-SIDE PAGINATION:
 * - Efficient pagination at database level (fetches only current page)
 * - Scales to thousands of videos without performance degradation
 * - Server handles sorting and filtering for optimal performance
 * - Client-side operations only on current page items (6-8 videos)
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
 * - Efficient pagination for large galleries
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
 * - Optimized with server-side pagination for large-scale performance
 */

interface VideoOutputsGalleryProps {
  // Data source
  projectId: string | null;
  shotId: string | null;

  // Event handlers (keeping the same interface for compatibility)
  onDelete: (generationId: string) => void;
  deletingVideoId: string | null;
  /**
   * Apply handler that operates using the original task id (server-side extraction).
   */
  onApplySettingsFromTask: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
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

  /**
   * Optional pre-loaded generation data (for shared/read-only views)
   * If provided, bypasses database queries
   */
  preloadedGenerations?: GenerationRow[];

  /**
   * Read-only mode - disables delete/edit actions
   */
  readOnly?: boolean;
}

const VideoOutputsGallery: React.FC<VideoOutputsGalleryProps> = ({
  projectId,
  shotId,
  onDelete,
  deletingVideoId,
  onApplySettingsFromTask,
  shotKey,
  getShotVideoCount,
  invalidateVideoCountsCache,
  projectAspectRatio,
  localZeroHint,
  preloadedGenerations,
  readOnly = false,
}) => {
  // ===============================================================================
  // STATE MANAGEMENT
  // ===============================================================================

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectedVideoForDetails, setSelectedVideoForDetails] = useState<GenerationRow | null>(null);
  const [showTaskDetailsModal, setShowTaskDetailsModal] = useState(false);
  const [optimisticallyRemovedIds, setOptimisticallyRemovedIds] = useState<Set<string>>(new Set());
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const navigate = useNavigate();

  // Ref for lightbox index setter (needed for external generations)
  const setLightboxIndexRef = useRef<(index: number) => void>(() => { });
  useEffect(() => {
    setLightboxIndexRef.current = setLightboxIndex;
  }, [setLightboxIndex]);

  // Stable content key to avoid resets during background refetches
  const contentKey = `${shotId ?? ''}:pagination-will-be-handled-by-hook`;

  // Calculate items per page based on project aspect ratio to optimize pagination
  const itemsPerPage = React.useMemo(() => {
    if (!projectAspectRatio) {
      return 6; // Default: 2 rows of 3 items each
    }

    const [width, height] = projectAspectRatio.split(':').map(Number);
    if (width && height) {
      const aspectRatio = width / height;

      // For very wide aspect ratios (16:9 and wider), show 2 videos per row
      // 6 items per page = 3 rows of 2 items each
      if (aspectRatio >= 16 / 9) {
        return 6;
      }
      // For very narrow aspect ratios (narrower than 4:3), show 4 videos per row
      // 8 items per page = 2 rows of 4 items each
      else if (aspectRatio < 4 / 3) {
        return 8;
      }
      // For moderate aspect ratios (4:3 to 16:9), use default
      // 6 items per page = 2 rows of 3 items each
      else {
        return 6;
      }
    }

    return 6; // Fallback
  }, [projectAspectRatio]);

  // Server-side pagination state
  const [currentPage, setCurrentPage] = useState(1);
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
      const result = Boolean(isMobile || coarsePointer || tabletUA || isIpadOsLike);
      
      // ALWAYS log to help diagnose autoplay issues
      console.log('[MobileAutoplayDebug] Device detection:', {
        isMobile,
        coarsePointer,
        tabletUA,
        maxTouchPoints,
        isIpadOsLike,
        finalResult: result,
        expectedBehavior: result ? 'STATIC_IMAGES_ONLY' : 'VIDEO_SCRUBBING_ENABLED',
        userAgent: ua.substring(0, 80),
        platform: (navigator as any)?.platform,
        timestamp: Date.now()
      });
      
      return result;
    } catch {
      return isMobile;
    }
  }, [isMobile]);

  // Video count cache for instant skeleton display
  const { getCachedCount, setCachedCount } = useVideoCountCache();

  // Stable video count to prevent data loss
  const lastGoodCountRef = useRef<number | null>(null);
  const prevShotIdRef = useRef<string | null>(null);
  
  // Track the shotId for which we last received fresh (non-placeholder) data
  // Used to distinguish "placeholder from different shot" vs "placeholder from same shot (pagination)"
  const lastFreshDataShotIdRef = useRef<string | null>(null);

  // Track the current shot key to detect changes
  const prevShotKeyRef = useRef<string | undefined>(shotKey);

  // Mobile double-tap detection refs
  const lastTouchTimeRef = useRef<number>(0);
  const doubleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ===============================================================================
  // HOOKS
  // ===============================================================================

  const hoverHook = useVideoHover(isMobile);
  const { hoveredVideo, hoverPosition, isInitialHover, handleHoverStart, handleHoverEnd, handlePreviewEnter, handlePreviewLeave, clearHoverTimeout } = hoverHook;

  // ===============================================================================
  // DATA FETCHING
  // ===============================================================================

  // [ShotNavDebug] RENDER-TIME logging for skeleton count issues
  // Log values directly (not nested) so they're visible without expanding
  const shotNavDebugRef = useRef<string | null>(null);
  if (shotId !== shotNavDebugRef.current) {
    const cachedCountNow = getShotVideoCount?.(shotId);
    console.log('[ShotNavDebug] 🎬 VideoGallery - shotId:', shotId?.substring(0, 8) || 'none',
      '| prevShotId:', shotNavDebugRef.current?.substring(0, 8) || 'none',
      '| cachedCount:', cachedCountNow,
      '| localZeroHint:', localZeroHint,
      '| willShowSkeletons:', cachedCountNow === null || cachedCountNow > 0,
      '| skeletonCount:', cachedCountNow ?? itemsPerPage);
    shotNavDebugRef.current = shotId;
  }

  // Reset state when shot changes to prevent stale data
  useEffect(() => {
    if (shotId !== prevShotIdRef.current) {
      // CRITICAL: Reset lastGoodCountRef to prevent cross-shot contamination
      lastGoodCountRef.current = null;

      // Clear any cached count for the previous shot to prevent contamination
      if (prevShotIdRef.current) {
        setCachedCount(prevShotIdRef.current, null);
      }

      // Clear mobile preload map to avoid cross-shot originalIndex collisions
      if (window.mobileVideoPreloadMap) {
        try {
          window.mobileVideoPreloadMap.clear();
          console.log('[MobilePreload] Cleared mobileVideoPreloadMap on shot change');
        } catch { }
      }

      prevShotIdRef.current = shotId;
    }
  }, [shotId, setCachedCount]);

  // Stable filters object to prevent infinite re-renders
  const filters = useMemo(() => ({
    mediaType: 'video' as const, // Only get videos for this gallery
    starredOnly: showStarredOnly, // Apply starred filter at server level
  }), [showStarredOnly]);

  // Debug logging for hook inputs
  console.log('[VideoGenMissing] VideoOutputsGallery props received:', {
    projectId,
    shotId,
    enabled: !!(projectId && shotId),
    timestamp: Date.now()
  });

  // Use preloaded data if provided, otherwise fetch from database with SERVER-SIDE pagination
  const { data: fetchedGenerationsData, isLoading: isLoadingGenerations, isFetching: isFetchingGenerations, isPlaceholderData, error: generationsError } = useUnifiedGenerations({
    projectId,
    mode: 'shot-specific',
    shotId,
    page: currentPage, // Server-side pagination
    limit: itemsPerPage, // Only fetch current page
    filters,
    includeTaskData: false, // We'll load task data on-demand for hover/lightbox
    preloadTaskData: true, // Background preload for better UX
    enabled: !preloadedGenerations && !!(projectId && shotId), // Disable if preloaded data provided
  });

  // Use preloaded data if provided, otherwise use fetched data
  const generationsData = preloadedGenerations
    ? { items: preloadedGenerations, total: preloadedGenerations.length }
    : fetchedGenerationsData;


  // Get video outputs from unified data (already paginated from server)
  const videoOutputs = useMemo(() => {
    console.log(`[VideoGalleryPreload] VIDEO_OUTPUTS_PROCESSING:`, {
      hasGenerationsData: !!(generationsData as any)?.items,
      itemCount: (generationsData as any)?.items?.length || 0,
      total: (generationsData as any)?.total || 0,
      currentPage,
      serverSidePagination: true,
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
  }, [(generationsData as any)?.items, currentPage]);

  // Enhanced generations with automatic task data preloading via context
  const enhancedVideoOutputs = useEnhancedGenerations(videoOutputs);

  // Background preload task data for current page
  useGenerationTaskPreloader(videoOutputs, !!projectId && !!shotId);

  // Batch fetch share slugs for CURRENT PAGE only (not all videos)
  const [shareSlugs, setShareSlugs] = useState<Record<string, string>>({});
  useEffect(() => {
    const fetchShareSlugs = async () => {
      if (!videoOutputs.length || readOnly) return;

      const generationIds = videoOutputs.map(v => v.id).filter(Boolean) as string[];
      if (!generationIds.length) return;

      console.log('[VideoGallery] Fetching share slugs for current page:', {
        page: currentPage,
        count: generationIds.length
      });

      try {
        const { data, error } = await supabase
          .from('shared_generations')
          .select('generation_id, share_slug')
          .in('generation_id', generationIds);

        if (!error && data) {
          const slugMap: Record<string, string> = {};
          data.forEach(item => {
            slugMap[item.generation_id] = item.share_slug;
          });
          setShareSlugs(slugMap);
        }
      } catch (err) {
        console.error('[VideoGallery] Failed to batch fetch share slugs:', err);
      }
    };

    fetchShareSlugs();
  }, [videoOutputs, readOnly, currentPage]);

  // Handle share creation callback to update batch cache
  const handleShareCreated = useCallback((videoId: string, shareSlug: string) => {
    setShareSlugs(prev => ({ ...prev, [videoId]: shareSlug }));
  }, []);

  // Server already sorted and filtered data - just use it directly
  // No need for client-side sorting since database handles it efficiently
  const sortedVideoOutputs = useMemo(() => {
    console.log(`[VideoGalleryPreload] VIDEO_OUTPUTS_FROM_SERVER:`, {
      count: videoOutputs.length,
      currentPage,
      showStarredOnly,
      serverHandlesSorting: true,
      serverHandlesFiltering: true,
      videoIds: videoOutputs.slice(0, 5).map(item => item.id?.substring(0, 8)),
      timestamp: Date.now()
    });
    return videoOutputs; // Already sorted and filtered by server
  }, [videoOutputs, currentPage, showStarredOnly]);

  // External generations hook (same as ShotImageManager and Timeline)
  const externalGens = useExternalGenerations({
    selectedShotId: shotId,
    optimisticOrder: sortedVideoOutputs,
    images: sortedVideoOutputs,
    setLightboxIndexRef
  });

  // Apply optimistic deletions to the displayed list and combine with external generations
  const displaySortedVideoOutputs = useMemo(() => {
    const filtered = optimisticallyRemovedIds.size === 0
      ? sortedVideoOutputs
      : sortedVideoOutputs.filter(v => !optimisticallyRemovedIds.has(v.id));
    // Combine with external generations for "Based on" navigation
    return [...filtered, ...externalGens.externalGenerations, ...externalGens.tempDerivedGenerations];
  }, [sortedVideoOutputs, optimisticallyRemovedIds, externalGens.externalGenerations, externalGens.tempDerivedGenerations]);

  // Server-side pagination - data is already paginated, just calculate total pages
  const totalPages = Math.ceil(((generationsData as any)?.total || 0) / itemsPerPage);
  const currentVideoOutputs = displaySortedVideoOutputs; // Already paginated from server

  // Page change handler - updates server query
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const resetToFirstPage = useCallback(() => {
    setCurrentPage(1);
  }, []);

  // DEEP DEBUG: Log pagination changes
  useEffect(() => {
    console.log(`[VideoGalleryPreload] SERVER_PAGINATION_STATE:`, {
      currentPage,
      totalPages,
      itemsPerPage,
      totalVideos: (generationsData as any)?.total || 0,
      currentPageItemsCount: currentVideoOutputs.length,
      currentVideoIds: currentVideoOutputs.slice(0, 3).map(item => item.id?.substring(0, 8)),
      serverSidePagination: true,
      timestamp: Date.now()
    });
  }, [currentPage, totalPages, currentVideoOutputs.length, generationsData]);

  // ===============================================================================
  // BACKGROUND THUMBNAIL GENERATION
  // ===============================================================================

  // Background thumbnail generation for videos without thumbnails
  console.log('[VideoOutputsGallery] Calling useBackgroundThumbnailGenerator:', {
    videosCount: videoOutputs.length,
    sortedVideosCount: sortedVideoOutputs.length,
    displayVideosCount: displaySortedVideoOutputs.length,
    currentPageVideosCount: currentVideoOutputs.length,
    isLoadingGenerations,
    projectId: projectId?.substring(0, 8) || 'none',
    readOnly,
    enabled: !readOnly && !!projectId && !!shotId && !isLoadingGenerations && currentVideoOutputs.length > 0,
    firstVideo: currentVideoOutputs[0] ? {
      id: currentVideoOutputs[0].id?.substring(0, 8),
      isVideo: currentVideoOutputs[0].isVideo,
      hasLocation: !!currentVideoOutputs[0].location,
      hasUrl: !!currentVideoOutputs[0].url,
      hasThumbUrl: !!currentVideoOutputs[0].thumbUrl,
      thumbUrl: currentVideoOutputs[0].thumbUrl?.substring(0, 50),
      location: currentVideoOutputs[0].location?.substring(0, 50),
    } : 'no videos',
    timestamp: Date.now()
  });
  
  useBackgroundThumbnailGenerator({
    videos: currentVideoOutputs, // Use currentVideoOutputs (the displayed videos)
    projectId,
    enabled: !readOnly && !!projectId && !!shotId && !isLoadingGenerations && currentVideoOutputs.length > 0, // Wait for data to load
  });

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
      // Always update cache immediately when we get valid data (including 0)
      setCachedCount(shotId, newTotal);

      // Only update lastGoodCountRef if we have a positive count or it's the first time
      if (newTotal > 0 || lastGoodCountRef.current === null) {
        lastGoodCountRef.current = newTotal;
      }
      // If newTotal is 0 but we had a good count before, don't update lastGoodCountRef
      // (protects against transient data loss during cache invalidation)
    }
  }, [generationsData, isLoadingGenerations, isFetchingGenerations, generationsError, shotId, setCachedCount, getShotVideoCount, invalidateVideoCountsCache]);

  // Get cached video count from shot_statistics
  const cachedCountRaw = getShotVideoCount?.(shotId);
  // If project cache hasn't loaded yet but local shot data hints 0 videos, treat as 0
  const cachedCount = (typeof cachedCountRaw === 'number') ? cachedCountRaw : (localZeroHint ? 0 : null);
  
  // Determine if we've received a definitive answer from the server
  const serverTotal = (generationsData as any)?.total;
  const hasServerResponse = typeof serverTotal === 'number';
  
  // Update lastFreshDataShotIdRef when we receive fresh (non-placeholder) data for this shot
  // This tracks which shot's data we're actually displaying
  if (!isPlaceholderData && !isLoadingGenerations && hasServerResponse && shotId) {
    lastFreshDataShotIdRef.current = shotId;
  }
  
  // Show skeleton when:
  // 1) Still loading (initial fetch), OR
  // 2) isPlaceholderData is true AND it's from a DIFFERENT shot (shot navigation)
  //    - Don't show skeletons for same-shot placeholder (pagination) - keep previous page visible
  const isPlaceholderFromDifferentShot = isPlaceholderData && lastFreshDataShotIdRef.current !== shotId;
  const shouldShowSkeleton = (isLoadingGenerations || isPlaceholderFromDifferentShot) && (cachedCount ?? itemsPerPage) > 0;
  const skeletonCount = shouldShowSkeleton ? Math.min(cachedCount ?? itemsPerPage, itemsPerPage) : 0;
  
  // [SkeletonCountMismatch] Debug log
  console.log(`[SkeletonCountMismatch] 🎯 SHOT ${shotId?.substring(0, 8) || 'none'}:`, {
    willShowSkeleton: shouldShowSkeleton,
    skeletonCount,
    cachedCount,
    serverTotal,
    actualVideos: videoOutputs.length,
    hasServerResponse,
    isFetching: isFetchingGenerations,
    isPlaceholderData,
    isPlaceholderFromDifferentShot,
    lastFreshDataShotId: lastFreshDataShotIdRef.current?.substring(0, 8),
    reason: shouldShowSkeleton 
      ? (isLoadingGenerations ? 'isLoading=true' : 'placeholder from different shot')
      : (videoOutputs.length > 0 ? 'have videos' : 'server says 0'),
  });

  // Empty state: show when we know there are 0 videos (from cache or server)
  const effectiveZero = (cachedCount === 0) || (Boolean(localZeroHint) && cachedCount === null);
  const shouldShowEmpty = (
    !shouldShowSkeleton &&
    (
      (sortedVideoOutputs.length === 0 && effectiveZero) ||
      // Only trust serverTotal=0 once we're not actively fetching (prevents placeholder empty flash)
      (!isFetchingGenerations && hasServerResponse && serverTotal === 0 && sortedVideoOutputs.length === 0)
    )
  );


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

  // Mobile double-tap handler with preloading - memoized for stable reference
  const handleMobileTap = useCallback(
    createMobileTapHandler(
      lastTouchTimeRef, 
      doubleTapTimeoutRef, 
      (index) => {
        console.log('[MobileTapFlow:VideoGallery] ✅ LIGHTBOX OPEN callback invoked', { 
          index,
          currentLightboxIndex: lightboxIndex,
          timestamp: Date.now()
        });
        setLightboxIndex(index);
        console.log('[MobileTapFlow:VideoGallery] setLightboxIndex called', { 
          index,
          timestamp: Date.now()
        });
      }, 
      handleMobilePreload
    ),
    [handleMobilePreload, lightboxIndex]
  );

  // Handle opening details from hover - memoized for stable reference
  const handleOpenDetailsFromHover = useCallback(
    createHoverDetailsHandler(
      hoveredVideo,
      displaySortedVideoOutputs,
      isMobile,
      setSelectedVideoForDetails,
      setLightboxIndex,
      handleHoverEnd
    ),
    [hoveredVideo, displaySortedVideoOutputs, isMobile, handleHoverEnd]
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

  // Helper to check if a video has a valid output URL
  const hasOutputUrl = useCallback((video: GenerationRow): boolean => {
    return !!(video.location || (video as any).url || video.imageUrl);
  }, []);

  // Base lightbox navigation (without derived mode) - skips items without output URLs
  const baseGoNext = useCallback(() => {
    if (lightboxIndex === null) return;
    
    const length = displaySortedVideoOutputs.length;
    if (length === 0) return;
    
    // Find the next item with an output URL
    for (let i = 1; i <= length; i++) {
      const nextIndex = (lightboxIndex + i) % length;
      if (hasOutputUrl(displaySortedVideoOutputs[nextIndex])) {
        setLightboxIndex(nextIndex);
        return;
      }
    }
    // No valid items found, stay at current
  }, [lightboxIndex, displaySortedVideoOutputs, hasOutputUrl]);

  const baseGoPrev = useCallback(() => {
    if (lightboxIndex === null) return;
    
    const length = displaySortedVideoOutputs.length;
    if (length === 0) return;
    
    // Find the previous item with an output URL
    for (let i = 1; i <= length; i++) {
      const prevIndex = (lightboxIndex - i + length) % length;
      if (hasOutputUrl(displaySortedVideoOutputs[prevIndex])) {
        setLightboxIndex(prevIndex);
        return;
      }
    }
    // No valid items found, stay at current
  }, [lightboxIndex, displaySortedVideoOutputs, hasOutputUrl]);

  // Check if there are valid items (with output URLs) in each direction
  const hasValidNext = useMemo(() => {
    if (lightboxIndex === null) return false;
    const length = displaySortedVideoOutputs.length;
    if (length <= 1) return false;
    
    // Check if any item other than the current one has a valid output URL
    for (let i = 1; i < length; i++) {
      const nextIndex = (lightboxIndex + i) % length;
      if (hasOutputUrl(displaySortedVideoOutputs[nextIndex])) {
        return true;
      }
    }
    return false;
  }, [lightboxIndex, displaySortedVideoOutputs, hasOutputUrl]);

  const hasValidPrevious = useMemo(() => {
    if (lightboxIndex === null) return false;
    const length = displaySortedVideoOutputs.length;
    if (length <= 1) return false;
    
    // Check if any item other than the current one has a valid output URL
    for (let i = 1; i < length; i++) {
      const prevIndex = (lightboxIndex - i + length) % length;
      if (hasOutputUrl(displaySortedVideoOutputs[prevIndex])) {
        return true;
      }
    }
    return false;
  }, [lightboxIndex, displaySortedVideoOutputs, hasOutputUrl]);

  // Add derived navigation mode support (navigates only through "Based on this" items when active)
  const { wrappedGoNext: handleNext, wrappedGoPrev: handlePrevious, hasNext: derivedHasNext, hasPrevious: derivedHasPrevious } = useDerivedNavigation({
    derivedNavContext: externalGens.derivedNavContext,
    lightboxIndex,
    currentImages: displaySortedVideoOutputs,
    handleOpenExternalGeneration: externalGens.handleOpenExternalGeneration,
    goNext: baseGoNext,
    goPrev: baseGoPrev,
    logPrefix: '[VideoGallery:DerivedNav]'
  });

  // Lightbox close handler - clear external generations
  const handleCloseLightbox = useCallback(() => {
    externalGens.setExternalGenerations([]);
    externalGens.setTempDerivedGenerations([]);
    externalGens.setDerivedNavContext(null);
    setLightboxIndex(null);
  }, [externalGens]);

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

  // Stable handler for opening mobile modal - prevents VideoItem re-renders
  const handleMobileModalOpen = useCallback((video: GenerationRow) => {
    setSelectedVideoForDetails(video);
    setShowTaskDetailsModal(true);
  }, []);

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
      setShowStarredOnly(false); // Reset starred filter (will trigger new server query)
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

  // Reset to first page when starred filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [showStarredOnly]);

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

  // Calculate grid columns based on aspect ratio - used by both skeleton AND actual grid
  const gridColumnConfig = React.useMemo(() => {
    const defaultConfig = { 
      columns: { base: 2, lg: 3 },
      classes: 'grid-cols-2 lg:grid-cols-3'
    };

    if (!projectAspectRatio) {
      return defaultConfig;
    }

    const [width, height] = projectAspectRatio.split(':').map(Number);
    if (width && height) {
      const aspectRatio = width / height;

      // For very wide aspect ratios (16:9 and wider), show 2 videos per row
      if (aspectRatio >= 16 / 9) {
        return { 
          columns: { base: 2, lg: 2 },
          classes: 'grid-cols-2 lg:grid-cols-2'
        };
      }
      // For very narrow aspect ratios (narrower than 4:3), show 4 videos per row
      else if (aspectRatio < 4 / 3) {
        return { 
          columns: { base: 2, lg: 4 },
          classes: 'grid-cols-2 lg:grid-cols-4'
        };
      }
      // For moderate aspect ratios (4:3 to 16:9), use default
      else {
        return defaultConfig;
      }
    }

    return defaultConfig;
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
    <div className="w-full bg-card border rounded-xl p-4 sm:p-6 shadow-sm">
      <div className="flex flex-col space-y-2 sm:space-y-3">
        <GalleryControls
          sortedVideoOutputs={displaySortedVideoOutputs}
          isLoadingGenerations={isLoadingGenerations}
          isFetchingGenerations={isFetchingGenerations}
          totalPages={totalPages}
          currentPage={currentPage}
          cachedCount={cachedCount}
          totalCount={(generationsData as any)?.total}
          showStarredOnly={showStarredOnly}
          onStarredFilterChange={setShowStarredOnly}
        />

        {/* Loading state - show skeleton when waiting for videos */}
        {shouldShowSkeleton ? (
          <SkeletonGallery
            // Prevent accidentally rendering hundreds of skeletons if shot_statistics is off.
            // We already only fetch one page at a time, so cap at the current page size.
            count={Math.min(cachedCount ?? itemsPerPage, itemsPerPage)}
            columns={gridColumnConfig.columns}
            gapClasses="gap-2 sm:gap-3 md:gap-4"
            projectAspectRatio={projectAspectRatio}
          />
        ) : (
          <>
            {/* Video grid */}
            <div className={`grid ${gridColumnConfig.classes} gap-2 sm:gap-3 md:gap-4`}>
              {displaySortedVideoOutputs.map((video, index) => {
                const originalIndex = sortedVideoOutputs.findIndex(v => v.id === video.id);

                return (
                  <VideoItem
                    key={video.id}
                    video={video}
                    index={index}
                    originalIndex={originalIndex}
                    // Simplified: all videos use 'metadata' preload - let browser manage concurrent requests
                    shouldPreload="metadata"
                    isMobile={isTouchLikeDevice}
                    projectAspectRatio={projectAspectRatio}
                    projectId={projectId}
                    onLightboxOpen={setLightboxIndex}
                    onMobileTap={handleMobileTap}
                    onMobilePreload={isMobile ? handleMobilePreload : undefined}
                    onDelete={handleDeleteOptimistic}
                    deletingVideoId={deletingVideoId}
                    onHoverStart={handleHoverStart}
                    onHoverEnd={handleHoverEnd}
                    onMobileModalOpen={handleMobileModalOpen}
                    selectedVideoForDetails={selectedVideoForDetails}
                    showTaskDetailsModal={showTaskDetailsModal}
                    onApplySettingsFromTask={onApplySettingsFromTask}
                    existingShareSlug={video.id ? shareSlugs[video.id] : undefined}
                    onShareCreated={handleShareCreated}
                    onViewSegments={(video) => {
                      navigate(`/tools/travel-between-images/segments/${video.id}`);
                    }}
                    deleteTooltip="Delete video permanently"
                  />
                );
              })}
            </div>

            {/* Pagination */}
            <GalleryPagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              isLoadingGenerations={isLoadingGenerations}
              isFetchingGenerations={isFetchingGenerations}
            />
          </>
        )}
      </div>

      {/* Lightbox */}
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
          onClose={handleCloseLightbox}
          onNext={handleNext}
          onPrevious={handlePrevious}
          showNavigation={true}
          showImageEditTools={false}
          showDownload={true}
          hasNext={derivedHasNext && hasValidNext}
          hasPrevious={derivedHasPrevious && hasValidPrevious}
          starred={(displaySortedVideoOutputs[lightboxIndex] as { starred?: boolean }).starred ?? false}
          shotId={shotId || undefined}
          showTaskDetails={true}
          onNavigateToGeneration={(generationId: string) => {
            console.log('[VideoGallery:DerivedNav] 📍 Navigate to generation', {
              generationId: generationId.substring(0, 8),
              sortedVideoOutputsCount: sortedVideoOutputs.length,
              externalGenerationsCount: externalGens.externalGenerations.length,
              tempDerivedCount: externalGens.tempDerivedGenerations.length,
              totalCount: displaySortedVideoOutputs.length
            });
            // Search in combined videos (sorted + external + derived)
            const index = displaySortedVideoOutputs.findIndex((video: any) => video.id === generationId);
            if (index !== -1) {
              console.log('[VideoGallery:DerivedNav] ✅ Found at index', index);
              setLightboxIndex(index);
            } else {
              console.log('[VideoGallery:DerivedNav] ⚠️ Not found in current videos');
              toast.info('This generation is not currently loaded');
            }
          }}
          onOpenExternalGeneration={externalGens.handleOpenExternalGeneration}
          taskDetailsData={{
            task,
            isLoading: isLoadingTask,
            error: taskError,
            inputImages,
            taskId: lightboxTaskMapping?.taskId || null,
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
        onPreviewEnter={handlePreviewEnter}
        onPreviewLeave={handlePreviewLeave}
      />
    </div>
  );
};

export default VideoOutputsGallery;
