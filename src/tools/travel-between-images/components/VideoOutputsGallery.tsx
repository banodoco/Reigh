import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { GenerationRow } from '@/types/shots';
import { Button } from '@/shared/components/ui/button';
import { Trash2, Info } from 'lucide-react';
import { Card } from '@/shared/components/ui/card';
import { Separator } from '@/shared/components/ui/separator';
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
  const itemsPerPage = 6;
  const taskDetailsButtonRef = useRef<HTMLButtonElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMobile = useIsMobile();

  // Use unified generations hook with task data preloading
  const { data: generationsData, isLoading: isLoadingGenerations, error: generationsError } = useUnifiedGenerations({
    projectId,
    mode: 'shot-specific',
    shotId,
    page: currentPage,
    limit: itemsPerPage,
    filters: {
      mediaType: 'video', // Only get videos for this gallery
    },
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
    console.log('[VideoGalleryDebug] Gallery data updated:', {
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
      videoDetails: videoOutputs.slice(0, 3).map(video => ({
        id: video.id,
        type: video.type,
        createdAt: (video as any).created_at,
        hasTaskId: !!(video as any).taskId,
        shotImageEntryId: (video as any).shotImageEntryId
      }))
    });
  }, [videoOutputs, enhancedVideoOutputs, currentPage, isLoadingGenerations, generationsError]);

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
    console.log('[HoverDebug] Processing hover task for input images:', {
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
    
    console.log('[HoverDebug] Starting hover for video:', video.id);
    
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
    
    console.log('[HoverDebug] Set hovered video:', video.id, 'positioning:', positioning);
    
    // Task data will be handled automatically by useTaskFromUnifiedCache
    // No need for complex manual fetching or caching logic
  };

  const handleHoverEnd = () => {
    console.log('[HoverDebug] Ending hover');
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

  if (sortedVideoOutputs.length === 0) {
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
          <h3 className="text-base sm:text-lg font-semibold">Output Videos ({sortedVideoOutputs.length})</h3>
          {totalPages > 1 && (
            <div className="flex items-center space-x-2">
              <span className="text-xs sm:text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
            </div>
          )}
        </div>

        <Separator className="my-2" />

        <div className="flex flex-wrap -mx-1 sm:-mx-1.5 md:-mx-2">
          {currentVideoOutputs.map((video, index) => {
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

        {totalPages > 1 && (
          <Pagination className="mt-4 sm:mt-6">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                  className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <PaginationItem key={page}>
                  <PaginationLink
                    onClick={() => handlePageChange(page)}
                    isActive={currentPage === page}
                    className="cursor-pointer"
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                  className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
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
          />
        )}

        {selectedVideoForDetails && (
          <TaskDetailsModal
            generationId={selectedVideoForDetails.id}
            onApplySettings={(settings) => {
              onApplySettings(settings);
              setSelectedVideoForDetails(null);
            }}
            onApplySettingsFromTask={(taskId, replaceImages, inputImages) => {
              onApplySettingsFromTask(taskId, replaceImages, inputImages);
              setSelectedVideoForDetails(null);
            }}
            onClose={() => setSelectedVideoForDetails(null)}
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
          console.log('[HoverDebug] Rendering hover preview:', {
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