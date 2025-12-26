/**
 * VideoEditModeDisplay Component
 *
 * Displays video with timeline overlay for portion selection (regenerate mode).
 * Video is paused by default and follows timeline marker position.
 *
 * Used in desktop layout when in video edit/regenerate mode.
 */

import React from 'react';
import { Plus } from 'lucide-react';
import { MultiPortionTimeline } from '@/shared/components/VideoPortionTimeline';

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
}) => {
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

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center">
      <video
        ref={videoRef}
        src={videoUrl}
        poster={posterUrl}
        muted
        playsInline
        controls
        preload="auto"
        className="max-w-full max-h-[calc(100%-140px)] object-contain shadow-wes border border-border/20 rounded"
        onLoadedMetadata={handleLoadedMetadata}
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
              fps={16}
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
