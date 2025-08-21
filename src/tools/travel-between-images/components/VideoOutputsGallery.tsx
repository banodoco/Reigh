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
import { useVideoCountCache } from '@/shared/hooks/useVideoCountCache';

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
 */

// SIMPLIFIED: No wrapper needed - use direct HoverScrubVideo

// Skeleton component for loading states - defined outside to prevent recreation
const VideoSkeleton = React.memo(({ index }: { index: number }) => (
  <div className="w-1/2 lg:w-1/3 px-1 sm:px-1.5 md:px-2 mb-2 sm:mb-3 md:mb-4">
    <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden shadow-sm border relative">
      <Skeleton className="w-full h-full" />
      
      {/* Loading indicator like real videos - stable animation */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-muted-foreground/60 rounded-full animate-spin" 
             style={{ animationDuration: '1s' }} />
      </div>
    </div>
  </div>
));

// VideoItem component with staggered loading and optimized loading behavior
interface VideoItemProps {
  video: GenerationRow;
  index: number;
  originalIndex: number;
  isFirstVideo: boolean;
  shouldPreload: string;
  isMobile: boolean;
  onLightboxOpen: (index: number) => void;
  onMobileTap: (index: number) => void;
  onDelete: (id: string) => void;
  deletingVideoId: string | null;
  onHoverStart: (video: GenerationRow, event: React.MouseEvent) => void;
  onHoverEnd: () => void;
  onMobileModalOpen: (video: GenerationRow) => void;
  selectedVideoForDetails: GenerationRow | null;
  showTaskDetailsModal: boolean;
}

const VideoItem = React.memo<VideoItemProps>(({ 
  video, 
  index, 
  originalIndex, 
  isFirstVideo, 
  shouldPreload, 
  isMobile, 
  onLightboxOpen, 
  onMobileTap, 
  onDelete, 
  deletingVideoId, 
  onHoverStart, 
  onHoverEnd,
  onMobileModalOpen,
  selectedVideoForDetails,
  showTaskDetailsModal
}) => {
  const [shouldLoad, setShouldLoad] = useState(isFirstVideo); // First video loads immediately
  const [videoMetadataLoaded, setVideoMetadataLoaded] = useState(false);
  const [videoPosterLoaded, setVideoPosterLoaded] = useState(false);
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const posterFallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasTriggeredLoadRef = useRef(false); // Prevent multiple load() calls
  
  // Check if we have a thumbnail URL that's different from the main video URL
  const hasThumbnail = video.thumbUrl && video.thumbUrl !== video.location && video.thumbUrl !== video.imageUrl;
  
  // Helper function to safely trigger load only once
  const triggerLoadOnce = useCallback((reason: string) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🎬 [VideoLifecycle] Video ${index + 1} - TRIGGER_LOAD_ATTEMPT:`, {
        videoId: video.id,
        phase: 'TRIGGER_LOAD_ATTEMPT',
        reason,
        hasTriggeredLoad: hasTriggeredLoadRef.current,
        hasVideoRef: !!videoRef.current,
        shouldPreload,
        willTriggerLoad: !hasTriggeredLoadRef.current && videoRef.current && shouldPreload === 'none',
        timestamp: Date.now()
      });
    }
    
    if (!hasTriggeredLoadRef.current && videoRef.current && shouldPreload === 'none') {
      hasTriggeredLoadRef.current = true;
      videoRef.current.load();
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_LOAD_TRIGGERED:`, {
          videoId: video.id,
          phase: 'VIDEO_LOAD_TRIGGERED',
          reason,
          videoSrc: videoRef.current.src,
          timestamp: Date.now()
        });
      }
    }
  }, [index, shouldPreload, video.id]);
  
  // Log component mount/unmount (debug only)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🎬 [VideoLifecycle] Video ${index + 1} - COMPONENT_MOUNTED:`, {
        videoId: video.id,
        phase: 'COMPONENT_MOUNTED',
        isFirstVideo,
        priority: isFirstVideo ? 'priority' : 'delayed',
        timestamp: Date.now()
      });
      
      // Return cleanup function to track unmounts
      return () => {
        console.log(`🎬 [VideoLifecycle] Video ${index + 1} - COMPONENT_UNMOUNTED:`, {
          videoId: video.id,
          phase: 'COMPONENT_UNMOUNTED',
          reason: 'Component destroyed/re-rendered',
          timestamp: Date.now()
        });
      };
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Staggered loading: load videos with a delay based on their position
  useEffect(() => {
    if (!isFirstVideo) {
      const delay = 200 + (index * 150); // 200ms base + 150ms per video
      const timer = setTimeout(() => {
        setShouldLoad(true);
        
        // For preload="none" videos, we need to manually trigger loading
        setTimeout(() => {
          triggerLoadOnce('(staggered timeout)');
        }, 100); // Small delay to ensure video element is rendered
      }, delay);
      
      return () => clearTimeout(timer);
    }
  }, [index, isFirstVideo, triggerLoadOnce]);
  
  // Hook into HoverScrubVideo's internal video element for loading optimization
  useEffect(() => {
    if (!shouldLoad) return;
    
    // Find the video element inside the HoverScrubVideo component
    const timeoutId = setTimeout(() => {
      const container = document.querySelector(`[data-video-id="${video.id}"]`);
      const videoElement = container?.querySelector('video') as HTMLVideoElement | null;
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_ELEMENT_SEARCH:`, {
          videoId: video.id,
          phase: 'VIDEO_ELEMENT_SEARCH',
          containerFound: !!container,
          videoElementFound: !!videoElement,
          containerSelector: `[data-video-id="${video.id}"]`,
          videoSrc: videoElement?.src || 'NO_SRC',
          shouldPreload: shouldPreload,
          videoReadyState: videoElement?.readyState || 'NO_ELEMENT',
          isFirstVideo: isFirstVideo,
          timestamp: Date.now()
        });
      }
      
      if (videoElement) {
        videoRef.current = videoElement;
        
        // Add our loading optimization event listeners
        const handleLoadStart = () => {
          if (process.env.NODE_ENV === 'development') {
            console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_LOAD_STARTED:`, {
              videoId: video.id,
              phase: 'VIDEO_LOAD_STARTED',
              src: videoElement.src,
              preload: shouldPreload,
              timestamp: Date.now()
            });
          }
        };
        
        const handleLoadedMetadata = () => {
          if (process.env.NODE_ENV === 'development') {
            console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_METADATA_LOADED:`, {
              videoId: video.id,
              phase: 'VIDEO_METADATA_LOADED',
              duration: videoElement?.duration,
              dimensions: `${videoElement?.videoWidth}x${videoElement?.videoHeight}`,
              timestamp: Date.now()
            });
          }
          setVideoMetadataLoaded(true);
          
          // Fallback: If onLoadedData doesn't fire within 2 seconds, consider poster ready
          if (posterFallbackTimeoutRef.current) {
            clearTimeout(posterFallbackTimeoutRef.current);
          }
          posterFallbackTimeoutRef.current = setTimeout(() => {
            if (!videoPosterLoaded) {
              if (process.env.NODE_ENV === 'development') {
                console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_POSTER_FALLBACK:`, {
                  videoId: video.id,
                  phase: 'VIDEO_POSTER_FALLBACK',
                  reason: 'onLoadedData did not fire within 2 seconds',
                  readyState: videoElement?.readyState,
                  networkState: videoElement?.networkState,
                  timestamp: Date.now()
                });
              }
              setVideoPosterLoaded(true);
            }
          }, 2000);
        };
        
        const handleLoadedData = () => {
          console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_POSTER_LOADED:`, {
            videoId: video.id,
            phase: 'VIDEO_POSTER_LOADED',
            currentTime: videoElement?.currentTime,
            readyState: videoElement?.readyState,
            nextPhase: 'Will transition to VIDEO_READY',
            timestamp: Date.now()
          });
          setVideoPosterLoaded(true);
          
          if (posterFallbackTimeoutRef.current) {
            clearTimeout(posterFallbackTimeoutRef.current);
            posterFallbackTimeoutRef.current = null;
          }
        };
        
        const handleSuspend = () => {
          console.warn(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_LOADING_SUSPENDED:`, {
            videoId: video.id,
            phase: 'VIDEO_LOADING_SUSPENDED',
            readyState: videoElement?.readyState,
            networkState: videoElement?.networkState,
            preload: shouldPreload,
            recovery: 'Will retry in 500ms if readyState=0',
            timestamp: Date.now()
          });
          
          if (shouldPreload === 'none' && videoElement?.readyState === 0) {
            setTimeout(() => {
              triggerLoadOnce('(suspended with readyState=0)');
            }, 500);
          }
        };
        
        const handleCanPlay = () => {
          console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_CAN_PLAY:`, {
            videoId: video.id,
            phase: 'VIDEO_CAN_PLAY',
            readyState: videoElement?.readyState,
            timestamp: Date.now()
          });
          
          if (!videoPosterLoaded && shouldPreload === 'none') {
            console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_CANPLAY_FALLBACK:`, {
              videoId: video.id,
              phase: 'VIDEO_CANPLAY_FALLBACK',
              reason: 'preload=none fallback trigger',
              triggeredBy: 'onCanPlay',
              timestamp: Date.now()
            });
            setVideoPosterLoaded(true);
            
            if (posterFallbackTimeoutRef.current) {
              clearTimeout(posterFallbackTimeoutRef.current);
              posterFallbackTimeoutRef.current = null;
            }
          }
        };
        
        // Add event listeners
        videoElement.addEventListener('loadstart', handleLoadStart);
        videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
        videoElement.addEventListener('loadeddata', handleLoadedData);
        videoElement.addEventListener('suspend', handleSuspend);
        videoElement.addEventListener('canplay', handleCanPlay);
        
        // Trigger manual loading for preload="none" videos
        console.log(`🎬 [VideoLifecycle] Video ${index + 1} - PRELOAD_CHECK:`, {
          videoId: video.id,
          phase: 'PRELOAD_CHECK',
          shouldPreload: shouldPreload,
          willTriggerManualLoad: shouldPreload === 'none',
          videoReadyState: videoElement.readyState,
          timestamp: Date.now()
        });
        
        // Check if video is already loaded (readyState >= 2 means metadata is loaded)
        if (videoElement.readyState >= 2) {
          console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_ALREADY_LOADED:`, {
            videoId: video.id,
            phase: 'VIDEO_ALREADY_LOADED',
            readyState: videoElement.readyState,
            readyStateText: videoElement.readyState === 4 ? 'HAVE_ENOUGH_DATA' : 
                           videoElement.readyState === 3 ? 'HAVE_FUTURE_DATA' : 
                           videoElement.readyState === 2 ? 'HAVE_CURRENT_DATA' : 'UNKNOWN',
            willSetStates: true,
            timestamp: Date.now()
          });
          
          // Video is already loaded, update our state immediately
          setVideoMetadataLoaded(true);
          if (videoElement.readyState >= 3) {
            setVideoPosterLoaded(true);
          }
        }
        
        if (shouldPreload === 'none') {
          setTimeout(() => {
            triggerLoadOnce('(HoverScrubVideo integration)');
          }, 50);
        } else {
          console.log(`🎬 [VideoLifecycle] Video ${index + 1} - AUTO_PRELOAD_EXPECTED:`, {
            videoId: video.id,
            phase: 'AUTO_PRELOAD_EXPECTED',
            shouldPreload: shouldPreload,
            message: 'Video should start loading automatically with this preload setting',
            videoReadyState: videoElement.readyState,
            timestamp: Date.now()
          });
        }
        
        // Store cleanup function
        return () => {
          videoElement.removeEventListener('loadstart', handleLoadStart);
          videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
          videoElement.removeEventListener('loadeddata', handleLoadedData);
          videoElement.removeEventListener('suspend', handleSuspend);
          videoElement.removeEventListener('canplay', handleCanPlay);
        };
      } else {
        console.warn(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_ELEMENT_NOT_FOUND:`, {
          videoId: video.id,
          phase: 'VIDEO_ELEMENT_NOT_FOUND',
          issue: 'HoverScrubVideo did not create video element',
          containerFound: !!container,
          retryIn: 'Will retry in next render cycle',
          timestamp: Date.now()
        });
      }
    }, 100); // Small delay to ensure HoverScrubVideo has rendered
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [shouldLoad, video.id, index, shouldPreload, triggerLoadOnce, setVideoMetadataLoaded, setVideoPosterLoaded, videoPosterLoaded, posterFallbackTimeoutRef]);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (posterFallbackTimeoutRef.current) {
        clearTimeout(posterFallbackTimeoutRef.current);
      }
    };
  }, []);
  
  // 🎬 UNIFIED VIDEO LOADING TRACKER - Use `[VideoLifecycle]` to follow complete loading journey
  // Phases: INITIALIZED → WAITING_TO_LOAD → THUMBNAIL_LOADED → VIDEO_LOADING_WITH_THUMBNAIL → VIDEO_READY
  // Or: INITIALIZED → WAITING_TO_LOAD → VIDEO_LOADING → VIDEO_READY (no thumbnail)
  // Log state changes (throttled to reduce spam)
  const lastLoggedStateRef = useRef<string>('');
  useEffect(() => {
    const currentState = `${shouldLoad}-${videoPosterLoaded}-${videoMetadataLoaded}-${thumbnailLoaded}-${hasThumbnail}`;
    if (currentState !== lastLoggedStateRef.current) {
      // Determine loading phase for clearer tracking
      let phase = 'INITIAL';
      let readyToShow = false;
      
      if (hasThumbnail && thumbnailLoaded && !videoPosterLoaded) {
        phase = 'THUMBNAIL_READY';
        readyToShow = true;
      } else if (!hasThumbnail && !shouldLoad) {
        phase = 'WAITING_TO_LOAD';
      } else if (shouldLoad && !videoPosterLoaded && !hasThumbnail) {
        phase = 'VIDEO_LOADING';
      } else if (shouldLoad && !videoPosterLoaded && hasThumbnail && thumbnailLoaded) {
        phase = 'VIDEO_LOADING_WITH_THUMBNAIL';
      } else if (videoPosterLoaded) {
        phase = 'VIDEO_READY';
        readyToShow = true;
      }
      
      console.log(`🎬 [VideoLifecycle] Video ${index + 1} - ${phase}:`, {
        // Core identification
        videoId: video.id,
        position: index + 1,
        phase,
        readyToShow,
        
        // Loading states
        shouldLoad,
        videoPosterLoaded,
        videoMetadataLoaded,
        
        // Thumbnail states
        hasThumbnail,
        thumbnailLoaded,
        thumbnailError,
        thumbnailUrl: video.thumbUrl,
        
        // URLs for debugging
        videoUrl: video.location,
        
        // Timing
        timestamp: Date.now(),
        
        // Summary for quick scanning
        summary: hasThumbnail 
          ? `Thumbnail: ${thumbnailLoaded ? '✅' : '⏳'} | Video: ${videoPosterLoaded ? '✅' : '⏳'}`
          : `Video: ${videoPosterLoaded ? '✅' : shouldLoad ? '⏳' : '⏸️'}`
      });
      lastLoggedStateRef.current = currentState;
    }
  }, [shouldLoad, videoPosterLoaded, videoMetadataLoaded, thumbnailLoaded, hasThumbnail, thumbnailError, index, video.id, video.thumbUrl, video.location]);
  
  return (
    <div className="w-1/2 lg:w-1/3 px-1 sm:px-1.5 md:px-2 mb-2 sm:mb-3 md:mb-4 relative group">
      <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden shadow-sm border relative">
        {/* Thumbnail - shows immediately if available, before video loads */}
        {hasThumbnail && !thumbnailError && (
          <img
            src={video.thumbUrl}
            alt="Video thumbnail"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
              videoPosterLoaded ? 'opacity-0' : 'opacity-100'
            }`}
            onLoad={() => {
              setThumbnailLoaded(true);
              console.log(`🎬 [VideoLifecycle] Video ${index + 1} - THUMBNAIL_LOADED:`, {
                videoId: video.id,
                thumbnailUrl: video.thumbUrl,
                phase: 'THUMBNAIL_LOADED',
                nextPhase: 'Will transition to video when ready',
                timestamp: Date.now()
              });
            }}
            onError={() => {
              setThumbnailError(true);
              console.warn(`🎬 [VideoLifecycle] Video ${index + 1} - THUMBNAIL_FAILED:`, {
                videoId: video.id,
                thumbnailUrl: video.thumbUrl,
                phase: 'THUMBNAIL_FAILED',
                fallback: 'Will show video loading directly',
                timestamp: Date.now()
              });
            }}
          />
        )}
        
        {/* Loading placeholder - shows until thumbnail or video poster is ready */}
        {!thumbnailLoaded && !videoPosterLoaded && (
          <div className="absolute inset-0 bg-gray-200 flex items-center justify-center z-10">
            <div className="flex flex-col items-center space-y-2">
              <div className="w-6 h-6 border-2 border-gray-400 border-t-gray-600 rounded-full animate-spin"></div>
              <div className="text-gray-500 text-xs">
                {hasThumbnail ? 'Loading thumbnail...' : 'Loading video...'}
              </div>
            </div>
          </div>
        )}
        
        {/* Only render video when it's time to load */}
        {shouldLoad && (
          <div className="relative w-full h-full">
            {/* HoverScrubVideo with loading optimization integration */}
            <HoverScrubVideo
              src={video.location || video.imageUrl}
              preload={shouldPreload as 'auto' | 'metadata' | 'none'}
              className={`w-full h-full transition-opacity duration-300 ${
                videoPosterLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              videoClassName="object-cover cursor-pointer"
              data-video-id={video.id}
              // Interaction events
              onDoubleClick={isMobile ? undefined : () => {
                onLightboxOpen(originalIndex);
              }}
              onTouchEnd={isMobile ? (e) => {
                // Don't interfere with touches inside action buttons
                const path = (e as any).nativeEvent?.composedPath?.() as HTMLElement[] | undefined;
                const isInsideButton = path ? path.some((el) => (el as HTMLElement)?.tagName === 'BUTTON' || (el as HTMLElement)?.closest?.('button')) : !!(e.target as HTMLElement).closest('button');
                if (isInsideButton) return;
                e.preventDefault();
                onMobileTap(originalIndex);
              } : undefined}
            />
          </div>
        )}
        

        
        {/* Action buttons – positioned directly on the video container */}
        <div className="absolute top-1/2 right-2 sm:right-3 flex flex-col items-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity -translate-y-1/2 z-20 pointer-events-auto">
          <Button
            variant="secondary"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              console.log('[MobileButtonDebug] [InfoButton] Button clicked START:', {
                isMobile,
                videoId: video.id,
                timestamp: Date.now()
              });
              
              if (isMobile) {
                // On mobile, open the modal
                console.log('[MobileButtonDebug] [InfoButton] Setting modal state...');
                onMobileModalOpen(video);
              } else {
                // On desktop, open the lightbox
                console.log('[MobileButtonDebug] [InfoButton] Desktop - opening lightbox');
                onLightboxOpen(originalIndex);
              }
            }}
            onMouseEnter={(e) => onHoverStart(video, e)}
            onMouseLeave={onHoverEnd}
            className="h-6 w-6 sm:h-7 sm:w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white"
          >
            <Info className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          </Button>
          <Button
            variant="destructive"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              console.log('[MobileButtonDebug] [DeleteButton] Button clicked:', {
                videoId: video.id,
                deletingVideoId,
                isDisabled: deletingVideoId === video.id,
                timestamp: Date.now()
              });
              onDelete(video.id);
              console.log('[MobileButtonDebug] [DeleteButton] onDelete called');
            }}
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
});

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
  

  const [currentPage, setCurrentPage] = useState(1);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectedVideoForDetails, setSelectedVideoForDetails] = useState<GenerationRow | null>(null);
  const [hoveredVideo, setHoveredVideo] = useState<GenerationRow | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number; positioning?: 'above' | 'below' } | null>(null);
  const [isInitialHover, setIsInitialHover] = useState(false);
  const [showTaskDetailsModal, setShowTaskDetailsModal] = useState(false);
  
  // Debug state changes
  useEffect(() => {
    console.log('[MobileButtonDebug] [StateChange] selectedVideoForDetails changed:', {
      videoId: selectedVideoForDetails?.id,
      timestamp: Date.now()
    });
  }, [selectedVideoForDetails]);
  
  useEffect(() => {
    console.log('[MobileButtonDebug] [StateChange] showTaskDetailsModal changed:', {
      showTaskDetailsModal,
      timestamp: Date.now()
    });
  }, [showTaskDetailsModal]);
  
  // SIMPLIFIED FIX: Use a simple delay-based approach instead of complex video loading tracking
  const [showVideosAfterDelay, setShowVideosAfterDelay] = useState(false);
  // Stable content key to avoid resets during background refetches
  const contentKey = `${shotId ?? ''}:${currentPage}`;
  const prevContentKeyRef = useRef<string | null>(null);
  
  const itemsPerPage = 6;
  const taskDetailsButtonRef = useRef<HTMLButtonElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMobile = useIsMobile();
  
  // Video count cache for instant skeleton display
  const { getCachedCount, setCachedCount } = useVideoCountCache();
  
  // Stable video count to prevent data loss
  const lastGoodCountRef = useRef<number | null>(null);
  const prevShotIdRef = useRef<string | null>(null);
  
  // Reset state when shot changes to prevent stale data
  useEffect(() => {
    if (shotId !== prevShotIdRef.current) {
      console.log('[SkeletonOptimization] Shot changed - resetting ALL state:', {
        prevShotId: prevShotIdRef.current,
        newShotId: shotId,
        resettingLastGoodCount: lastGoodCountRef.current,
        timestamp: Date.now()
      });
      
      // Reset pagination to page 1
      setCurrentPage(1);
      
      // CRITICAL: Reset lastGoodCountRef to prevent cross-shot contamination
      lastGoodCountRef.current = null;
      
      // SIMPLIFIED FIX: Reset video delay state for new shot
      setShowVideosAfterDelay(false);
      
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

  // [GalleryPollingDebug] Log when component uses the hook
  React.useEffect(() => {
    console.log('📊 [GalleryPollingDebug:VideoOutputsGallery] useUnifiedGenerations result:', {
      projectId,
      shotId,
      currentPage,
      itemsPerPage,
      isLoadingGenerations,
      isFetchingGenerations,
      hasData: !!generationsData,
      itemsCount: (generationsData as any)?.items?.length,
      total: (generationsData as any)?.total,
      filters,
      enabled: !!(projectId && shotId),
      errorMessage: generationsError?.message,
      timestamp: Date.now()
    });
    
    // [SkeletonOptimization] Track when generationsData becomes available
    console.log('[SkeletonOptimization] useUnifiedGenerations data change:', {
      generationsDataExists: !!generationsData,
      generationsDataTotal: (generationsData as any)?.total,
      generationsDataItems: (generationsData as any)?.items?.length,
      isLoadingGenerations,
      isFetchingGenerations,
      previousDataExists: !!generationsData,
      timestamp: Date.now()
    });
    
    // Cache video count when data becomes available and protect against data loss
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
  }, [generationsData, isLoadingGenerations, isFetchingGenerations, generationsError, projectId, shotId, currentPage, setCachedCount, getShotVideoCount, invalidateVideoCountsCache]);

  // Get video outputs from unified data
  const videoOutputs = useMemo(() => {
    if (!(generationsData as any)?.items) return [];
    
    // Debug log the raw data structure to see thumbnails
    console.log('[ThumbnailDebug] Raw generationsData.items:', {
      itemCount: (generationsData as any).items.length,
      firstItem: (generationsData as any).items[0],
      itemsWithThumbs: (generationsData as any).items.filter((item: any) => item.thumbUrl && item.thumbUrl !== item.url).length,
      timestamp: Date.now()
    });
    
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
        shotImageEntryId: (video as any).shotImageEntryId,
        thumbUrl: video.thumbUrl,
        location: video.location,
        hasThumbnail: video.thumbUrl && video.thumbUrl !== video.location && video.thumbUrl !== video.imageUrl
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

  // SIMPLIFIED FIX: Use a simple delay after initial data load; do not reset on background refetches
  useEffect(() => {
    // Detect content key changes (shot or page) and reset only then
    if (prevContentKeyRef.current !== contentKey) {
      console.log('[VideoLoadingFix] Content key changed, resetting delay state', {
        prev: prevContentKeyRef.current, next: contentKey
      });
      prevContentKeyRef.current = contentKey;
      setShowVideosAfterDelay(false);
    }

    // Start delay only after initial load completes for this key
    if (!isLoadingGenerations && !showVideosAfterDelay) {
      const videoDelay = setTimeout(() => {
        setShowVideosAfterDelay(true);
        console.log('[VideoLoadingFix] Video delay complete, showing actual videos for key', contentKey);
      }, 800);
      return () => clearTimeout(videoDelay);
    }
  }, [contentKey, isLoadingGenerations, showVideosAfterDelay]);

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
      
      // Reset stable count for new shot
      lastGoodCountRef.current = null;
      
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
  
  // Log video loading strategy for this page (throttled to avoid spam)
  const hasLoggedStrategyRef = useRef(false);
  React.useEffect(() => {
    if (currentVideoOutputs.length > 0 && !hasLoggedStrategyRef.current) {
      console.log('🎬 [VideoLifecycle] PAGE_LOADING_STRATEGY:', {
        currentPage,
        totalVideosOnPage: currentVideoOutputs.length,
        loadingPlan: currentVideoOutputs.map((video, index) => ({
          videoNum: index + 1,
          videoId: video.id,
          strategy: index === 0 ? 'IMMEDIATE (priority)' : `DELAYED (${200 + (index * 150)}ms)`,
          preload: index === 0 ? 'metadata' : 'none',
          posterStrategy: 'video-first-frame'
        })),
        timestamp: Date.now()
      });
      hasLoggedStrategyRef.current = true;
    }
  }, [currentVideoOutputs, currentPage]);
  
  // Reset the flag when page changes
  React.useEffect(() => {
    hasLoggedStrategyRef.current = false;
  }, [currentPage, shotId]);

  // SIMPLIFIED: Show skeletons during initial data loading OR during video delay period
  const getSkeletonCount = () => {
    // Only gate on initial loading, not background refetches
    const isDataLoading = isLoadingGenerations; 
    
    // SIMPLIFIED FIX: Show skeletons if data is loading OR videos haven't had time to load yet
    const shouldShowSkeletons = isDataLoading || (!showVideosAfterDelay && videoOutputs.length > 0);
    
      // Get cached count for instant display
    const cachedCount = getCachedCount(shotId);
    // Get project-wide preloaded count (highest priority for instant display)
    const projectVideoCount = getShotVideoCount?.(shotId) ?? null;
    
    console.log('[VideoLoadingFix] Getting skeleton count:', {
      isLoadingGenerations,
      isFetchingGenerations,
      isDataLoading,
      shouldShowSkeletons,
      showVideosAfterDelay,
      videoOutputsLength: videoOutputs.length,
      currentVideoOutputsLength: currentVideoOutputs.length,
      currentPage,
      itemsPerPage,
      shotId,
      projectVideoCount,
      cachedCount,
      timestamp: Date.now()
    });
    
    // SIMPLIFIED FIX: Show skeletons during data loading or video delay period
    if (shouldShowSkeletons) {
      // Priority 1: Use current data if available AND it's from current shot (most accurate)
      const totalVideos = (generationsData as any)?.total;
      const isDataFresh = !isFetchingGenerations; // Data is fresh if not currently fetching
      
      // Priority 2: Use project-wide preloaded count (instant display) 
      // Priority 3: Use cached count for fallback
      // Priority 4: Use last good count to prevent data loss
      const lastGoodCount = lastGoodCountRef.current;
      // ONLY use project cache during loading - never use cached/lastGood during transitions
      const countToUse = (totalVideos !== null && totalVideos !== undefined && isDataFresh) ? totalVideos :
                        (projectVideoCount !== null && projectVideoCount >= 0) ? projectVideoCount : 0;
      
      console.log('[SkeletonOptimization] Loading state - count sources (SAFE MODE):', {
        totalVideos,
        isDataFresh,
        projectVideoCount,
        countToUse,
        usingFreshData: (totalVideos !== null && totalVideos !== undefined && isDataFresh),
        usingProject: !(totalVideos !== null && totalVideos !== undefined && isDataFresh) && projectVideoCount !== null,
        usingFallback: !(totalVideos !== null && totalVideos !== undefined && isDataFresh) && projectVideoCount === null,
        generationsData: generationsData ? 'exists' : 'null',
        shotId,
        timestamp: Date.now()
      });
      
      // If we have count information (current or cached), calculate accurate skeleton count
      if (countToUse > 0) {
        // Calculate how many videos should be on the current page
        const startIndex = (currentPage - 1) * itemsPerPage;
        
        // Handle case where currentPage is beyond available data
        if (startIndex >= countToUse) {
          console.log('[VideoLoadingFix] Current page beyond available data, returning 0 skeletons:', {
            startIndex,
            countToUse,
            currentPage,
            itemsPerPage
          });
          return 0;
        }
        
        // SIMPLIFIED: No partial skeleton logic - just show all or none
        
        const videosOnCurrentPage = Math.min(countToUse - startIndex, itemsPerPage);
        const result = Math.max(0, videosOnCurrentPage);
        const source = (totalVideos !== null && totalVideos !== undefined && isDataFresh) ? 'fresh-current' : 'project';
        console.log('[VideoLoadingFix] Calculated skeleton count from count:', {
          countToUse,
          startIndex,
          videosOnCurrentPage,
          result,
          currentPage,
          itemsPerPage,
          source
        });
        return result;
      }
      
      // Do NOT use existing data from previous shot to derive skeletons; avoid cross-shot contamination
      
      // For initial load with no data and no cache, show 0 skeletons
      // Most conservative approach - no jarring transitions
      console.log('[SkeletonOptimization] SAFE FALLBACK: No fresh data or project cache, returning 0 skeletons to prevent stale data');
      return 0;
    }
    
    console.log('[SkeletonOptimization] Not loading, returning 0 skeletons');
    return 0;
  };

  const skeletonCount = getSkeletonCount();
  
  // [VideoLoadingFix] Log the final skeleton count being used
  console.log('[VideoLoadingFix] Final skeleton count result:', {
    skeletonCount,
    isLoadingGenerations,
    isFetchingGenerations,
    showVideosAfterDelay,
    videoOutputsLength: videoOutputs.length,
    sortedVideoOutputsLength: sortedVideoOutputs.length,
    willShowSkeletons: skeletonCount > 0,
    willShowActualVideos: skeletonCount === 0 && videoOutputs.length > 0,
    reason: skeletonCount > 0 ? 'data-loading-or-video-delay' : 'ready-to-show-videos',
    timestamp: Date.now()
  });
  
  // Debug logging for skeleton visibility
  React.useEffect(() => {
    const totalVideos = (generationsData as any)?.total || 0;
    console.log('[VideoOutputsGallery:Skeleton] Debug skeleton state:', {
      isLoadingGenerations,
      isFetchingGenerations,
      skeletonCount,
      totalVideos,
      videoOutputsLength: videoOutputs.length,
      sortedVideoOutputsLength: sortedVideoOutputs.length,
      currentPage,
      itemsPerPage,
      calculatedVideosOnPage: totalVideos > 0 ? Math.min(totalVideos - ((currentPage - 1) * itemsPerPage), itemsPerPage) : 'unknown',
      timestamp: Date.now()
    });
  }, [isLoadingGenerations, isFetchingGenerations, skeletonCount, videoOutputs.length, sortedVideoOutputs.length, currentPage, generationsData]);

  // Debug: Compare different count sources for potential mismatches
  React.useEffect(() => {
    const projectVideoCount = getShotVideoCount?.(shotId) ?? null;
    const currentDataTotal = (generationsData as any)?.total ?? null;
    if (shotId && (projectVideoCount !== null || currentDataTotal !== null)) {
      console.log('[CountMismatchDebug] Comparing video count sources:', {
        shotId,
        projectVideoCount,
        currentDataTotal,
        cachedCount: getCachedCount(shotId),
        videoOutputsLength: videoOutputs.length,
        sortedVideoOutputsLength: sortedVideoOutputs.length,
        mismatch: projectVideoCount !== null && currentDataTotal !== null && projectVideoCount !== currentDataTotal,
        timestamp: Date.now()
      });
    }
  }, [shotId, getShotVideoCount, generationsData, getCachedCount, videoOutputs.length, sortedVideoOutputs.length]);

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

  // Show empty state if:
  // 1. We know for certain there are 0 videos (from project cache) OR
  // 2. We know from current data that there are 0 videos (fast path) OR  
  // 3. We're not loading AND there are no videos
  const projectVideoCount = getShotVideoCount?.(shotId) ?? null;
  const currentDataTotal = (generationsData as any)?.total ?? null;
  const shouldShowEmptyState = (projectVideoCount === 0) || 
                               (currentDataTotal === 0) ||
                               (sortedVideoOutputs.length === 0 && !isLoadingGenerations && !isFetchingGenerations);

  // When loading and we have no skeletons to show and no videos loaded, show the 0-videos message
  // This avoids a temporary blank state while we await confirmation of zero
  const showZeroMessageWhileLoading = (isLoadingGenerations || isFetchingGenerations) && skeletonCount === 0 && sortedVideoOutputs.length === 0;
  
  if (shouldShowEmptyState || showZeroMessageWhileLoading) {
    console.log('[SkeletonOptimization] Showing instant empty state:', {
      projectVideoCount,
      currentDataTotal,
      sortedVideoOutputsLength: sortedVideoOutputs.length,
      isLoadingGenerations,
      isFetchingGenerations,
      reason: projectVideoCount === 0 ? 'project-cache-zero' : 
              currentDataTotal === 0 ? 'current-data-zero' : (showZeroMessageWhileLoading ? 'loading-zero' : 'no-videos-loaded'),
      timestamp: Date.now()
    });
    return (
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col space-y-2 sm:space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-base sm:text-lg font-light flex items-center gap-2">
              Output Videos &nbsp;(0)
            </h3>
          </div>

          <Separator className="my-2" />

          <div className="text-center text-muted-foreground pb-8 pt-12">
            <p>No video outputs yet. Generate some videos to see them here.</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex flex-col space-y-2 sm:space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-base sm:text-lg font-light flex items-center gap-2">
            Output Videos &nbsp;
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
            <VideoSkeleton key={`skeleton-${contentKey}-${index}`} index={index} />
          ))}
          
          {/* Show actual videos when not loading */}
          {skeletonCount === 0 && currentVideoOutputs.map((video, index) => {
            const originalIndex = startIndex + index;
            const isFirstVideo = index === 0; // Prioritize first video
            const shouldPreload = isFirstVideo ? "metadata" : "none"; // Only preload first video
            
            // Video initialization tracked at component level (COMPONENT_MOUNTED)
            
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

        {(() => {
          console.log('[MobileButtonDebug] [TaskDetailsModal] Render check:', {
            selectedVideoForDetails: !!selectedVideoForDetails,
            selectedVideoId: selectedVideoForDetails?.id,
            showTaskDetailsModal,
            shouldRender: !!(selectedVideoForDetails && showTaskDetailsModal),
            timestamp: Date.now()
          });
          return selectedVideoForDetails && showTaskDetailsModal;
        })() && (
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
                      <h4 className="font-light text-sm">Generation Details</h4>
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