/**
 * Comprehensive tab resume debugging utilities
 * Tracks user interactions, state changes, and system behavior after tab resume
 */

let tabResumeTime: number | null = null;
let isTrackingTabResume = false;

// Track when tab becomes visible
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      tabResumeTime = Date.now();
      isTrackingTabResume = true;
      
      console.error('[TabResumeDebug] 🎯 TAB RESUMED - Starting comprehensive tracking', {
        timestamp: tabResumeTime,
        userAgent: navigator.userAgent.slice(0, 50),
        windowSize: `${window.innerWidth}x${window.innerHeight}`,
        localStorage: {
          lastSelectedProjectId: localStorage.getItem('lastSelectedProjectId'),
          supabaseAuth: localStorage.getItem('sb-wczysqzxlwdndgxitrvc-auth-token') ? 'present' : 'missing'
        }
      });

      // Stop tracking after 30 seconds
      setTimeout(() => {
        isTrackingTabResume = false;
        console.error('[TabResumeDebug] 🏁 Stopped tracking tab resume interactions');
      }, 30000);
    }
  });

  // Track all clicks after tab resume
  document.addEventListener('click', (event) => {
    if (!isTrackingTabResume || !tabResumeTime) return;
    
    const target = event.target as HTMLElement;
    const timeSinceResume = Date.now() - tabResumeTime;
    
    // Only track first 30 seconds after tab resume
    if (timeSinceResume > 30000) {
      isTrackingTabResume = false;
      return;
    }

    const clickInfo = {
      timeSinceResume,
      targetTag: target.tagName,
      targetClass: target.className,
      targetId: target.id,
      targetText: target.textContent?.slice(0, 50),
      targetType: target.getAttribute('type'),
      targetRole: target.getAttribute('role'),
      isButton: target.tagName === 'BUTTON' || target.getAttribute('role') === 'button',
      parentButton: target.closest('button')?.textContent?.slice(0, 50),
      timestamp: Date.now()
    };

    console.error('[TabResumeDebug] 🖱️ CLICK AFTER TAB RESUME', clickInfo);

    // Special tracking for buttons that might create tasks
    if (clickInfo.isButton || clickInfo.parentButton) {
      console.error('[TabResumeDebug] 🔥 BUTTON CLICKED AFTER TAB RESUME', {
        ...clickInfo,
        criticalNote: 'This button click might trigger task creation - watch for edge function calls'
      });
    }
  });

  // Track form submissions
  document.addEventListener('submit', (event) => {
    if (!isTrackingTabResume || !tabResumeTime) return;
    
    const timeSinceResume = Date.now() - tabResumeTime;
    if (timeSinceResume > 30000) return;

    const form = event.target as HTMLFormElement;
    console.error('[TabResumeDebug] 📝 FORM SUBMITTED AFTER TAB RESUME', {
      timeSinceResume,
      formId: form.id,
      formClass: form.className,
      formAction: form.action,
      timestamp: Date.now()
    });
  });

  // Track React Query mutations
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const [url, options] = args;
    const urlStr = typeof url === 'string' ? url : url.toString();
    
    if (isTrackingTabResume && tabResumeTime && urlStr.includes('/functions/v1/')) {
      const timeSinceResume = Date.now() - tabResumeTime;
      if (timeSinceResume <= 30000) {
        console.error('[TabResumeDebug] 🚀 EDGE FUNCTION CALL AFTER TAB RESUME', {
          timeSinceResume,
          url: urlStr,
          method: options?.method || 'GET',
          hasBody: !!options?.body,
          bodyPreview: options?.body ? String(options.body).slice(0, 100) : null,
          timestamp: Date.now()
        });
      }
    }

    return originalFetch(...args);
  };
}

export function initTabResumeDebugger() {
  console.error('[TabResumeDebug] 🔧 Tab resume debugger initialized');
}
