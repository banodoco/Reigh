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

// Initialize autoplay monitoring in development (after console suppression check)
if (import.meta.env.NODE_ENV === 'development') {
  import('@/shared/utils/autoplayMonitor');
}

// Import cache validator for debugging (only in development)
if (import.meta.env.DEV) {
  import('../shared/lib/simpleCacheValidator');
}

// Initialize dark mode from localStorage (prevents flash of wrong theme)
// This runs before React renders, reading directly from localStorage
const storedDarkMode = localStorage.getItem('dark-mode');
if (storedDarkMode === 'true') {
  document.documentElement.classList.add('dark');
}

createRoot(document.getElementById('root')!).render(
  <Profiler id="Root" onRender={reactProfilerOnRender}>
    <App />
  </Profiler>
);