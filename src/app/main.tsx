// -----------------------------------------------------------------------------
// *** Global console output suppression ***
// Runs before any other imports so third-party modules can't spam the console.
// Enable verbose output only when VITE_DEBUG_LOGS=true is set.
// -----------------------------------------------------------------------------
if (import.meta.env.VITE_DEBUG_LOGS !== 'true') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-global-assign
  ['log', 'info', 'debug', 'warn'].forEach((method) => {
    // @ts-ignore: dynamic assignment of console methods
    console[method] = (..._args: any[]) => {};
  });
}

import { createRoot } from 'react-dom/client';
import { Profiler } from 'react';
import App from './App.tsx';
import '@/index.css';
import { reactProfilerOnRender } from '@/shared/lib/logger';
import { initializeTheme } from '@/shared/lib/theme-switcher';

// Initialize autoplay monitoring in development (after console suppression check)
if (import.meta.env.NODE_ENV === 'development') {
  import('@/shared/utils/autoplayMonitor');
}

// Import cache validator for debugging (only in development)
if (import.meta.env.DEV) {
  import('../shared/lib/simpleCacheValidator');
}

// Initialize theme system
initializeTheme();

// Add global theme switching helpers for debugging
if (import.meta.env.DEV) {
  (window as any).switchTheme = (themeName: 'lala-land' | 'wes-anderson' | 'cat-lounging') => {
    const { switchTheme } = require('@/shared/lib/theme-switcher');
    switchTheme(themeName);
    console.log(`Switched to ${themeName} theme`);
  };
  
  (window as any).getAvailableThemes = () => {
    const { getAvailableThemes } = require('@/shared/lib/theme-switcher');
    return getAvailableThemes();
  };
  
  console.log('Theme helpers available:');
  console.log('- switchTheme("wes-anderson")');
  console.log('- switchTheme("lala-land")');
  console.log('- switchTheme("cat-lounging")');
  console.log('- getAvailableThemes()');
}

createRoot(document.getElementById('root')!).render(
  <Profiler id="Root" onRender={reactProfilerOnRender}>
    <App />
  </Profiler>
);