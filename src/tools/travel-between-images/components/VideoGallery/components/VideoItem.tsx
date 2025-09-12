import React, { useState, useRef, useEffect } from 'react';

// TypeScript declaration for global mobile video preload map
declare global {
  interface Window {
    mobileVideoPreloadMap?: Map<number, () => void>;
  }
}
import { GenerationRow } from '@/types/shots';
import { Button } from '@/shared/components/ui/button';
import { Trash2, Info } from 'lucide-react';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';
import { TimeStamp } from '@/shared/components/TimeStamp';
import { useVideoLoader, useThumbnailLoader, useVideoElementIntegration } from '../hooks';
import { determineVideoPhase, createLoadingSummary } from '../utils/video-loading-utils';
import { getDisplayUrl } from '@/shared/lib/utils';

interface VideoItemProps {
  video: GenerationRow;
  index: number;
  originalIndex: number;
  isFirstVideo: boolean;
  shouldPreload: string;
  isMobile: boolean;
  projectAspectRatio?: string;
  onLightboxOpen: (index: number) => void;
  onMobileTap: (index: number) => void;
  onMobilePreload?: (index: number) => void;
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
  projectAspectRatio,
  onLightboxOpen, 
  onMobileTap, 
  onMobilePreload,
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
  const { 
    thumbnailLoaded, 
    setThumbnailLoaded, 
    thumbnailError, 
    setThumbnailError, 
    hasThumbnail,
    isInitiallyCached,
    inPreloaderCache,
    inBrowserCache
  } = thumbnailLoader;

  // DEEP DEBUG: Log thumbnail state changes
  useEffect(() => {
    console.log(`[VideoGalleryPreload] VIDEO_ITEM_THUMBNAIL_STATE:`, {
      videoId: video.id?.substring(0, 8),
      thumbnailLoaded,
      thumbnailError,
      hasThumbnail,
      isInitiallyCached,
      inPreloaderCache,
      inBrowserCache,
      timestamp: Date.now()
    });
  }, [video.id, thumbnailLoaded, thumbnailError, hasThumbnail, isInitiallyCached, inPreloaderCache, inBrowserCache]);
  
  // Hook for video element integration
  useVideoElementIntegration(video, index, shouldLoad, shouldPreload, videoLoader);
  
  // ===============================================================================
  // VIDEO TRANSITION STATE - Smooth transition from thumbnail to video
  // ===============================================================================
  
  // Track when video is fully visible to prevent flashing
  const [videoFullyVisible, setVideoFullyVisible] = useState(false);
  
  // ===============================================================================
  // MOBILE PRELOADING STATE - Video preloading on first tap
  // ===============================================================================
  
  // Track mobile video preloading state
  const [isMobilePreloading, setIsMobilePreloading] = useState(false);
  const preloadVideoRef = useRef<HTMLVideoElement | null>(null);
  
  // ===============================================================================
  // MOBILE VIDEO PRELOADING FUNCTION
  // ===============================================================================
  
  const startMobileVideoPreload = React.useCallback(() => {
    if (!isMobile || isMobilePreloading || preloadVideoRef.current) {
      console.log('[MobilePreload] Skipping preload', {
        videoId: video.id?.substring(0, 8),
        isMobile,
        isMobilePreloading,
        hasExistingPreloadVideo: !!preloadVideoRef.current,
        timestamp: Date.now()
      });
      return;
    }
    
    console.log('[MobilePreload] Starting video preload', {
      videoId: video.id?.substring(0, 8),
      videoSrc: video.location?.substring(video.location.lastIndexOf('/') + 1) || 'no-src',
      timestamp: Date.now()
    });
    
    setIsMobilePreloading(true);
    
    // Create hidden video element for preloading
    const preloadVideo = document.createElement('video');
    const resolvedSrc = getDisplayUrl((video.location || video.imageUrl || '') as string);
    preloadVideo.src = resolvedSrc;
    preloadVideo.preload = 'auto';
    preloadVideo.muted = true;
    preloadVideo.playsInline = true;
    preloadVideo.style.display = 'none';
    preloadVideo.style.position = 'absolute';
    preloadVideo.style.top = '-9999px';
    preloadVideo.style.left = '-9999px';
    
    // Add event listeners for preload tracking
    const handleCanPlay = () => {
      console.log('[MobilePreload] Video can play - preload successful', {
        videoId: video.id?.substring(0, 8),
        readyState: preloadVideo.readyState,
        timestamp: Date.now()
      });
    };
    
    const handleLoadedData = () => {
      console.log('[MobilePreload] Video data loaded - preload progressing', {
        videoId: video.id?.substring(0, 8),
        readyState: preloadVideo.readyState,
        timestamp: Date.now()
      });
    };
    
    const handleError = () => {
      console.warn('[MobilePreload] Video preload failed', {
        videoId: video.id?.substring(0, 8),
        error: preloadVideo.error,
        timestamp: Date.now()
      });
    };
    
    preloadVideo.addEventListener('canplay', handleCanPlay);
    preloadVideo.addEventListener('loadeddata', handleLoadedData);
    preloadVideo.addEventListener('error', handleError);
    
    // Store ref and append to DOM (hidden)
    preloadVideoRef.current = preloadVideo;
    document.body.appendChild(preloadVideo);
    
    // Cleanup function
    const cleanup = () => {
      if (preloadVideoRef.current) {
        preloadVideoRef.current.removeEventListener('canplay', handleCanPlay);
        preloadVideoRef.current.removeEventListener('loadeddata', handleLoadedData);
        preloadVideoRef.current.removeEventListener('error', handleError);
        if (preloadVideoRef.current.parentNode) {
          preloadVideoRef.current.parentNode.removeChild(preloadVideoRef.current);
        }
        preloadVideoRef.current = null;
      }
    };
    
    // Auto-cleanup after 30 seconds if video not opened
    const timeoutId = setTimeout(() => {
      console.log('[MobilePreload] Auto-cleanup preload video after timeout', {
        videoId: video.id?.substring(0, 8),
        timestamp: Date.now()
      });
      cleanup();
      setIsMobilePreloading(false);
    }, 30000);
    
    // Store cleanup function for manual cleanup
    preloadVideo.dataset.cleanupTimeoutId = timeoutId.toString();
    
    return cleanup;
  }, [isMobile, isMobilePreloading, video.id, video.location, video.imageUrl]);
  
  // Cleanup preload video on unmount or video change
  useEffect(() => {
    return () => {
      if (preloadVideoRef.current) {
        const timeoutId = preloadVideoRef.current.dataset.cleanupTimeoutId;
        if (timeoutId) {
          clearTimeout(parseInt(timeoutId));
        }
        if (preloadVideoRef.current.parentNode) {
          preloadVideoRef.current.parentNode.removeChild(preloadVideoRef.current);
        }
        preloadVideoRef.current = null;
      }
    };
  }, [video.id]);
  
  // ===============================================================================
  // MOBILE PRELOAD TRIGGER - Connect to parent callback
  // ===============================================================================
  
  // Create stable preload handler for this video item
  const handleMobilePreload = React.useCallback(() => {
    startMobileVideoPreload();
  }, [startMobileVideoPreload]);
  
  // Expose preload function to parent via callback effect
  React.useEffect(() => {
    if (onMobilePreload) {
      // Store this video's preload function globally so parent can call it
      // We'll use a map keyed by originalIndex
      if (!window.mobileVideoPreloadMap) {
        window.mobileVideoPreloadMap = new Map();
      }
      window.mobileVideoPreloadMap.set(originalIndex, handleMobilePreload);
      
      return () => {
        window.mobileVideoPreloadMap?.delete(originalIndex);
      };
    }
  }, [originalIndex, handleMobilePreload, onMobilePreload]);
  
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
  // ASPECT RATIO CALCULATION - Dynamic aspect ratio based on project settings
  // ===============================================================================
  
  // Calculate aspect ratio for video container based on project dimensions
  const aspectRatioStyle = React.useMemo(() => {
    if (!projectAspectRatio) {
      return { aspectRatio: '16/9' }; // Default to 16:9 if no project aspect ratio
    }
    
    const [width, height] = projectAspectRatio.split(':').map(Number);
    if (width && height) {
      return { aspectRatio: `${width}/${height}` };
    }
    
    return { aspectRatio: '16/9' }; // Fallback to 16:9
  }, [projectAspectRatio]);

  // ===============================================================================
  // GRID LAYOUT CALCULATION - Dynamic grid based on project aspect ratio
  // ===============================================================================
  
  // Calculate grid classes based on project aspect ratio
  const gridClasses = React.useMemo(() => {
    if (!projectAspectRatio) {
      return "w-1/2 lg:w-1/3"; // Default: 2 per row mobile, 3 per row desktop
    }
    
    const [width, height] = projectAspectRatio.split(':').map(Number);
    if (width && height) {
      const aspectRatio = width / height;
      
      // For very wide aspect ratios (16:9 and wider), show 2 videos per row
      if (aspectRatio >= 16/9) {
        return "w-1/2"; // 2 videos per row on all screen sizes
      }
      // For very narrow aspect ratios (narrower than 4:3), show 4 videos per row
      else if (aspectRatio < 4/3) {
        return "w-1/4 sm:w-1/4"; // 4 videos per row on all screen sizes
      }
      // For moderate aspect ratios (4:3 to 16:9), use responsive layout
      else {
        return "w-1/2 lg:w-1/3"; // 2 per row mobile, 3 per row desktop
      }
    }
    
    return "w-1/2 lg:w-1/3"; // Fallback
  }, [projectAspectRatio]);

  // ===============================================================================
  // RENDER - Clean component rendering
  // ===============================================================================

  // MOBILE OPTIMIZATION: Use poster images instead of video elements on mobile to prevent autoplay budget exhaustion
  // ALL gallery videos use posters on mobile to leave maximum budget for lightbox autoplay
  const shouldUsePosterOnMobile = isMobile;
  
  // Determine poster image source: prefer thumbnail, fallback to video poster frame
  const posterImageSrc = (() => {
    if (video.thumbUrl) return video.thumbUrl; // Use thumbnail if available
    if (video.location) return video.location; // Use video URL (browser will show first frame)
    return video.imageUrl; // Final fallback
  })();
  
  if (process.env.NODE_ENV === 'development' && shouldUsePosterOnMobile) {
    console.log('[AutoplayDebugger:GALLERY] 📱 Using poster optimization', {
      videoId: video.id?.substring(0, 8),
      hasThumbnail,
      posterSrc: posterImageSrc?.substring(posterImageSrc.lastIndexOf('/') + 1) || 'none',
      reason: 'Mobile optimization - ALL gallery videos use posters to maximize lightbox autoplay budget',
      timestamp: Date.now()
    });
  }

  return (
    <div className={`${gridClasses} px-1 sm:px-1.5 md:px-2 mb-2 sm:mb-3 md:mb-4 relative group`}>
      <div 
        className="bg-gray-100 rounded-lg overflow-hidden shadow-sm border relative"
        style={aspectRatioStyle}
      >
        
        {shouldUsePosterOnMobile ? (
          // MOBILE POSTER MODE: Show static image - clickable to open lightbox
          <div 
            className="absolute inset-0 w-full h-full cursor-pointer"
            onClick={(e) => {
              // Don't interfere with touches inside action buttons
              const path = (e as any).nativeEvent?.composedPath?.() as HTMLElement[] | undefined;
              const isInsideButton = path ? path.some((el) => (el as HTMLElement)?.tagName === 'BUTTON' || (el as HTMLElement)?.closest?.('button')) : !!(e.target as HTMLElement).closest('button');
              if (isInsideButton) return;
              e.preventDefault();
              e.stopPropagation();
              if (process.env.NODE_ENV === 'development') {
                console.log('[AutoplayDebugger:GALLERY] 📱 Poster clicked, opening lightbox', {
                  videoId: video.id?.substring(0, 8),
                  originalIndex,
                  timestamp: Date.now()
                });
              }
              onMobileTap(originalIndex);
            }}
            onTouchEnd={isMobile ? (e) => {
              // Don't interfere with touches inside action buttons
              const path = (e as any).nativeEvent?.composedPath?.() as HTMLElement[] | undefined;
              const isInsideButton = path ? path.some((el) => (el as HTMLElement)?.tagName === 'BUTTON' || (el as HTMLElement)?.closest?.('button')) : !!(e.target as HTMLElement).closest('button');
              if (isInsideButton) return;
              e.preventDefault();
              e.stopPropagation();
              if (process.env.NODE_ENV === 'development') {
                console.log('[AutoplayDebugger:GALLERY] 📱 Poster touched, opening lightbox', {
                  videoId: video.id?.substring(0, 8),
                  originalIndex,
                  timestamp: Date.now()
                });
              }
              onMobileTap(originalIndex);
            } : undefined}
          >
            <img
              src={posterImageSrc}
              alt="Video poster"
              loading="eager"
              decoding="sync"
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          // DESKTOP OR PRIORITY VIDEO MODE: Use actual video element
          <>
            {/* Thumbnail - shows immediately if available, stays visible until video fully transitions */}
            {hasThumbnail && !thumbnailError && (
              <img
                src={video.thumbUrl}
                alt="Video thumbnail"
                loading="eager"
                decoding="sync"
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
                  wasInitiallyCached: isInitiallyCached,
                  inPreloaderCache,
                  inBrowserCache,
                  timestamp: Date.now()
                });
                console.log(`[VideoGalleryPreload] THUMBNAIL_LOADED - URL: ${video.thumbUrl}`);
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
                console.warn(`[VideoGalleryPreload] THUMBNAIL_FAILED - URL: ${video.thumbUrl}`);
              }
            }}
          />
            )}
            
            {/* Loading placeholder - shows until thumbnail or video poster is ready */}
            {/* Don't show loading if thumbnail was initially cached */}
            {!thumbnailLoaded && !videoPosterLoaded && !isInitiallyCached && (() => {
              console.log(`[VideoGalleryPreload] VIDEO_ITEM_SHOWING_LOADING_SPINNER:`, {
                videoId: video.id?.substring(0, 8),
                thumbnailLoaded,
                videoPosterLoaded,
                isInitiallyCached,
                hasThumbnail,
                inPreloaderCache,
                inBrowserCache,
                reason: 'thumbnailLoaded=false AND videoPosterLoaded=false AND isInitiallyCached=false',
                timestamp: Date.now()
              });
              return (
                <div className={`absolute inset-0 bg-gray-200 flex items-center justify-center z-10 transition-opacity duration-300 ${videoFullyVisible ? 'opacity-0' : 'opacity-100'}`}>
                  <div className="w-6 h-6 border-2 border-gray-400 border-t-gray-600 rounded-full animate-spin"></div>
                </div>
              );
            })()}
            
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
                  poster={video.thumbUrl}
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
          </>
        )}
        
        {/* Action buttons – positioned directly on the video/poster container */}
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
        showOnHover={false}
      />
    </div>
  );
});
