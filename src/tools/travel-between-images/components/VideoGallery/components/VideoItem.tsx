import React, { useState, useRef, useEffect } from 'react';
import { GenerationRow } from '@/types/shots';
import { Button } from '@/shared/components/ui/button';
import { Trash2, Info } from 'lucide-react';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';
import { TimeStamp } from '@/shared/components/TimeStamp';
import { useVideoLoader, useThumbnailLoader, useVideoElementIntegration } from '../hooks';
import { determineVideoPhase, createLoadingSummary } from '../utils/video-loading-utils';

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

export const VideoItem = React.memo<VideoItemProps>(({ 
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
  // ===============================================================================
  // HOOKS - Use extracted hooks for cleaner separation of concerns
  // ===============================================================================
  
  const videoLoader = useVideoLoader(video, index, isFirstVideo, shouldPreload);
  const thumbnailLoader = useThumbnailLoader(video);
  
  // Destructure for easier access
  const { shouldLoad, videoMetadataLoaded, videoPosterLoaded, logVideoEvent } = videoLoader;
  const { thumbnailLoaded, setThumbnailLoaded, thumbnailError, setThumbnailError, hasThumbnail } = thumbnailLoader;
  
  // Hook for video element integration
  useVideoElementIntegration(video, index, shouldLoad, shouldPreload, videoLoader);
  
  // ===============================================================================
  // VIDEO TRANSITION STATE - Smooth transition from thumbnail to video
  // ===============================================================================
  
  // Track when video is fully visible to prevent flashing
  const [videoFullyVisible, setVideoFullyVisible] = useState(false);
  
  useEffect(() => {
    if (videoPosterLoaded) {
      // Delay hiding thumbnail until video transition completes
      const timer = setTimeout(() => {
        setVideoFullyVisible(true);
        if (process.env.NODE_ENV === 'development') {
          console.log(`🎬 [VideoLifecycle] Video ${index + 1} - TRANSITION_COMPLETE:`, {
            videoId: video.id,
            phase: 'TRANSITION_COMPLETE',
            thumbnailWillHide: true,
            videoFullyVisible: true,
            timestamp: Date.now()
          });
        }
      }, 350); // Slightly longer than the 300ms transition
      
      return () => clearTimeout(timer);
    } else {
      setVideoFullyVisible(false);
    }
  }, [videoPosterLoaded, index, video.id]);
  
  // ===============================================================================
  // STATE TRACKING - Unified video lifecycle logging
  // ===============================================================================
  
  const lastLoggedStateRef = useRef<string>('');
  useEffect(() => {
    const currentState = `${shouldLoad}-${videoPosterLoaded}-${videoMetadataLoaded}-${thumbnailLoaded}-${hasThumbnail}`;
    if (currentState !== lastLoggedStateRef.current && process.env.NODE_ENV === 'development') {
      const { phase, readyToShow } = determineVideoPhase(shouldLoad, videoPosterLoaded, videoMetadataLoaded, thumbnailLoaded, hasThumbnail);
      
      logVideoEvent(phase, {
        readyToShow,
        shouldLoad,
        videoPosterLoaded,
        videoMetadataLoaded,
        hasThumbnail,
        thumbnailLoaded,
        thumbnailError,
        thumbnailUrl: video.thumbUrl,
        videoUrl: video.location,
        summary: createLoadingSummary(hasThumbnail, thumbnailLoaded, videoPosterLoaded, shouldLoad)
      });
      
      lastLoggedStateRef.current = currentState;
    }
  }, [shouldLoad, videoPosterLoaded, videoMetadataLoaded, thumbnailLoaded, hasThumbnail, thumbnailError, logVideoEvent, video.thumbUrl, video.location]);

  // ===============================================================================
  // RENDER - Clean component rendering
  // ===============================================================================

  return (
    <div className="w-1/2 lg:w-1/3 px-1 sm:px-1.5 md:px-2 mb-2 sm:mb-3 md:mb-4 relative group">
      <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden shadow-sm border relative">
        {/* Thumbnail - shows immediately if available, stays visible until video fully transitions */}
        {hasThumbnail && !thumbnailError && (
          <img
            src={video.thumbUrl}
            alt="Video thumbnail"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
              videoFullyVisible ? 'opacity-0' : 'opacity-100'
            }`}
            onLoad={() => {
              setThumbnailLoaded(true);
              if (process.env.NODE_ENV === 'development') {
                console.log(`🎬 [VideoLifecycle] Video ${index + 1} - THUMBNAIL_LOADED:`, {
                  videoId: video.id,
                  thumbnailUrl: video.thumbUrl,
                  phase: 'THUMBNAIL_LOADED',
                  nextPhase: 'Will transition to video when ready',
                  timestamp: Date.now()
                });
              }
            }}
            onError={() => {
              setThumbnailError(true);
              if (process.env.NODE_ENV === 'development') {
                console.warn(`🎬 [VideoLifecycle] Video ${index + 1} - THUMBNAIL_FAILED:`, {
                  videoId: video.id,
                  thumbnailUrl: video.thumbUrl,
                  phase: 'THUMBNAIL_FAILED',
                  fallback: 'Will show video loading directly',
                  timestamp: Date.now()
                });
              }
            }}
          />
        )}
        
        {/* Loading placeholder - shows until thumbnail or video poster is ready */}
        {!thumbnailLoaded && !videoPosterLoaded && (
          <div className="absolute inset-0 bg-gray-200 flex items-center justify-center z-10">
            <div className="w-6 h-6 border-2 border-gray-400 border-t-gray-600 rounded-full animate-spin"></div>
          </div>
        )}
        
        {/* Only render video when it's time to load */}
        {shouldLoad && (
          <div className="relative w-full h-full">
            {/* HoverScrubVideo with loading optimization integration */}
            <HoverScrubVideo
              src={video.location || video.imageUrl}
              preload={shouldPreload as 'auto' | 'metadata' | 'none'}
              className={`w-full h-full transition-opacity duration-500 ${
                videoPosterLoaded ? 'opacity-100' : 'opacity-0 pointer-events-none'
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
