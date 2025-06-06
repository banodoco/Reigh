import React from 'react';
import { cn, getDisplayUrl } from '@/shared/lib/utils';
import { useVideoScrubbing } from '@/shared/hooks/useVideoScrubbing';

interface HoverScrubVideoProps extends React.HTMLAttributes<HTMLDivElement> {
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
   * Whether to show the scrubbing progress bar (defaults to true).
   */
  showProgress?: boolean;
  /**
   * Whether to show the playback-rate indicator (defaults to true).
   */
  showPlaybackRate?: boolean;
  /**
   * Loop the video (defaults to true).
   */
  loop?: boolean;
  /**
   * Mute the video (defaults to true).
   */
  muted?: boolean;
}

/**
 * HoverScrubVideo consolidates the hover-to-play and scrubbing UI so we don't
 * repeat the same logic in multiple places (list item vs. lightbox). All
 * behaviour is powered by the shared useVideoScrubbing hook.
 */
const HoverScrubVideo: React.FC<HoverScrubVideoProps> = ({
  src,
  poster,
  className,
  videoClassName,
  showProgress = true,
  showPlaybackRate = true,
  loop = true,
  muted = true,
  ...rest
}) => {
  const {
    videoRef,
    playbackRate,
    progress,
    handleMouseEnter,
    handleMouseMove,
    handleMouseLeave,
    handleSeek,
  } = useVideoScrubbing();

  return (
    <div
      className={cn('relative group', className)}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      {...rest}
    >
      <video
        ref={videoRef}
        src={getDisplayUrl(src)}
        poster={poster ? getDisplayUrl(poster) : getDisplayUrl('/placeholder.svg')}
        preload="auto"
        onLoadedData={(e) => {
          // Remove poster once we have first frame to avoid flash.
          e.currentTarget.removeAttribute('poster');
        }}
        loop={loop}
        muted={muted}
        playsInline
        className={cn('w-full h-full object-contain', videoClassName)}
      >
        Your browser does not support the video tag.
      </video>

      {showPlaybackRate && playbackRate !== null && (
        <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-md font-mono pointer-events-none z-20">
          {playbackRate.toFixed(1)}x
        </div>
      )}

      {showProgress && (
        <div
          className="absolute bottom-0 left-0 w-full h-1.5 bg-white/20 cursor-pointer z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-white"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
};

export default HoverScrubVideo; 