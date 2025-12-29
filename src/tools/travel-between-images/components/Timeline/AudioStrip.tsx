import React, { useRef, useState, useCallback, useEffect } from 'react';
import { TIMELINE_PADDING_OFFSET } from './constants';
import { Button } from '@/shared/components/ui/button';
import { Play, Pause, Trash2, Volume2 } from 'lucide-react';

// Frame rate for timeline (Wan model uses 25fps)
const FRAME_RATE = 25;

interface AudioMetadata {
  duration: number;
  name?: string;
}

interface AudioStripProps {
  audioUrl: string;
  audioMetadata: AudioMetadata | null;
  onRemove: () => void;
  // Timeline coordinate system
  fullMin: number;
  fullMax: number;
  fullRange: number;
  containerWidth: number;
  zoomLevel: number;
  readOnly?: boolean;
}

export const AudioStrip: React.FC<AudioStripProps> = ({
  audioUrl,
  audioMetadata,
  onRemove,
  fullMin,
  fullMax,
  fullRange,
  containerWidth,
  zoomLevel,
  readOnly = false,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(audioMetadata?.duration || 0);
  const [isLoaded, setIsLoaded] = useState(false);

  // Calculate timeline duration in seconds from frames
  // This is the actual video duration that the timeline represents
  const timelineDuration = fullRange / FRAME_RATE;

  // Load audio metadata if not provided
  useEffect(() => {
    if (audioRef.current) {
      const handleLoadedMetadata = () => {
        setAudioDuration(audioRef.current?.duration || 0);
        setIsLoaded(true);
      };

      audioRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);

      // If already loaded
      if (audioRef.current.readyState >= 1) {
        handleLoadedMetadata();
      }

      return () => {
        audioRef.current?.removeEventListener('loadedmetadata', handleLoadedMetadata);
      };
    }
  }, [audioUrl]);

  // Update playhead position during playback using requestAnimationFrame
  // Also stop playback when we reach the end of the timeline duration
  useEffect(() => {
    if (isPlaying && audioRef.current) {
      const updatePlayhead = () => {
        if (audioRef.current) {
          const time = audioRef.current.currentTime;
          setCurrentTime(time);

          // Stop playback when we reach the end of the timeline duration
          if (time >= timelineDuration) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            setCurrentTime(0);
            setIsPlaying(false);
            return;
          }
        }
        animationRef.current = requestAnimationFrame(updatePlayhead);
      };
      animationRef.current = requestAnimationFrame(updatePlayhead);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, timelineDuration]);

  // Handle play/pause toggle
  const togglePlay = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        // Reset to start if we're at the end of the timeline
        if (currentTime >= timelineDuration) {
          audioRef.current.currentTime = 0;
          setCurrentTime(0);
        }
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying, currentTime, timelineDuration]);

  // Handle audio ended (natural end of audio file)
  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  // Handle click on strip to seek within the timeline duration
  const handleStripClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !containerRef.current || timelineDuration === 0) return;

    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;

    // Calculate position within the effective timeline area
    const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
    const normalizedX = Math.max(0, Math.min(1, (clickX - TIMELINE_PADDING_OFFSET) / effectiveWidth));

    // Seek to that position based on timeline duration (not audio duration)
    const seekTime = normalizedX * timelineDuration;
    audioRef.current.currentTime = Math.min(seekTime, audioDuration); // Don't seek beyond audio length
    setCurrentTime(seekTime);
  }, [containerWidth, timelineDuration, audioDuration]);

  // Calculate playhead position based on timeline duration
  const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
  const playheadPercent = timelineDuration > 0 ? Math.min(currentTime / timelineDuration, 1) : 0;
  const playheadX = TIMELINE_PADDING_OFFSET + (playheadPercent * effectiveWidth);

  // Format time for display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format with decimals for short durations
  const formatTimeDetailed = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={containerRef}
      className="relative h-10 mt-1 select-none"
      style={{
        width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%',
        minWidth: '100%',
      }}
    >
      {/* Audio strip background bar */}
      <div
        className="absolute inset-y-1 bg-blue-500/20 hover:bg-blue-500/30 rounded cursor-pointer transition-colors"
        style={{
          left: TIMELINE_PADDING_OFFSET,
          right: TIMELINE_PADDING_OFFSET
        }}
        onClick={handleStripClick}
      >
        {/* Audio icon and label */}
        <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-blue-400/70 pointer-events-none">
          <Volume2 className="w-3.5 h-3.5" />
          <span className="text-[10px] font-medium">
            {isLoaded
              ? `${formatTimeDetailed(currentTime)} / ${formatTimeDetailed(timelineDuration)}`
              : 'Loading...'}
          </span>
        </div>
      </div>

      {/* Playhead */}
      {isLoaded && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-blue-400 shadow-[0_0_4px_rgba(59,130,246,0.5)] pointer-events-none z-10"
          style={{
            left: `${playheadX}px`,
            transition: isPlaying ? 'none' : 'left 0.1s ease-out',
          }}
        >
          {/* Playhead handle */}
          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-blue-400 rounded-full" />
        </div>
      )}

      {/* Play/Pause button */}
      {!readOnly && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0 hover:bg-blue-500/20"
          onClick={togglePlay}
          disabled={!isLoaded}
        >
          {isPlaying ? (
            <Pause className="h-3.5 w-3.5 text-blue-400" />
          ) : (
            <Play className="h-3.5 w-3.5 text-blue-400" />
          )}
        </Button>
      )}

      {/* Delete button */}
      {!readOnly && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0 hover:bg-red-500/20"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-400" />
        </Button>
      )}

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={audioUrl}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        preload="metadata"
      />
    </div>
  );
};

export default AudioStrip;
