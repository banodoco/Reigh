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
import { useGetTaskIdForGeneration } from '@/shared/hooks/useGenerations';
import { useGetTask } from '@/shared/hooks/useTasks';
import { Badge } from '@/shared/components/ui/badge';
import { Check, X } from 'lucide-react';
import { SharedTaskDetails } from './SharedTaskDetails';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';



interface VideoOutputsGalleryProps {
  videoOutputs: GenerationRow[];
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
}

const VideoOutputsGallery: React.FC<VideoOutputsGalleryProps> = ({
  videoOutputs,
  onDelete,
  deletingVideoId,
  onApplySettings,
  onApplySettingsFromTask,
  onImageSaved,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectedVideoForDetails, setSelectedVideoForDetails] = useState<GenerationRow | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [hoveredVideo, setHoveredVideo] = useState<GenerationRow | null>(null);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number; positioning?: 'above' | 'below' } | null>(null);
  const [isInitialHover, setIsInitialHover] = useState(false);
  const itemsPerPage = 6;
  const taskDetailsButtonRef = useRef<HTMLButtonElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMobile = useIsMobile();

  // Hooks for task details
  const getTaskIdMutation = useGetTaskIdForGeneration();
  const { data: task, isLoading: isLoadingTask, error: taskError } = useGetTask(taskId || '');
  
  // Hooks for hover preview
  const getHoverTaskIdMutation = useGetTaskIdForGeneration();
  const { data: hoverTask, isLoading: isLoadingHoverTask } = useGetTask(hoveredTaskId || '');
  
  // Background preloading
  const queryClient = useQueryClient();
  const [preloadedTaskIds, setPreloadedTaskIds] = useState<Set<string>>(new Set());
  const [isPreloading, setIsPreloading] = useState(false);

  // Background preloading function
  const preloadTaskDetails = useCallback(async (videosToPreload: GenerationRow[]) => {
    if (isPreloading) return;
    
    setIsPreloading(true);
    console.log('[TaskPreload] Starting background preload for', videosToPreload.length, 'videos');
    
    try {
      // Process videos in small batches to avoid overwhelming the server
      const batchSize = 3;
      for (let i = 0; i < videosToPreload.length; i += batchSize) {
        const batch = videosToPreload.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (video) => {
          try {
            // Check if we already have this task ID cached
            if (preloadedTaskIds.has(video.id)) return;
            
            console.log('[TaskPreload] Preloading task for video:', video.id);
            
            // Get task ID
            const { data: generationData } = await supabase
              .from('generations')
              .select('tasks')
              .eq('id', video.id)
              .single();
            
            if (!generationData?.tasks) return;
            
            const tasksArray = generationData.tasks as string[] | null;
            const taskId = Array.isArray(tasksArray) && tasksArray.length > 0 ? tasksArray[0] : null;
            
            if (!taskId) return;
            
            // Prefetch task details into React Query cache
            await queryClient.prefetchQuery({
              queryKey: ['tasks', 'single', taskId],
              queryFn: async () => {
                const { data, error } = await supabase
                  .from('tasks')
                  .select('*')
                  .eq('id', taskId)
                  .single();
                
                if (error) {
                  throw new Error(`Task with ID ${taskId} not found: ${error.message}`);
                }
                
                // Map the data same way as in useTasks.ts
                return {
                  id: data.id,
                  project_id: data.project_id,
                  status: data.status,
                  task_type: data.task_type,
                  params: data.params,
                  result: data.result,
                  error: data.error,
                  claimed_at: data.claimed_at,
                  completed_at: data.completed_at,
                  created_at: data.created_at,
                  updated_at: data.updated_at,
                  worker_id: data.worker_id,
                  cost: data.cost,
                  credits_used: data.credits_used,
                  processing_started_at: data.processing_started_at,
                  processing_completed_at: data.processing_completed_at,
                };
              },
              staleTime: 5 * 60 * 1000, // 5 minutes
            });
            
            // Also prefetch the generation -> task ID mapping
            queryClient.setQueryData(['tasks', 'taskId', video.id], { taskId });
            
            setPreloadedTaskIds(prev => new Set([...prev, video.id]));
            console.log('[TaskPreload] Successfully preloaded task for video:', video.id, 'taskId:', taskId);
            
          } catch (error) {
            console.warn('[TaskPreload] Failed to preload task for video:', video.id, error);
          }
        }));
        
        // Small delay between batches to be nice to the server
        if (i + batchSize < videosToPreload.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } finally {
      setIsPreloading(false);
      console.log('[TaskPreload] Background preload completed');
    }
  }, [isPreloading, preloadedTaskIds, queryClient]);

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
      hoveredTaskId,
      hoverTaskParams: hoverTask ? Object.keys((hoverTask as any)?.params || {}) : []
    });
    
    const p = (hoverTask as any)?.params || {};
    if (Array.isArray(p.input_images) && p.input_images.length > 0) return p.input_images;
    if (p.full_orchestrator_payload && Array.isArray(p.full_orchestrator_payload.input_image_paths_resolved)) {
      return p.full_orchestrator_payload.input_image_paths_resolved;
    }
    if (Array.isArray(p.input_image_paths_resolved)) return p.input_image_paths_resolved;
    return [];
  }, [hoverTask, hoveredTaskId]);



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

  // Fetch task details when lightbox opens or video changes
  useEffect(() => {
    let cancelled = false;
    
    console.log('[VideoOutputsGallery] Task details useEffect triggered', { 
      lightboxIndex, 
      currentVideoId: currentVideo?.id,
      timestamp: Date.now() 
    });
    
    const fetchTaskDetails = async () => {
      if (!currentVideo) {
        console.log('[VideoOutputsGallery] No current video, clearing task ID');
        setTaskId(null);
        return;
      }
      
      console.log('[VideoOutputsGallery] Fetching task details for video', currentVideo.id);
      
      try {
        const result = await getTaskIdMutation.mutateAsync(currentVideo.id);
        
        if (cancelled) {
          console.log('[VideoOutputsGallery] Task fetch cancelled');
          return;
        }

        if (!result.taskId) {
          console.log(`[VideoOutputsGallery] No task ID found for generation ID: ${currentVideo.id}`);
          setTaskId(null);
          return;
        }
        
        console.log('[VideoOutputsGallery] Task ID found:', result.taskId);
        setTaskId(result.taskId);

      } catch (error: any) {
        if (cancelled) return;
        console.error(`[VideoOutputsGallery] Error fetching task details:`, error);
        setTaskId(null);
      }
    };

    fetchTaskDetails();

    return () => {
      cancelled = true;
    };
  }, [currentVideo?.id]);

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

  // Handle hover for task details preview
  const handleHoverStart = async (video: GenerationRow, event: React.MouseEvent) => {
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
    
    // Check if we have preloaded task ID data
    const cachedTaskId = queryClient.getQueryData(['tasks', 'taskId', video.id]) as { taskId: string } | undefined;
    
    if (cachedTaskId?.taskId) {
      console.log('[HoverDebug] Using preloaded task ID:', cachedTaskId.taskId, 'for video:', video.id);
      setHoveredTaskId(cachedTaskId.taskId);
      setIsInitialHover(false);
    } else {
      console.log('[HoverDebug] No preloaded data, will fetch task ID for video:', video.id);
      setIsInitialHover(true);
      
      // Delay fetching task details slightly to avoid rapid API calls
      hoverTimeoutRef.current = setTimeout(async () => {
        setIsInitialHover(false);
        console.log('[HoverDebug] Timeout triggered, fetching task details for:', video.id);
        try {
          const result = await getHoverTaskIdMutation.mutateAsync(video.id);
          console.log('[HoverDebug] Task ID result:', result);
          if (result.taskId) {
            console.log('[HoverDebug] Setting hover task ID:', result.taskId);
            setHoveredTaskId(result.taskId);
          } else {
            console.log('[HoverDebug] No task ID found for video:', video.id);
            setHoveredTaskId(null);
          }
        } catch (error) {
          console.error('[HoverDebug] Error fetching hover task details:', error);
          setHoveredTaskId(null);
        }
      }, 500);
    }
  };

  const handleHoverEnd = () => {
    console.log('[HoverDebug] Ending hover');
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredVideo(null);
    setHoveredTaskId(null);
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

  // Background preloading effect
  useEffect(() => {
    if (currentVideoOutputs.length === 0) return;
    
    // Check if any videos in current view are not preloaded
    const unpreloadedVideos = currentVideoOutputs.filter(video => !preloadedTaskIds.has(video.id));
    
    if (unpreloadedVideos.length === 0) {
      console.log('[TaskPreload] All videos on current page already preloaded');
      return;
    }
    
    console.log('[TaskPreload] Found', unpreloadedVideos.length, 'unpreloaded videos on current page');
    
    // If it's a fresh page load (most videos unpreloaded), add delay
    // If it's just a few new videos (like after deletion), preload immediately
    const shouldDelay = unpreloadedVideos.length >= currentVideoOutputs.length * 0.8; // 80% or more unpreloaded
    const delay = shouldDelay ? 1000 : 200; // 1s for fresh page, 200ms for new videos
    
    const timer = setTimeout(() => {
      preloadTaskDetails(unpreloadedVideos);
    }, delay);

    return () => clearTimeout(timer);
  }, [currentVideoOutputs, currentPage, preloadTaskDetails, preloadedTaskIds]); // Re-run when page or preloaded set changes

  // Clean up preloaded cache when videos are deleted
  useEffect(() => {
    const currentVideoIds = new Set(sortedVideoOutputs.map(v => v.id));
    const preloadedIds = Array.from(preloadedTaskIds);
    const staleIds = preloadedIds.filter(id => !currentVideoIds.has(id));
    
    if (staleIds.length > 0) {
      console.log('[TaskPreload] Cleaning up', staleIds.length, 'stale preloaded entries');
      setPreloadedTaskIds(prev => {
        const newSet = new Set(prev);
        staleIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    }
  }, [sortedVideoOutputs, preloadedTaskIds]);

  // Preload next page for faster pagination
  useEffect(() => {
    if (totalPages <= 1) return; // No next page
    
    const timer = setTimeout(() => {
      const nextPage = currentPage + 1;
      if (nextPage <= totalPages) {
        const nextStartIndex = (nextPage - 1) * itemsPerPage;
        const nextEndIndex = nextStartIndex + itemsPerPage;
        const nextPageVideos = sortedVideoOutputs.slice(nextStartIndex, nextEndIndex);
        const unpreloadedNextPageVideos = nextPageVideos.filter(video => !preloadedTaskIds.has(video.id));
        
        if (unpreloadedNextPageVideos.length > 0) {
          console.log('[TaskPreload] Preloading', unpreloadedNextPageVideos.length, 'videos from next page');
          preloadTaskDetails(unpreloadedNextPageVideos);
        }
      }
    }, 3000); // 3 seconds after current page loads

    return () => clearTimeout(timer);
  }, [currentPage, totalPages, itemsPerPage, sortedVideoOutputs, preloadedTaskIds, preloadTaskDetails]);

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
              isLoading: getTaskIdMutation.isPending || isLoadingTask,
              error: getTaskIdMutation.error || taskError,
              inputImages,
              taskId,
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
            hoveredTaskId,
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
                {(isInitialHover || getHoverTaskIdMutation.isPending || isLoadingHoverTask || (hoveredTaskId && !hoverTask)) ? (
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