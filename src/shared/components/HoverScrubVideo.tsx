import React, { useRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { getDisplayUrl } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';

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
}

/**
 * Simple video component that plays on hover and pauses when mouse leaves.
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
  ...rest
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const speedOptions = [0.25, 0.5, 1, 1.5, 2];

  const handleMouseEnter = () => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {
        // Ignore play errors (e.g., if video is already playing)
      });
    }
  };

  const handleMouseLeave = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
  };

  const handleSpeedChange = (speed: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      setPlaybackRate(speed);
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Ensure the video starts paused
    video.pause();
    video.currentTime = 0;

    return () => {
      if (video) {
        video.pause();
      }
    };
  }, [src]);

  return (
    <div
      className={cn('relative group', className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...rest}
    >
      <video
        ref={videoRef}
        src={getDisplayUrl(src)}
        poster={poster ? getDisplayUrl(poster) : undefined}
        preload={preloadProp}
        controls={showNativeControls}
        onLoadedMetadata={(e) => {
          // Ensure we can see the first frame by seeking to the start
          if (e.currentTarget && e.currentTarget.currentTime === 0) {
            e.currentTarget.currentTime = 0.1;
            setTimeout(() => {
              if (e.currentTarget) {
                e.currentTarget.currentTime = 0;
              }
            }, 100);
          }
        }}
        loop={loop}
        muted={muted}
        playsInline
        className={cn('w-full h-full object-contain', videoClassName, {
          'hide-video-controls': !showNativeControls
        })}
        onDoubleClick={onDoubleClick}
        onTouchEnd={onTouchEnd}
      >
        Your browser does not support the video tag.
      </video>

      {/* Speed controls overlay */}
      {showSpeedControls && (
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