import { useState, useRef, useCallback } from 'react';

// Timing constants - keep CSS and JS in sync
export const AUTO_ADVANCE_DELAY_MS = 3800;
export const AUTO_ADVANCE_ANIMATION_DURATION = '3.75s';

interface UseTravelAutoAdvanceOptions {
  totalExamples: number;
  onExampleChange: (idx: number) => void;
}

interface UseTravelAutoAdvanceReturn {
  // State
  videoEnded: Set<number>;
  videoPlayed: Set<number>;
  nextAdvanceIdx: number | null;
  prevAdvanceIdx: number | null;
  drainingIdx: number | null;
  videoProgress: number;

  // Actions
  handleVideoEnded: (idx: number) => void;
  handleVideoTimeUpdate: (idx: number, currentTime: number, duration: number, selectedIdx: number) => void;
  handleManualSelect: (idx: number) => void;
  handleVideoStarted: (idx: number) => void;
  resetAll: () => void;
  setVideoProgress: (progress: number) => void;
}

/**
 * Hook to manage the auto-advance animation state for travel example videos.
 *
 * Flow:
 * 1. Video plays, progress fill grows left-to-right
 * 2. Video ends → border animation starts (reveals on next, hides on current)
 * 3. After delay → switch to next video, drain fill on previous
 */
export function useTravelAutoAdvance({
  totalExamples,
  onExampleChange,
}: UseTravelAutoAdvanceOptions): UseTravelAutoAdvanceReturn {
  // Which videos have ended (showing play button)
  const [videoEnded, setVideoEnded] = useState<Set<number>>(
    new Set(Array.from({ length: totalExamples }, (_, i) => i))
  );
  // Which videos have played at least once (to hide poster after first play)
  const [videoPlayed, setVideoPlayed] = useState<Set<number>>(new Set());

  // Animation state
  const [nextAdvanceIdx, setNextAdvanceIdx] = useState<number | null>(null);
  const [prevAdvanceIdx, setPrevAdvanceIdx] = useState<number | null>(null);
  const [drainingIdx, setDrainingIdx] = useState<number | null>(null);
  const [videoProgress, setVideoProgress] = useState<number>(0);

  // Refs
  const autoAdvanceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProgressUpdateRef = useRef<number>(0);

  const clearAutoAdvance = useCallback(() => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
  }, []);

  const handleVideoEnded = useCallback((idx: number) => {
    setVideoEnded(prev => new Set(prev).add(idx));

    // Start border animation AND fill drain on current selector simultaneously
    const nextIdx = (idx + 1) % totalExamples;
    setNextAdvanceIdx(nextIdx);
    setPrevAdvanceIdx(idx);
    setDrainingIdx(idx); // Drain fill at same time as border

    // After animation completes, switch to next video
    autoAdvanceTimeoutRef.current = setTimeout(() => {
      setNextAdvanceIdx(null);
      setPrevAdvanceIdx(null);
      setDrainingIdx(null); // Clear drain state
      setVideoProgress(0);
      onExampleChange(nextIdx);
    }, AUTO_ADVANCE_DELAY_MS);
  }, [totalExamples, onExampleChange]);

  const handleVideoTimeUpdate = useCallback((
    idx: number,
    currentTime: number,
    duration: number,
    selectedIdx: number
  ) => {
    if (idx !== selectedIdx || !duration) return;

    const now = Date.now();
    if (now - lastProgressUpdateRef.current < 100) return;
    lastProgressUpdateRef.current = now;

    const progress = (currentTime / duration) * 100;
    setVideoProgress(progress);
  }, []);

  const handleManualSelect = useCallback((idx: number) => {
    clearAutoAdvance();
    setNextAdvanceIdx(null);
    setPrevAdvanceIdx(null);
    setDrainingIdx(null);
    setVideoProgress(0);
    onExampleChange(idx);
  }, [clearAutoAdvance, onExampleChange]);

  const handleVideoStarted = useCallback((idx: number) => {
    setVideoEnded(prev => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
    setVideoPlayed(prev => new Set(prev).add(idx));
  }, []);

  const resetAll = useCallback(() => {
    clearAutoAdvance();
    setVideoEnded(new Set(Array.from({ length: totalExamples }, (_, i) => i)));
    setVideoPlayed(new Set());
    setNextAdvanceIdx(null);
    setPrevAdvanceIdx(null);
    setDrainingIdx(null);
    setVideoProgress(0);
  }, [clearAutoAdvance, totalExamples]);

  return {
    videoEnded,
    videoPlayed,
    nextAdvanceIdx,
    prevAdvanceIdx,
    drainingIdx,
    videoProgress,
    handleVideoEnded,
    handleVideoTimeUpdate,
    handleManualSelect,
    handleVideoStarted,
    resetAll,
    setVideoProgress,
  };
}
