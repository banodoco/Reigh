// -----------------------------------------------------------------------------
// *** Global console output suppression ***
// Runs before any other imports so third-party modules can't spam the console.
// Enable verbose output only when VITE_DEBUG_LOGS=true is set.
// Can be overridden at runtime using enableDebugLogs() from console.
// -----------------------------------------------------------------------------
let originalConsole: { [key: string]: any } = {};
let consoleSuppressionActive = false;

function suppressConsole() {
  if (consoleSuppressionActive) return;
  
  ['log', 'info', 'debug', 'warn'].forEach((method) => {
    originalConsole[method] = console[method];
    // @ts-ignore: dynamic assignment of console methods
    console[method] = (..._args: any[]) => {};
  });
  consoleSuppressionActive = true;
}

function restoreConsole() {
  if (!consoleSuppressionActive) return;
  
  ['log', 'info', 'debug', 'warn'].forEach((method) => {
    if (originalConsole[method]) {
      // @ts-ignore: dynamic assignment of console methods
      console[method] = originalConsole[method];
    }
  });
  consoleSuppressionActive = false;
}

// Initial suppression if debug logs not enabled
if (import.meta.env.VITE_DEBUG_LOGS !== 'true') {
  suppressConsole();
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
  import('../shared/lib/cacheValidationDebugger');
  import('../shared/lib/simpleCacheValidator');
}

// Initialize theme system
initializeTheme();

// Add global debug and theme switching helpers
// Available in both development AND production for runtime debugging
(window as any).enableDebugLogs = () => {
  restoreConsole();
  const { enableDebugLogs } = require('@/shared/lib/logger');
  enableDebugLogs();
};

(window as any).disableDebugLogs = () => {
  const { disableDebugLogs } = require('@/shared/lib/logger');
  disableDebugLogs();
  if (import.meta.env.VITE_DEBUG_LOGS !== 'true') {
    suppressConsole();
  }
};

(window as any).isDebugEnabled = () => {
  const { isDebugEnabled } = require('@/shared/lib/logger');
  return isDebugEnabled();
};

// Theme helpers (dev only)
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
  
  console.log('Debug helpers available:');
  console.log('- enableDebugLogs()  // Enable debug logs and restore console');
  console.log('- disableDebugLogs() // Disable debug logs and suppress console');
  console.log('- isDebugEnabled()   // Check if debug logs are enabled');
  console.log('');
  console.log('Theme helpers available:');
  console.log('- switchTheme("wes-anderson")');
  console.log('- switchTheme("lala-land")');
  console.log('- switchTheme("cat-lounging")');
  console.log('- getAvailableThemes()');
} else {
  // Production - only show debug helpers
  console.log('Debug helpers available:');
  console.log('- enableDebugLogs()  // Enable debug logs and restore console');
  console.log('- disableDebugLogs() // Disable debug logs and suppress console');
  console.log('- isDebugEnabled()   // Check if debug logs are enabled');
}

createRoot(document.getElementById('root')!).render(
  <Profiler id="Root" onRender={reactProfilerOnRender}>
    <App />
  </Profiler>
);