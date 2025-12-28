import { useState, useRef, useEffect, useCallback } from 'react';

type ButtonState = 'idle' | 'submitting' | 'success';

interface SubmitButtonStateOptions {
  /** Duration of "Submitting..." state in ms (default: 1000) */
  submittingDuration?: number;
  /** Duration of success state in ms (default: 2000) */
  successDuration?: number;
}

interface SubmitButtonStateResult {
  /** True when in "submitting" state */
  isSubmitting: boolean;
  /** True when in "success" state */
  isSuccess: boolean;
  /** Current state value */
  state: ButtonState;
  /** Trigger the state transition: idle → submitting → success → idle */
  trigger: () => void;
  /** Reset to idle immediately */
  reset: () => void;
}

/**
 * Hook for managing submit button state transitions.
 * Provides a consistent UX pattern: idle → submitting → success → idle
 *
 * Handles cleanup on unmount and clears existing transitions on re-trigger.
 *
 * @example
 * ```tsx
 * const submitButton = useSubmitButtonState();
 *
 * const handleSubmit = () => {
 *   submitButton.trigger();
 *   // Start background work...
 * };
 *
 * <Button
 *   disabled={submitButton.isSubmitting}
 *   variant={submitButton.isSuccess ? "success" : "default"}
 * >
 *   {submitButton.isSuccess ? "Done!" : submitButton.isSubmitting ? "Submitting..." : "Submit"}
 * </Button>
 * ```
 */
export function useSubmitButtonState(options: SubmitButtonStateOptions = {}): SubmitButtonStateResult {
  const { submittingDuration = 1000, successDuration = 2000 } = options;

  const [state, setState] = useState<ButtonState>('idle');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const trigger = useCallback(() => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setState('submitting');
    timeoutRef.current = setTimeout(() => {
      setState('success');
      timeoutRef.current = setTimeout(() => {
        setState('idle');
      }, successDuration);
    }, submittingDuration);
  }, [submittingDuration, successDuration]);

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setState('idle');
  }, []);

  return {
    isSubmitting: state === 'submitting',
    isSuccess: state === 'success',
    state,
    trigger,
    reset,
  };
}
