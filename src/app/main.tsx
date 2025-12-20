// -----------------------------------------------------------------------------
// *** Logger initialization - MUST BE FIRST ***
// Logger handles both console suppression (when VITE_DEBUG_LOGS=false) and
// console interception for persistence (when VITE_PERSIST_LOGS=true).
// Import before anything else to capture all logs.
// -----------------------------------------------------------------------------
import { reactProfilerOnRender } from '@/shared/lib/logger';

import { createRoot } from 'react-dom/client';
import { Profiler } from 'react';
import App from './App.tsx';
import '@/index.css';

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
// Defaults to dark mode for new users (when no stored value exists)
const storedDarkMode = localStorage.getItem('dark-mode');
if (storedDarkMode === null || storedDarkMode === 'true') {
  document.documentElement.classList.add('dark');
}

createRoot(document.getElementById('root')!).render(
  <Profiler id="Root" onRender={reactProfilerOnRender}>
    <App />
  </Profiler>
);