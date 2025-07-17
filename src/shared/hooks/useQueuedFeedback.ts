/*
 * useQueuedFeedback
 * -----------------
 * A small reusable hook that provides a unified pattern for displaying
 * transient "Added to queue!" feedback on task-creation buttons.
 *
 * Usage:
 *   const { justQueued, triggerQueued } = useQueuedFeedback();
 *   // Call triggerQueued() once your task(s) are successfully queued.
 *   // Bind justQueued in your UI to swap button text, colour, etc.
 */
import { useCallback, useState } from 'react';

export const useQueuedFeedback = (displayMs: number = 3000) => {
  const [justQueued, setJustQueued] = useState(false);

  const triggerQueued = useCallback(() => {
    setJustQueued(true);
    // Reset the flag after the specified duration so the normal label returns.
    const timeout = setTimeout(() => setJustQueued(false), displayMs);
    return () => clearTimeout(timeout);
  }, [displayMs]);

  return { justQueued, triggerQueued } as const;
}; 