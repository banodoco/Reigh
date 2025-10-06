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
  console.log('✅ Project debug logging enabled. Refresh the page to start logging.');
};

// Disable debug logging
window.disableProjectDebug = () => {
  localStorage.removeItem('DEBUG_PROJECT_CONTEXT');
  console.log('❌ Project debug logging disabled.');
};

// Check current project state
window.checkProjectState = () => {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  
  // Try to access React DevTools or context directly
  const reactRoot = (document.querySelector('#root') as any)?._reactInternalFiber || 
                    (document.querySelector('#root') as any)?._reactInternals;
  
  console.log('🔍 Project State Check:');
  console.log('- Is Mobile:', isMobile);
  console.log('- User Agent:', navigator.userAgent);
  
  // Use centralized NetworkStatusManager if available
  try {
    const { getNetworkStatusManager } = require('@/shared/lib/NetworkStatusManager');
    const manager = getNetworkStatusManager();
    const status = manager.getStatus();
    console.log('- Network Status (NetworkStatusManager):', status.isOnline ? 'Online' : 'Offline');
    console.log('- Connection Type:', status.connection.effectiveType || 'Unknown');
    console.log('- Connection Quality:', Math.round(manager.getConnectionQuality() * 100) + '%');
    console.log('- Last Network Transition:', new Date(status.lastTransitionAt).toISOString());
  } catch {
    // Fallback to direct navigator access
    console.log('- Network Status (navigator):', navigator.onLine ? 'Online' : 'Offline');
    console.log('- Connection Type:', (navigator as any).connection?.effectiveType || 'Unknown');
  }
  console.log('- Local Storage Available:', (() => {
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
      console.log('- Supabase Session:', !!result.data?.session?.user?.id);
      console.log('- User ID:', result.data?.session?.user?.id || 'None');
    });
  } else {
    console.log('- Supabase not found');
  }
  
  // Check localStorage for relevant data
  console.log('- Debug Mode Enabled:', localStorage.getItem('DEBUG_PROJECT_CONTEXT') === 'true');
  
  console.log('\n📊 Recent Debug History:');
  if (window.__projectDebugLog && window.__projectDebugLog.length > 0) {
    window.__projectDebugLog.slice(-5).forEach((entry, i) => {
      console.log(`${i + 1}.`, entry);
    });
  } else {
    console.log('No debug history available. Enable debug mode and refresh to start collecting data.');
  }
};

// Force recovery attempt
window.forceProjectRecovery = () => {
  console.log('🚑 Attempting forced recovery...');
  
  // Clear potentially stuck localStorage
  try {
    const keysToCheck = ['projects', 'selectedProject', 'auth', 'user'];
    keysToCheck.forEach(key => {
      if (localStorage.getItem(key)) {
        console.log(`Clearing localStorage key: ${key}`);
        localStorage.removeItem(key);
      }
    });
  } catch (e) {
    console.log('Could not clear localStorage:', e);
  }
  
  // Try to trigger auth refresh
  if ((window as any).supabase) {
    console.log('Refreshing Supabase session...');
    (window as any).supabase.auth.refreshSession().then(() => {
      console.log('Session refresh completed');
    }).catch((error: any) => {
      console.log('Session refresh failed:', error);
    });
  }
  
  // Force page reload as last resort
  setTimeout(() => {
    console.log('Forcing page reload in 3 seconds...');
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
    console.log('No debug history available. Enable debug mode first with enableProjectDebug()');
    return [];
  }
};

// Debug tools available at: window.enableProjectDebug(), checkProjectState(), forceProjectRecovery(), getProjectDebugHistory()

export {}; // Make this a module 