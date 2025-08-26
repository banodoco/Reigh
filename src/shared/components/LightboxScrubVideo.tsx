import React, { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { getDisplayUrl } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { getAutoplayContext, logAutoplayAttempt, trackVideoStates } from '@/shared/utils/autoplayDebugger';

interface LightboxScrubVideoProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onTouchEnd'> {
  /**
   * Source URL for the video. Can be a full URL or relative path handled by getDisplayUrl.
   */
  src: string;
  /**
   * Optional poster (thumbnail) URL.
   */
  poster?: string;
  /**
   * Extra className applied to the root div.
   */
  className?: string;
  /**
   * Extra className applied to the underlying <video> element.
   */
  videoClassName?: string;
  /**
   * Loop the video (defaults to true).
   */
  loop?: boolean;
  /**
   * Mute the video (defaults to true).
   */
  muted?: boolean;
  /**
   * Handle double-click events (desktop only).
   */
  onDoubleClick?: () => void;
  /**
   * Handle touch end events (mobile only).
   */
  onTouchEnd?: (e: React.TouchEvent<HTMLVideoElement>) => void;
  preload?: 'auto' | 'metadata' | 'none';
  showSpeedControls?: boolean;
  speedControlsPosition?: 'top-left' | 'bottom-center';
}

/**
 * Video component for lightbox usage that plays on loop by default and allows scrubbing on hover.
 * Unlike HoverScrubVideo, this starts playing automatically and only scrubs during active hover/mouse movement.
 */
const LightboxScrubVideo: React.FC<LightboxScrubVideoProps> = ({
  src,
  poster,
  className,
  videoClassName,
  loop = true,
  muted = true,
  onDoubleClick,
  onTouchEnd,
  preload: preloadProp = 'metadata',
  showSpeedControls = false,
  speedControlsPosition = 'top-left',
  ...rest
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringRef = useRef(false);
  const isScrubbingRef = useRef(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [duration, setDuration] = useState(0);
  const [scrubberPosition, setScrubberPosition] = useState<number | null>(null);
  const [scrubberVisible, setScrubberVisible] = useState(false);
  const speedOptions = [0.25, 0.5, 1, 1.5, 2];
  const isMobile = useIsMobile();

  const startAutoPlay = useCallback(() => {
    if (videoRef.current && !isScrubbingRef.current) {
      // Check if video is already playing to prevent restart
      if (!videoRef.current.paused) {
        console.log('[AutoplayDebugger:LIGHTBOX] Video already playing, skipping autoplay', {
          src: videoRef.current.src,
          currentTime: videoRef.current.currentTime,
          timestamp: Date.now()
        });
        return;
      }

      // CRITICAL iOS FIX: Ensure muted + playsInline for autoplay compliance
      videoRef.current.muted = true;
      videoRef.current.setAttribute('muted', '');
      videoRef.current.setAttribute('playsinline', '');
      
      // COMPREHENSIVE AUTOPLAY CONTEXT LOGGING
      const allVideos = document.querySelectorAll('video');
      const playingVideos = Array.from(allVideos).filter(v => !v.paused);
      const videoSources = Array.from(allVideos).map(v => ({
        src: v.src?.substring(v.src.lastIndexOf('/') + 1) || 'no-src',
        paused: v.paused,
        muted: v.muted,
        readyState: v.readyState,
        currentTime: v.currentTime
      }));
      
      console.log('[AutoplayDebugger:LIGHTBOX] 🚀 ATTEMPTING AUTOPLAY', {
        // Video context
        targetVideoSrc: videoRef.current.src,
        targetVideoPaused: videoRef.current.paused,
        targetVideoReadyState: videoRef.current.readyState,
        targetVideoCurrentTime: videoRef.current.currentTime,
        targetVideoMuted: videoRef.current.muted,
        
        // Page video context
        totalVideosOnPage: allVideos.length,
        playingVideosCount: playingVideos.length,
        allVideoStates: videoSources,
        
        // Browser context
        isMobile,
        userAgent: navigator.userAgent,
        
        // User interaction context
        documentHasFocus: document.hasFocus(),
        documentVisibilityState: document.visibilityState,
        
        timestamp: Date.now()
      });
      
      // Get comprehensive autoplay context before attempting play
      const autoplayContext = getAutoplayContext(isMobile);
      
      // Track all video states before autoplay attempt
      trackVideoStates();
      
      const playPromise = videoRef.current.play();
      
      playPromise.then(() => {
        logAutoplayAttempt(autoplayContext, videoRef.current!.src, true);
      }).catch((error) => {
        logAutoplayAttempt(autoplayContext, videoRef.current!.src, false, error);
      });
    }
  }, [isMobile]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Skip mouse interactions on mobile devices
    if (isMobile) return;
    if (!videoRef.current || !containerRef.current || duration === 0) return;

    isScrubbingRef.current = true;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const progress = Math.max(0, Math.min(1, mouseX / rect.width));
    const targetTime = progress * duration;

    // Update scrubber position (percentage) and make it visible
    setScrubberPosition(progress * 100);
    setScrubberVisible(true);

    // Pause the video and seek to the position
    videoRef.current.pause();
    videoRef.current.currentTime = targetTime;

    // Clear existing timeout
    if (mouseMoveTimeoutRef.current) {
      clearTimeout(mouseMoveTimeoutRef.current);
    }

    // Set a new timeout to start playing after mouse stops moving
    mouseMoveTimeoutRef.current = setTimeout(() => {
      if (isHoveringRef.current) {
        // Hide scrubber and resume playing
        setScrubberVisible(false);
        isScrubbingRef.current = false;
        startAutoPlay();
      }
    }, 200); // Resume playing 200ms after mouse stops moving
  }, [duration, isMobile, startAutoPlay]);

  const handleMouseEnter = useCallback(() => {
    // Skip hover interactions on mobile devices
    if (isMobile) return;
    
    isHoveringRef.current = true;
    // Don't pause immediately - let the video continue playing until user starts scrubbing
  }, [isMobile]);

  const handleMouseLeave = useCallback(() => {
    // Skip hover interactions on mobile devices
    if (isMobile) return;
    
    isHoveringRef.current = false;
    isScrubbingRef.current = false;
    setScrubberPosition(null); // Hide scrubber
    setScrubberVisible(false);
    
    if (mouseMoveTimeoutRef.current) {
      clearTimeout(mouseMoveTimeoutRef.current);
      mouseMoveTimeoutRef.current = null;
    }
    
    // Resume auto-playing when mouse leaves
    startAutoPlay();
  }, [isMobile, startAutoPlay]);

  const handleSpeedChange = (speed: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      setPlaybackRate(speed);
    }
  };

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      // Don't autoplay here - let the useEffect handle it to prevent multiple attempts
      console.log('[LightboxAutoplay] Metadata loaded, duration set', {
        duration: videoRef.current.duration,
        timestamp: Date.now()
      });
    }
  }, []);

  // Initialize video and start auto-play
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setDuration(0);

    // DEEP DEBUG: Log lightbox video initialization context
    const pageVideoCount = document.querySelectorAll('video').length;
    const galleryVideos = document.querySelectorAll('[data-video-id]').length;
    
    const initContext = getAutoplayContext(isMobile);
    console.log('[AutoplayDebugger:LIGHTBOX] 🎭 INITIALIZING', {
      videoSrc: video.src?.substring(video.src.lastIndexOf('/') + 1) || 'no-src',
      autoplayContext: initContext,
      initializationState: {
        pageVideoCount,
        galleryVideos,
        documentFocused: document.hasFocus()
      },
      timestamp: Date.now()
    });

    // Track if we've attempted autoplay to avoid multiple attempts
    let hasAttemptedAutoplay = false;

    const attemptAutoplay = () => {
      if (!hasAttemptedAutoplay && !isScrubbingRef.current) {
        console.log('[LightboxAutoplay] attemptAutoplay called', {
          hasAttemptedAutoplay,
          isScrubbingRef: isScrubbingRef.current,
          videoPaused: video.paused,
          currentTime: video.currentTime,
          readyState: video.readyState,
          isMobile,
          timestamp: Date.now()
        });
        hasAttemptedAutoplay = true;
        // iOS CRITICAL FIX: Force load() only if video hasn't loaded at all (readyState 0)
        // Avoid load() if video has any data to prevent flicker/reset
        if (isMobile && video.readyState === 0) {
          console.log('[AutoplayDebugger:LIGHTBOX] 🔄 Forcing video.load() for iOS (readyState 0)', {
            readyState: video.readyState,
            timestamp: Date.now()
          });
          try {
            video.load();
          } catch (e) {
            console.warn('[AutoplayDebugger:LIGHTBOX] video.load() failed', e);
          }
        } else if (isMobile && video.readyState > 0) {
          console.log('[AutoplayDebugger:LIGHTBOX] ⏭️ Skipping load() - video already has data', {
            readyState: video.readyState,
            reason: 'Avoid flicker/reset',
            timestamp: Date.now()
          });
        }
        startAutoPlay();
      } else if (!video.paused) {
        console.log('[LightboxAutoplay] Skipping autoplay - already playing', {
          currentTime: video.currentTime,
          timestamp: Date.now()
        });
      }
    };

    const handleCanPlay = () => {
      const canPlayContext = getAutoplayContext(isMobile);
      console.log('[AutoplayDebugger:LIGHTBOX] 🟢 canplay event', {
        videoState: {
          readyState: video.readyState,
          paused: video.paused,
          src: video.src?.substring(video.src.lastIndexOf('/') + 1) || 'no-src'
        },
        autoplayContext: canPlayContext,
        timestamp: Date.now()
      });
      // Primary autoplay trigger
      attemptAutoplay();
    };

    const handleLoadedData = () => {
      const loadedDataContext = getAutoplayContext(isMobile);
      console.log('[AutoplayDebugger:LIGHTBOX] 🟡 loadeddata event', {
        videoState: {
          readyState: video.readyState,
          paused: video.paused,
          src: video.src?.substring(video.src.lastIndexOf('/') + 1) || 'no-src'
        },
        autoplayContext: loadedDataContext,
        timestamp: Date.now()
      });
      // Fallback for iOS/iPadOS when canplay doesn't fire reliably with multiple videos
      // Use a small delay to ensure the video is truly ready
      setTimeout(() => {
        const timeoutContext = getAutoplayContext(isMobile);
        console.log('[AutoplayDebugger:LIGHTBOX] ⏰ Autoplay timeout triggered', {
          hasAttemptedAutoplay,
          videoPaused: video.paused,
          autoplayContext: timeoutContext,
          timeoutReason: 'iOS/iPadOS loadeddata fallback',
          timestamp: Date.now()
        });
        attemptAutoplay();
      }, 100);
    };

    const handleEnded = () => {
      // Restart from beginning when video ends (if loop is enabled)
      if (loop && !isScrubbingRef.current) {
        hasAttemptedAutoplay = false; // Reset for loop
        startAutoPlay();
      }
    };

    // iOS/iPadOS specific: Also try on first user interaction if autoplay hasn't started
    const handleFirstInteraction = () => {
              const gestureContext = getAutoplayContext(isMobile);
        console.log('[AutoplayDebugger:LIGHTBOX] 💆 User gesture detected', {
          hasAttemptedAutoplay,
          videoPaused: video.paused,
          autoplayContext: gestureContext,
          interactionType: 'first-touch-or-click',
          timestamp: Date.now()
        });
      
      if (!hasAttemptedAutoplay && video.paused) {
        // iOS FIX: Force load() only if video hasn't loaded at all (readyState 0)
        if (video.readyState === 0) {
          try { 
            video.load(); 
            console.log('[AutoplayDebugger:LIGHTBOX] 🔄 Forced video.load() on user gesture (readyState 0)');
          } catch (e) {
            console.warn('[AutoplayDebugger:LIGHTBOX] video.load() on gesture failed', e);
          }
        } else {
          console.log('[AutoplayDebugger:LIGHTBOX] ⏭️ Skipping load() on gesture - video has data', {
            readyState: video.readyState,
            timestamp: Date.now()
          });
        }
        attemptAutoplay();
      }
    };

    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('ended', handleEnded);
    
    // Add interaction listeners for iOS/iPadOS autoplay policy workaround
    if (isMobile) {
      document.addEventListener('touchstart', handleFirstInteraction, { once: true });
      document.addEventListener('click', handleFirstInteraction, { once: true });
    }

    // CRITICAL iOS FALLBACK: Try autoplay on mount after brief delay
    // This works when the lightbox opens from a user gesture (poster click)
    if (isMobile) {
      const mountTimeoutId = setTimeout(() => {
        console.log('[AutoplayDebugger:LIGHTBOX] 🚨 MOUNT FALLBACK AUTOPLAY', {
          hasAttemptedAutoplay,
          videoPaused: video.paused,
          readyState: video.readyState,
          src: video.src?.substring(video.src.lastIndexOf('/') + 1) || 'no-src',
          reason: 'iOS mount-time fallback after poster click',
          timestamp: Date.now()
        });
        
        if (!hasAttemptedAutoplay && video.paused) {
          // Force load and play only if video hasn't loaded (readyState 0)
          if (video.readyState === 0) {
            try {
              video.load();
              console.log('[AutoplayDebugger:LIGHTBOX] 🔄 Mount fallback: forced video.load() (readyState 0)');
            } catch (e) {
              console.warn('[AutoplayDebugger:LIGHTBOX] Mount fallback: video.load() failed', e);
            }
          } else {
            console.log('[AutoplayDebugger:LIGHTBOX] ⏭️ Mount fallback: skipping load() - video has data', {
              readyState: video.readyState,
              timestamp: Date.now()
            });
          }
          attemptAutoplay();
        }
      }, 200); // Small delay to let poster click gesture context persist

      return () => {
        clearTimeout(mountTimeoutId);
        if (video) {
          video.removeEventListener('canplay', handleCanPlay);
          video.removeEventListener('loadeddata', handleLoadedData);
          video.removeEventListener('ended', handleEnded);
        }
        if (isMobile) {
          document.removeEventListener('touchstart', handleFirstInteraction);
          document.removeEventListener('click', handleFirstInteraction);
        }
        if (mouseMoveTimeoutRef.current) {
          clearTimeout(mouseMoveTimeoutRef.current);
          mouseMoveTimeoutRef.current = null;
        }
      };
    }

    return () => {
      if (video) {
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('loadeddata', handleLoadedData);
        video.removeEventListener('ended', handleEnded);
      }
      if (isMobile) {
        document.removeEventListener('touchstart', handleFirstInteraction);
        document.removeEventListener('click', handleFirstInteraction);
      }
      if (mouseMoveTimeoutRef.current) {
        clearTimeout(mouseMoveTimeoutRef.current);
        mouseMoveTimeoutRef.current = null;
      }
    };
  }, [src, loop, startAutoPlay, isMobile]);

  return (
    <div
      ref={containerRef}
      className={cn('relative group', className)}
      onMouseEnter={isMobile ? undefined : handleMouseEnter}
      onMouseLeave={isMobile ? undefined : handleMouseLeave}
      onMouseMove={isMobile ? undefined : handleMouseMove}
      {...rest}
    >
      <video
        ref={videoRef}
        src={getDisplayUrl(src)}
        poster={poster ? getDisplayUrl(poster) : undefined}
        preload={isMobile ? 'auto' : preloadProp}
        controls={false}
        onLoadedMetadata={handleLoadedMetadata}
        loop={loop}
        muted={true}
        autoPlay={false} // We control play/pause manually
        playsInline={true}
        className={cn('w-full h-full object-contain', videoClassName)}
        onDoubleClick={onDoubleClick}
        onTouchEnd={onTouchEnd}
        data-lightbox-video="true"
      >
        Your browser does not support the video tag.
      </video>

      {/* Scrubber Line - Desktop only */}
      {!isMobile && scrubberPosition !== null && (
        <div 
          className={cn(
            "absolute top-0 bottom-0 w-0.5 bg-white shadow-lg z-30 pointer-events-none transition-opacity duration-300",
            scrubberVisible ? "opacity-100" : "opacity-0"
          )}
          style={{ left: `${scrubberPosition}%` }}
        >
          {/* Scrubber handle/dot */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg border-2 border-black/20" />
          
          {/* Time indicator */}
          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
            {duration > 0 && (
              `${Math.floor((scrubberPosition / 100) * duration)}s / ${Math.floor(duration)}s`
            )}
          </div>
        </div>
      )}

      {/* Speed controls overlay - Desktop only */}
      {!isMobile && showSpeedControls && (
        <div 
          className={cn(
            'absolute flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-md px-2 py-1 backdrop-blur-sm z-20',
            speedControlsPosition === 'top-left' 
              ? 'top-2 left-2' 
              : 'bottom-2 left-1/2 -translate-x-1/2'
          )}
        >
          {speedOptions.map((speed) => (
            <Button
              key={speed}
              variant={playbackRate === speed ? 'default' : 'secondary'}
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleSpeedChange(speed);
              }}
              className={cn(
                'h-5 min-w-[36px] px-1.5 text-xs',
                playbackRate === speed ? 'text-white' : 'text-foreground'
              )}
            >
              {speed}x
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LightboxScrubVideo;
