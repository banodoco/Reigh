import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Trash2, Info, Settings, CheckCircle, AlertTriangle, Download, PlusCircle, Check, Star, Eye, Link, Plus, Pencil } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/shared/components/ui/tooltip";
import ShotSelector from "@/shared/components/ShotSelector";
import { DraggableImage } from "@/shared/components/DraggableImage";
import { getDisplayUrl } from "@/shared/lib/utils";
import { isImageCached, setImageCacheStatus } from "@/shared/lib/imageCacheManager";
import { getImageLoadingStrategy } from '@/shared/lib/imageLoadingPriority';
import { TimeStamp } from "@/shared/components/TimeStamp";
import { useToast } from "@/shared/hooks/use-toast";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { GeneratedImageWithMetadata, DisplayableMetadata } from "./ImageGallery";
import SharedMetadataDetails from "./SharedMetadataDetails";
import { SharedTaskDetails } from "@/tools/travel-between-images/components/SharedTaskDetails";
import { log } from '@/shared/lib/logger';
import { cn } from "@/shared/lib/utils";
import CreateShotModal from "@/shared/components/CreateShotModal";
import { useAddImageToShot, useCreateShotWithImage } from "@/shared/hooks/useShots";
import { useProject } from "@/shared/contexts/ProjectContext";
import { useShotNavigation } from "@/shared/hooks/useShotNavigation";
import { useLastAffectedShot } from "@/shared/hooks/useLastAffectedShot";
import { parseRatio } from "@/shared/lib/aspectRatios";
import { useProgressiveImage } from "@/shared/hooks/useProgressiveImage";
import { isProgressiveLoadingEnabled } from "@/shared/settings/progressiveLoading";
import { useTaskFromUnifiedCache } from "@/shared/hooks/useUnifiedGenerations";
import { useTaskType } from "@/shared/hooks/useTaskType";
import { useGetTask } from "@/shared/hooks/useTasks";
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
}

/**
 * Video component that scrubs based on mouse position and plays when mouse stops moving.
 * Copied from HoverScrubVideo to live locally in ImageGalleryItem.
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
  ...rest
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringRef = useRef(false);
  // Track whether a play was explicitly initiated by the user
  const userInitiatedPlayRef = useRef(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [duration, setDuration] = useState(0);
  const [scrubberPosition, setScrubberPosition] = useState<number | null>(null);
  const [scrubberVisible, setScrubberVisible] = useState(true);
  const [hasLoadedOnDemand, setHasLoadedOnDemand] = useState(false);
  // When posterOnlyUntilClick is enabled, defer activation until interaction
  const [isActivated, setIsActivated] = useState<boolean>(() => !posterOnlyUntilClick);
  const speedOptions = [0.25, 0.5, 1, 1.5, 2];
  const isMobile = useIsMobile();
  
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
    
    // Skip hover interactions on mobile devices or when scrubbing is disabled
    if (isMobile || thumbnailMode || disableScrubbing || autoplayOnHover) return;

    if (loadOnDemand && !hasLoadedOnDemand) {
      setHasLoadedOnDemand(true);
      return;
    }

    if (!videoRef.current || !containerRef.current) return;

    // Additional fallback: Prime video loading on mouse move if it still hasn't loaded
    if (preloadProp === 'none' && videoRef.current.readyState < 2) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[VideoStallFix] Fallback priming video load on mouse move', {
          src: src.substring(src.lastIndexOf('/') + 1) || 'no-src',
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

    if (duration === 0) return;

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
      if (videoRef.current && isHoveringRef.current) {
        // Start fade out of scrubber before video plays
        setScrubberVisible(false);
        
        videoRef.current.play().catch(() => {
          // Ignore play errors
        });
      }
    }, 150); // Start playing 150ms after mouse stops moving
  }, [duration, isMobile, thumbnailMode, disableScrubbing, loadOnDemand, hasLoadedOnDemand, autoplayOnHover, preloadProp, src]);

  const handleMouseEnter = useCallback(() => {
    // Skip hover interactions on mobile devices or when scrubbing is disabled
    if (isMobile || disableScrubbing) {
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
      videoRef.current?.play();
      return;
    }
    
    isHoveringRef.current = true;
    if (videoRef.current) {
      // Fix for video stalling: Prime video loading on first hover for preload="none"
      // This ensures the video starts loading from a user interaction
      if (preloadProp === 'none' && videoRef.current.readyState === 0) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[VideoStallFix] Priming video load on hover for preload="none"', {
            src: src.substring(src.lastIndexOf('/') + 1) || 'no-src',
            readyState: videoRef.current.readyState,
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
    setScrubberPosition(null); // Hide scrubber
    setScrubberVisible(true); // Reset visibility for next hover
    if (mouseMoveTimeoutRef.current) {
      clearTimeout(mouseMoveTimeoutRef.current);
      mouseMoveTimeoutRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0; // Reset to beginning
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

      setDuration(videoRef.current.duration);
      
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
      if (!disableScrubbing && videoRef.current.currentTime === 0) {
        // Very small seek to ensure first frame is visible
        videoRef.current.currentTime = 0.001;
        if (process.env.NODE_ENV === 'development' && !thumbnailMode) {
          console.log('[MobileVideoAutoplay] Set currentTime to show first frame', {
            isMobile,
            disableScrubbing,
            newCurrentTime: videoRef.current.currentTime,
            timestamp: Date.now()
          });
        }
      } else if (disableScrubbing) {
        if (process.env.NODE_ENV === 'development' && !thumbnailMode) {
          console.log('[MobileVideoAutoplay] Skipping currentTime manipulation in lightbox mode', {
            isMobile,
            disableScrubbing,
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

    if (process.env.NODE_ENV === 'development') {
      console.log('[MobileVideoAutoplay] useEffect[src] called', {
        isMobile,
        disableScrubbing,
        src,
        videoPaused: video.paused,
        videoCurrentTime: video.currentTime,
        timestamp: Date.now()
      });
    }

    // Ensure the video starts paused
    video.pause();
    // Important: never force-reset currentTime in lightbox (disableScrubbing=true)
    if (!disableScrubbing) {
      // Only reset currentTime for gallery thumbnails
      video.currentTime = 0;
    }
    setDuration(0);

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
        src={getDisplayUrl(src)}
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
        onLoadStart={() => {
          if (process.env.NODE_ENV === 'development' && !thumbnailMode) {
            console.log('[MobileVideoAutoplay] onLoadStart called', {
              isMobile,
              src: getDisplayUrl(src),
              timestamp: Date.now()
            });
          }
        }}
        onLoadedData={() => {
          if (process.env.NODE_ENV === 'development' && !thumbnailMode) {
            console.log('[MobileVideoAutoplay] onLoadedData called', {
              isMobile,
              src: getDisplayUrl(src),
              videoPaused: videoRef.current?.paused,
              timestamp: Date.now()
            });
          }
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
            {duration > 0 && (
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

interface ImageGalleryItemProps {
  image: GeneratedImageWithMetadata;
  index: number;
  isDeleting: boolean;
  onDelete?: (id: string) => void;
  onApplySettings?: (metadata: DisplayableMetadata) => void;
  onOpenLightbox: (image: GeneratedImageWithMetadata, autoEnterEditMode?: boolean) => void;
  onAddToLastShot: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToLastShotWithoutPosition?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onDownloadImage: (rawUrl: string, filename: string, imageId?: string, isVideo?: boolean, originalContentType?: string) => void;
  onToggleStar?: (id: string, starred: boolean) => void;
  selectedShotIdLocal: string;
  simplifiedShotOptions: { id: string; name: string }[];
  showTickForImageId: string | null;
  onShowTick: (imageId: string) => void;
  showTickForSecondaryImageId?: string | null;
  onShowSecondaryTick?: (imageId: string) => void;
  optimisticUnpositionedIds?: Set<string>;
  optimisticPositionedIds?: Set<string>;
  optimisticDeletedIds?: Set<string>;
  onOptimisticUnpositioned?: (imageId: string) => void;
  onOptimisticPositioned?: (imageId: string) => void;
  addingToShotImageId: string | null;
  setAddingToShotImageId: (id: string | null) => void;
  addingToShotWithoutPositionImageId?: string | null;
  setAddingToShotWithoutPositionImageId?: (id: string | null) => void;
  downloadingImageId: string | null;
  isMobile: boolean;
  mobileActiveImageId: string | null;
  mobilePopoverOpenImageId: string | null;
  onMobileTap: (image: GeneratedImageWithMetadata) => void;
  setMobilePopoverOpenImageId: (id: string | null) => void;
  setSelectedShotIdLocal: (id: string) => void;
  setLastAffectedShotId: (id: string) => void;
  toggleStarMutation: any;
  // Progressive loading props
  shouldLoad?: boolean;
  isPriority?: boolean;
  isGalleryLoading?: boolean;
  // Shot creation props
  onCreateShot?: (shotName: string, files: File[]) => Promise<void>;
  currentViewingShotId?: string; // ID of the shot currently being viewed (hides navigation buttons)
  // Project dimensions
  projectAspectRatio?: string;
}

export const ImageGalleryItem: React.FC<ImageGalleryItemProps> = ({
  image,
  index,
  isDeleting,
  onDelete,
  onApplySettings,
  onOpenLightbox,
  onAddToLastShot,
  onAddToLastShotWithoutPosition,
  onDownloadImage,
  onToggleStar,
  selectedShotIdLocal,
  simplifiedShotOptions,
  showTickForImageId,
  onShowTick,
  showTickForSecondaryImageId,
  onShowSecondaryTick,
  optimisticUnpositionedIds,
  optimisticPositionedIds,
  optimisticDeletedIds,
  onOptimisticUnpositioned,
  onOptimisticPositioned,
  addingToShotImageId,
  setAddingToShotImageId,
  addingToShotWithoutPositionImageId,
  setAddingToShotWithoutPositionImageId,
  downloadingImageId,
  isMobile,
  mobileActiveImageId,
  mobilePopoverOpenImageId,
  onMobileTap,
  setMobilePopoverOpenImageId,
  setSelectedShotIdLocal,
  setLastAffectedShotId,
  toggleStarMutation,
  shouldLoad = true,
  isPriority = false,
  isGalleryLoading = false,
  onCreateShot,
  currentViewingShotId,
  projectAspectRatio,
}) => {
  // Local pending state to scope star button disabled to this item only
  const [isTogglingStar, setIsTogglingStar] = useState<boolean>(false);
  
  // Fetch task data for video tasks to show proper details
  // Try to get task ID from metadata first (more efficient), fallback to cache query
  const taskIdFromMetadata = (image.metadata as any)?.taskId;
  const { data: taskIdMapping } = useTaskFromUnifiedCache(image.id);
  const taskIdFromCache = typeof taskIdMapping?.taskId === 'string' ? taskIdMapping.taskId : null;
  const taskId: string | null = taskIdFromMetadata || taskIdFromCache;
  
  const { data: taskData } = useGetTask(taskId);
  
  // Only use the actual task type name (like 'wan_2_2_t2i'), not tool_type (like 'image-generation')
  // tool_type and task type name are different concepts - tool_type is a broader category
  const taskType = taskData?.taskType;
  const { data: taskTypeInfo } = useTaskType(taskType || null);
  
  // Determine if this should show video task details (SharedTaskDetails)
  // Check if content_type is 'video' from task_types table
  // Fallback: if no taskTypeInfo, check metadata.tool_type for legacy support
  const isVideoTask = taskTypeInfo?.content_type === 'video' || 
    (!taskTypeInfo && (image.metadata as any)?.tool_type === 'travel-between-images');
  
  // [VideoThumbnailRender] Debug if this component is rendering for videos
  React.useEffect(() => {
    if (image.isVideo && index < 3) {
      console.log('[VideoThumbnailRender] ImageGalleryItem mounting for video:', {
        imageId: image.id?.substring(0, 8),
        index,
        isVideo: image.isVideo,
        shouldLoad,
        timestamp: Date.now()
      });
    }
  }, []); // Only log on mount
  
  // Debug mobile state for first few items (reduced frequency)
  React.useEffect(() => {
    if (index < 3) {
      console.log(`[MobileDebug] ImageGalleryItem ${index} mounted:`, {
        isMobile,
        imageId: image.id?.substring(0, 8),
        hasOnMobileTap: typeof onMobileTap === 'function',
        timestamp: Date.now()
      });
    }
  }, [isMobile, image.id]); // Only log when key props change
  const { toast } = useToast();
  const { selectedProjectId } = useProject();
  const addImageToShotMutation = useAddImageToShot();
  const createShotWithImageMutation = useCreateShotWithImage();
  const { navigateToShot } = useShotNavigation();
  const { lastAffectedShotId, setLastAffectedShotId: updateLastAffectedShotId } = useLastAffectedShot();
  // Progressive loading for thumbnail → full image transition
  // DISABLE progressive loading for videos - we want to show thumbnails, not load the full video file
  const progressiveEnabled = isProgressiveLoadingEnabled() && !image.isVideo;
  const { src: progressiveSrc, phase, isThumbShowing, isFullLoaded, error: progressiveError, retry: retryProgressive, ref: progressiveRef } = useProgressiveImage(
    progressiveEnabled ? image.thumbUrl : null,
    image.url,
    {
      priority: isPriority,
      lazy: !isPriority,
      enabled: progressiveEnabled, // Don't tie to shouldLoad - let the hook complete its transition
      crossfadeMs: 180
    }
  );
  
  // [ThumbToFullTransition] Log progressive loading state changes for first few items
  React.useEffect(() => {
    if (index < 3) {
      console.log(`[ThumbToFullTransition] Item ${index} state:`, {
        imageId: image.id?.substring(0, 8),
        progressiveEnabled,
        phase,
        isThumbShowing,
        isFullLoaded,
        progressiveSrc: progressiveSrc?.substring(0, 50),
        thumbUrl: image.thumbUrl?.substring(0, 50),
        fullUrl: image.url?.substring(0, 50),
        isPriority,
        shouldLoad,
        timestamp: Date.now()
      });
    }
  }, [progressiveEnabled, phase, isThumbShowing, isFullLoaded, progressiveSrc, isPriority, shouldLoad, index, image.id, image.thumbUrl, image.url]);
  
  // Fallback to legacy behavior if progressive loading is disabled
  const displayUrl = useMemo(() => {
    // For videos, ALWAYS use the thumbnail, never the video file
    if (image.isVideo) {
      const videoDisplayUrl = getDisplayUrl(image.thumbUrl || image.url);
      
      if (index === 0) { // Only log the first video item in detail
        console.log('[VideoThumbnailFIXED] ImageGalleryItem video URL selection:', {
          imageId: image.id?.substring(0, 8),
          index,
          progressiveEnabled,
          usingThumbnail: !!image.thumbUrl,
          usingVideoFallback: !image.thumbUrl,
          // Show full URLs for verification
          fullThumbUrl: image.thumbUrl,
          fullVideoUrl: image.url,
          fullDisplayUrl: videoDisplayUrl,
          timestamp: Date.now()
        });
      }
      
      return videoDisplayUrl;
    }
    
    // For images, use progressive loading if enabled
    if (progressiveEnabled && progressiveSrc) {
      if (index < 3) {
        console.log(`[ThumbToFullTransition] Item ${index} using progressiveSrc:`, {
          imageId: image.id?.substring(0, 8),
          progressiveSrc: progressiveSrc?.substring(0, 50),
          phase,
          timestamp: Date.now()
        });
      }
      return progressiveSrc;
    }
    
    const fallbackUrl = getDisplayUrl(image.thumbUrl || image.url);
    if (index < 3 && progressiveEnabled) {
      console.log(`[ThumbToFullTransition] Item ${index} using fallback (no progressiveSrc yet):`, {
        imageId: image.id?.substring(0, 8),
        fallbackUrl: fallbackUrl?.substring(0, 50),
        phase,
        timestamp: Date.now()
      });
    }
    return fallbackUrl;
  }, [progressiveEnabled, progressiveSrc, image.thumbUrl, image.url, image.isVideo, image.id, index, phase]);
  // Track loading state for this specific image
  const [imageLoadError, setImageLoadError] = useState<boolean>(false);
  const [imageRetryCount, setImageRetryCount] = useState<number>(0);
  const [isInfoOpen, setIsInfoOpen] = useState<boolean>(false);
  // State for CreateShotModal
  const [isCreateShotModalOpen, setIsCreateShotModalOpen] = useState<boolean>(false);
  const [isCreatingShot, setIsCreatingShot] = useState<boolean>(false);
  // State for quick create success
  const [quickCreateSuccess, setQuickCreateSuccess] = useState<{
    isSuccessful: boolean;
    shotId: string | null;
    shotName: string | null;
  }>({ isSuccessful: false, shotId: null, shotName: null });
  // Check if this image was already cached by the preloader using centralized function
  const isPreloadedAndCached = isImageCached(image);
  const [imageLoaded, setImageLoaded] = useState<boolean>(isPreloadedAndCached);
  const [imageLoading, setImageLoading] = useState<boolean>(false);
  
  // Track successful image load events
  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    setImageLoading(false);
    // Mark this image as cached in the centralized cache to avoid future skeletons
    try {
      setImageCacheStatus(image, true);
    } catch (_) {}
  }, [index, image.id, isPreloadedAndCached]);
  const MAX_RETRIES = 2;
  
  // Handle shot creation
  const handleCreateShot = async (shotName: string, files: File[]) => {
    if (!onCreateShot) return;
    
    setIsCreatingShot(true);
    try {
      await onCreateShot(shotName, files);
      setIsCreateShotModalOpen(false);
    } catch (error) {
      console.error("Error creating shot:", error);
      toast({ 
        title: "Error Creating Shot", 
        description: "Failed to create the shot. Please try again.",
        variant: "destructive" 
      });
    } finally {
      setIsCreatingShot(false);
    }
  };

  // Handle quick create and add using atomic database function
  const handleQuickCreateAndAdd = async () => {
    if (!selectedProjectId) return;
    
    // Generate automatic shot name
    const shotCount = simplifiedShotOptions.length;
    const newShotName = `Shot ${shotCount + 1}`;
    
    setAddingToShotImageId(image.id);
    try {
      console.log('[QuickCreate] Starting atomic shot creation with image:', {
        projectId: selectedProjectId,
        shotName: newShotName,
        generationId: image.id
      });
      
      // Use the atomic database function to create shot and add image in one operation
      const result = await createShotWithImageMutation.mutateAsync({
        projectId: selectedProjectId,
        shotName: newShotName,
        generationId: image.id
      });
      
      console.log('[QuickCreate] Atomic operation successful:', result);
      
      // Set the newly created shot as the last affected shot
      updateLastAffectedShotId(result.shotId);
      
      // Set success state immediately and let the mutation's onSuccess handle the data refresh
      // The mutation should have triggered query invalidation, so the shot will be available soon
      setQuickCreateSuccess({
        isSuccessful: true,
        shotId: result.shotId,
        shotName: result.shotName
      });
      
      // Clear success state after 5 seconds
      setTimeout(() => {
        setQuickCreateSuccess({ isSuccessful: false, shotId: null, shotName: null });
      }, 5000);
      
    } catch (error) {
      console.error('[QuickCreate] Error in atomic operation:', error);
      toast({ 
        title: "Error", 
        description: "Failed to create shot and add image. Please try again.",
        variant: "destructive" 
      });
    } finally {
      setAddingToShotImageId(null);
    }
  };
  
  // Track previous image ID to detect actual changes vs re-renders
  // Create a stable identifier for the image
  // Include URL (and optional updatedAt) so identifier changes when the image asset changes
  const imageIdentifier = `${image.id}:${image.url || ''}:${image.thumbUrl || ''}:${(image as any).updatedAt || ''}`;
  const prevImageIdentifierRef = useRef<string>(imageIdentifier);

  // Handle image load error with retry mechanism
  const handleImageError = useCallback((errorEvent?: React.SyntheticEvent<HTMLImageElement | HTMLVideoElement>) => {
    const failedSrc = (errorEvent?.target as HTMLImageElement | HTMLVideoElement)?.src || displayUrl;
    console.warn(`[ImageGalleryItem] Image load failed for ${image.id}: ${failedSrc}, retry ${imageRetryCount + 1}/${MAX_RETRIES}`);
    
    // Always reset loading state on error
    setImageLoading(false);
    
    // Don't retry placeholder URLs or obviously invalid URLs
    if (failedSrc?.includes('/placeholder.svg') || failedSrc?.includes('undefined') || !failedSrc) {
      console.warn(`[ImageGalleryItem] Not retrying invalid URL: ${failedSrc}`);
      setImageLoadError(true);
      return;
    }
    
    if (imageRetryCount < MAX_RETRIES) {
      console.log(`[ImageGalleryItem] Auto-retrying image load for ${image.id} in ${1000 * (imageRetryCount + 1)}ms...`);
      // Auto-retry with cache busting after a delay
      setTimeout(() => {
        setImageRetryCount(prev => prev + 1);
        // Force reload by clearing and resetting the src
        setActualSrc(null);
        setTimeout(() => {
          const retryUrl = getDisplayUrl(image.thumbUrl || image.url, true); // Force cache bust
          setActualSrc(retryUrl);
        }, 100);
      }, 1000 * (imageRetryCount + 1)); // Exponential backoff
    } else {
      console.warn(`[ImageGalleryItem] Max retries exceeded for ${image.id}, showing error state`);
      setImageLoadError(true);
    }
  }, [displayUrl, image.id, imageRetryCount, image.thumbUrl, image.url]);

  // Reset error state when URL changes (new image)
  useEffect(() => {
    // Log if image.id is undefined
    if (index < 3 && !image.id) {
      console.warn(`[ImageGalleryItem-${index}] Image has no ID!`, image);
    }
    
    // Check if this is actually a new image
    if (prevImageIdentifierRef.current === imageIdentifier) {
      return; // Same image ID, don't reset
    }
    
    if (index < 3) {
      console.log(`[ImageGalleryItem-${index}] Image changed, resetting state`, {
        prevId: prevImageIdentifierRef.current,
        newId: imageIdentifier
      });
    }
    
    // [VideoThumbnailLoop] Debug what's causing the reset loop
    if (image.isVideo && index === 0) {
      console.log('[VideoThumbnailLoop] imageIdentifier changed, causing reset:', {
        imageId: image.id?.substring(0, 8),
        prevIdentifier: prevImageIdentifierRef.current,
        newIdentifier: imageIdentifier,
        url: image.url?.substring(0, 50) + '...',
        thumbUrl: image.thumbUrl?.substring(0, 50) + '...',
        timestamp: Date.now()
      });
    }
    
    // Update the ref AFTER logging
    prevImageIdentifierRef.current = imageIdentifier;
    
    setImageLoadError(false);
    setImageRetryCount(0);
    // Check if the new image is already cached using centralized function
    const isNewImageCached = isImageCached(image);
    setImageLoaded(isNewImageCached);
    // Only set loading to false if not cached (if cached, we never start loading)
    if (!isNewImageCached) {
      setImageLoading(false);
    }
    // CRITICAL: Reset actualSrc so the loading effect can run for the new image
    setActualSrc(null);
  }, [imageIdentifier]); // Only reset when image ID changes

  // Progressive loading: only set src when shouldLoad is true
  const [actualSrc, setActualSrc] = useState<string | null>(null);
  
  // [VideoThumbnailActualSrc] Debug actualSrc changes for videos
  React.useEffect(() => {
    if (image.isVideo && index === 0) {
      console.log('[VideoThumbnailActualSrc] actualSrc changed:', {
        imageId: image.id?.substring(0, 8),
        actualSrc: actualSrc?.substring(0, 50) + '...' || 'NULL',
        actualSrcExists: !!actualSrc,
        timestamp: Date.now(),
        stack: new Error().stack?.split('\n')[1] // Show where this was called from
      });
    }
  }, [actualSrc, image.isVideo, image.id, index]);
  
  // [VideoThumbnailIssue] Debug shouldLoad for videos
  React.useEffect(() => {
    if (image.isVideo && index === 0) {
      console.log('[VideoThumbnailLoad] shouldLoad state for first video:', {
        imageId: image.id?.substring(0, 8),
        shouldLoad,
        actualSrc: !!actualSrc,
        displayUrl: displayUrl?.substring(0, 50) + '...',
        imageLoading,
        imageLoadError,
        timestamp: Date.now()
      });
    }
  }, [shouldLoad, actualSrc, image.isVideo, image.id, index, displayUrl, imageLoading, imageLoadError]);

  // Generate display URL with retry cache busting
  const actualDisplayUrl = useMemo(() => {
    if (imageRetryCount > 0) {
      return getDisplayUrl(image.thumbUrl || image.url, true); // Force refresh with cache busting
    }
    return displayUrl;
  }, [displayUrl, image.thumbUrl, image.url, imageRetryCount]);

  // Simplified loading system - responds to progressive loading and URL changes
  useEffect(() => {
    // Generate unique load ID for tracking this specific image load
    const loadId = `load-${image.id}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const isPreloaded = isImageCached(image);
    
    if (index < 3) {
      console.log(`[ThumbToFullTransition] Item ${index} actualSrc effect:`, {
        imageId: image.id?.substring(0, 8),
        shouldLoad,
        actualSrc: actualSrc?.substring(0, 50),
        actualDisplayUrl: actualDisplayUrl?.substring(0, 50),
        willUpdate: actualDisplayUrl !== actualSrc && shouldLoad,
        timestamp: Date.now()
      });
    }
    
    // Update actualSrc when displayUrl changes (for progressive loading transitions)
    // OR when shouldLoad becomes true for the first time
    if (shouldLoad && actualDisplayUrl) {
      // Don't load placeholder URLs - they indicate missing/invalid image data
      if (actualDisplayUrl === '/placeholder.svg') {
        setImageLoadError(true);
        return;
      }
      
      // Update actualSrc if it's different from actualDisplayUrl
      // This handles both initial load AND progressive thumbnail→full transitions
      if (actualSrc !== actualDisplayUrl) {
        if (index < 3) {
          console.log(`[ThumbToFullTransition] Item ${index} updating actualSrc:`, {
            imageId: image.id?.substring(0, 8),
            from: actualSrc?.substring(0, 50),
            to: actualDisplayUrl?.substring(0, 50),
            timestamp: Date.now()
          });
        }
        
        // Only set loading if the image isn't already cached/loaded
        if (!isPreloaded && !actualSrc) {
          setImageLoading(true);
        }
        
        setActualSrc(actualDisplayUrl);
      }
    }
  }, [actualSrc, actualDisplayUrl, shouldLoad, image.id, index, isImageCached]);

  // Check if we should show metadata details (only when tooltip/popover is open for performance)
  const shouldShowMetadata = useMemo(() => {
    if (!image.metadata) return false;
    
    // On mobile, only show when popover is open; on desktop, only when tooltip might be shown
    return isMobile 
      ? (mobilePopoverOpenImageId === image.id)
      : isInfoOpen;
  }, [image.metadata, isMobile, mobilePopoverOpenImageId, image.id, isInfoOpen]);
  const isCurrentDeleting = isDeleting;
  const imageKey = image.id || `image-${actualDisplayUrl}-${index}`;

  // Determine if it's a video ONLY if the display URL points to a video file
  // Thumbnails for videos are images (png/jpg) and must be treated as images here
  const urlIsVideo = Boolean(
    actualDisplayUrl && (
      actualDisplayUrl.toLowerCase().endsWith('.webm') ||
      actualDisplayUrl.toLowerCase().endsWith('.mp4') ||
      actualDisplayUrl.toLowerCase().endsWith('.mov')
    )
  );
  // If the display URL is not a video file, force image rendering even if image.isVideo is true
  const isActuallyVideo = urlIsVideo;
  // Content type: whether this item represents a video generation at all
  const isVideoContent = useMemo(() => {
    if (typeof image.isVideo === 'boolean') return image.isVideo;
    const url = image.url || '';
    const lower = url.toLowerCase();
    return lower.endsWith('.webm') || lower.endsWith('.mp4') || lower.endsWith('.mov');
  }, [image.isVideo, image.url]);

  // Check if we have a real image thumbnail (not a video file)
  const hasThumbnailImage = useMemo(() => {
    const thumb = image.thumbUrl || '';
    if (!thumb) return false;
    const lower = thumb.toLowerCase();
    // Treat as image only if not a video extension
    const isVideoExt = lower.endsWith('.webm') || lower.endsWith('.mp4') || lower.endsWith('.mov');
    return !isVideoExt;
  }, [image.thumbUrl]);

  const videoUrl = useMemo(() => (isVideoContent ? (image.url || null) : null), [isVideoContent, image.url]);

  // Placeholder check
  const isPlaceholder = !image.id && actualDisplayUrl === "/placeholder.svg";
  const currentTargetShotName = selectedShotIdLocal ? simplifiedShotOptions.find(s => s.id === selectedShotIdLocal)?.name : undefined;
  
  // Check if image is already positioned in the selected shot (DB + optimistic)
  const isAlreadyPositionedInSelectedShot = useMemo(() => {
    if (!selectedShotIdLocal || !image.id) return false;
    
    // Check optimistic state first
    if (optimisticPositionedIds?.has(image.id)) return true;
    
    // Optimized: Check single shot first (most common case)
    if (image.shot_id === selectedShotIdLocal) {
      return image.position !== null && image.position !== undefined;
    }
    
    // Check multiple shot associations only if needed
    if (image.all_shot_associations) {
      const matchingAssociation = image.all_shot_associations.find(
        assoc => assoc.shot_id === selectedShotIdLocal
      );
      return matchingAssociation && 
             matchingAssociation.position !== null && 
             matchingAssociation.position !== undefined;
    }
    
    return false;
  }, [selectedShotIdLocal, image.id, image.shot_id, image.position, image.all_shot_associations, optimisticPositionedIds]);

  // Check if image is already associated with the selected shot WITHOUT position (DB + optimistic)
  const isAlreadyAssociatedWithoutPosition = useMemo(() => {
    if (!selectedShotIdLocal || !image.id) return false;
    
    // Check optimistic state first
    if (optimisticUnpositionedIds?.has(image.id)) return true;
    
    // Optimized: Check single shot first (most common case)
    if (image.shot_id === selectedShotIdLocal) {
      return image.position === null || image.position === undefined;
    }
    
    // Check multiple shot associations only if needed
    if (image.all_shot_associations) {
      const matchingAssociation = image.all_shot_associations.find(
        assoc => assoc.shot_id === selectedShotIdLocal
      );
      return matchingAssociation && 
             (matchingAssociation.position === null || matchingAssociation.position === undefined);
    }
    
    return false;
  }, [selectedShotIdLocal, image.id, image.shot_id, image.position, image.all_shot_associations, optimisticUnpositionedIds]);

  // Check if we're currently viewing the selected shot specifically
  // Only hide "add without position" button when actively filtering to view the current shot's items
  const isCurrentlyViewingSelectedShot = useMemo(() => {
    // Must have both IDs and they must match
    if (!currentViewingShotId || !selectedShotIdLocal) {
      return false;
    }
    
    // Only hide when viewing items specifically filtered to the current shot
    return currentViewingShotId === selectedShotIdLocal;
  }, [currentViewingShotId, selectedShotIdLocal]);

  // 🎯 PERFORMANCE: Memoize "Add without position" button visibility to prevent 840 checks per 2 minutes
  // This calculation was running on every render, causing massive overhead
  const shouldShowAddWithoutPositionButton = useMemo(() => {
    const shouldShow = onAddToLastShotWithoutPosition && 
                      !isAlreadyPositionedInSelectedShot && 
                      showTickForImageId !== image.id && 
                      addingToShotImageId !== image.id && 
                      !isCurrentlyViewingSelectedShot;
    
    // Throttled logging to track visibility changes (not on every render)
    if (shouldShow) {
      console.log('[AddWithoutPosition] Button will show for image:', image.id?.substring(0, 8));
    }
    
    return shouldShow;
  }, [
    onAddToLastShotWithoutPosition,
    isAlreadyPositionedInSelectedShot,
    showTickForImageId,
    image.id,
    addingToShotImageId,
    isCurrentlyViewingSelectedShot
  ]);
  
  // Handle quick create success navigation
  const handleQuickCreateSuccess = useCallback(() => {
    if (quickCreateSuccess.shotId) {
      // Try to find the shot in the list first
      const shot = simplifiedShotOptions.find(s => s.id === quickCreateSuccess.shotId);
      if (shot) {
        // Shot found in list, use it
        navigateToShot({ 
          id: shot.id, 
          name: shot.name,
          images: [],
          position: 0
        });
      } else {
        // Shot not in list yet, but we have the ID and name, so navigate anyway
        console.log('[QuickCreate] Shot not in list yet, navigating with stored data');
        navigateToShot({ 
          id: quickCreateSuccess.shotId, 
          name: quickCreateSuccess.shotName || `Shot`,
          images: [],
          position: 0
        });
      }
    }
  }, [quickCreateSuccess, simplifiedShotOptions, navigateToShot]);

  let aspectRatioPadding = '100%'; 
  let minHeight = '120px'; // Minimum height for very small images
  
  // Try to get dimensions from multiple sources
  let width = image.metadata?.width;
  let height = image.metadata?.height;
  
  // If not found, try to extract from resolution string
  if (!width || !height) {
    const resolution = (image.metadata as any)?.originalParams?.orchestrator_details?.resolution;
    if (resolution && typeof resolution === 'string' && resolution.includes('x')) {
      const [w, h] = resolution.split('x').map(Number);
      if (!isNaN(w) && !isNaN(h)) {
        width = w;
        height = h;
      }
    }
  }
  
  if (width && height) {
    const calculatedPadding = (height / width) * 100;
    // Ensure reasonable aspect ratio bounds
    const minPadding = 60; // Minimum 60% height (for very wide images)
    const maxPadding = 200; // Maximum 200% height (for very tall images)
    aspectRatioPadding = `${Math.min(Math.max(calculatedPadding, minPadding), maxPadding)}%`;
  } else if (projectAspectRatio) {
    // Use project aspect ratio as fallback instead of square
    const ratio = parseRatio(projectAspectRatio);
    if (!isNaN(ratio)) {
      const calculatedPadding = (1 / ratio) * 100; // height/width * 100
      // Ensure reasonable aspect ratio bounds
      const minPadding = 60; // Minimum 60% height (for very wide images)
      const maxPadding = 200; // Maximum 200% height (for very tall images)
      aspectRatioPadding = `${Math.min(Math.max(calculatedPadding, minPadding), maxPadding)}%`;
    }
  }

  // If it's a placeholder, render simplified placeholder item
  if (isPlaceholder) {
    return (
      <div 
        key={imageKey}
        className="border rounded-lg overflow-hidden bg-muted animate-pulse"
      >
        <div style={{ paddingBottom: aspectRatioPadding }} className="relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <Eye className="h-12 w-12 text-muted-foreground opacity-30" />
          </div>
        </div>
      </div>
    );
  }

  // Check if this image is optimistically deleted
  const isOptimisticallyDeleted = optimisticDeletedIds?.has(image.id) ?? false;

  // Track drag state for visual feedback
  const [isDragging, setIsDragging] = useState(false);

  // Handle drag start for dropping onto timeline
  const handleDragStart = useCallback((e: React.DragEvent) => {
    // Only enable drag on desktop
    if (isMobile) {
      e.preventDefault();
      return;
    }
    
    setIsDragging(true);
    
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/x-generation', JSON.stringify({
      generationId: image.id,
      imageUrl: image.url,
      thumbUrl: image.thumbUrl,
      metadata: image.metadata
    }));
    
    // Create a small drag preview element
    if (e.dataTransfer.setDragImage && e.currentTarget instanceof HTMLElement) {
      const preview = document.createElement('div');
      preview.style.position = 'absolute';
      preview.style.top = '-1000px'; // Position off-screen
      preview.style.width = '80px';
      preview.style.height = '80px';
      preview.style.opacity = '0.7';
      preview.style.borderRadius = '8px';
      preview.style.overflow = 'hidden';
      preview.style.border = '2px solid #fff';
      preview.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
      
      // Clone the image element
      const imgElement = e.currentTarget.querySelector('img');
      if (imgElement) {
        const imgClone = imgElement.cloneNode(true) as HTMLImageElement;
        imgClone.style.width = '100%';
        imgClone.style.height = '100%';
        imgClone.style.objectFit = 'cover';
        preview.appendChild(imgClone);
      }
      
      document.body.appendChild(preview);
      e.dataTransfer.setDragImage(preview, 40, 40);
      
      // Clean up after a brief moment
      setTimeout(() => {
        if (document.body.contains(preview)) {
          document.body.removeChild(preview);
        }
      }, 0);
    }
    
    console.log('[GenerationDrag] Drag started:', {
      generationId: image.id?.substring(0, 8),
      imageUrl: image.url?.substring(0, 50),
      timestamp: Date.now()
    });
  }, [image, isMobile]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Conditionally wrap with DraggableImage only on desktop to avoid interfering with mobile scrolling
  const imageContent = (
    <div 
        className={`border rounded-lg overflow-hidden hover:shadow-md transition-all duration-200 relative group bg-card ${
          isOptimisticallyDeleted ? 'opacity-50 scale-95 pointer-events-none' : ''
        } ${isDragging ? 'opacity-50 scale-75' : ''} ${!isMobile ? 'cursor-grab active:cursor-grabbing' : ''}`}
        draggable={!isMobile}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
    >
      <div className="relative w-full">
      <div 
        style={{ 
          paddingBottom: aspectRatioPadding,
          minHeight: minHeight 
        }} 
        className="relative bg-gray-200"
      >
          {isVideoContent ? (
            <HoverScrubVideo
                      src={videoUrl || actualSrc || ''}
                      poster={displayUrl || undefined}
              preload={shouldLoad ? "auto" : "none"}
              className="absolute inset-0 w-full h-full"
              videoClassName="object-cover cursor-pointer w-full h-full"
              muted
              loop
              playsInline
                    onDoubleClick={isMobile ? undefined : () => onOpenLightbox(image)}
                    onTouchEnd={isMobile ? (e) => {
                      console.log('[MobileDebug] Video onTouchEnd fired', {
                        imageId: image.id?.substring(0, 8),
                        target: (e.target as HTMLElement)?.tagName,
                        timestamp: Date.now()
                      });
                      e.preventDefault();
                      onMobileTap(image);
                    } : undefined}
              // Pass video loading handlers if HoverScrubVideo supports them, or if it spreads props to video
                    onError={handleImageError}
                    onLoadStart={() => setImageLoading(true)}
                    onLoadedData={handleImageLoad}
            />
          ) : imageLoadError ? (
            // Fallback when image fails to load after retries
            <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-gray-100 text-gray-500">
              <div className="text-center">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs">Failed to load image</p>
                <button 
                  onClick={() => {
                    setImageLoadError(false);
                    setImageRetryCount(0);
                    setActualSrc(null);
                    setImageLoaded(false);
                    setImageLoading(false);
                  }}
                  className="text-xs underline hover:no-underline mt-1"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Show image once it's loaded, regardless of shouldLoad state */}
              {actualSrc && imageLoaded && (() => {
                return (
                <img
                  ref={progressiveRef}
                  src={actualSrc}
                  alt={image.prompt || `Generated image ${index + 1}`}
                  className={cn(
                    "absolute inset-0 w-full h-full object-cover group-hover:opacity-80 transition-all duration-300",
                    // Add crossfade effect for progressive loading
                    progressiveEnabled && isThumbShowing && "opacity-90",
                    progressiveEnabled && isFullLoaded && "opacity-100"
                  )}
                  onDoubleClick={isMobile ? undefined : () => onOpenLightbox(image)}
                  onTouchEnd={isMobile ? (e) => {
                    console.log('[MobileDebug] Image onTouchEnd fired', {
                      imageId: image.id?.substring(0, 8),
                      target: (e.target as HTMLElement)?.tagName,
                      timestamp: Date.now()
                    });
                    e.preventDefault();
                    onMobileTap(image);
                  } : undefined}
                  draggable={false}
                  style={{ cursor: 'pointer' }}
                />
                );
              })()}
              
              {/* Hidden image for background loading - only when image hasn't loaded yet */}
              {actualSrc && !imageLoaded && (
                <img
                  src={actualSrc}
                  alt={image.prompt || `Generated image ${index + 1}`}
                  style={{ display: 'none' }}
                  onError={handleImageError}
                  onLoad={handleImageLoad}
                  onLoadStart={() => setImageLoading(true)}
                  onAbort={() => {
                    setImageLoading(false);
                  }}
                />
              )}
              
              {/* Show skeleton only while the media is still loading */}
              {/* Only show skeleton if image hasn't loaded yet - never show it for already-loaded images */}
              {!imageLoaded && (
                index < 3 && console.log(`[ImageGalleryItem-${index}] Showing skeleton`, {
                  imageId: image.id,
                  imageLoaded,
                  imageLoading,
                  actualSrc
                }),
                <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-gray-200 animate-pulse">
                  <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-400"></div>
                </div>
              )}
              
            </>
          )}
      </div>
      </div>
      
      {/* Action buttons and UI elements */}
      {image.id && ( // Ensure image has ID for actions
      <>
          {/* Shot Name Badge for Videos - Top Left (always show for videos with shot_id) */}
          {isVideoContent && image.shot_id && simplifiedShotOptions.length > 0 && (
          <div className="absolute top-2 left-2 flex flex-col items-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
              <button 
                  className="px-2 py-1 rounded-md bg-black/50 hover:bg-black/70 text-white text-xs font-medium transition-colors flex items-center gap-1.5"
                  onClick={() => {
                      const targetShot = simplifiedShotOptions.find(s => s.id === image.shot_id);
                      if (targetShot) {
                          navigateToShot(targetShot as any, { scrollToTop: true });
                      }
                  }}
              >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  {simplifiedShotOptions.find(s => s.id === image.shot_id)?.name || 'Unknown Shot'}
              </button>
          </div>
          )}
          
          {/* Add to Shot UI - Top Left (for non-video content) */}
          {simplifiedShotOptions.length > 0 && onAddToLastShot && (
          <div className="absolute top-2 left-2 flex flex-col items-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
              {!isVideoContent && (
              <ShotSelector
                  value={selectedShotIdLocal}
                  onValueChange={(value) => {
                      setSelectedShotIdLocal(value);
                      setLastAffectedShotId(value);
                  }}
                  shots={simplifiedShotOptions}
                  placeholder="Shot..."
                  triggerClassName="h-7 px-2 py-1 rounded-md bg-black/50 hover:bg-black/70 text-white text-xs min-w-[70px] max-w-[90px] truncate focus:ring-0 focus:ring-offset-0"
                  contentClassName="w-[var(--radix-select-trigger-width)]"
                  showAddShot={!!onCreateShot}
                  onCreateShot={handleQuickCreateAndAdd}
                  isCreatingShot={addingToShotImageId === image.id}
                  quickCreateSuccess={quickCreateSuccess}
                  onQuickCreateSuccess={handleQuickCreateSuccess}
                  side="top"
                  align="start"
                  sideOffset={4}
              />
              )}

              {!isVideoContent && (
              <div className="relative">
                <Tooltip delayDuration={0} disableHoverableContent>
                    <TooltipTrigger asChild>
                        <Button
                            variant="outline"
                            size="icon"
                            className={`h-7 w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white ${
                                showTickForImageId === image.id
                                    ? 'bg-green-500 hover:bg-green-600 !text-white'
                                    : isAlreadyPositionedInSelectedShot
                                        ? 'bg-gray-500/60 hover:bg-gray-600/70 !text-white'
                                        : ''
                            }`}
                          onClick={async () => {
                              // If in transient success or already positioned, navigate to shot
                              if ((showTickForImageId === image.id || isAlreadyPositionedInSelectedShot) && selectedShotIdLocal && simplifiedShotOptions) {
                                  const targetShot = simplifiedShotOptions.find(s => s.id === selectedShotIdLocal);
                                  if (targetShot) {
                                      navigateToShot(targetShot as any, { scrollToTop: true });
                                      return;
                                  }
                              }
                              
                              console.log('[GenerationsPane] Add to Shot button clicked', {
                                imageId: image.id,
                                selectedShotIdLocal,
                                isAlreadyPositionedInSelectedShot,
                                simplifiedShotOptions: simplifiedShotOptions.map(s => ({ id: s.id, name: s.name })),
                                imageUrl: image.url?.substring(0, 50) + '...',
                                timestamp: Date.now()
                              });
                              
                              // If already positioned in shot, nothing else to do (navigation already handled)
                              if (isAlreadyPositionedInSelectedShot) {
                                  return;
                              }

                              if (!selectedShotIdLocal) {
                                  console.log('[GenerationsPane] ❌ No shot selected for adding image');
                                  toast({ title: "Select a Shot", description: "Please select a shot first to add this image.", variant: "destructive" });
                                  return;
                              }
                              
                              console.log('[GenerationsPane] 🚀 Starting add to shot process', {
                                imageId: image.id,
                                targetShotId: selectedShotIdLocal,
                                targetShotName: simplifiedShotOptions.find(s => s.id === selectedShotIdLocal)?.name
                              });
                              
                              setAddingToShotImageId(image.id!);
                              try {
                                  // Add limited retry logic for mobile network issues
                                  let success = false;
                                  let retryCount = 0;
                                  const maxRetries = isMobile ? 2 : 1; // Reduced from 3 to 2 retries on mobile
                                  
                                  // Mobile-specific debugging - detect network state if available (only when debugging enabled)
                                  if (isMobile && 'connection' in navigator && import.meta.env.VITE_DEBUG_LOGS) {
                                      const conn = (navigator as any).connection;
                                      log('MobileAddToShot', `Network state - Type: ${conn.effectiveType}, Downlink: ${conn.downlink}Mbps, RTT: ${conn.rtt}ms`);
                                  }
                                  
                                  while (!success && retryCount < maxRetries) {
                                      try {
                                          // Use the image URL directly instead of displayUrl to avoid potential URL resolution issues
                                          const imageUrlToUse = image.url || displayUrl;
                                          const thumbUrlToUse = image.thumbUrl || imageUrlToUse;
                                          
                                          console.log(`[GenerationsPane] Calling onAddToLastShot - Attempt ${retryCount + 1}/${maxRetries}`, {
                                            imageId: image.id,
                                            imageUrlToUse: imageUrlToUse?.substring(0, 80) + '...',
                                            thumbUrlToUse: thumbUrlToUse?.substring(0, 80) + '...',
                                            selectedShotIdLocal,
                                            timestamp: Date.now()
                                          });
                                          
                                          success = await onAddToLastShot(image.id!, imageUrlToUse, thumbUrlToUse);
                                          
                                          if (success) {
                                              console.log(`[GenerationsPane] ✅ Success on attempt ${retryCount + 1} for image ${image.id}`);
                                              onShowTick(image.id!);
                                              onOptimisticPositioned?.(image.id!);
                                              log('MobileAddToShot', `Success on attempt ${retryCount + 1} for image ${image.id}`);
                                          } else {
                                              console.log(`[GenerationsPane] ❌ Failed on attempt ${retryCount + 1} for image ${image.id}`);
                                          }
                                      } catch (error) {
                                          retryCount++;
                                          log('MobileAddToShot', `Attempt ${retryCount} failed for image ${image.id}:`, error);
                                          
                                          // Don't retry for certain error types that won't benefit from retrying
                                          const isRetryableError = (err: any): boolean => {
                                              const message = err?.message?.toLowerCase() || '';
                                              const isNetworkError = message.includes('load failed') || 
                                                                    message.includes('network error') || 
                                                                    message.includes('fetch') ||
                                                                    message.includes('timeout');
                                              const isServerError = message.includes('unauthorized') || 
                                                                   message.includes('forbidden') || 
                                                                   message.includes('not found') ||
                                                                   message.includes('quota') ||
                                                                   err?.status === 401 || 
                                                                   err?.status === 403 || 
                                                                   err?.status === 404;
                                              return isNetworkError && !isServerError;
                                          };
                                          
                                          if (retryCount < maxRetries && isRetryableError(error)) {
                                              // Show user feedback on retry
                                              if (retryCount === 1) {
                                                  toast({ title: "Retrying...", description: "Network issue detected, trying again.", duration: 1500 });
                                              }
                                              
                                              // Wait before retry, with shorter delay to improve UX
                                              const waitTime = 800; // Fixed 800ms delay instead of exponential
                                              log('MobileAddToShot', `Waiting ${waitTime}ms before retry ${retryCount + 1}`);
                                              await new Promise(resolve => setTimeout(resolve, waitTime));
                                          } else {
                                              // Final retry failed, show user-friendly error
                                              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                                              log('MobileAddToShot', `All retries failed for image ${image.id}. Final error:`, error);
                                              toast({ 
                                                  title: "Network Error", 
                                                  description: `Could not add image to shot. ${isMobile ? 'Please check your connection and try again.' : errorMessage}`,
                                                  variant: "destructive" 
                                              });
                                              throw error;
                                          }
                                      }
                                  }
                              } finally {
                                  setAddingToShotImageId(null);
                              }
                          }}
                          disabled={!selectedShotIdLocal || addingToShotImageId === image.id}
                          aria-label={
                              isAlreadyPositionedInSelectedShot ? `Jump to ${currentTargetShotName}` :
                              showTickForImageId === image.id ? `Jump to ${currentTargetShotName}` : 
                              (currentTargetShotName ? `Add to '${currentTargetShotName}' at final position` : "Add to selected shot")
                          }
                          onPointerDown={(e) => e.stopPropagation()}
                      >
                          {addingToShotImageId === image.id ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
                          ) : showTickForImageId === image.id ? (
                              <Check className="h-4 w-4" />
                          ) : isAlreadyPositionedInSelectedShot ? (
                              <Check className="h-4 w-4" />
                          ) : (
                              <PlusCircle className="h-4 w-4" />
                          )}
                      </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                            {isAlreadyPositionedInSelectedShot ? `Jump to ${currentTargetShotName || 'shot'}` :
                            showTickForImageId === image.id ? `Jump to ${currentTargetShotName || 'shot'}` :
                            (selectedShotIdLocal && currentTargetShotName ? `Add to '${currentTargetShotName}' at final position` : "Select a shot then click to add")}
                        </TooltipContent>
                    </Tooltip>
                    
                    {/* Add without position button - visibility now memoized for performance */}
                    {shouldShowAddWithoutPositionButton && (
                        <Tooltip delayDuration={0} disableHoverableContent>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className={`absolute -top-1 -right-1 h-4 w-4 p-0 rounded-full border-0 scale-75 hover:scale-100 transition-transform duration-200 ease-out ${
                                        isAlreadyAssociatedWithoutPosition
                                            ? 'bg-gray-500/80 hover:bg-gray-600/90 text-white'
                                            : 'bg-black/60 hover:bg-black/80 text-white'
                                    }`}
                                    onClick={async () => {
                                        // If already associated without position, navigate to shot
                                        if (isAlreadyAssociatedWithoutPosition && selectedShotIdLocal && simplifiedShotOptions) {
                                            const targetShot = simplifiedShotOptions.find(s => s.id === selectedShotIdLocal);
                                            if (targetShot) {
                                                navigateToShot(targetShot as any, { scrollToTop: true });
                                                return;
                                            }
                                        }
                                        console.log('[GenerationsPane] Add to Shot WITHOUT position button clicked', {
                                          imageId: image.id,
                                          selectedShotIdLocal,
                                          simplifiedShotOptions: simplifiedShotOptions.map(s => ({ id: s.id, name: s.name })),
                                          imageUrl: image.url?.substring(0, 50) + '...',
                                          timestamp: Date.now()
                                        });
                                        
                                        setAddingToShotWithoutPositionImageId?.(image.id!);
                                        try {
                                            // Add limited retry logic for mobile network issues
                                            let success = false;
                                            let retryCount = 0;
                                            const maxRetries = isMobile ? 2 : 1;
                                            
                                            while (!success && retryCount < maxRetries) {
                                                try {
                                                    // Use the image URL directly instead of displayUrl to avoid potential URL resolution issues
                                                    const imageUrlToUse = image.url || displayUrl;
                                                    const thumbUrlToUse = image.thumbUrl || imageUrlToUse;
                                                    
                                                    console.log(`[GenerationsPane] Calling onAddToLastShotWithoutPosition - Attempt ${retryCount + 1}/${maxRetries}`, {
                                                      imageId: image.id,
                                                      imageUrlToUse: imageUrlToUse?.substring(0, 80) + '...',
                                                      thumbUrlToUse: thumbUrlToUse?.substring(0, 80) + '...',
                                                      selectedShotIdLocal,
                                                      timestamp: Date.now()
                                                    });
                                                    
                                                    success = await onAddToLastShotWithoutPosition(image.id!, imageUrlToUse, thumbUrlToUse);
                                                    
                                                    if (success) {
                                                        console.log(`[GenerationsPane] ✅ Success without position on attempt ${retryCount + 1} for image ${image.id}`);
                                                        onShowSecondaryTick?.(image.id!);
                                                        onOptimisticUnpositioned?.(image.id!);
                                                    } else {
                                                        console.log(`[GenerationsPane] ❌ Failed without position on attempt ${retryCount + 1} for image ${image.id}`);
                                                    }
                                                } catch (error) {
                                                    retryCount++;
                                                    
                                                    // Don't retry for certain error types that won't benefit from retrying
                                                    const isRetryableError = (err: any): boolean => {
                                                        const message = err?.message?.toLowerCase() || '';
                                                        const isNetworkError = message.includes('load failed') || 
                                                                               message.includes('network error') || 
                                                                               message.includes('fetch') ||
                                                                               message.includes('timeout');
                                                        const isServerError = message.includes('unauthorized') || 
                                                                              message.includes('forbidden') || 
                                                                              message.includes('not found') ||
                                                                              message.includes('quota') ||
                                                                              err?.status === 401 || 
                                                                              err?.status === 403 || 
                                                                              err?.status === 404;
                                                        return isNetworkError && !isServerError;
                                                    };
                                                    
                                                    if (retryCount < maxRetries && isRetryableError(error)) {
                                                        // Show user feedback on retry
                                                        if (retryCount === 1) {
                                                            toast({ title: "Retrying...", description: "Network issue detected, trying again.", duration: 1500 });
                                                        }
                                                        
                                                        // Wait before retry, with shorter delay to improve UX
                                                        const waitTime = 800; // Fixed 800ms delay instead of exponential
                                                        await new Promise(resolve => setTimeout(resolve, waitTime));
                                                    } else {
                                                        // Final retry failed, show user-friendly error
                                                        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                                                        toast({ 
                                                            title: "Network Error", 
                                                            description: `Could not add image to shot without position. ${isMobile ? 'Please check your connection and try again.' : errorMessage}`,
                                                            variant: "destructive" 
                                                        });
                                                        throw error;
                                                    }
                                                }
                                            }
                                        } finally {
                                            setAddingToShotWithoutPositionImageId?.(null);
                                        }
                                    }}
                                    disabled={!selectedShotIdLocal || addingToShotWithoutPositionImageId === image.id || addingToShotImageId === image.id}
                                    aria-label={
                                        isAlreadyAssociatedWithoutPosition
                                            ? (currentTargetShotName ? `Jump to ${currentTargetShotName}` : 'Jump to shot')
                                            : (currentTargetShotName ? `Add to '${currentTargetShotName}' without position` : "Add to selected shot without position")
                                    }
                                    onPointerDown={(e) => e.stopPropagation()}
                                >
                                    {addingToShotWithoutPositionImageId === image.id ? (
                                        <div className="h-2 w-2 animate-spin rounded-full border-b border-white"></div>
                                    ) : isAlreadyAssociatedWithoutPosition ? (
                                        <Check className="h-2 w-2" />
                                    ) : (
                                        <Plus className="h-2 w-2" />
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                                {isAlreadyAssociatedWithoutPosition
                                    ? `Jump to ${currentTargetShotName || 'shot'}`
                                    : (selectedShotIdLocal && currentTargetShotName ? `Add to '${currentTargetShotName}' without position` : "Add to selected shot without position")}
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
              )}
          </div>
          )}

          {/* Timestamp - Top Right */}
          <TimeStamp 
            createdAt={image.createdAt} 
            position="top-right"
            showOnHover={false} // Always show for all devices
            className="z-30"
          />

          {/* Optimistic delete overlay */}
          {isOptimisticallyDeleted && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center rounded-lg">
              <div className="bg-white/90 px-3 py-2 rounded-md flex items-center gap-2 text-sm font-medium text-gray-700">
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-gray-600"></div>
                Deleting...
              </div>
            </div>
          )}

          {/* Action buttons - Top Right (Delete, Info & Apply) */}
          <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5 mt-8 z-20">
              {/* Delete button - Mobile Top Right */}
              {isMobile && onDelete && (
                <Button 
                    variant="destructive" 
                    size="icon" 
                    className="h-7 w-7 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(image.id!);
                    }}
                    disabled={isCurrentDeleting}
                >
                    {isCurrentDeleting ? (
                        <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-white"></div>
                    ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                    )}
                </Button>
              )}
              {/* Info tooltip (shown on hover) */}
              {image.metadata && (
                isMobile ? (
                  <PopoverPrimitive.Root open={mobilePopoverOpenImageId === image.id} onOpenChange={(open) => {
                    if (!open) {
                      setMobilePopoverOpenImageId(null);
                    }
                  }}>
                    <PopoverPrimitive.Trigger asChild>
                      <div
                        className={`${mobileActiveImageId === image.id ? 'opacity-100' : 'opacity-0'} group-hover:opacity-100 transition-opacity cursor-pointer`}
                        onClick={() => {
                          setMobilePopoverOpenImageId(image.id);
                        }}
                      >
                        <div className="h-7 w-7 rounded-full bg-black/30 flex items-center justify-center">
                          <Info className="h-3.5 w-3.5 text-white" />
                        </div>
                      </div>
                    </PopoverPrimitive.Trigger>
                    <PopoverPrimitive.Portal>
                      <PopoverPrimitive.Content
                        side="right"
                        align="start"
                        sideOffset={4}
                        className="z-[10010] max-w-lg p-0 border bg-background shadow-lg rounded-md max-h-96 overflow-y-auto"
                      >
                        {shouldShowMetadata && image.metadata && (
                          <>
                            {isVideoTask && taskData ? (
                              <SharedTaskDetails
                                task={taskData}
                                inputImages={[]}
                                variant="panel"
                                isMobile={true}
                              />
                            ) : (
                              <SharedMetadataDetails
                                metadata={image.metadata}
                                variant="panel"
                                isMobile={true}
                                showUserImage={true}
                              />
                            )}
                          </>
                        )}
                      </PopoverPrimitive.Content>
                    </PopoverPrimitive.Portal>
                  </PopoverPrimitive.Root>
                ) : (
                  <Tooltip onOpenChange={setIsInfoOpen}>
                    <TooltipTrigger asChild>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                        <div className="h-7 w-7 rounded-full bg-black/30 flex items-center justify-center">
                          <Info className="h-3.5 w-3.5 text-white" />
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      align="start"
                      className="max-w-lg p-0 border-0 bg-background/95 backdrop-blur-sm"
                      sideOffset={15}
                      collisionPadding={10}
                    >
                      {shouldShowMetadata && image.metadata && (
                        <>
                          {isVideoTask && taskData ? (
                            <SharedTaskDetails
                              task={taskData}
                              inputImages={[]}
                              variant="hover"
                              isMobile={false}
                            />
                          ) : (
                            <SharedMetadataDetails
                              metadata={image.metadata}
                              variant="hover"
                              isMobile={false}
                              showUserImage={true}
                            />
                          )}
                        </>
                      )}
                    </TooltipContent>
                  </Tooltip>
                )
              )}

          {/* Apply settings button temporarily disabled */}
          {false && image.metadata && onApplySettings && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Tooltip>
                      <TooltipTrigger asChild>
                          <Button 
                              variant="outline"
                              size="icon" 
                              className="h-7 w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white"
                              onClick={() => onApplySettings(image.metadata!)}
                          >
                              <Settings className="h-4 w-4 mr-1" /> Apply
                          </Button>
                      </TooltipTrigger>
                      <TooltipContent>Apply these generation settings to the form</TooltipContent>
                  </Tooltip>
              </div>
              )}
          </div>

          {/* Delete button - Desktop Bottom Right */}
              {!isMobile && onDelete && (
              <div className="absolute bottom-2 right-2 flex flex-col items-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                  {/* Delete button - Desktop */}
                  <Button 
                      variant="destructive" 
                      size="icon" 
                      className="h-7 w-7 p-0 rounded-full"
                      onClick={(e) => {
                          e.stopPropagation();
                          onDelete(image.id!);
                      }}
                      disabled={isCurrentDeleting}
                  >
                      {isCurrentDeleting ? (
                          <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-white"></div>
                      ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                      )}
                  </Button>
              </div>
          )}

          {/* Bottom Left Buttons - Star, Edit Image */}
          <div className={`absolute bottom-2 left-2 flex items-center gap-1.5 transition-opacity z-20 ${
            image.starred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}>
              {/* Star Button */}
              <Button
                  variant="secondary"
                  size="icon"
                  className="h-7 w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white"
                  onClick={() => {
                      if (isTogglingStar) return;
                      setIsTogglingStar(true);
                      const nextStarred = !image.starred;
                      try {
                        if (onToggleStar) {
                          onToggleStar(image.id!, nextStarred);
                          // Assume parent handles async; release immediately to avoid global dulling
                          setIsTogglingStar(false);
                        } else {
                          toggleStarMutation.mutate(
                            { id: image.id!, starred: nextStarred },
                            {
                              onSettled: () => {
                                setIsTogglingStar(false);
                              },
                            }
                          );
                        }
                      } catch (_) {
                        setIsTogglingStar(false);
                      }
                  }}
                  disabled={isTogglingStar}
              >
                  <Star 
                      className={`h-3.5 w-3.5 ${image.starred ? 'fill-current' : ''}`} 
                  />
              </Button>
              
              {/* Edit Image Button - Desktop and Mobile, images only */}
              {!image.isVideo && (
                <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white"
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenLightbox(image, true); // Pass true to auto-enter edit mode
                    }}
                    title="Edit image"
                >
                    <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
          </div>
      </>)
      }
    </div>
  );

  // On mobile, drag is already disabled by using the non-draggable branch.
  return isMobile ? (
    <React.Fragment key={imageKey}>
      {imageContent}
      {onCreateShot && (
        <CreateShotModal
          isOpen={isCreateShotModalOpen}
          onClose={() => setIsCreateShotModalOpen(false)}
          onSubmit={handleCreateShot}
          isLoading={isCreatingShot}
          projectId={selectedProjectId}
        />
      )}
    </React.Fragment>
  ) : (
    <DraggableImage key={`draggable-${imageKey}`} image={image} onDoubleClick={() => onOpenLightbox(image)}>
      {imageContent}
      {onCreateShot && (
        <CreateShotModal
          isOpen={isCreateShotModalOpen}
          onClose={() => setIsCreateShotModalOpen(false)}
          onSubmit={handleCreateShot}
          isLoading={isCreatingShot}
          projectId={selectedProjectId}
        />
      )}
    </DraggableImage>
  );
};

export default React.memo(ImageGalleryItem); 