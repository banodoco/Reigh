import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  const itemsPerPage = 6;
  const taskDetailsButtonRef = useRef<HTMLButtonElement>(null);
  const isMobile = useIsMobile();

  // Hooks for task details
  const getTaskIdMutation = useGetTaskIdForGeneration();
  const { data: task, isLoading: isLoadingTask, error: taskError } = useGetTask(taskId || '');

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
    };
  }, []);

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
                      onClick={() => setSelectedVideoForDetails(video)}
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
    </Card>
  );
};

export default VideoOutputsGallery; 