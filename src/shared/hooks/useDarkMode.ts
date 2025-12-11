import { useEffect } from 'react';
import usePersistentState from './usePersistentState';

/**
 * Hook to manage dark mode state with persistence.
 * Applies the 'dark' class to document.documentElement when enabled.
 */
export function useDarkMode() {
  const [darkMode, setDarkMode] = usePersistentState<boolean>('dark-mode', false);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggle = () => setDarkMode(!darkMode);

  return { darkMode, setDarkMode, toggle };
}

export default useDarkMode;

