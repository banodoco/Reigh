/**
 * VideoEditModeDisplay Component
 *
 * Displays video with timeline overlay for portion selection (regenerate mode).
 * Video is paused by default and follows timeline marker position.
 *
 * Used in desktop layout when in video edit/regenerate mode.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Play, Pause, Trash2 } from 'lucide-react';
import { MultiPortionTimeline, formatTime } from '@/shared/components/VideoPortionTimeline';
import { cn } from '@/shared/lib/utils';
import { SEGMENT_OVERLAY_COLORS } from '@/shared/lib/segmentColors';

export interface VideoEditModeDisplayProps {
  /** Reference to the video element */
  videoRef: React.RefObject<HTMLVideoElement>;

  /** Video source URL */
  videoUrl: string;

  /** Poster/thumbnail URL */
  posterUrl?: string;

  /** Current video duration (used for timeline visibility) */
  videoDuration: number;

  /** Callback when video metadata loads */
  onLoadedMetadata: (duration: number) => void;

  /** Selections for the timeline */
  selections: Array<{
    id: string;
    start: number;
    end: number;
    prompt?: string;
  }>;

  /** Currently active selection ID */
  activeSelectionId: string | null;

  /** Callback when a selection is changed */
  onSelectionChange: (id: string, start: number, end: number) => void;

  /** Callback when a selection is clicked */
  onSelectionClick: (id: string | null) => void;

  /** Callback to remove a selection */
  onRemoveSelection: (id: string) => void;

  /** Callback to add a new selection */
  onAddSelection: () => void;

  /** Video FPS for frame number calculations */
  fps?: number;
}


export const VideoEditModeDisplay: React.FC<VideoEditModeDisplayProps> = ({
  videoRef,
  videoUrl,
  posterUrl,
  videoDuration,
  onLoadedMetadata,
  selections,
  activeSelectionId,
  onSelectionChange,
  onSelectionClick,
  onRemoveSelection,
  onAddSelection,
  fps = 16,
}) => {
  // Track current video time for overlay display
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Track video time updates
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentVideoTime(video.currentTime);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [videoRef]);

  // Check if current time is in a regeneration zone and which segment
  const regenerationZoneInfo = useMemo(() => {
    const sortedSelections = [...selections].sort((a, b) => a.start - b.start);
    for (let i = 0; i < sortedSelections.length; i++) {
      const selection = sortedSelections[i];
      if (currentVideoTime >= selection.start && currentVideoTime <= selection.end) {
        return { inZone: true, segmentIndex: i, selectionId: selection.id };
      }
    }
    return { inZone: false, segmentIndex: -1, selectionId: null };
  }, [currentVideoTime, selections]);

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (Number.isFinite(video.duration) && video.duration > 0) {
      onLoadedMetadata(video.duration);
      // Seek to start of first selection when video loads
      if (selections.length > 0 && selections[0].start > 0) {
        video.currentTime = selections[0].start;
      }
    }
  };

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center">
      {/* Position overlay - top left */}
      {videoDuration > 0 && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 text-[11px] font-mono text-white/80 bg-black/50 backdrop-blur-sm rounded px-2 py-1">
          {formatTime(currentVideoTime)}
          <span className="text-white/50 ml-1">f{Math.round(currentVideoTime * fps)}</span>
          {' '}
          <span className={cn(
            "px-1.5 py-0.5 rounded text-[10px] ml-1",
            regenerationZoneInfo.inZone
              ? SEGMENT_OVERLAY_COLORS[regenerationZoneInfo.segmentIndex % SEGMENT_OVERLAY_COLORS.length].bg + ' ' + SEGMENT_OVERLAY_COLORS[regenerationZoneInfo.segmentIndex % SEGMENT_OVERLAY_COLORS.length].text
              : "bg-white/20 text-white/70"
          )}>
            {regenerationZoneInfo.inZone ? `segment ${regenerationZoneInfo.segmentIndex + 1}` : 'keep'}
          </span>
          {/* Delete button - only show when in a segment and there's more than 1 */}
          {regenerationZoneInfo.inZone && selections.length > 1 && regenerationZoneInfo.selectionId && (
            <button
              onClick={() => onRemoveSelection(regenerationZoneInfo.selectionId!)}
              className="ml-1 p-0.5 rounded hover:bg-white/20 text-white/50 hover:text-white transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Play/Pause button overlay - center */}
      <button
        onClick={handlePlayPause}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-16 h-16 flex items-center justify-center rounded-full bg-black/50 text-white/80 hover:bg-black/70 hover:text-white transition-all opacity-0 hover:opacity-100 focus:opacity-100"
        style={{ marginTop: '-70px' }} // Offset for timeline at bottom
      >
        {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
      </button>

      <video
        ref={videoRef}
        src={videoUrl}
        poster={posterUrl}
        muted
        playsInline
        controls={false}
        preload="auto"
        className="max-w-full max-h-[calc(100%-140px)] object-contain shadow-wes border border-border/20 rounded cursor-pointer"
        style={{ WebkitAppearance: 'none' }}
        onLoadedMetadata={handleLoadedMetadata}
        onClick={handlePlayPause}
      />

      {/* Timeline overlay for portion selection */}
      {videoDuration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
          <div className="bg-black/80 backdrop-blur-sm rounded-lg p-3">
            <MultiPortionTimeline
              duration={videoDuration}
              selections={selections}
              activeSelectionId={activeSelectionId}
              onSelectionChange={onSelectionChange}
              onSelectionClick={onSelectionClick}
              onRemoveSelection={onRemoveSelection}
              videoRef={videoRef}
              videoUrl={videoUrl}
              fps={fps}
            />

            {/* Add selection button */}
            <button
              onClick={onAddSelection}
              className="mt-2 flex items-center gap-1 text-xs text-white/70 hover:text-white transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add another portion
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoEditModeDisplay;
