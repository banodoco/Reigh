import { useEffect } from 'react';
import usePersistentState from './usePersistentState';

/**
 * Hook to manage whether user-inputted text preserves its original casing.
 *
 * UI text is ALWAYS lowercase for aesthetic consistency.
 * This setting controls whether user-inputted text (project names, shot names,
 * prompts, etc.) is also lowercased or preserves its original case.
 *
 * - Default (false): All text lowercase, including user inputs
 * - Enabled (true): User-inputted text preserves original case via .preserve-case
 */
export function useTextCase() {
  const [preserveUserText, setPreserveUserText] = usePersistentState<boolean>('preserve-user-text', false);

  useEffect(() => {
    if (preserveUserText) {
      document.documentElement.classList.add('preserve-user-text');
    } else {
      document.documentElement.classList.remove('preserve-user-text');
    }
  }, [preserveUserText]);

  const toggle = () => setPreserveUserText(!preserveUserText);

  return { preserveUserText, setPreserveUserText, toggle };
}

export default useTextCase;
