import { useEffect } from 'react';
import usePersistentState from './usePersistentState';

/**
 * Hook to manage dark mode state with persistence.
 * Applies the 'dark' class to document.documentElement when enabled.
 * Also swaps the favicon to match the current theme.
 * Defaults to dark mode (true) for new users.
 */
export function useDarkMode() {
  const [darkMode, setDarkMode] = usePersistentState<boolean>('dark-mode', true);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    // Update favicon to match theme
    const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
    if (favicon) {
      favicon.href = darkMode ? '/favicon-dark.ico' : '/favicon-light.ico';
    }
  }, [darkMode]);

  const toggle = () => setDarkMode(!darkMode);

  return { darkMode, setDarkMode, toggle };
}

export default useDarkMode;

