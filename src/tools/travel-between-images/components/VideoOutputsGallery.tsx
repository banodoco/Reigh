import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { GenerationRow } from '@/types/shots';
import { Button } from '@/shared/components/ui/button';
import { Trash2, Info } from 'lucide-react';
import { Card } from '@/shared/components/ui/card';
import { Separator } from '@/shared/components/ui/separator';
import { Skeleton } from '@/shared/components/ui/skeleton';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';
import { getDisplayUrl } from '@/shared/lib/utils';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/shared/components/ui/pagination';
import MediaLightbox from '@/shared/components/MediaLightbox';
import TaskDetailsModal from '@/tools/travel-between-images/components/TaskDetailsModal';
import { TimeStamp } from '@/shared/components/TimeStamp';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useGetTask } from '@/shared/hooks/useTasks';
import { Badge } from '@/shared/components/ui/badge';
import { Check, X } from 'lucide-react';
import { SharedTaskDetails } from './SharedTaskDetails';
import { useQueryClient } from '@tanstack/react-query';
import { useUnifiedGenerations, useTaskFromUnifiedCache } from '@/shared/hooks/useUnifiedGenerations';
import { useGenerationTaskPreloader, useEnhancedGenerations } from '@/shared/contexts/GenerationTaskContext';



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
}) => {
  

  const [currentPage, setCurrentPage] = useState(1);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectedVideoForDetails, setSelectedVideoForDetails] = useState<GenerationRow | null>(null);
  const [hoveredVideo, setHoveredVideo] = useState<GenerationRow | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number; positioning?: 'above' | 'below' } | null>(null);
  const [isInitialHover, setIsInitialHover] = useState(false);
  const [showTaskDetailsModal, setShowTaskDetailsModal] = useState(false);
  const itemsPerPage = 6;
  const taskDetailsButtonRef = useRef<HTMLButtonElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMobile = useIsMobile();

  // Stable filters object to prevent infinite re-renders
  const filters = useMemo(() => ({
    mediaType: 'video' as const, // Only get videos for this gallery
  }), []);

  // Debug logging for hook inputs
  console.log('[VideoGenMissing] VideoOutputsGallery props received:', {
    projectId,
    shotId,
    currentPage,
    itemsPerPage,
    enabled: !!(projectId && shotId),
    timestamp: Date.now()
  });

  // Use unified generations hook with task data preloading
  const { data: generationsData, isLoading: isLoadingGenerations, isFetching: isFetchingGenerations, error: generationsError } = useUnifiedGenerations({
    projectId,
    mode: 'shot-specific',
    shotId,
    page: currentPage,
    limit: itemsPerPage,
    filters,
    includeTaskData: false, // We'll load task data on-demand for hover/lightbox
    preloadTaskData: true, // Background preload for better UX
    enabled: !!(projectId && shotId),
  });

  // Get video outputs from unified data
  const videoOutputs = useMemo(() => {
    if (!(generationsData as any)?.items) return [];
    
    // Transform to GenerationRow format for compatibility
    return ((generationsData as any).items as any[]).map((item: any) => ({
      id: item.id,
      imageUrl: item.url,
      location: item.url,
      thumbUrl: item.thumbUrl,
      type: item.isVideo ? 'video_travel_output' : 'single_image',
      created_at: item.createdAt,
      metadata: item.metadata,
      shotImageEntryId: item.shotImageEntryId,
      position: item.position,
      // Include task data if available
      ...(item.taskId && { taskId: item.taskId }),
    })) as GenerationRow[];
  }, [(generationsData as any)?.items]);

  // Enhanced generations with automatic task data preloading via context
  const enhancedVideoOutputs = useEnhancedGenerations(videoOutputs);
  
  // Background preload task data for current page
  useGenerationTaskPreloader(videoOutputs, !!projectId && !!shotId);
  
  // Debug logging for VideoOutputsGallery data updates
  React.useEffect(() => {
    console.log('[VideoGenMissing] Gallery data updated:', {
      projectId,
      shotId,
      currentPage,
      itemsPerPage,
      videoOutputsCount: videoOutputs.length,
      enhancedVideoOutputsCount: enhancedVideoOutputs.length,
      isLoadingGenerations,
      generationsError: generationsError?.message,
      visibilityState: document.visibilityState,
      timestamp: Date.now(),
      rawGenerationsData: generationsData,
      generationsDataItems: (generationsData as any)?.items,
      generationsDataTotal: (generationsData as any)?.total,
      videoDetails: videoOutputs.slice(0, 3).map(video => ({
        id: video.id,
        type: video.type,
        createdAt: (video as any).created_at,
        hasTaskId: !!(video as any).taskId,
        shotImageEntryId: (video as any).shotImageEntryId
      }))
    });
  }, [videoOutputs, enhancedVideoOutputs, currentPage, isLoadingGenerations, generationsError, generationsData]);

  // Hooks for task details (now using unified cache)
  const lightboxVideoId = lightboxIndex !== null && videoOutputs[lightboxIndex] ? videoOutputs[lightboxIndex].id : null;
  const { data: lightboxTaskMapping } = useTaskFromUnifiedCache(lightboxVideoId || '');
  const { data: task, isLoading: isLoadingTask, error: taskError } = useGetTask(lightboxTaskMapping?.taskId || '');
  
  // Hooks for hover preview (now using unified cache)
  const { data: hoverTaskMapping } = useTaskFromUnifiedCache(hoveredVideo?.id || '');
  const { data: hoverTask, isLoading: isLoadingHoverTask } = useGetTask(hoverTaskMapping?.taskId || '');
  
  // Track the current shot key to detect changes
  const prevShotKeyRef = useRef<string | undefined>(shotKey);

  // Derive input images from multiple possible locations within task params
  const inputImages: string[] = useMemo(() => {
    const p = (task as any)?.params || {};
    if (Array.isArray(p.input_images) && p.input_images.length > 0) return p.input_images;
    if (p.full_orchestrator_payload && Array.isArray(p.full_orchestrator_payload.input_image_paths_resolved)) {
      return p.full_orchestrator_payload.input_image_paths_resolved;
    }
    if (Array.isArray(p.input_image_paths_resolved)) return p.input_image_paths_resolved;
    return [];
  }, [task]);

  // Derive hover input images from hover task
  const hoverInputImages: string[] = useMemo(() => {
    console.log('[VideoGenMissing] Processing hover task for input images:', {
      hoverTask: !!hoverTask,
      hoveredVideoId: hoveredVideo?.id,
      hoverTaskParams: hoverTask ? Object.keys((hoverTask as any)?.params || {}) : []
    });
    
    const p = (hoverTask as any)?.params || {};
    if (Array.isArray(p.input_images) && p.input_images.length > 0) return p.input_images;
    if (p.full_orchestrator_payload && Array.isArray(p.full_orchestrator_payload.input_image_paths_resolved)) {
      return p.full_orchestrator_payload.input_image_paths_resolved;
    }
    if (Array.isArray(p.input_image_paths_resolved)) return p.input_image_paths_resolved;
    return [];
  }, [hoverTask, hoveredVideo?.id]);



  // Mobile double-tap detection refs
  const lastTouchTimeRef = useRef<number>(0);
  const doubleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (selectedVideoForDetails && taskDetailsButtonRef.current) {
      taskDetailsButtonRef.current.click();
    }
  }, [selectedVideoForDetails]);

  // Sort video outputs by creation date
  const sortedVideoOutputs = useMemo(() => {
    return [...videoOutputs]
      .map(v => ({ v, time: new Date(v.createdAt || (v as { created_at?: string | null }).created_at || 0).getTime() }))
      .sort((a, b) => b.time - a.time)
      .map(({ v }) => v);
  }, [videoOutputs]);

  // Get current video for lightbox
  const currentVideo = lightboxIndex !== null ? sortedVideoOutputs[lightboxIndex] : null;

  // Stable callback for showing task details
  const handleShowTaskDetails = useCallback(() => {
    console.log('[TaskToggle] VideoOutputsGallery: handleShowTaskDetails called', { 
      lightboxIndex, 
      video: sortedVideoOutputs[lightboxIndex]?.id,
      showTaskDetailsModal,
      selectedVideoForDetails: selectedVideoForDetails?.id
    });
    const currentVideo = sortedVideoOutputs[lightboxIndex];
    if (currentVideo) {
      // Set up task details modal state first
      setSelectedVideoForDetails(currentVideo);
      // Use setTimeout to ensure state update happens before opening modal
      setTimeout(() => {
        setShowTaskDetailsModal(true);
        // Close lightbox after modal is set to open
        setLightboxIndex(null);
        console.log('[TaskToggle] VideoOutputsGallery: State updated for task details modal', {
          newSelectedVideo: currentVideo.id,
          newShowModal: true,
          closedLightbox: true
        });
      }, 100);
    } else {
      console.error('[TaskToggle] VideoOutputsGallery: No current video found for lightboxIndex:', lightboxIndex);
    }
  }, [lightboxIndex, sortedVideoOutputs, showTaskDetailsModal, selectedVideoForDetails]);

  // Simple loading state management - task data is now handled by unified cache

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

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
      setCurrentPage(1);
      setLightboxIndex(null);
      setSelectedVideoForDetails(null);
      setHoveredVideo(null);
      setHoverPosition(null);
      setIsInitialHover(false);
      
      // Clear any pending timeouts
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
        doubleTapTimeoutRef.current = null;
      }
    }
    
    // Update the ref for next comparison
    prevShotKeyRef.current = shotKey;
  }, [shotKey]);

  // Handle hover for task details preview
  const handleHoverStart = (video: GenerationRow, event: React.MouseEvent) => {
    if (isMobile) return; // Don't show hover preview on mobile
    
    console.log('[VideoGenMissing] Starting hover for video:', video.id);
    
    // Clear any existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    // Calculate smart position for tooltip
    const rect = event.currentTarget.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    // Estimated tooltip dimensions (based on our min-w-80 = 320px and typical height)
    const tooltipWidth = 320;
    const tooltipHeight = 450; // Estimated height for enhanced content
    const margin = 20; // Margin from viewport edge
    
    // Calculate initial position (centered above button)
    let x = rect.left + rect.width / 2;
    let y = rect.top;
    let positioning: 'above' | 'below' = 'above'; // Default: show above
    
    // Check if tooltip would be cut off at the top
    if (y - tooltipHeight - margin < 0) {
      // Not enough space above, position below
      y = rect.bottom;
      positioning = 'below';
    }
    
    // Check horizontal boundaries
    const halfTooltipWidth = tooltipWidth / 2;
    if (x - halfTooltipWidth < margin) {
      // Too close to left edge, align to left with margin
      x = margin + halfTooltipWidth;
    } else if (x + halfTooltipWidth > viewportWidth - margin) {
      // Too close to right edge, align to right with margin
      x = viewportWidth - margin - halfTooltipWidth;
    }
    
    setHoverPosition({ x, y, positioning });
    setHoveredVideo(video);
    
    console.log('[VideoGenMissing] Set hovered video:', video.id, 'positioning:', positioning);
    
    // Task data will be handled automatically by useTaskFromUnifiedCache
    // No need for complex manual fetching or caching logic
  };

  const handleHoverEnd = () => {
    console.log('[VideoGenMissing] Ending hover');
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredVideo(null);
    setHoverPosition(null);
    setIsInitialHover(false);
  };

  const handleOpenDetailsFromHover = () => {
    if (hoveredVideo) {
      if (isMobile) {
        // On mobile, open the modal for better UX
        setSelectedVideoForDetails(hoveredVideo);
      } else {
        // On desktop, open the lightbox
        const videoIndex = sortedVideoOutputs.findIndex(v => v.id === hoveredVideo.id);
        if (videoIndex !== -1) {
          setLightboxIndex(videoIndex);
        }
      }
      // Clear hover state when opening details
      handleHoverEnd();
    }
  };

  // Handle mobile double-tap detection for video lightbox
  const handleMobileTap = (originalIndex: number) => {
    const currentTime = Date.now();
    const timeSinceLastTap = currentTime - lastTouchTimeRef.current;
    
    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
      // This is a double-tap, clear any pending timeout and open lightbox
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
        doubleTapTimeoutRef.current = null;
      }
      setLightboxIndex(originalIndex);
    } else {
      // This is a single tap, set a timeout to handle it if no second tap comes
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
      doubleTapTimeoutRef.current = setTimeout(() => {
        // Single tap on mobile - you could add single tap behavior here if needed
        doubleTapTimeoutRef.current = null;
      }, 300);
    }
    
    lastTouchTimeRef.current = currentTime;
  };

  const totalPages = Math.ceil(sortedVideoOutputs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentVideoOutputs = sortedVideoOutputs.slice(startIndex, endIndex);

  // Skeleton component for loading states
  const VideoSkeleton = ({ index }: { index: number }) => (
    <div key={`skeleton-${index}`} className="w-1/2 lg:w-1/3 px-1 sm:px-1.5 md:px-2 mb-2 sm:mb-3 md:mb-4">
      <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden shadow-sm border relative">
        <Skeleton className="w-full h-full" />
        
        {/* Skeleton for timestamp */}
        <div className="absolute top-1 left-4 sm:top-2 sm:left-4 z-10">
          <Skeleton className="h-4 w-16 rounded" />
        </div>
        
        {/* Skeleton for action buttons */}
        <div className="absolute top-1/2 right-2 sm:right-3 flex flex-col items-end gap-1 -translate-y-1/2 z-20">
          <Skeleton className="h-6 w-6 sm:h-7 sm:w-7 rounded-full" />
          <Skeleton className="h-6 w-6 sm:h-7 sm:w-7 rounded-full" />
        </div>
      </div>
    </div>
  );

  // Determine number of skeletons to show
  const getSkeletonCount = () => {
    // Show skeletons when either loading initial data or fetching new data
    const isLoading = isLoadingGenerations || isFetchingGenerations;
    
    if (isLoading) {
      // If we have existing data, show skeletons for the current page
      if (sortedVideoOutputs.length > 0) {
        return Math.min(itemsPerPage, sortedVideoOutputs.length);
      }
      // Otherwise show default number of skeletons
      return itemsPerPage;
    }
    return 0;
  };

  const skeletonCount = getSkeletonCount();
  
  // Debug logging for skeleton visibility
  React.useEffect(() => {
    console.log('[VideoOutputsGallery:Skeleton] Debug skeleton state:', {
      isLoadingGenerations,
      isFetchingGenerations,
      skeletonCount,
      videoOutputsLength: videoOutputs.length,
      sortedVideoOutputsLength: sortedVideoOutputs.length,
      currentPage,
      itemsPerPage,
      timestamp: Date.now()
    });
  }, [isLoadingGenerations, isFetchingGenerations, skeletonCount, videoOutputs.length, sortedVideoOutputs.length, currentPage]);

  // Background preloading is now handled by the unified generations system

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

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

  // Only show empty state if we're not loading AND there are no videos
  if (sortedVideoOutputs.length === 0 && !isLoadingGenerations && !isFetchingGenerations) {
    return (
      <Card className="p-4 sm:p-6">
        <div className="text-center text-muted-foreground">
          <p>No video outputs yet. Generate some videos to see them here.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex flex-col space-y-2 sm:space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2">
            Output Videos 
            {(isLoadingGenerations || isFetchingGenerations) ? (
              <Skeleton className="h-5 w-8 inline-block" />
            ) : (
              `(${sortedVideoOutputs.length})`
            )}
          </h3>
          {totalPages > 1 && !(isLoadingGenerations || isFetchingGenerations) && (
            <div className="flex items-center space-x-2">
              <span className="text-xs sm:text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
            </div>
          )}
        </div>

        <Separator className="my-2" />

        <div className="flex flex-wrap -mx-1 sm:-mx-1.5 md:-mx-2">
          {/* Show skeletons when loading */}
          {skeletonCount > 0 && Array.from({ length: skeletonCount }, (_, index) => (
            <VideoSkeleton key={`skeleton-${index}`} index={index} />
          ))}
          
          {/* Show actual videos when not loading */}
          {skeletonCount === 0 && currentVideoOutputs.map((video, index) => {
            const originalIndex = startIndex + index;
            return (
              <div key={video.id} className="w-1/2 lg:w-1/3 px-1 sm:px-1.5 md:px-2 mb-2 sm:mb-3 md:mb-4 relative group">
                <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden shadow-sm border relative">
                  <HoverScrubVideo
                    src={getDisplayUrl(video.location || video.imageUrl)}
                    poster={video.thumbUrl}
                    className="w-full h-full object-cover cursor-pointer"
                    onDoubleClick={isMobile ? undefined : () => {
                      setLightboxIndex(originalIndex);
                    }}
                    onTouchEnd={isMobile ? (e) => {
                      e.preventDefault();
                      handleMobileTap(originalIndex);
                    } : undefined}
                    preload="metadata"
                  />
                  
                  {/* Action buttons – positioned directly on the video container */}
                  <div className="absolute top-1/2 right-2 sm:right-3 flex flex-col items-end gap-1 opacity-0 group-hover:opacity-100 group-touch:opacity-100 transition-opacity -translate-y-1/2 z-20">
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => {
                        if (isMobile) {
                          // On mobile, open the modal
                          setSelectedVideoForDetails(video);
                        } else {
                          // On desktop, open the lightbox
                          setLightboxIndex(originalIndex);
                        }
                      }}
                      onMouseEnter={(e) => handleHoverStart(video, e)}
                      onMouseLeave={handleHoverEnd}
                      className="h-6 w-6 sm:h-7 sm:w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white"
                      title="View details"
                    >
                      <Info className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => onDelete(video.id)}
                      disabled={deletingVideoId === video.id}
                      className="h-6 w-6 sm:h-7 sm:w-7 p-0 rounded-full"
                      title="Delete video"
                    >
                      <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    </Button>
                  </div>
                </div>
                
                {/* Timestamp - Top Left */}
                <TimeStamp 
                  createdAt={video.createdAt || (video as { created_at?: string | null }).created_at} 
                  position="top-left"
                  className="z-10 !top-1 !left-4 sm:!top-2 sm:!left-4"
                />
              </div>
            );
          })}
        </div>

        {totalPages > 1 && !(isLoadingGenerations || isFetchingGenerations) && (
          <Pagination className="mt-4 sm:mt-6">
            <PaginationContent>
              {(() => {
                if (!isMobile || totalPages <= 5) {
                  // Desktop or few pages: show all pages
                  return Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <PaginationItem key={page}>
                      <PaginationLink
                        onClick={() => handlePageChange(page)}
                        isActive={currentPage === page}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ));
                }
                
                // Mobile with many pages: show smart pagination
                const items = [];
                
                // Always show page 1
                items.push(
                  <PaginationItem key={1}>
                    <PaginationLink
                      onClick={() => handlePageChange(1)}
                      isActive={currentPage === 1}
                      className="cursor-pointer"
                    >
                      1
                    </PaginationLink>
                  </PaginationItem>
                );
                
                // Show ellipsis if current page is far from start
                if (currentPage > 3) {
                  items.push(
                    <PaginationItem key="start-ellipsis">
                      <span className="px-3 py-2 text-sm text-muted-foreground">...</span>
                    </PaginationItem>
                  );
                }
                
                // Show current page and adjacent pages (if not already shown)
                const start = Math.max(2, currentPage - 1);
                const end = Math.min(totalPages - 1, currentPage + 1);
                
                for (let page = start; page <= end; page++) {
                  if (page !== 1 && page !== totalPages) {
                    items.push(
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => handlePageChange(page)}
                          isActive={currentPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  }
                }
                
                // Show ellipsis if current page is far from end
                if (currentPage < totalPages - 2) {
                  items.push(
                    <PaginationItem key="end-ellipsis">
                      <span className="px-3 py-2 text-sm text-muted-foreground">...</span>
                    </PaginationItem>
                  );
                }
                
                // Always show last page (if more than 1 page)
                if (totalPages > 1) {
                  items.push(
                    <PaginationItem key={totalPages}>
                      <PaginationLink
                        onClick={() => handlePageChange(totalPages)}
                        isActive={currentPage === totalPages}
                        className="cursor-pointer"
                      >
                        {totalPages}
                      </PaginationLink>
                    </PaginationItem>
                  );
                }
                
                return items;
              })()}
            </PaginationContent>
          </Pagination>
        )}

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
            videoPlayerComponent="simple-player"
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
              onApplySettingsFromTask
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

      {/* Hover Preview Tooltip - Rendered via Portal to escape stacking context */}
      {!isMobile && hoveredVideo && hoverPosition && createPortal(
        (() => {
          console.log('[VideoGenMissing] Rendering hover preview:', {
            hoveredVideoId: hoveredVideo.id,
            hoverTaskId: hoverTaskMapping?.taskId,
            isLoadingHoverTask,
            hoverTask: !!hoverTask,
            hoverTaskKeys: hoverTask ? Object.keys(hoverTask) : []
          });
          return (
            <div
              className="fixed z-[10001] pointer-events-auto"
              style={{
                left: hoverPosition.x,
                top: hoverPosition.positioning === 'below' ? hoverPosition.y + 10 : hoverPosition.y - 10,
                transform: hoverPosition.positioning === 'below' 
                  ? 'translateX(-50%) translateY(0)' 
                  : 'translateX(-50%) translateY(-100%)',
              }}
            >
              <div className="bg-background border border-border shadow-lg rounded-lg p-4 max-w-md min-w-80 relative">
                {/* Arrow pointing to the button */}
                {hoverPosition.positioning === 'below' ? (
                  <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                    <div className="w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-border"></div>
                    <div className="absolute top-px left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-3 border-r-3 border-b-3 border-l-transparent border-r-transparent border-b-background"></div>
                  </div>
                ) : (
                  <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2">
                    <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-border"></div>
                    <div className="absolute bottom-px left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-3 border-r-3 border-t-3 border-l-transparent border-r-transparent border-t-background"></div>
                  </div>
                )}
                {(isInitialHover || isLoadingHoverTask || (hoverTaskMapping?.taskId && !hoverTask)) ? (
                  <div className="flex items-center space-y-2">
                    <svg className="animate-spin h-4 w-4 text-primary mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-sm text-muted-foreground">Loading task details...</span>
                  </div>
                ) : hoverTask ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm">Generation Details</h4>
                      <Badge variant="secondary" className="text-xs">Preview</Badge>
                    </div>
                    
                    <SharedTaskDetails
                      task={hoverTask}
                      inputImages={hoverInputImages}
                      variant="hover"
                      isMobile={isMobile}
                    />
                    
                    <button 
                      onClick={handleOpenDetailsFromHover}
                      className="w-full text-xs text-muted-foreground hover:text-foreground pt-1 border-t border-border transition-colors cursor-pointer"
                    >
                      Click to view full details
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-2">
                    <p className="text-sm text-muted-foreground">No task details available</p>
                  </div>
                )}
              </div>
            </div>
          );
        })(),
        document.body
      )}
    </Card>
  );
};

export default VideoOutputsGallery; 