import React, { useRef, useEffect } from 'react';
import { cn, getDisplayUrl } from '@/shared/lib/utils';

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
  ...rest
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

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
        preload="metadata"
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
        className={cn('w-full h-full object-contain', videoClassName)}
        onDoubleClick={onDoubleClick}
        onTouchEnd={onTouchEnd}
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
};

export default HoverScrubVideo; 