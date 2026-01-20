/**
 * useVideoScrubbing - Reusable hook for video scrubbing behavior
 *
 * Extracts the core scrubbing logic so it can be used in different UI patterns:
 * - Traditional: scrub container and video are the same element (HoverScrubVideo)
 * - Separated: scrub on thumbnails, preview plays in a different container (SegmentOutputStrip)
 *
 * Mouse position directly controls video seek position (timeline-style scrubbing).
 */

import { useRef, useState, useCallback, useEffect } from 'react';

export interface UseVideoScrubbingOptions {
  /** Whether scrubbing is enabled */
  enabled?: boolean;
  /** Start playing after user stops scrubbing (but stays hovering) */
  playOnStopScrubbing?: boolean;
  /** Delay in ms before auto-play starts (default: 400) */
  playDelay?: number;
  /** Reset video to beginning on mouse leave (default: true) */
  resetOnLeave?: boolean;
  /** Callback when scrub progress changes */
  onProgressChange?: (progress: number, currentTime: number) => void;
  /** Callback when hover starts */
  onHoverStart?: () => void;
  /** Callback when hover ends */
  onHoverEnd?: () => void;
  /** Callback when playback starts */
  onPlayStart?: () => void;
  /** Callback when playback pauses */
  onPlayPause?: () => void;
}

export interface UseVideoScrubbingReturn {
  /** Ref to attach to the scrub trigger container */
  containerRef: React.RefObject<HTMLDivElement>;

  /** Props to spread on the trigger container */
  containerProps: {
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };

  /** Ref to attach to the video element (can be anywhere in DOM) */
  videoRef: React.RefObject<HTMLVideoElement>;

  /** Props to spread on the video element */
  videoProps: {
    onLoadedMetadata: () => void;
  };

  /** Current scrub progress (0-1) */
  progress: number;

  /** Current time in seconds */
  currentTime: number;

  /** Video duration in seconds */
  duration: number;

  /** Scrubber position as percentage (0-100), null when not scrubbing */
  scrubberPosition: number | null;

  /** Whether scrubber should be visible */
  scrubberVisible: boolean;

  /** Whether mouse is over the trigger container */
  isHovering: boolean;

  /** Whether video is currently playing */
  isPlaying: boolean;

  /** Manually set the video to control (for external video refs) */
  setVideoElement: (video: HTMLVideoElement | null) => void;

  /** Manually set the duration (useful when video metadata isn't loaded yet) */
  setDuration: (duration: number) => void;

  /** Manually seek to a progress value (0-1) */
  seekToProgress: (progress: number) => void;

  /** Start playback */
  play: () => void;

  /** Pause playback */
  pause: () => void;

  /** Reset state (useful when switching videos) */
  reset: () => void;
}

export function useVideoScrubbing(
  options: UseVideoScrubbingOptions = {}
): UseVideoScrubbingReturn {
  const {
    enabled = true,
    playOnStopScrubbing = true,
    playDelay = 400,
    resetOnLeave = true,
    onProgressChange,
    onHoverStart,
    onHoverEnd,
    onPlayStart,
    onPlayPause,
  } = options;

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const externalVideoRef = useRef<HTMLVideoElement | null>(null);
  const mouseMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringRef = useRef(false);
  const lastMouseXRef = useRef<number | null>(null);

  // State
  const [duration, setDurationState] = useState(0);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [scrubberPosition, setScrubberPosition] = useState<number | null>(null);
  const [scrubberVisible, setScrubberVisible] = useState(true);
  const [isHovering, setIsHovering] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  // Track when video element changes to re-run effects
  const [videoElementVersion, setVideoElementVersion] = useState(0);

  // Get the active video element (external or internal ref)
  const getVideo = useCallback(() => {
    return externalVideoRef.current || videoRef.current;
  }, []);

  // Set external video element
  const setVideoElement = useCallback((video: HTMLVideoElement | null) => {
    externalVideoRef.current = video;
    // Increment version to trigger re-run of event listener effects
    setVideoElementVersion(v => v + 1);
    if (video && video.duration && Number.isFinite(video.duration)) {
      setDurationState(video.duration);
    }
  }, []);

  // Set duration manually
  const setDuration = useCallback((dur: number) => {
    if (Number.isFinite(dur) && dur > 0) {
      setDurationState(dur);
    }
  }, []);

  // Reset state
  const reset = useCallback(() => {
    setProgress(0);
    setCurrentTime(0);
    setScrubberPosition(null);
    setScrubberVisible(true);
    setIsPlaying(false);
    lastMouseXRef.current = null;

    if (mouseMoveTimeoutRef.current) {
      clearTimeout(mouseMoveTimeoutRef.current);
      mouseMoveTimeoutRef.current = null;
    }
  }, []);

  // Seek to progress
  const seekToProgress = useCallback((prog: number) => {
    const video = getVideo();
    const dur = duration || (video?.duration ?? 0);

    if (!Number.isFinite(dur) || dur <= 0) return;

    const clampedProgress = Math.max(0, Math.min(1, prog));
    const targetTime = clampedProgress * dur;

    if (Number.isFinite(targetTime)) {
      if (video) {
        video.currentTime = targetTime;
      }
      setProgress(clampedProgress);
      setCurrentTime(targetTime);
      onProgressChange?.(clampedProgress, targetTime);
    }
  }, [duration, getVideo, onProgressChange]);

  // Play
  const play = useCallback(() => {
    const video = getVideo();
    if (video) {
      video.play().catch(() => {
        // Ignore autoplay errors
      });
    }
  }, [getVideo]);

  // Pause
  const pause = useCallback(() => {
    const video = getVideo();
    if (video) {
      video.pause();
    }
  }, [getVideo]);

  // Handle mouse move (scrubbing)
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    console.log('[useVideoScrubbing] 🖱️ handleMouseMove called', { enabled, hasContainer: !!containerRef.current });
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    lastMouseXRef.current = mouseX;

    const prog = Math.max(0, Math.min(1, mouseX / rect.width));

    // Always show scrubber position (percentage-based) even if duration isn't ready
    setScrubberPosition(prog * 100);
    setScrubberVisible(true);
    setProgress(prog);

    const video = getVideo();
    const dur = duration || (video?.duration ?? 0);

    if (!Number.isFinite(dur) || dur <= 0) {
      // Duration not ready - try to load video
      if (video && video.readyState === 0) {
        video.load();
      }
      // Still fire callback with progress (useful for UI that doesn't need actual seek)
      onProgressChange?.(prog, 0);
      return;
    }

    const targetTime = prog * dur;
    if (!Number.isFinite(targetTime)) return;

    // Pause and seek
    if (video) {
      video.pause();
      video.currentTime = targetTime;
      setIsPlaying(false);
    }
    setCurrentTime(targetTime);

    onProgressChange?.(prog, targetTime);

    // Clear existing timeout
    if (mouseMoveTimeoutRef.current) {
      clearTimeout(mouseMoveTimeoutRef.current);
      mouseMoveTimeoutRef.current = null;
    }

    // Start playing after delay if enabled
    if (playOnStopScrubbing) {
      console.log('[useVideoScrubbing] ⏱️ Setting autoplay timeout', { playDelay, isHovering: isHoveringRef.current });
      mouseMoveTimeoutRef.current = setTimeout(() => {
        const currentVideo = getVideo();
        console.log('[useVideoScrubbing] ⏱️ Autoplay timeout fired', {
          hasVideo: !!currentVideo,
          isHovering: isHoveringRef.current,
          videoSrc: currentVideo?.src?.substring(currentVideo.src.lastIndexOf('/') + 1) || 'no-src',
        });
        if (currentVideo && isHoveringRef.current) {
          setScrubberVisible(false);
          currentVideo.play().catch((err) => {
            console.log('[useVideoScrubbing] ❌ Autoplay failed', err);
          });
          setIsPlaying(true);
          onPlayStart?.();
        }
      }, playDelay);
    }
  }, [enabled, duration, getVideo, playOnStopScrubbing, playDelay, onProgressChange, onPlayStart]);

  // Handle mouse enter
  const handleMouseEnter = useCallback(() => {
    if (!enabled) return;

    isHoveringRef.current = true;
    setIsHovering(true);
    onHoverStart?.();

    const video = getVideo();
    if (video) {
      // Prime video loading if needed
      if (video.readyState === 0) {
        video.load();
      }
      video.pause();
      setIsPlaying(false);
    }
  }, [enabled, getVideo, onHoverStart]);

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    if (!enabled) return;

    isHoveringRef.current = false;
    setIsHovering(false);
    lastMouseXRef.current = null;
    setScrubberPosition(null);
    setScrubberVisible(true);

    if (mouseMoveTimeoutRef.current) {
      clearTimeout(mouseMoveTimeoutRef.current);
      mouseMoveTimeoutRef.current = null;
    }

    const video = getVideo();
    if (video) {
      video.pause();
      if (resetOnLeave) {
        video.currentTime = 0;
        setProgress(0);
        setCurrentTime(0);
      }
      setIsPlaying(false);
    }

    onHoverEnd?.();
    onPlayPause?.();
  }, [enabled, resetOnLeave, getVideo, onHoverEnd, onPlayPause]);

  // Handle video metadata loaded
  const handleLoadedMetadata = useCallback(() => {
    const video = getVideo();
    if (!video) return;

    const newDuration = video.duration;
    if (!Number.isFinite(newDuration) || newDuration <= 0) return;

    setDurationState(newDuration);

    // Recalculate scrubber if user was hovering while metadata loaded
    if (isHoveringRef.current && lastMouseXRef.current !== null && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const prog = Math.max(0, Math.min(1, lastMouseXRef.current / rect.width));
      const targetTime = prog * newDuration;

      if (Number.isFinite(targetTime)) {
        setScrubberPosition(prog * 100);
        setScrubberVisible(true);
        setProgress(prog);
        setCurrentTime(targetTime);

        video.pause();
        video.currentTime = targetTime;
        onProgressChange?.(prog, targetTime);
      }
    }
  }, [getVideo, onProgressChange]);

  // Track video play/pause state and time updates during playback
  useEffect(() => {
    const video = getVideo();
    if (!video) return;

    const handlePlay = () => {
      setIsPlaying(true);
      onPlayStart?.();
    };

    const handlePause = () => {
      setIsPlaying(false);
      onPlayPause?.();
    };

    const handleDurationChange = () => {
      if (video.duration && Number.isFinite(video.duration)) {
        setDurationState(video.duration);
      }
    };

    // Update progress/currentTime during playback
    const handleTimeUpdate = () => {
      const dur = video.duration;
      if (!Number.isFinite(dur) || dur <= 0) return;

      const time = video.currentTime;
      const prog = time / dur;

      setCurrentTime(time);
      setProgress(prog);
      setScrubberPosition(prog * 100);
      onProgressChange?.(prog, time);
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [getVideo, onPlayStart, onPlayPause, onProgressChange, videoElementVersion]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mouseMoveTimeoutRef.current) {
        clearTimeout(mouseMoveTimeoutRef.current);
      }
    };
  }, []);

  return {
    containerRef,
    containerProps: {
      onMouseMove: handleMouseMove,
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
    },
    videoRef,
    videoProps: {
      onLoadedMetadata: handleLoadedMetadata,
    },
    progress,
    currentTime,
    duration,
    scrubberPosition,
    scrubberVisible,
    isHovering,
    isPlaying,
    setVideoElement,
    setDuration,
    seekToProgress,
    play,
    pause,
    reset,
  };
}

export default useVideoScrubbing;
