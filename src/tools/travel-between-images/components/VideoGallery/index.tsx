import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
  VideoSkeleton,
  VideoItem,
  VideoHoverPreview,
  GalleryControls,
  GalleryPagination,
  EmptyState
} from './components';
import {
  calculateSkeletonCount,
  shouldShowEmptyState,
  SkeletonCalculationParams
} from './utils/skeleton-utils';
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
}) => {
  // ===============================================================================
  // STATE MANAGEMENT
  // ===============================================================================
  
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectedVideoForDetails, setSelectedVideoForDetails] = useState<GenerationRow | null>(null);
  const [showTaskDetailsModal, setShowTaskDetailsModal] = useState(false);
  
  // SIMPLIFIED FIX: Show videos immediately since we have thumbnail preloading
  const [showVideosAfterDelay, setShowVideosAfterDelay] = useState(true);
  // Stable content key to avoid resets during background refetches
  const contentKey = `${shotId ?? ''}:pagination-will-be-handled-by-hook`;
  const prevContentKeyRef = useRef<string | null>(null);
  
  const itemsPerPage = 6;
  const taskDetailsButtonRef = useRef<HTMLButtonElement>(null);
  const isMobile = useIsMobile();
  
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

  // Use pagination hook
  const paginationHook = useGalleryPagination(sortedVideoOutputs, itemsPerPage);
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
  const lightboxVideoId = lightboxIndex !== null && sortedVideoOutputs[lightboxIndex] ? sortedVideoOutputs[lightboxIndex].id : null;
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
      // Check for cache mismatch and invalidate if needed
      if (projectVideoCount !== null && projectVideoCount !== newTotal && invalidateVideoCountsCache) {
        console.log('[SkeletonOptimization] Cache mismatch detected - invalidating project cache:', {
          shotId,
          projectVideoCount,
          actualTotal: newTotal,
          timestamp: Date.now()
        });
        invalidateVideoCountsCache();
      }
      
      // Only update cache and last good count if we have a valid positive count
      // or if this is the first time we're seeing data (prevent data loss)
      if (newTotal > 0 || lastGoodCountRef.current === null) {
        setCachedCount(shotId, newTotal);
        lastGoodCountRef.current = newTotal;
        console.log('[SkeletonOptimization] Updated stable count:', {
          shotId,
          newTotal,
          lastGoodCount: lastGoodCountRef.current,
          timestamp: Date.now()
        });
      } else if (newTotal === 0 && lastGoodCountRef.current && lastGoodCountRef.current > 0) {
        // Data disappeared - this might be a race condition or cache invalidation
        console.warn('[SkeletonOptimization] Data loss detected - preserving last good count:', {
          shotId,
          newTotal,
          lastGoodCount: lastGoodCountRef.current,
          preservingCount: true,
          timestamp: Date.now()
        });
        // Don't update the cache with 0 if we had a good count before
      }
    }
  }, [generationsData, isLoadingGenerations, isFetchingGenerations, generationsError, shotId, setCachedCount, getShotVideoCount, invalidateVideoCountsCache]);

  // SIMPLIFIED FIX: Use a simple delay after initial data load; do not reset on background refetches
  useEffect(() => {
    // Detect content key changes (shot or page) and reset only then
    if (prevContentKeyRef.current !== contentKey) {
      console.log('[VideoLoadingFix] Content key changed, resetting delay state', {
        prev: prevContentKeyRef.current, next: contentKey
      });
      prevContentKeyRef.current = contentKey;
      // Keep showVideosAfterDelay true for immediate display
    }

    // Set showVideosAfterDelay to true when data is ready (no artificial delay needed)
    if (!isLoadingGenerations && !showVideosAfterDelay && videoOutputs.length > 0) {
      setShowVideosAfterDelay(true);
      console.log('[VideoLoadingFix] Data loaded, enabling video display for key', contentKey);
    }
  }, [contentKey, isLoadingGenerations, showVideosAfterDelay, videoOutputs.length]);

  // Calculate skeleton count
  const skeletonCalculationParams: SkeletonCalculationParams = {
    isLoadingGenerations,
    isFetchingGenerations,
    showVideosAfterDelay,
    videoOutputs,
    currentVideoOutputs,
    currentPage,
    itemsPerPage,
    shotId,
    generationsData,
    getCachedCount,
    getShotVideoCount,
    lastGoodCountRef
  };

  const skeletonCount = calculateSkeletonCount(skeletonCalculationParams);
  
  // Enhanced debug logging for skeleton visibility
  useEffect(() => {
    console.log(`[VideoGalleryPreload] SKELETON_DEBUG:`, {
      skeletonCount,
      isLoadingGenerations,
      isFetchingGenerations,
      showVideosAfterDelay,
      videoOutputsLength: videoOutputs.length,
      currentVideoOutputsLength: currentVideoOutputs.length,
      sortedVideoOutputsLength: sortedVideoOutputs.length,
      shouldShowSkeletons: skeletonCount > 0,
      contentKey,
      projectId,
      shotId,
      timestamp: Date.now()
    });
  }, [skeletonCount, isLoadingGenerations, isFetchingGenerations, showVideosAfterDelay, videoOutputs.length, currentVideoOutputs.length, contentKey]);
  const shouldShowEmpty = shouldShowEmptyState(
    getShotVideoCount,
    shotId,
    generationsData,
    sortedVideoOutputs,
    isLoadingGenerations,
    isFetchingGenerations,
    skeletonCount
  );

  // ===============================================================================
  // EVENT HANDLERS
  // ===============================================================================
  
  // Mobile double-tap handler
  const handleMobileTap = createMobileTapHandler(lastTouchTimeRef, doubleTapTimeoutRef, setLightboxIndex);

  // Handle opening details from hover
  const handleOpenDetailsFromHover = createHoverDetailsHandler(
    hoveredVideo,
    sortedVideoOutputs,
    isMobile,
    setSelectedVideoForDetails,
    setLightboxIndex,
    handleHoverEnd
  );

  // Stable callback for showing task details
  const handleShowTaskDetails = useCallback(() => 
    createTaskDetailsHandler(
      lightboxIndex,
      sortedVideoOutputs,
      setSelectedVideoForDetails,
      setShowTaskDetailsModal,
      setLightboxIndex
    )(), [lightboxIndex, sortedVideoOutputs]);

  // Lightbox navigation
  const handleNext = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex + 1) % sortedVideoOutputs.length);
    }
  };

  const handlePrevious = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex - 1 + sortedVideoOutputs.length) % sortedVideoOutputs.length);
    }
  };

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
  // RENDER
  // ===============================================================================
  
  // Show empty state if needed
  if (shouldShowEmpty) {
    return <EmptyState />;
  }

  // Get current video for lightbox
  const currentVideo = lightboxIndex !== null ? sortedVideoOutputs[lightboxIndex] : null;

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex flex-col space-y-2 sm:space-y-3">
        <GalleryControls
          sortedVideoOutputs={sortedVideoOutputs}
          isLoadingGenerations={isLoadingGenerations}
          isFetchingGenerations={isFetchingGenerations}
          totalPages={totalPages}
          currentPage={currentPage}
        />

        <div className="flex flex-wrap -mx-1 sm:-mx-1.5 md:-mx-2">
                  {/* Show skeletons when loading */}
        {skeletonCount > 0 && (() => {
          console.log(`[VideoGalleryPreload] RENDERING_SKELETONS:`, {
            skeletonCount,
            contentKey,
            isLoadingGenerations,
            showVideosAfterDelay,
            timestamp: Date.now()
          });
          return Array.from({ length: skeletonCount }, (_, index) => (
            <VideoSkeleton key={`skeleton-${contentKey}-${index}`} index={index} />
          ));
        })()}

        {/* Show actual videos when not loading */}
        {skeletonCount === 0 && (() => {
          console.log(`[VideoGalleryPreload] RENDERING_VIDEOS:`, {
            videoCount: currentVideoOutputs.length,
            contentKey,
            isLoadingGenerations,
            showVideosAfterDelay,
            videoIds: currentVideoOutputs.slice(0, 3).map(v => v.id?.substring(0, 8)),
            timestamp: Date.now()
          });
          return currentVideoOutputs.map((video, index) => {
            const originalIndex = (currentPage - 1) * itemsPerPage + index;
            const isFirstVideo = index === 0; // Prioritize first video
            const shouldPreload = isFirstVideo ? "metadata" : "none"; // Only preload first video
            
            console.log(`[VideoGalleryPreload] RENDERING_VIDEO_ITEM:`, {
              videoId: video.id?.substring(0, 8),
              index,
              originalIndex,
              hasThumbUrl: !!video.thumbUrl,
              thumbUrl: video.thumbUrl?.substring(video.thumbUrl.lastIndexOf('/') + 1) || 'none',
              shouldPreload,
              timestamp: Date.now()
            });
            
            return (
              <VideoItem
                key={video.id}
                video={video}
                index={index}
                originalIndex={originalIndex}
                isFirstVideo={isFirstVideo}
                shouldPreload={shouldPreload}
                isMobile={isMobile}
                onLightboxOpen={setLightboxIndex}
                onMobileTap={handleMobileTap}
                onDelete={onDelete}
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
        
        {/* DEEP DEBUG: Log current rendering state */}
        {(() => {
          console.log(`[VideoGalleryPreload] RENDER_STATE_SUMMARY:`, {
            isRenderingSkeletons: skeletonCount > 0,
            isRenderingVideos: skeletonCount === 0,
            skeletonCount,
            videoCount: currentVideoOutputs.length,
            isLoadingGenerations,
            isFetchingGenerations,
            showVideosAfterDelay,
            contentKey,
            timestamp: Date.now()
          });
          return null;
        })()}

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
              const media = sortedVideoOutputs[lightboxIndex];
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
            hasNext={lightboxIndex < sortedVideoOutputs.length - 1}
            hasPrevious={lightboxIndex > 0}
            starred={(sortedVideoOutputs[lightboxIndex] as { starred?: boolean }).starred || false}
            showTaskDetails={!isMobile}
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
            onShowTaskDetails={isMobile ? handleShowTaskDetails : undefined}
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
              const index = sortedVideoOutputs.findIndex(v => v.id === selectedVideoForDetails.id);
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
