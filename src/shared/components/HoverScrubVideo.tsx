import React, { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { getDisplayUrl } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { useIsMobile } from '@/shared/hooks/use-mobile';

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
  ...rest
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringRef = useRef(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [duration, setDuration] = useState(0);
  const [scrubberPosition, setScrubberPosition] = useState<number | null>(null);
  const [scrubberVisible, setScrubberVisible] = useState(true);
  const speedOptions = [0.25, 0.5, 1, 1.5, 2];
  const isMobile = useIsMobile();
  
  // Debug mobile detection
  React.useEffect(() => {
    console.log('[MobileVideoAutoplay] Mobile detection result:', {
      isMobile,
      disableScrubbing,
      userAgent: navigator.userAgent,
      src,
      poster,
      isEmulatedMobile: /Chrome/.test(navigator.userAgent) && isMobile, // Detect Chrome mobile emulation
      isLightboxMode: disableScrubbing,
      timestamp: Date.now()
    });
  }, [isMobile, src, poster, disableScrubbing]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Skip mouse interactions on mobile devices or when scrubbing is disabled
    if (isMobile || disableScrubbing) {
      if (isMobile) {
        console.log('[MobileVideoAutoplay] Mouse move detected on mobile (should be ignored)', {
          src,
          timestamp: Date.now(),
          eventType: e.type
        });
      }
      return;
    }
    if (!videoRef.current || !containerRef.current || duration === 0) return;

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
  }, [duration, isMobile, disableScrubbing]);

  const handleMouseEnter = useCallback(() => {
    // Skip hover interactions on mobile devices or when scrubbing is disabled
    if (isMobile || disableScrubbing) {
      if (isMobile) {
        console.log('[MobileVideoAutoplay] Mouse enter detected on mobile (should be ignored)', {
          src,
          timestamp: Date.now()
        });
      }
      return;
    }
    
    isHoveringRef.current = true;
    if (videoRef.current) {
      // Don't start playing immediately, wait for mouse movement or timeout
      videoRef.current.pause();
    }
  }, [isMobile, disableScrubbing]);

  const handleMouseLeave = useCallback(() => {
    // Skip hover interactions on mobile devices or when scrubbing is disabled
    if (isMobile || disableScrubbing) {
      if (isMobile) {
        console.log('[MobileVideoAutoplay] Mouse leave detected on mobile (should be ignored)', {
          src,
          timestamp: Date.now()
        });
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
  }, [isMobile, disableScrubbing]);

  const handleSpeedChange = (speed: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      setPlaybackRate(speed);
    }
  };

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      console.log('[MobileVideoAutoplay] handleLoadedMetadata called', {
        isMobile,
        videoPaused: videoRef.current.paused,
        videoCurrentTime: videoRef.current.currentTime,
        videoDuration: videoRef.current.duration,
        videoSrc: videoRef.current.src,
        timestamp: Date.now()
      });

      setDuration(videoRef.current.duration);
      
      // Ensure video is paused first to prevent autoplay
      if (!videoRef.current.paused) {
        console.warn('[MobileVideoAutoplay] Video was playing during metadata load, pausing it', {
          isMobile,
          videoSrc: videoRef.current.src,
          timestamp: Date.now()
        });
        videoRef.current.pause();
      }
      
      // Set to first frame to show as poster - but only for gallery thumbnails, not lightbox
      if (!disableScrubbing && videoRef.current.currentTime === 0) {
        // Very small seek to ensure first frame is visible
        videoRef.current.currentTime = 0.001;
        console.log('[MobileVideoAutoplay] Set currentTime to show first frame', {
          isMobile,
          disableScrubbing,
          newCurrentTime: videoRef.current.currentTime,
          timestamp: Date.now()
        });
      } else if (disableScrubbing) {
        console.log('[MobileVideoAutoplay] Skipping currentTime manipulation in lightbox mode', {
          isMobile,
          disableScrubbing,
          currentTime: videoRef.current.currentTime,
          timestamp: Date.now()
        });
      }
    }
  }, [isMobile, disableScrubbing]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    console.log('[MobileVideoAutoplay] useEffect[src] called', {
      isMobile,
      src,
      videoPaused: video.paused,
      videoCurrentTime: video.currentTime,
      timestamp: Date.now()
    });

    // Ensure the video starts paused
    video.pause();
    if (!disableScrubbing) {
      // Only reset currentTime for gallery thumbnails, not lightbox
      video.currentTime = 0;
    }
    setDuration(0);

    // Add event listeners to track unexpected play events
    const handlePlay = () => {
      console.warn('[MobileVideoAutoplay] Video started playing unexpectedly', {
        isMobile,
        src: video.src,
        currentTime: video.currentTime,
        isHovering: isHoveringRef.current,
        timestamp: Date.now(),
        stackTrace: new Error().stack
      });
      
      // Immediately pause if on mobile and not expected to be playing
      if (isMobile && !isHoveringRef.current) {
        console.warn('[MobileVideoAutoplay] Force pausing unexpected autoplay on mobile', {
          src: video.src,
          timestamp: Date.now()
        });
        video.pause();
      }
    };

    const handlePause = () => {
      console.log('[MobileVideoAutoplay] Video paused', {
        isMobile,
        src: video.src,
        currentTime: video.currentTime,
        timestamp: Date.now()
      });
    };

    const handleSeeked = () => {
      console.log('[MobileVideoAutoplay] Video seeked', {
        isMobile,
        src: video.src,
        currentTime: video.currentTime,
        paused: video.paused,
        timestamp: Date.now()
      });
      
      // Ensure video stays paused after seeking on mobile
      if (isMobile && !video.paused) {
        console.warn('[MobileVideoAutoplay] Video started playing after seek on mobile, pausing', {
          src: video.src,
          timestamp: Date.now()
        });
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
  }, [src, isMobile, disableScrubbing]);

  // Additional mobile protection - use Intersection Observer to detect when video becomes visible
  // Only for gallery thumbnails, not lightbox
  useEffect(() => {
    if (!isMobile || !videoRef.current || disableScrubbing) return;

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
    if (!isMobile || disableScrubbing) return;

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
      onMouseEnter={isMobile || disableScrubbing ? undefined : handleMouseEnter}
      onMouseLeave={isMobile || disableScrubbing ? undefined : handleMouseLeave}
      onMouseMove={isMobile || disableScrubbing ? undefined : handleMouseMove}
      {...rest}
    >
      <video
        ref={videoRef}
        src={getDisplayUrl(src)}
        poster={undefined}
        preload={isMobile ? 'metadata' : preloadProp}
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
          console.log('[MobileVideoAutoplay] onTouchEnd called', {
            isMobile,
            src: getDisplayUrl(src),
            videoPaused: videoRef.current?.paused,
            timestamp: Date.now()
          });
          onTouchEnd?.(e);
        }}
        onTouchStart={(e) => {
          console.log('[MobileVideoAutoplay] onTouchStart called', {
            isMobile,
            src: getDisplayUrl(src),
            videoPaused: videoRef.current?.paused,
            timestamp: Date.now()
          });
        }}
        onTouchMove={(e) => {
          console.log('[MobileVideoAutoplay] onTouchMove called', {
            isMobile,
            src: getDisplayUrl(src),
            videoPaused: videoRef.current?.paused,
            timestamp: Date.now()
          });
        }}
        onClick={(e) => {
          console.log('[MobileVideoAutoplay] onClick called', {
            isMobile,
            src: getDisplayUrl(src),
            videoPaused: videoRef.current?.paused,
            timestamp: Date.now()
          });
        }}
        onLoadStart={() => {
          console.log('[MobileVideoAutoplay] onLoadStart called', {
            isMobile,
            src: getDisplayUrl(src),
            timestamp: Date.now()
          });
        }}
        onLoadedData={() => {
          console.log('[MobileVideoAutoplay] onLoadedData called', {
            isMobile,
            src: getDisplayUrl(src),
            videoPaused: videoRef.current?.paused,
            timestamp: Date.now()
          });
        }}
        onCanPlay={() => {
          console.log('[MobileVideoAutoplay] onCanPlay called', {
            isMobile,
            src: getDisplayUrl(src),
            videoPaused: videoRef.current?.paused,
            posterSrc: poster ? getDisplayUrl(poster) : 'none',
            timestamp: Date.now()
          });
          // Prevent autoplay on mobile only for gallery thumbnails (scrubbing enabled)
          if (!disableScrubbing && isMobile && videoRef.current && !videoRef.current.paused) {
            console.warn('[MobileVideoAutoplay] Forcing pause on canPlay event (mobile thumbnail)', {
              src: getDisplayUrl(src),
              timestamp: Date.now()
            });
            videoRef.current.pause();
          }
        }}
        onError={(e) => {
          console.error('[MobileVideoAutoplay] Video error occurred', {
            isMobile,
            src: getDisplayUrl(src),
            error: e.currentTarget.error,
            posterSrc: poster ? getDisplayUrl(poster) : 'none',
            timestamp: Date.now()
          });
        }}
        onSuspend={() => {
          console.log('[MobileVideoAutoplay] Video suspended', {
            isMobile,
            src: getDisplayUrl(src),
            timestamp: Date.now()
          });
        }}
        onWaiting={() => {
          console.log('[MobileVideoAutoplay] Video waiting', {
            isMobile,
            src: getDisplayUrl(src),
            timestamp: Date.now()
          });
        }}
      >
        Your browser does not support the video tag.
      </video>

      {/* Scrubber Line - Desktop only and when scrubbing is enabled */}
      {!isMobile && !disableScrubbing && scrubberPosition !== null && (
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
      {!isMobile && !disableScrubbing && showSpeedControls && (
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