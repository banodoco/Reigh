import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

// Helper to get thumbnail path for an image
export const getThumbPath = (src: string): string => {
  if (src.startsWith('/introduction-images/')) {
    const name = src.split('/').pop()!;
    const ext = name.split('.').pop();
    const base = name.replace(`.${ext}`, '');
    return `/thumbs/${base}-thumb.${ext}`;
  }
  if (src.startsWith('/916-')) {
    return `/thumbs/${src.slice(1).replace('.jpg', '-thumb.jpg')}`;
  }
  if (src.startsWith('/h') && src.includes('-crop.webp')) {
    return `/thumbs/${src.slice(1).replace('.webp', '-thumb.webp')}`;
  }
  if (src.startsWith('/lora-') && src.endsWith('.webp')) {
    return `/thumbs/${src.slice(1).replace('.webp', '-thumb.webp')}`;
  }
  if (src.endsWith('-poster.jpg')) {
    return `/thumbs/${src.slice(1).replace('.jpg', '-thumb.jpg')}`;
  }
  if (src.startsWith('/example-image')) {
    return `/thumbs/${src.slice(1).replace('.jpg', '-thumb.jpg')}`;
  }
  return src; // No thumb available, use original
};

interface VideoWithPosterProps {
  src: string;
  poster: string;
  showPoster: boolean;
  posterLoaded: boolean;
  showPlayButton: boolean;
  onPlay: () => void;
  onEnded?: () => void;
  onTimeUpdate?: (video: HTMLVideoElement) => void;
  onPosterLoad?: (src: string) => void;
  onPosterRef?: (img: HTMLImageElement | null, src: string) => void;
  className?: string;
  playButtonSize?: 'sm' | 'md' | 'lg';
  preload?: 'none' | 'metadata' | 'auto';
}

/**
 * Video player with thumbnail → full poster → play button overlay pattern.
 *
 * Poster visibility logic:
 * - Thumbnail always loads first (low quality placeholder)
 * - Full poster fades in when loaded
 * - Both hide when video starts playing
 * - Play button shows when showPlayButton is true
 */
export const VideoWithPoster = forwardRef<HTMLVideoElement, VideoWithPosterProps>(({
  src,
  poster,
  showPoster,
  posterLoaded,
  showPlayButton,
  onPlay,
  onEnded,
  onTimeUpdate,
  onPosterLoad,
  onPosterRef,
  className,
  playButtonSize = 'lg',
  preload = 'metadata',
}, ref) => {
  const buttonSizeClasses = {
    sm: 'w-6 h-6 sm:w-8 sm:h-8',
    md: 'w-8 h-8 sm:w-10 sm:h-10',
    lg: 'w-8 h-8 sm:w-12 sm:h-12',
  };

  return (
    <>
      <video
        ref={ref}
        src={src}
        muted
        playsInline
        preload={preload}
        className="w-full h-full object-cover"
        onTimeUpdate={onTimeUpdate ? (e) => onTimeUpdate(e.currentTarget) : undefined}
        onEnded={onEnded}
      />

      {/* Thumbnail - always visible initially as low-quality placeholder */}
      <img
        src={getThumbPath(poster)}
        alt=""
        className={cn(
          "absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300",
          !showPoster && "opacity-0"
        )}
      />

      {/* Full poster - fades in on top of thumbnail when loaded */}
      <img
        ref={onPosterRef ? (img) => onPosterRef(img, poster) : undefined}
        src={poster}
        alt=""
        onLoad={onPosterLoad ? () => onPosterLoad(poster) : undefined}
        className={cn(
          "absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300",
          (!showPoster || !posterLoaded) && "opacity-0"
        )}
      />

      {/* Play button overlay */}
      <button
        onClick={onPlay}
        className={cn(
          "absolute inset-0 bg-black/40 flex items-center justify-center text-white hover:bg-black/50 transition-all duration-300",
          showPlayButton ? "opacity-100" : "opacity-0 pointer-events-none",
          className
        )}
      >
        <svg className={buttonSizeClasses[playButtonSize]} fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z"/>
        </svg>
      </button>
    </>
  );
});

VideoWithPoster.displayName = 'VideoWithPoster';
