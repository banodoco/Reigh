import React, { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { getDisplayUrl } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { useIsMobile } from '@/shared/hooks/use-mobile';

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
      videoRef.current.play().catch(() => {
        // Ignore play errors
      });
    }
  }, []);

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
      // Start auto-playing once metadata is loaded
      startAutoPlay();
    }
  }, [startAutoPlay]);

  // Initialize video and start auto-play
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setDuration(0);

    const handleCanPlay = () => {
      // Auto-start playing when video can play (unless user is actively scrubbing)
      if (!isScrubbingRef.current) {
        startAutoPlay();
      }
    };

    const handleEnded = () => {
      // Restart from beginning when video ends (if loop is enabled)
      if (loop && !isScrubbingRef.current) {
        startAutoPlay();
      }
    };

    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('ended', handleEnded);

    return () => {
      if (video) {
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('ended', handleEnded);
      }
      if (mouseMoveTimeoutRef.current) {
        clearTimeout(mouseMoveTimeoutRef.current);
        mouseMoveTimeoutRef.current = null;
      }
    };
  }, [src, loop, startAutoPlay]);

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
        preload={preloadProp}
        controls={false}
        onLoadedMetadata={handleLoadedMetadata}
        loop={loop}
        muted={muted}
        autoPlay={false} // We control play/pause manually
        playsInline
        className={cn('w-full h-full object-contain', videoClassName)}
        onDoubleClick={onDoubleClick}
        onTouchEnd={onTouchEnd}
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
