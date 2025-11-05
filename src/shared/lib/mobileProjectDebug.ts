/**
 * Mobile Project Selector Debug Utilities
 * 
 * Run these functions in the browser console when experiencing mobile stalling:
 * 
 * To enable debug logging:
 * > enableProjectDebug()
 * 
 * To check current state:
 * > checkProjectState()
 * 
 * To force recovery:
 * > forceProjectRecovery()
 * 
 * To view debug history:
 * > getProjectDebugHistory()
 */

declare global {
  interface Window {
    enableProjectDebug: () => void;
    disableProjectDebug: () => void;
    checkProjectState: () => void;
    forceProjectRecovery: () => void;
    getProjectDebugHistory: () => any[];
    __projectDebugLog?: any[];
  }
}

// Enable debug logging
window.enableProjectDebug = () => {
  localStorage.setItem('DEBUG_PROJECT_CONTEXT', 'true');
  };

// Disable debug logging
window.disableProjectDebug = () => {
  localStorage.removeItem('DEBUG_PROJECT_CONTEXT');
  };

// Check current project state
window.checkProjectState = () => {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  
  // Try to access React DevTools or context directly
  const reactRoot = (document.querySelector('#root') as any)?._reactInternalFiber || 
                    (document.querySelector('#root') as any)?._reactInternals;
  
  // Use centralized NetworkStatusManager if available
  try {
    const { getNetworkStatusManager } = require('@/shared/lib/NetworkStatusManager');
    const manager = getNetworkStatusManager();
    const status = manager.getStatus();
    :', status.isOnline ? 'Online' : 'Offline');
    * 100) + '%');
    .toISOString());
  } catch {
    // Fallback to direct navigator access
    :', navigator.onLine ? 'Online' : 'Offline');
    .connection?.effectiveType || 'Unknown');
  }
  => {
    try {
      localStorage.setItem('test', 'test');
      localStorage.removeItem('test');
      return true;
    } catch {
      return false;
    }
  })());
  
  // Check Supabase auth state
  if ((window as any).supabase) {
    (window as any).supabase.auth.getSession().then((result: any) => {
      });
  } else {
    }
  
  // Check localStorage for relevant data
  === 'true');
  
  if (window.__projectDebugLog && window.__projectDebugLog.length > 0) {
    window.__projectDebugLog.slice(-5).forEach((entry, i) => {
      });
  } else {
    }
};

// Force recovery attempt
window.forceProjectRecovery = () => {
  // Clear potentially stuck localStorage
  try {
    const keysToCheck = ['projects', 'selectedProject', 'auth', 'user'];
    keysToCheck.forEach(key => {
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
      }
    });
  } catch (e) {
    }
  
  // Try to trigger auth refresh
  if ((window as any).supabase) {
    (window as any).supabase.auth.refreshSession().then(() => {
      }).catch((error: any) => {
      });
  }
  
  // Force page reload as last resort
  setTimeout(() => {
    setTimeout(() => {
      window.location.reload();
    }, 3000);
  }, 1000);
};

// Get debug history
window.getProjectDebugHistory = () => {
  if (window.__projectDebugLog) {
    console.table(window.__projectDebugLog);
    return window.__projectDebugLog;
  } else {
    ');
    return [];
  }
};

// Debug tools available at: window.enableProjectDebug(), checkProjectState(), forceProjectRecovery(), getProjectDebugHistory()

export {}; // Make this a module 