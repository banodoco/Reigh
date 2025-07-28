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

  console.log('[QueuedFeedback] Current state:', { justQueued });

  const triggerQueued = useCallback(() => {
    console.log('[QueuedFeedback] triggerQueued called, setting justQueued to true');
    setJustQueued(true);
    // Reset the flag after the specified duration so the normal label returns.
    const timeout = setTimeout(() => {
      console.log('[QueuedFeedback] Timeout reached, resetting justQueued to false');
      setJustQueued(false);
    }, displayMs);
    return () => clearTimeout(timeout);
  }, [displayMs]);

  return { justQueued, triggerQueued } as const;
}; 