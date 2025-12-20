import React, { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { getDisplayUrl, stripQueryParameters } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { getAutoplayContext, logAutoplayAttempt, trackVideoStates } from '@/shared/utils/autoplayDebugger';

interface HoverScrubVideoProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onTouchEnd'> {
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
  showNativeControls?: boolean;
  speedControlsPosition?: 'top-left' | 'bottom-center';
  /**
   * Disable scrubbing behavior for lightbox/fullscreen usage (defaults to false).
   */
  disableScrubbing?: boolean;
  /**
   * Load video content on demand (first hover/interaction) for better performance
   */
  loadOnDemand?: boolean;
  /**
   * Lightweight thumbnail mode: disables scrubbing and heavy listeners/logging,
   * uses preload="none" for minimal overhead. Ideal for small previews.
   */
  thumbnailMode?: boolean;
  /**
   * Autoplays video on hover, disabling scrubbing (defaults to false).
   */
  autoplayOnHover?: boolean;
  /**
   * If true, do not set video src until user interaction. Only the poster is shown.
   */
  posterOnlyUntilClick?: boolean;
  /**
   * When true, toggle play/pause on click (helpful on mobile where hover is absent)
   */
  playOnClick?: boolean;
  /**
   * Callback for video load error
   */
  onVideoError?: React.ReactEventHandler<HTMLVideoElement>;
  /**
   * Callback for video load start
   */
  onLoadStart?: React.ReactEventHandler<HTMLVideoElement>;
  /**
   * Callback for video loaded data
   */
  onLoadedData?: React.ReactEventHandler<HTMLVideoElement>;
}

/**
 * Video component that scrubs based on mouse position and plays when mouse stops moving.
 */
const HoverScrubVideo: React.FC<HoverScrubVideoProps> = ({
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
  showNativeControls = false,
  speedControlsPosition = 'top-left',
  disableScrubbing = false,
  loadOnDemand = false,
  thumbnailMode = false,
  autoplayOnHover = false,
  posterOnlyUntilClick = false,
  playOnClick = false,
  onVideoError,
  onLoadStart,
  onLoadedData,
  ...rest
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringRef = useRef(false);
  // Track whether a play was explicitly initiated by the user
  const userInitiatedPlayRef = useRef(false);
  // Track the last mouse X position for re-calculating scrubber when metadata loads
  const lastMouseXRef = useRef<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [duration, setDuration] = useState(0);
  const [scrubberPosition, setScrubberPosition] = useState<number | null>(null);
  const [scrubberVisible, setScrubberVisible] = useState(true);
  const [hasLoadedOnDemand, setHasLoadedOnDemand] = useState(false);

  // When posterOnlyUntilClick is enabled, defer activation until interaction
  const [isActivated, setIsActivated] = useState<boolean>(() => !posterOnlyUntilClick);
  const speedOptions = [0.25, 0.5, 1, 1.5, 2];
  const isMobile = useIsMobile();
  
  // Safely handle potentially missing or placeholder sources
  const displaySrc = getDisplayUrl(src);
  const hasValidVideoSrc = displaySrc && displaySrc !== '/placeholder.svg';
  
  // Track stable source (without query params) to avoid resetting when only tokens change
  const stableSrcRef = useRef<string>(stripQueryParameters(src));
  
  // Debug mobile detection (development only)
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // Track video context when component mounts
      const autoplayContext = getAutoplayContext(isMobile);
      
      console.log('[AutoplayDebugger:GALLERY] 🎬 Video mounted', {
        videoType: disableScrubbing ? 'lightbox' : 'gallery',
        isMobile,
        src: src?.substring(src.lastIndexOf('/') + 1) || 'no-src',
        autoplayContext,
        componentState: {
          disableScrubbing,
          thumbnailMode,
          isEmulatedMobile: /Chrome/.test(navigator.userAgent) && isMobile
        },
        timestamp: Date.now()
      });
      
      // Track video states when new video mounts
      trackVideoStates();
    }
  }, [isMobile, src, poster, disableScrubbing, thumbnailMode]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    console.log('[SegmentCardPopulation] handleMouseMove called', {
      src: src?.substring(src.lastIndexOf('/') + 1) || 'no-src',
      isMobile,
      thumbnailMode,
      disableScrubbing,
      autoplayOnHover,
      loadOnDemand,
      hasLoadedOnDemand,
      hasVideoRef: !!videoRef.current,
      hasContainerRef: !!containerRef.current,
      duration,
      timestamp: Date.now()
    });
    
    // Skip hover interactions on mobile devices or when scrubbing is disabled
    if (isMobile || thumbnailMode || disableScrubbing || autoplayOnHover) {
      console.log('[SegmentCardPopulation] Skipping mouse move - conditions not met', {
        isMobile,
        thumbnailMode,
        disableScrubbing,
        autoplayOnHover
      });
      return;
    }

    // Store the mouse X position even if duration is 0, so we can calculate scrubber when metadata loads
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      lastMouseXRef.current = e.clientX - rect.left;
    }

    if (loadOnDemand && !hasLoadedOnDemand) {
      console.log('[SegmentCardPopulation] Load on demand - setting hasLoadedOnDemand');
      setHasLoadedOnDemand(true);
      // Fall through to allow scrubbing on the very first interaction
      // effectively treating the first hover as the "load trigger" AND the "scrub trigger"
    }

    if (!videoRef.current || !containerRef.current) {
      console.log('[SegmentCardPopulation] Missing refs', {
        hasVideoRef: !!videoRef.current,
        hasContainerRef: !!containerRef.current
      });
      return;
    }

    // Additional fallback: Prime video loading on mouse move if it still hasn't loaded
    if (preloadProp === 'none' && videoRef.current.readyState < 2) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[VideoStallFix] Fallback priming video load on mouse move', {
          src: src?.substring(src.lastIndexOf('/') + 1) || 'no-src',
          readyState: videoRef.current.readyState,
          timestamp: Date.now()
        });
      }
      try {
        videoRef.current.load();
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[VideoStallFix] Failed to prime video load on mouse move', e);
        }
      }
    }

    if (!Number.isFinite(duration) || duration <= 0) {
      console.log('[SegmentCardPopulation] Duration is invalid, skipping scrubbing (mouse position stored for later)', { duration });
      
      // Force load if video is stuck in HAVE_NOTHING state, even if preload is metadata
      // This fixes cases where the browser suspended loading or network is slow
      if (videoRef.current && videoRef.current.readyState === 0) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[VideoStallFix] Force loading video during scrub because duration is invalid and readyState is 0', {
            src: src?.substring(src.lastIndexOf('/') + 1) || 'no-src'
          });
        }
        videoRef.current.load();
      }
      return;
    }
    
    console.log('[SegmentCardPopulation] Processing mouse move for scrubbing', {
      duration,
      videoReadyState: videoRef.current.readyState,
      timestamp: Date.now()
    });

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    
    // Store the mouse X position for re-calculating when metadata loads
    lastMouseXRef.current = mouseX;
    
    const progress = Math.max(0, Math.min(1, mouseX / rect.width));
    const targetTime = progress * duration;

    // Validate targetTime before setting currentTime
    if (!Number.isFinite(targetTime)) {
      console.warn('[SegmentCardPopulation] Calculated targetTime is not finite, skipping', { targetTime, progress, duration });
      return;
    }

    // Update scrubber position (percentage) and make it visible
    setScrubberPosition(progress * 100);
    setScrubberVisible(true);

    // Pause the video and seek to the position
    videoRef.current.pause();
    videoRef.current.currentTime = targetTime;

    // Clear existing timeout
    if (mouseMoveTimeoutRef.current) {
      clearTimeout(mouseMoveTimeoutRef.current);
      mouseMoveTimeoutRef.current = null;
    }

    // Removed auto-play on stop hover as per user request
    // The video will only scrub, not play automatically
  }, [duration, isMobile, thumbnailMode, disableScrubbing, loadOnDemand, hasLoadedOnDemand, autoplayOnHover, preloadProp, src]);

  const handleMouseEnter = useCallback(() => {
    console.log('[SegmentCardPopulation] handleMouseEnter called', {
      src: src?.substring(src.lastIndexOf('/') + 1) || 'no-src',
      isMobile,
      disableScrubbing,
      autoplayOnHover,
      timestamp: Date.now()
    });
    
    // Skip hover interactions on mobile devices or when scrubbing is disabled
    if (isMobile || disableScrubbing) {
      console.log('[SegmentCardPopulation] Skipping mouse enter', {
        isMobile,
        disableScrubbing
      });
      if (isMobile) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[MobileVideoAutoplay] Mouse enter detected on mobile (should be ignored)', {
            src,
            timestamp: Date.now()
          });
        }
      }
      return;
    }

    if (autoplayOnHover) {
      console.log('[SegmentCardPopulation] Autoplay on hover enabled, playing video');
      videoRef.current?.play();
      return;
    }
    
    console.log('[SegmentCardPopulation] Setting isHoveringRef to true');
    isHoveringRef.current = true;
    if (videoRef.current) {
      // Fix for video stalling: Prime video loading on first hover
      // This ensures the video starts loading from a user interaction if it hasn't started yet
      // Removed check for preloadProp === 'none' to handle stalled metadata loads too
      if (videoRef.current.readyState === 0) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[VideoStallFix] Priming video load on hover (readyState=0)', {
            src: src?.substring(src.lastIndexOf('/') + 1) || 'no-src',
            preloadProp,
            timestamp: Date.now()
          });
        }
        try {
          videoRef.current.load();
        } catch (e) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[VideoStallFix] Failed to prime video load on hover', e);
          }
        }
      }
      
      // Don't start playing immediately, wait for mouse movement or timeout
      videoRef.current.pause();
    }
  }, [isMobile, disableScrubbing, autoplayOnHover, preloadProp, src]);

  const handleMouseLeave = useCallback(() => {
    // Skip hover interactions on mobile devices or when scrubbing is disabled
    if (isMobile || disableScrubbing) {
      if (isMobile) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[MobileVideoAutoplay] Mouse leave detected on mobile (should be ignored)', {
            src,
            timestamp: Date.now()
          });
        }
      }
      return;
    }

    if (autoplayOnHover) {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0; // Reset to beginning
      }
      return;
    }
    
    isHoveringRef.current = false;
    lastMouseXRef.current = null; // Clear stored mouse position
    setScrubberPosition(null); // Hide scrubber
    setScrubberVisible(true); // Reset visibility for next hover
    if (mouseMoveTimeoutRef.current) {
      clearTimeout(mouseMoveTimeoutRef.current);
      mouseMoveTimeoutRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      // Reset to beginning when mouse leaves
      videoRef.current.currentTime = 0;
    }
  }, [isMobile, disableScrubbing, autoplayOnHover]);

  const handleSpeedChange = (speed: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      setPlaybackRate(speed);
    }
  };

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      console.log('[SegmentCardPopulation] handleLoadedMetadata called', {
        src: src?.substring(src.lastIndexOf('/') + 1) || 'no-src',
        videoDuration: videoRef.current.duration,
        videoPaused: videoRef.current.paused,
        videoReadyState: videoRef.current.readyState,
        disableScrubbing,
        isHovering: isHoveringRef.current,
        lastMouseX: lastMouseXRef.current,
        timestamp: Date.now()
      });
      
      if (process.env.NODE_ENV === 'development' && !thumbnailMode) {
        console.log('[MobileVideoAutoplay] handleLoadedMetadata called', {
          isMobile,
          videoPaused: videoRef.current.paused,
          videoCurrentTime: videoRef.current.currentTime,
          videoDuration: videoRef.current.duration,
          videoSrc: videoRef.current.src,
          timestamp: Date.now()
        });
      }

      const newDuration = videoRef.current.duration;
      
      // Only set duration if valid
      if (!Number.isFinite(newDuration) || newDuration <= 0) {
        return;
      }
      
      setDuration(newDuration);
      console.log('[SegmentCardPopulation] Duration set to:', newDuration);
      
      // FIX: Recalculate scrubber position if user was hovering while metadata was loading
      // This fixes the issue where the scrubber doesn't appear on first hover of the first video
      if (!isMobile && !disableScrubbing && !thumbnailMode && isHoveringRef.current && lastMouseXRef.current !== null && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const progress = Math.max(0, Math.min(1, lastMouseXRef.current / rect.width));
        const targetTime = progress * newDuration;
        
        // Validate targetTime
        if (!Number.isFinite(targetTime)) {
          console.warn('[ScrubberFix] Calculated targetTime is not finite, skipping seek', { targetTime, progress, newDuration });
          return;
        }
        
        console.log('[ScrubberFix] Recalculating scrubber after metadata loaded while hovering', {
          src: src?.substring(src.lastIndexOf('/') + 1) || 'no-src',
          progress,
          targetTime,
          newDuration,
          timestamp: Date.now()
        });
        
        setScrubberPosition(progress * 100);
        setScrubberVisible(true);
        
        // Also seek to the position
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.currentTime = targetTime;
        }
      }
      
      // Ensure video is paused first to prevent autoplay
      if (!videoRef.current.paused) {
        if (process.env.NODE_ENV === 'development' && !thumbnailMode) {
          console.warn('[MobileVideoAutoplay] Video was playing during metadata load, pausing it', {
            isMobile,
            videoSrc: videoRef.current.src,
            timestamp: Date.now()
          });
        }
        videoRef.current.pause();
      }
      
      // Set to first frame to show as poster - but only for gallery thumbnails, not lightbox
      // IMPORTANT: Skip this if we already have a poster to avoid "weird reset" flashes
      if (!disableScrubbing && videoRef.current.currentTime === 0 && !poster) {
        // Very small seek to ensure first frame is visible
        videoRef.current.currentTime = 0.001;
        if (process.env.NODE_ENV === 'development' && !thumbnailMode) {
          console.log('[MobileVideoAutoplay] Set currentTime to show first frame (no poster present)', {
            isMobile,
            disableScrubbing,
            newCurrentTime: videoRef.current.currentTime,
            timestamp: Date.now()
          });
        }
      } else if (disableScrubbing || poster) {
        if (process.env.NODE_ENV === 'development' && !thumbnailMode) {
          console.log(`[MobileVideoAutoplay] Skipping currentTime manipulation (${disableScrubbing ? 'lightbox mode' : 'poster present'})`, {
            isMobile,
            disableScrubbing,
            hasPoster: !!poster,
            currentTime: videoRef.current.currentTime,
            timestamp: Date.now()
          });
        }
      }
    }
  }, [isMobile, disableScrubbing]);

  useEffect(() => {
    if (thumbnailMode) {
      // Skip attaching event listeners entirely in thumbnail mode
      return;
    }
    const video = videoRef.current;
    if (!video) return;

    const currentStableSrc = stripQueryParameters(src);
    const isActuallyNewSrc = currentStableSrc !== stableSrcRef.current;
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[MobileVideoAutoplay] useEffect[src] called', {
        isMobile,
        disableScrubbing,
        src: src?.substring(0, 50),
        isActuallyNewSrc,
        videoPaused: video.paused,
        videoCurrentTime: video.currentTime,
        timestamp: Date.now()
      });
    }

    // Update stable source ref
    stableSrcRef.current = currentStableSrc;

    // Only perform reset logic if the underlying source has actually changed
    if (isActuallyNewSrc) {
      // Ensure the video starts paused
      video.pause();
      // Important: never force-reset currentTime in lightbox (disableScrubbing=true)
      if (!disableScrubbing) {
        // Only reset currentTime for gallery thumbnails
        video.currentTime = 0;
      }
      setDuration(0);
    }

    // Add event listeners to track unexpected play events
    const handlePlay = () => {
      if (process.env.NODE_ENV === 'development') {
        // Get full autoplay context when video starts playing
        const autoplayContext = getAutoplayContext(isMobile);
        
        console.warn('[AutoplayDebugger:GALLERY] 🎯 Video STARTED playing', {
          videoSrc: video.src?.substring(video.src.lastIndexOf('/') + 1) || 'no-src',
          playTrigger: isHoveringRef.current ? 'hover' : 'unexpected',
          autoplayContext,
          playbackState: {
            currentTime: video.currentTime,
            readyState: video.readyState,
            muted: video.muted
          },
          componentState: {
            isMobile,
            disableScrubbing,
            isHovering: isHoveringRef.current
          },
          timestamp: Date.now()
        });
        
        // Log this as an autoplay attempt for tracking
        logAutoplayAttempt(autoplayContext, video.src, true);
      }
      
      // Only enforce anti-autoplay on mobile thumbnails (scrubbing enabled)
      // but allow if explicitly user-initiated (click/touch)
      if (!disableScrubbing && isMobile && !isHoveringRef.current && !userInitiatedPlayRef.current) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[AutoplayDebugger:GALLERY] 🚫 BLOCKED mobile autoplay', {
            videoSrc: video.src?.substring(video.src.lastIndexOf('/') + 1) || 'no-src',
            reason: 'Mobile gallery video should not autoplay',
            autoplayContext: getAutoplayContext(isMobile),
            blockingPolicy: 'Prevent gallery videos from autoplaying on mobile',
            timestamp: Date.now()
          });
        }
        video.pause();
      }
    };

    const handlePause = () => {
      if (process.env.NODE_ENV === 'development') {
        const autoplayContext = getAutoplayContext(isMobile);
        
        console.log('[AutoplayDebugger:GALLERY] ⏸️ Video paused', {
          videoSrc: video.src?.substring(video.src.lastIndexOf('/') + 1) || 'no-src',
          pauseTrigger: isHoveringRef.current ? 'hover-end' : 'programmatic',
          autoplayContext,
          playbackState: {
            currentTime: video.currentTime,
            readyState: video.readyState
          },
          componentState: {
            isMobile,
            isHovering: isHoveringRef.current
          },
          timestamp: Date.now()
        });
      }
      // Reset user-initiated flag on pause so future autoplays are blocked again
      userInitiatedPlayRef.current = false;
    };

    const handleSeeked = () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[MobileVideoAutoplay] Video seeked', {
          isMobile,
          disableScrubbing,
          src: video.src,
          currentTime: video.currentTime,
          paused: video.paused,
          timestamp: Date.now()
        });
      }
      
      // Only enforce pause-after-seek on mobile thumbnails, unless user initiated
      if (!disableScrubbing && isMobile && !userInitiatedPlayRef.current && !video.paused) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[MobileVideoAutoplay] Video started playing after seek on mobile thumbnail, pausing', {
            src: video.src,
            timestamp: Date.now()
          });
        }
        video.pause();
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeked', handleSeeked);

    return () => {
      if (video) {
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('seeked', handleSeeked);
        video.pause();
      }
      if (mouseMoveTimeoutRef.current) {
        clearTimeout(mouseMoveTimeoutRef.current);
        mouseMoveTimeoutRef.current = null;
      }
    };
  }, [src, isMobile, disableScrubbing, thumbnailMode]);

  // Additional mobile protection - use Intersection Observer to detect when video becomes visible
  // Only for gallery thumbnails, not lightbox
  useEffect(() => {
    if (!isMobile || !videoRef.current || disableScrubbing || thumbnailMode) return;

    const video = videoRef.current;
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            console.log('[MobileVideoAutoplay] Video thumbnail became visible on mobile', {
              src: video.src,
              videoPaused: video.paused,
              disableScrubbing,
              timestamp: Date.now()
            });
            
            // Ensure video thumbnail is paused when it comes into view on mobile
            if (!video.paused) {
              console.warn('[MobileVideoAutoplay] Video thumbnail was playing when it became visible, pausing it', {
                src: video.src,
                disableScrubbing,
                timestamp: Date.now()
              });
              video.pause();
            }
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(video);

    return () => {
      observer.disconnect();
    };
  }, [isMobile, src, disableScrubbing]);

  // Periodic mobile check to catch any unexpected play states - but only for gallery thumbnails
  useEffect(() => {
    if (!isMobile || disableScrubbing || thumbnailMode) return;

    const intervalId = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        console.warn('[MobileVideoAutoplay] Periodic check found video playing on mobile thumbnail, pausing it', {
          src: videoRef.current.src,
          currentTime: videoRef.current.currentTime,
          disableScrubbing,
          timestamp: Date.now()
        });
        videoRef.current.pause();
      }
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isMobile, src, disableScrubbing]);

  // Log component render state
  React.useEffect(() => {
    console.log('[SegmentCardPopulation] HoverScrubVideo render state', {
      src: src?.substring(src.lastIndexOf('/') + 1) || 'no-src',
      hasValidVideoSrc,
      displaySrc: displaySrc?.substring(displaySrc.lastIndexOf('/') + 1) || 'no-src',
      isMobile,
      disableScrubbing,
      thumbnailMode,
      duration,
      willAttachHandlers: !(isMobile || disableScrubbing || thumbnailMode),
      timestamp: Date.now()
    });
  }, [src, hasValidVideoSrc, displaySrc, isMobile, disableScrubbing, thumbnailMode, duration]);

  return (
    <div
      ref={containerRef}
      className={cn('relative group', className)}
      onMouseEnter={isMobile || disableScrubbing || thumbnailMode ? undefined : handleMouseEnter}
      onMouseLeave={isMobile || disableScrubbing || thumbnailMode ? undefined : handleMouseLeave}
      onMouseMove={isMobile || disableScrubbing || thumbnailMode ? undefined : handleMouseMove}
      {...rest}
    >
      <video
        ref={videoRef}
        src={hasValidVideoSrc ? displaySrc : undefined}
        poster={poster ? getDisplayUrl(poster) : undefined}
        preload={thumbnailMode ? 'none' : (isMobile ? 'metadata' : preloadProp)}
        controls={showNativeControls}
        onLoadedMetadata={handleLoadedMetadata}
        loop={loop}
        muted={muted}
        autoPlay={false}
        playsInline
        className={cn('w-full h-full object-contain', videoClassName, {
          'hide-video-controls': !showNativeControls
        })}
        onDoubleClick={onDoubleClick}
        onTouchEnd={(e) => {
          if (process.env.NODE_ENV === 'development' && !thumbnailMode) {
            console.log('[MobileVideoAutoplay] onTouchEnd called', {
              isMobile,
              src: getDisplayUrl(src),
              videoPaused: videoRef.current?.paused,
              timestamp: Date.now()
            });
          }
          onTouchEnd?.(e);
        }}
        onTouchStart={(e) => {
          if (process.env.NODE_ENV === 'development' && !thumbnailMode) {
            console.log('[MobileVideoAutoplay] onTouchStart called', {
              isMobile,
              src: getDisplayUrl(src),
              videoPaused: videoRef.current?.paused,
              timestamp: Date.now()
            });
          }
        }}
        onTouchMove={(e) => {
          if (process.env.NODE_ENV === 'development' && !thumbnailMode) {
            console.log('[MobileVideoAutoplay] onTouchMove called', {
              isMobile,
              src: getDisplayUrl(src),
              videoPaused: videoRef.current?.paused,
              timestamp: Date.now()
            });
          }
        }}
        onClick={(e) => {
          if (process.env.NODE_ENV === 'development' && !thumbnailMode) {
            console.log('[MobileVideoAutoplay] onClick called', {
              isMobile,
              src: getDisplayUrl(src),
              videoPaused: videoRef.current?.paused,
              timestamp: Date.now()
            });
          }

        }}
        onLoadStart={(e) => {
          if (process.env.NODE_ENV === 'development' && !thumbnailMode) {
            console.log('[MobileVideoAutoplay] onLoadStart called', {
              isMobile,
              src: getDisplayUrl(src),
              timestamp: Date.now()
            });
          }
          onLoadStart?.(e);
        }}
        onLoadedData={(e) => {
          if (process.env.NODE_ENV === 'development' && !thumbnailMode) {
            console.log('[MobileVideoAutoplay] onLoadedData called', {
              isMobile,
              src: getDisplayUrl(src),
              videoPaused: videoRef.current?.paused,
              timestamp: Date.now()
            });
          }
          onLoadedData?.(e);
        }}
        onCanPlay={() => {
          if (process.env.NODE_ENV === 'development' && !thumbnailMode) {
            console.log('[MobileVideoAutoplay] onCanPlay called', {
              isMobile,
              src: getDisplayUrl(src),
              videoPaused: videoRef.current?.paused,
              posterSrc: poster ? getDisplayUrl(poster) : 'none',
              timestamp: Date.now()
            });
          }
          // Prevent autoplay on mobile only for gallery thumbnails (scrubbing enabled)
          if (!disableScrubbing && isMobile && videoRef.current && !videoRef.current.paused) {
            if (process.env.NODE_ENV === 'development' && !thumbnailMode) {
              console.warn('[MobileVideoAutoplay] Forcing pause on canPlay event (mobile thumbnail)', {
                src: getDisplayUrl(src),
                timestamp: Date.now()
              });
            }
            videoRef.current.pause();
          }
        }}
        onError={(e) => {
          if (process.env.NODE_ENV === 'development') {
            console.error('[MobileVideoAutoplay] Video error occurred', {
              isMobile,
              src: getDisplayUrl(src),
              error: e.currentTarget.error,
              posterSrc: poster ? getDisplayUrl(poster) : 'none',
              timestamp: Date.now()
            });
          }
          onVideoError?.(e);
        }}
        onSuspend={() => {
          if (process.env.NODE_ENV === 'development' && !thumbnailMode) {
            console.log('[MobileVideoAutoplay] Video suspended', {
              isMobile,
              src: getDisplayUrl(src),
              timestamp: Date.now()
            });
          }
        }}
        onWaiting={() => {
          if (process.env.NODE_ENV === 'development' && !thumbnailMode) {
            console.log('[MobileVideoAutoplay] Video waiting', {
              isMobile,
              src: getDisplayUrl(src),
              timestamp: Date.now()
            });
          }
        }}
      >
        Your browser does not support the video tag.
      </video>

      {/* Overlay play hint when deferring src */}
      {posterOnlyUntilClick && !isActivated && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/20 transition-colors cursor-pointer"
          onClick={() => setIsActivated(true)}
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-black/70 text-white text-sm">
            ▶
          </div>
        </div>
      )}

      {/* Scrubber Line - Desktop only and when scrubbing is enabled */}
      {!isMobile && !disableScrubbing && !thumbnailMode && isActivated && scrubberPosition !== null && (
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
            {Number.isFinite(duration) && duration > 0 && (
              `${Math.floor((scrubberPosition / 100) * duration)}s / ${Math.floor(duration)}s`
            )}
          </div>
        </div>
      )}

      {/* Speed controls overlay - Desktop only */}
      {!isMobile && !disableScrubbing && !thumbnailMode && isActivated && showSpeedControls && (
        <div 
          className={cn(
            'absolute flex items-center space-x-1 opacity-0 group-hover:opacity-100 group-touch:opacity-100 transition-opacity bg-black/60 rounded-md px-2 py-1 backdrop-blur-sm z-20',
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

export default HoverScrubVideo; 