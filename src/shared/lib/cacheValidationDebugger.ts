/**
 * Cache Validation Debugger
 * 
 * Run in browser console to validate cache cleanup behavior.
 * Usage: window.cacheValidator.validateCacheCleanup()
 */

import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface CacheValidationResult {
  currentPage: number;
  totalCachedPages: number;
  cachedPages: number[];
  expectedMaxPages: number;
  strategy: string;
  isValidCache: boolean;
  issues: string[];
  recommendations: string[];
}

class CacheValidator {
  validateCacheCleanup(projectId?: string): CacheValidationResult {
    // Try to get the query client from React context
    let queryClient: any;
    try {
      // This is a hack to get the query client from the global context
      const reactInstance = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__?.reactDevtoolsAgent?.reactInstances?.[0];
      if (reactInstance) {
        queryClient = reactInstance.queryClient;
      }
    } catch (e) {
      console.warn('[CacheValidator] Could not access query client directly');
    }

    if (!queryClient) {
      return {
        currentPage: 0,
        totalCachedPages: 0,
        cachedPages: [],
        expectedMaxPages: 0,
        strategy: 'unknown',
        isValidCache: false,
        issues: ['Could not access React Query client'],
        recommendations: ['Use validateCacheManually() with query client instance']
      };
    }

    return this.validateCacheManually(queryClient, projectId);
  }

  validateCacheManually(queryClient: any, projectId?: string): CacheValidationResult {
    // Auto-detect project ID if not provided
    if (!projectId) {
      const allQueries = queryClient.getQueryCache().getAll();
      const generationQuery = allQueries.find((q: any) => q.queryKey?.[0] === 'unified-generations' && q.queryKey?.[1] === 'project');
      projectId = generationQuery?.queryKey?.[2];
    }

    if (!projectId) {
      return {
        currentPage: 0,
        totalCachedPages: 0,
        cachedPages: [],
        expectedMaxPages: 0,
        strategy: 'unknown',
        isValidCache: false,
        issues: ['No project ID found in queries'],
        recommendations: ['Navigate to a page with generations first']
      };
    }

    // Get all generation queries
    const allQueries = queryClient.getQueryCache().getAll();
    const generationQueries = allQueries.filter((query: any) => {
      const queryKey = query.queryKey;
      return queryKey?.[0] === 'unified-generations' && 
             queryKey?.[1] === 'project' &&
             queryKey?.[2] === projectId && 
             typeof queryKey?.[3] === 'number'; // page number
    });

    const cachedPages = generationQueries
      .map(q => q.queryKey[3])
      .sort((a, b) => a - b);

    // Try to determine current page (most recently accessed)
    const currentPage = Math.max(...cachedPages.filter((p: any) => p !== undefined)) || 1;

    // Determine device configuration (simplified)
    const isMobile = window.innerWidth < 768;
    const hasLowMemory = (navigator as any).deviceMemory ? (navigator as any).deviceMemory < 4 : false;
    
    let expectedMaxPages: number;
    let strategy: string;

    if (hasLowMemory || isMobile) {
      expectedMaxPages = 3; // Conservative
      strategy = 'conservative';
    } else if (isMobile) {
      expectedMaxPages = 5; // Moderate
      strategy = 'moderate';
    } else {
      expectedMaxPages = 7; // Aggressive
      strategy = 'aggressive';
    }

    // Validate cache behavior
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    // Check total pages
    if (cachedPages.length > expectedMaxPages) {
      issues.push(`Too many pages cached: ${cachedPages.length} > ${expectedMaxPages}`);
      recommendations.push('Cache cleanup may not be working correctly');
    }

    // Check adjacency (pages should be current ± range)
    const keepRange = Math.floor(expectedMaxPages / 2);
    const minExpected = currentPage - keepRange;
    const maxExpected = currentPage + keepRange;
    
    const invalidPages = cachedPages.filter(page => page < minExpected || page > maxExpected);
    if (invalidPages.length > 0) {
      issues.push(`Non-adjacent pages cached: ${invalidPages.join(', ')} (current: ${currentPage}, range: ${minExpected}-${maxExpected})`);
      recommendations.push('Distant pages should be cleaned up during navigation');
    }

    const isValidCache = issues.length === 0;

    return {
      currentPage,
      totalCachedPages: cachedPages.length,
      cachedPages,
      expectedMaxPages,
      strategy,
      isValidCache,
      issues,
      recommendations
    };
  }

  logDetailedCacheState(projectId?: string) {
    const result = this.validateCacheCleanup(projectId);
    
    console.group('🗂️ Cache Validation Report');
    console.log('📊 Current State:', {
      currentPage: result.currentPage,
      totalCached: result.totalCachedPages,
      cachedPages: result.cachedPages,
      strategy: result.strategy
    });
    
    console.log('⚙️ Configuration:', {
      expectedMaxPages: result.expectedMaxPages,
      keepRange: Math.floor(result.expectedMaxPages / 2),
      deviceType: window.innerWidth < 768 ? 'mobile' : 'desktop'
    });
    
    if (result.isValidCache) {
      console.log('✅ Cache is valid - only adjacent pages cached');
    } else {
      console.log('❌ Cache validation failed');
      result.issues.forEach(issue => console.log(`  🔴 ${issue}`));
      result.recommendations.forEach(rec => console.log(`  💡 ${rec}`));
    }
    
    console.groupEnd();
    
    return result;
  }

  // Monitor cache changes in real-time
  startCacheMonitoring(projectId?: string) {
    let lastCacheState = '';
    
    const monitor = () => {
      const result = this.validateCacheManually((window as any).queryClient, projectId);
      const currentState = JSON.stringify(result.cachedPages);
      
      if (currentState !== lastCacheState) {
        console.log(`[CacheMonitor] Cache changed:`, {
          timestamp: new Date().toISOString(),
          cachedPages: result.cachedPages,
          isValid: result.isValidCache,
          issues: result.issues
        });
        lastCacheState = currentState;
      }
    };
    
    const intervalId = setInterval(monitor, 1000);
    console.log('🔍 Cache monitoring started (every 1s). Call stopCacheMonitoring() to stop.');
    
    (window as any).stopCacheMonitoring = () => {
      clearInterval(intervalId);
      console.log('⏹️ Cache monitoring stopped');
    };
    
    return intervalId;
  }

  // ================= Dead Mode Diagnostics =================
  scanBlockingOverlays(minCoverage: number = 0.6) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const viewportArea = vw * vh;
    const elements = Array.from(document.body.querySelectorAll('*')) as HTMLElement[];
    const candidates: Array<{
      tag: string;
      id: string;
      classes: string[];
      zIndex: string;
      rect: { x: number; y: number; width: number; height: number };
      coverage: number;
      pointerEvents: string;
      opacity: string;
      visibility: string;
      ariaHidden: string | null;
      ariaModal: string | null;
    }> = [];

    for (const el of elements) {
      const style = window.getComputedStyle(el);
      if (!style) continue;
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0) {
        continue;
      }
      // Only consider elements that can capture input
      if (style.pointerEvents === 'none') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const area = rect.width * rect.height;
      const coverage = area / viewportArea;
      // Heuristics: large, positioned, high z-index-like element
      const zIndex = style.zIndex;
      const isFixedOrAbsolute = style.position === 'fixed' || style.position === 'absolute';
      if ((coverage >= minCoverage || isFixedOrAbsolute) && area > 10000) {
        candidates.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || '',
          classes: (el.className || '').toString().split(/\s+/).filter(Boolean),
          zIndex,
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          coverage: Number(coverage.toFixed(3)),
          pointerEvents: style.pointerEvents,
          opacity: style.opacity,
          visibility: style.visibility,
          ariaHidden: el.getAttribute('aria-hidden'),
          ariaModal: el.getAttribute('aria-modal'),
        });
      }
    }

    candidates.sort((a, b) => (parseInt(b.zIndex || '0') || 0) - (parseInt(a.zIndex || '0') || 0));
    console.log('[DeadModeInvestigation] Blocking overlay scan', { count: candidates.length, candidates });
    return candidates;
  }

  reportReactQueryState(queryClient?: any) {
    // Try multiple ways to get the query client
    let qc = queryClient;
    if (!qc) {
      // Try global references
      qc = (window as any).queryClient || (window as any).__REACT_QUERY_CLIENT__;
    }
    if (!qc) {
      // Try to find it via React DevTools
      try {
        const reactFiber = (document.querySelector('#root') as any)?._reactInternalInstance ||
                          (document.querySelector('#root') as any)?._reactInternals;
        if (reactFiber) {
          // Walk up the fiber tree to find QueryClient
          let current = reactFiber;
          while (current && !qc) {
            if (current.memoizedProps?.client || current.stateNode?.queryClient) {
              qc = current.memoizedProps?.client || current.stateNode?.queryClient;
              break;
            }
            current = current.return || current.child;
          }
        }
      } catch (e) {
        // Ignore fiber tree traversal errors
      }
    }
    if (!qc) {
      // Try to find QueryClient in React context - check common React Query provider patterns
      try {
        // Look for QueryClientProvider in the React tree
        const rootElement = document.querySelector('#root') || document.body;
        const allElements = [rootElement, ...Array.from(document.querySelectorAll('*'))];
        
        for (const el of allElements) {
          if (!el) continue;
          const reactProps = Object.keys(el).find(key => 
            key.startsWith('__reactInternalInstance') || 
            key.startsWith('__reactFiber') ||
            key.startsWith('_reactInternals')
          );
          if (reactProps) {
            const fiber = (el as any)[reactProps];
            // Walk up the fiber tree looking for QueryClient
            let currentFiber = fiber;
            let depth = 0;
            while (currentFiber && depth < 50) { // Prevent infinite loops
              // Check for QueryClient in various locations
              if (currentFiber.memoizedProps?.value?.queryClient) {
                qc = currentFiber.memoizedProps.value.queryClient;
                break;
              }
              if (currentFiber.memoizedProps?.client) {
                qc = currentFiber.memoizedProps.client;
                break;
              }
              if (currentFiber.stateNode?.queryClient) {
                qc = currentFiber.stateNode.queryClient;
                break;
              }
              // Check context values
              if (currentFiber.memoizedState?.memoizedState?.queryClient) {
                qc = currentFiber.memoizedState.memoizedState.queryClient;
                break;
              }
              currentFiber = currentFiber.return || currentFiber.child;
              depth++;
            }
            if (qc) break;
          }
        }
      } catch (e) {
        // Ignore context search errors
      }
    }
    
    // Last resort: check if it's attached to window in development
    if (!qc && typeof window !== 'undefined') {
      qc = (window as any).__REACT_QUERY_DEVTOOLS_CLIENT__ || 
           (window as any).__REACT_QUERY_CLIENT__ ||
           (window as any).reactQueryClient;
    }
    
    if (!qc) {
      console.warn('[DeadModeInvestigation] No React Query client found after exhaustive search');
      return null;
    }
    const queries = qc.getQueryCache().getAll();
    const mutations = qc.getMutationCache().getAll();
    const now = Date.now();
    // Find task-related queries specifically
    const taskQueries = queries.filter((q: any) => {
      const key = q.queryKey;
      return key && (key[0] === 'tasks' || key[0] === 'task-status-counts');
    });
    
    const taskPaginatedQueries = taskQueries.filter((q: any) => q.queryKey[1] === 'paginated');
    const taskStatusCountQueries = taskQueries.filter((q: any) => q.queryKey[0] === 'task-status-counts');
    
    const summary = {
      totalQueries: queries.length,
      fetching: queries.filter((q: any) => q.state.fetchStatus === 'fetching').length,
      paused: queries.filter((q: any) => q.state.fetchStatus === 'paused').length,
      stale: queries.filter((q: any) => q.state.isStale).length,
      longFetching: queries
        .filter((q: any) => q.state.fetchStatus === 'fetching' && now - (q.state.dataUpdatedAt || 0) > 30000)
        .map((q: any) => ({ key: q.queryKey, updatedAt: q.state.dataUpdatedAt, fetchStatus: q.state.fetchStatus })),
      successButEmpty: queries
        .filter((q: any) => q.state.status === 'success' && (q.state.data == null || (Array.isArray(q.state.data) && q.state.data.length === 0)))
        .slice(0, 20)
        .map((q: any) => ({ key: q.queryKey })),
      taskQueries: {
        total: taskQueries.length,
        paginated: taskPaginatedQueries.length,
        statusCounts: taskStatusCountQueries.length,
        paginatedDetails: taskPaginatedQueries.slice(0, 5).map((q: any) => ({
          key: q.queryKey,
          status: q.state.status,
          fetchStatus: q.state.fetchStatus,
          dataAge: q.state.dataUpdatedAt ? Math.round((now - q.state.dataUpdatedAt) / 1000) + 's' : 'never',
          hasData: !!q.state.data,
          tasksCount: q.state.data?.tasks?.length || 0,
          isStale: q.state.isStale
        })),
        statusCountDetails: taskStatusCountQueries.slice(0, 3).map((q: any) => ({
          key: q.queryKey,
          status: q.state.status,
          fetchStatus: q.state.fetchStatus,
          dataAge: q.state.dataUpdatedAt ? Math.round((now - q.state.dataUpdatedAt) / 1000) + 's' : 'never',
          data: q.state.data,
          isStale: q.state.isStale
        }))
      },
      mutations: {
        total: mutations.length,
        pending: mutations.filter((m: any) => m.state.status === 'pending').length,
        erroring: mutations.filter((m: any) => m.state.status === 'error').length,
      },
    };
    console.log('[DeadModeInvestigation] React Query summary', summary);
    return summary;
  }

  installLongTaskObserver(minDurationMs: number = 200) {
    if (!(window as any).PerformanceObserver) {
      console.warn('[DeadModeInvestigation] PerformanceObserver not supported');
      return () => {};
    }
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const e: any = entry as any;
        const duration = e.duration;
        if (duration >= minDurationMs) {
          console.warn('[DeadModeInvestigation] Long task detected', {
            durationMs: Math.round(duration),
            startTimeMs: Math.round(e.startTime),
            name: e.name,
          });
        }
      }
    });
    try {
      observer.observe({ entryTypes: ['longtask'] as any });
      console.log('[DeadModeInvestigation] Long task observer installed');
      return () => observer.disconnect();
    } catch {
      console.warn('[DeadModeInvestigation] Failed to install long task observer');
      return () => {};
    }
  }

  installGlobalErrorHandlers() {
    const onError = (event: ErrorEvent) => {
      console.error('[DeadModeInvestigation] window.onerror', {
        message: event.message,
        source: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error?.stack || event.error?.message,
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      console.error('[DeadModeInvestigation] unhandledrejection', { reason: (event.reason && event.reason.stack) || event.reason });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    console.log('[DeadModeInvestigation] Global error handlers installed');
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }

  installClickPropagationDebugger(sampleRate: number = 1) {
    // Monkey-patch stopPropagation to detect swallowed events
    const originalStop = Event.prototype.stopPropagation;
    const originalStopImmediate = Event.prototype.stopImmediatePropagation;
    (Event.prototype as any).stopPropagation = function () {
      (this as any).__stopped__ = true;
      return originalStop.apply(this, arguments as any);
    } as any;
    (Event.prototype as any).stopImmediatePropagation = function () {
      (this as any).__stoppedImmediate__ = true;
      return originalStopImmediate.apply(this, arguments as any);
    } as any;

    const capture = (e: Event) => {
      if (Math.random() > sampleRate) return;
      const target = e.target as HTMLElement | null;
      const path = (e.composedPath ? e.composedPath() : []) as any[];
      console.log('[DeadModeInvestigation] Click capture', {
        targetTag: target?.tagName?.toLowerCase(),
        targetClasses: target?.className,
        defaultPrevented: e.defaultPrevented,
        stopped: (e as any).__stopped__ || false,
        stoppedImmediate: (e as any).__stoppedImmediate__ || false,
        pathTags: path.slice(0, 6).map(n => n?.tagName?.toLowerCase?.()).filter(Boolean),
      });
    };
    const bubble = (e: Event) => {
      if (Math.random() > sampleRate) return;
      const target = e.target as HTMLElement | null;
      console.log('[DeadModeInvestigation] Click bubble', {
        targetTag: target?.tagName?.toLowerCase(),
        defaultPrevented: e.defaultPrevented,
        stopped: (e as any).__stopped__ || false,
        stoppedImmediate: (e as any).__stoppedImmediate__ || false,
      });
    };
    document.addEventListener('click', capture, true);
    window.addEventListener('click', bubble, false);
    console.log('[DeadModeInvestigation] Click propagation debugger installed');
    return () => {
      document.removeEventListener('click', capture, true);
      window.removeEventListener('click', bubble, false);
      // best-effort restore
      (Event.prototype as any).stopPropagation = originalStop as any;
      (Event.prototype as any).stopImmediatePropagation = originalStopImmediate as any;
    };
  }

  reportEnvironment() {
    const info = {
      online: navigator.onLine,
      connection: (navigator as any).connection ? {
        effectiveType: (navigator as any).connection.effectiveType,
        downlink: (navigator as any).connection.downlink,
        rtt: (navigator as any).connection.rtt,
      } : undefined,
      visibilityState: document.visibilityState,
      hidden: document.hidden,
      userAgent: navigator.userAgent,
      time: new Date().toISOString(),
    };
    console.log('[DeadModeInvestigation] Environment', info);
    return info;
  }

  reportSupabaseRealtime() {
    try {
      const socket = (supabase as any)?.realtime?.socket;
      const channels = (supabase as any)?.getChannels ? (supabase as any).getChannels() : [];
      console.log('[DeadModeInvestigation] Supabase realtime status', {
        connected: !!socket?.isConnected?.(),
        connState: socket?.connectionState,
        channels: channels?.map((c: any) => ({ topic: c.topic, state: c.state })),
      });
    } catch (e) {
      console.warn('[DeadModeInvestigation] Supabase realtime status unavailable');
    }
  }

  emergencyRecovery() {
    console.group('[DeadModeInvestigation] 🚨 EMERGENCY RECOVERY');
    
    try {
      const qc = (window as any).__REACT_QUERY_CLIENT__;
      if (qc) {
        const mutations = qc.getMutationCache().getAll();
        const queries = qc.getQueryCache().getAll();
        
        // Cancel all stuck mutations
        const stuckMutations = mutations.filter((m: any) => {
          const isPending = m.state.status === 'pending';
          const age = Date.now() - (m.state.submittedAt || 0);
          return isPending && age > 10000; // 10 seconds for emergency mode
        });
        
        console.log('[DeadModeInvestigation] Cancelling stuck mutations', {
          count: stuckMutations.length,
          mutations: stuckMutations.map((m: any) => m.mutationKey)
        });
        
        stuckMutations.forEach((mutation: any) => {
          try {
            if (mutation.reset) mutation.reset();
            if (mutation.cancel) mutation.cancel();
          } catch (e) {
            console.warn('Failed to cancel mutation:', e);
          }
        });
        
        // Cancel long-running queries
        const longQueries = queries.filter((q: any) => {
          const isFetching = q.state.fetchStatus === 'fetching';
          const age = Date.now() - (q.state.dataUpdatedAt || 0);
          return isFetching && age > 15000; // 15 seconds
        }).filter((q: any) => {
          try {
            const key = q.queryKey;
            const root = Array.isArray(key) ? key[0] : undefined;
            // Avoid cancelling queries that drive core galleries/UI to prevent CancelledError storms
            const skipRoots = new Set([
              'shots',
              'generations',
              'unified-generations',
              'all-shot-generations',
              'video-outputs',
              // Ensure tasks UI does not blank during recovery
              'tasks',
              'task-status-counts'
            ]);
            return !skipRoots.has(root as any);
          } catch { return true; }
        });
        
        console.log('[DeadModeInvestigation] Cancelling long queries', {
          count: longQueries.length,
          queries: longQueries.map((q: any) => q.queryKey)
        });
        
        longQueries.forEach((query: any) => {
          try {
            if (query.cancel) query.cancel();
          } catch (e) {
            console.warn('Failed to cancel query:', e);
          }
        });
        
        // Force invalidate all task-related queries (safe nudge; do not cancel them)
        try { qc.invalidateQueries({ queryKey: ['tasks'] }); } catch {}
        try { qc.invalidateQueries({ queryKey: ['task-status-counts'] }); } catch {}
        
        console.log('[DeadModeInvestigation] Recovery complete - invalidated task queries');
      }
    } catch (e) {
      console.error('[DeadModeInvestigation] Recovery failed:', e);
    }
    
    console.groupEnd();
  }

  installAllDiagnostics() {
    const teardownFns: Array<() => void> = [];
    this.reportEnvironment();
    this.scanBlockingOverlays();
    this.reportReactQueryState();
    this.reportSupabaseRealtime();
    teardownFns.push(this.installLongTaskObserver());
    teardownFns.push(this.installGlobalErrorHandlers());
    teardownFns.push(this.installClickPropagationDebugger(0.5));
    console.log('[DeadModeInvestigation] All diagnostics installed. Call window.deadMode.teardown() to remove.');
    return () => {
      teardownFns.forEach(fn => {
        try { fn(); } catch {}
      });
      console.log('[DeadModeInvestigation] Diagnostics removed');
    };
  }
}

// Create global instance
const cacheValidator = new CacheValidator();

// Auto-install diagnostics and monitoring
class DeadModeDetector {
  private teardownFns: Array<() => void> = [];
  private isInstalled = false;
  private lastInteractionTime = Date.now();
  private interactionTimeoutId: number | null = null;
  
  install() {
    if (this.isInstalled) return;
    this.isInstalled = true;
    
    console.log('[DeadModeInvestigation] Auto-installing diagnostics on page load');

    // Gate diagnostics behind an environment flag in ALL environments to reduce overhead
    try {
      const enabled = ((import.meta as any)?.env?.VITE_ENABLE_DEADMODE_DIAGNOSTICS ?? 'false') === 'true';
      if (!enabled) {
        console.log('[DeadModeInvestigation] Diagnostics disabled (set VITE_ENABLE_DEADMODE_DIAGNOSTICS=true to enable)');
        return;
      }
    } catch {}
    
    // Install basic monitoring immediately
    this.teardownFns.push(cacheValidator.installLongTaskObserver(200));
    this.teardownFns.push(cacheValidator.installGlobalErrorHandlers());
    this.teardownFns.push(cacheValidator.installClickPropagationDebugger(0.3));
    
    // Track user interactions to detect when app becomes unresponsive
    this.installInteractionMonitoring();
    
    // Periodic health checks
    this.installPeriodicHealthCheck();
    
    // React Query monitoring
    this.installReactQueryMonitoring();

    // Realtime monitoring
    this.installRealtimeMonitoring();
  }
  
  private installInteractionMonitoring() {
    const updateInteraction = () => {
      this.lastInteractionTime = Date.now();
      if (this.interactionTimeoutId) {
        clearTimeout(this.interactionTimeoutId);
      }
      // If no interaction for 30 seconds, run diagnostics
      this.interactionTimeoutId = window.setTimeout(() => {
        console.warn('[DeadModeInvestigation] No user interaction for 30s, running diagnostics...');
        this.runEmergencyDiagnostics();
      }, 30000);
    };
    
    ['click', 'keydown', 'scroll', 'touchstart'].forEach(event => {
      document.addEventListener(event, updateInteraction, { passive: true });
    });
    
    this.teardownFns.push(() => {
      ['click', 'keydown', 'scroll', 'touchstart'].forEach(event => {
        document.removeEventListener(event, updateInteraction);
      });
      if (this.interactionTimeoutId) clearTimeout(this.interactionTimeoutId);
    });
  }
  
  private installPeriodicHealthCheck() {
    const healthCheck = () => {
      const now = Date.now();
      const timeSinceInteraction = now - this.lastInteractionTime;
      
      // Check for signs of dead mode
      const suspiciousConditions = [];
      
      // Check for blocking overlays
      // Skip heavy scans when tab is hidden; reduce min coverage to speed
      const overlays = document.hidden ? [] : cacheValidator.scanBlockingOverlays(0.5);
      if (overlays.length > 0) {
        suspiciousConditions.push(`${overlays.length} blocking overlays detected`);
      }
      
      // Check React Query state
      const rqState = cacheValidator.reportReactQueryState();
      if (rqState && rqState.longFetching.length > 0) {
        suspiciousConditions.push(`${rqState.longFetching.length} long-running queries`);
      }
      
      // Check visibility
      if (document.hidden) {
        suspiciousConditions.push('page is hidden');
      }
      
      if (suspiciousConditions.length > 0) {
        console.warn('[DeadModeInvestigation] Health check found issues:', {
          timeSinceInteractionMs: timeSinceInteraction,
          conditions: suspiciousConditions,
          timestamp: now
        });
        
        // If multiple issues and no recent interaction, run full diagnostics
        if (suspiciousConditions.length >= 2 && timeSinceInteraction > 10000) {
          this.runEmergencyDiagnostics();
        }
      }
    };
    
    // Adapt cadence based on visibility: scan less often when hidden
    const getInterval = () => (document.hidden ? 60000 : 15000);
    let intervalId = setInterval(healthCheck, getInterval());
    const onVisibility = () => {
      clearInterval(intervalId);
      intervalId = setInterval(healthCheck, getInterval());
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.teardownFns.push(() => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }
  
  private installReactQueryMonitoring() {
    // Monitor for stuck mutations/queries
    const checkReactQuery = () => {
      try {
        const qc = (window as any).queryClient || (window as any).__REACT_QUERY_CLIENT__;
        if (!qc) return;
        
        const mutations = qc.getMutationCache().getAll();
        const stuckMutations = mutations.filter((m: any) => {
          const isPending = m.state.status === 'pending';
          const age = Date.now() - (m.state.submittedAt || 0);
          return isPending && age > 20000; // 20 seconds
        });
        
        if (stuckMutations.length > 0) {
          console.error('[DeadModeInvestigation] Stuck mutations detected!', {
            count: stuckMutations.length,
            mutations: stuckMutations.map((m: any) => ({
              mutationKey: m.mutationKey,
              status: m.state.status,
              ageMs: Date.now() - (m.state.submittedAt || 0),
              error: m.state.error?.message
            }))
          });
          
          // EMERGENCY RECOVERY: Cancel stuck mutations after 30 seconds
          stuckMutations.forEach((mutation: any) => {
            const ageMs = Date.now() - (mutation.state.submittedAt || 0);
            if (ageMs > 30000) { // 30 seconds
              console.warn('[DeadModeInvestigation] 🚨 CANCELLING STUCK MUTATION', {
                mutationKey: mutation.mutationKey,
                ageMs,
                timestamp: Date.now()
              });
              
              try {
                // Try to reset the mutation to idle state
                if (mutation.reset) {
                  mutation.reset();
                }
                // If that doesn't work, try to cancel
                if (mutation.cancel && mutation.state.status === 'pending') {
                  mutation.cancel();
                }
              } catch (e) {
                console.warn('[DeadModeInvestigation] Failed to cancel mutation:', e);
              }
            }
          });
          
          this.runEmergencyDiagnostics();
        }
      } catch (e) {
        console.warn('[DeadModeInvestigation] React Query monitoring error:', e);
      }
    };
    
    const intervalId = setInterval(checkReactQuery, 10000); // Every 10 seconds
    this.teardownFns.push(() => clearInterval(intervalId));
  }
  
  private installRealtimeMonitoring() {
    try {
      let lastSnapshot = '';
      const sample = () => {
        try {
          const socket = (supabase as any)?.realtime?.socket;
          const channels = (supabase as any)?.getChannels ? (supabase as any).getChannels() : [];
          const snapshot = JSON.stringify({
            connected: !!socket?.isConnected?.(),
            connState: socket?.connectionState,
            channels: channels?.map((c: any) => ({ topic: c.topic, state: c.state })) || []
          });
          if (snapshot !== lastSnapshot) {
            const parsed = JSON.parse(snapshot);
            console.warn('[DeadModeInvestigation] Realtime transition', {
              timestamp: Date.now(),
              ...parsed
            });
            lastSnapshot = snapshot;
          }
        } catch (e) {
          // ignore
        }
      };
      const intervalId = setInterval(sample, 5000);
      // initial sample
      sample();
      this.teardownFns.push(() => clearInterval(intervalId));
    } catch (e) {
      // ignore
    }
  }
  
  private runEmergencyDiagnostics() {
    console.group('[DeadModeInvestigation] 🚨 EMERGENCY DIAGNOSTICS');
    console.log('Timestamp:', new Date().toISOString());
    
    cacheValidator.reportEnvironment();
    cacheValidator.scanBlockingOverlays(0.3);
    cacheValidator.reportReactQueryState();
    cacheValidator.reportSupabaseRealtime();
    
    // Check for common dead mode indicators
    const body = document.body;
    const bodyStyle = window.getComputedStyle(body);
    console.log('[DeadModeInvestigation] Body element state:', {
      pointerEvents: bodyStyle.pointerEvents,
      overflow: bodyStyle.overflow,
      position: bodyStyle.position,
      opacity: bodyStyle.opacity,
      visibility: bodyStyle.visibility
    });
    
    // Check for loading states
    const loadingElements = document.querySelectorAll('[aria-busy="true"], .loading, .spinner, [data-loading="true"]');
    console.log('[DeadModeInvestigation] Loading elements:', {
      count: loadingElements.length,
      elements: Array.from(loadingElements).slice(0, 5).map(el => ({
        tag: el.tagName.toLowerCase(),
        classes: el.className,
        id: el.id
      }))
    });
    
    console.groupEnd();
  }
  
  teardown() {
    this.teardownFns.forEach(fn => {
      try { fn(); } catch (e) { console.warn('Teardown error:', e); }
    });
    this.teardownFns = [];
    this.isInstalled = false;
    if (this.interactionTimeoutId) {
      clearTimeout(this.interactionTimeoutId);
      this.interactionTimeoutId = null;
    }
    console.log('[DeadModeInvestigation] Auto-diagnostics torn down');
  }
}

const deadModeDetector = new DeadModeDetector();

// Make available globally
if (typeof window !== 'undefined') {
  (window as any).cacheValidator = cacheValidator;
  (window as any).deadMode = {
    scanBlockingOverlays: (...args: any[]) => cacheValidator.scanBlockingOverlays.apply(cacheValidator, args as any),
    reportRQ: (...args: any[]) => cacheValidator.reportReactQueryState.apply(cacheValidator, args as any),
    longTasks: (...args: any[]) => cacheValidator.installLongTaskObserver.apply(cacheValidator, args as any),
    errors: () => cacheValidator.installGlobalErrorHandlers(),
    clicks: (...args: any[]) => cacheValidator.installClickPropagationDebugger.apply(cacheValidator, args as any),
    env: () => cacheValidator.reportEnvironment(),
    supabase: () => cacheValidator.reportSupabaseRealtime(),
    installAll: () => {
      const teardown = cacheValidator.installAllDiagnostics();
      (window as any).deadMode.teardown = teardown;
      return teardown;
    },
    emergency: () => deadModeDetector['runEmergencyDiagnostics'](),
    recover: () => cacheValidator.emergencyRecovery(),
    teardown: () => deadModeDetector.teardown(),
  };
  
  // Auto-install on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => deadModeDetector.install());
  } else {
    deadModeDetector.install();
  }
}

export { cacheValidator, type CacheValidationResult };
