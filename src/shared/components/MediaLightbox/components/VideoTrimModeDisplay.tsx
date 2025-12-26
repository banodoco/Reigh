/**
 * VideoTrimModeDisplay Component
 *
 * Displays video that plays within the trimmed region and loops automatically.
 * Constrains playback to the "keep" region (startTrim to duration - endTrim).
 *
 * Used in desktop and mobile layouts when in video trim mode.
 */

import React from 'react';

export interface TrimState {
  startTrim: number;
  endTrim: number;
  videoDuration: number;
}

export interface VideoTrimModeDisplayProps {
  /** Reference to the video element */
  videoRef: React.RefObject<HTMLVideoElement>;

  /** Video source URL */
  videoUrl: string;

  /** Poster/thumbnail URL */
  posterUrl?: string;

  /** Current trim state */
  trimState: TrimState;

  /** Callback when video metadata loads */
  onLoadedMetadata: (duration: number) => void;

  /** Callback on time update (for syncing current time display) */
  onTimeUpdate: (currentTime: number) => void;

  /** Additional className for the video element */
  className?: string;
}

export const VideoTrimModeDisplay: React.FC<VideoTrimModeDisplayProps> = ({
  videoRef,
  videoUrl,
  posterUrl,
  trimState,
  onLoadedMetadata,
  onTimeUpdate,
  className = "max-w-full max-h-full object-contain shadow-wes border border-border/20 rounded",
}) => {
  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (Number.isFinite(video.duration) && video.duration > 0) {
      onLoadedMetadata(video.duration);
      // Seek to start of keep region when video loads
      video.currentTime = trimState.startTrim;
    }
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    onTimeUpdate(video.currentTime);

    // Constrain playback to keep region (startTrim to duration - endTrim)
    const keepStart = trimState.startTrim;
    const keepEnd = trimState.videoDuration - trimState.endTrim;

    if (video.currentTime >= keepEnd) {
      // Loop back to start of keep region and ensure playing
      video.currentTime = keepStart;
      if (video.paused) {
        video.play().catch(() => {});
      }
    } else if (video.currentTime < keepStart) {
      // Jump to start of keep region if before it
      video.currentTime = keepStart;
      if (video.paused) {
        video.play().catch(() => {});
      }
    }
  };

  const handleEnded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    // If video reaches the actual end, loop back to keep region start
    const video = e.currentTarget;
    video.currentTime = trimState.startTrim;
    video.play().catch(() => {});
  };

  return (
    <video
      ref={videoRef}
      src={videoUrl}
      poster={posterUrl}
      muted
      playsInline
      controls
      autoPlay
      loop={false}
      preload="auto"
      className={className}
      onLoadedMetadata={handleLoadedMetadata}
      onTimeUpdate={handleTimeUpdate}
      onEnded={handleEnded}
    />
  );
};

export default VideoTrimModeDisplay;
