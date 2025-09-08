/**
 * Testing utilities for TabReactivation system
 * 
 * Usage in browser console:
 * - window.__TAB_REACTIVATION_TEST__() - Manually trigger boundary swap
 * - window.__TAB_REACTIVATION_STATUS__() - Check current observer state
 */

export function initTabReactivationTesting() {
  if (typeof window === 'undefined') return;

  // Manual trigger for testing
  (window as any).__TAB_REACTIVATION_TEST__ = () => {
    console.log('[TabReactivation] Manual test triggered');
    const trigger = (window as any).__TRIGGER_REALTIME_BOUNDARY_SWAP__;
    if (trigger) {
      trigger();
      return 'Boundary swap triggered successfully';
    } else {
      return 'Error: Boundary swap trigger not found - RealtimeBoundary may not be mounted';
    }
  };

  // Status check for debugging
  (window as any).__TAB_REACTIVATION_STATUS__ = () => {
    // Use boundary client if available, fallback to main client
    const boundaryClient = (window as any).__BOUNDARY_QUERY_CLIENT__;
    const outerClient = (window as any).__OUTER_QUERY_CLIENT__ || (window as any).__REACT_QUERY_CLIENT__;
    const queryClient = boundaryClient || outerClient;
    const clientIds = (window as any).__QUERY_CLIENT_IDS__ || {};
    
    if (!queryClient) {
      return { error: 'No QueryClient found' };
    }

    const criticalFamilies = [
      { name: 'unified-generations-project', prefixes: [['unified-generations', 'project']], needsProjectId: true },
      { name: 'unified-generations-shot', prefixes: [['unified-generations', 'shot']], needsProjectId: false },
      { name: 'task-status-counts', prefixes: [['task-status-counts']], needsProjectId: true },
      { name: 'tasks-paginated', prefixes: [['tasks', 'paginated']], needsProjectId: true },
      { name: 'shots', prefixes: [['shots']], needsProjectId: true },
    ];

    // Try to get current project ID from ProjectContext via DOM or global state
    let projectId = 'unknown';
    
    // Try to get from React context via global state
    const projectContext = (window as any).__PROJECT_CONTEXT__;
    if (projectContext?.selectedProjectId) {
      projectId = projectContext.selectedProjectId;
    } else {
      // Fallback: try to extract from URL patterns
      const pathname = window.location.pathname;
      if (pathname.includes('/project/')) {
        projectId = pathname.split('/project/')[1]?.split('/')[0] || 'unknown';
      } else if (pathname.includes('/tools/')) {
        // Tools pages don't have project in URL, try to get from local storage or other sources
        const storedProject = localStorage.getItem('lastSelectedProjectId');
        if (storedProject) {
          projectId = storedProject;
        }
      }
    }

    // Helper function to match query key prefixes
    const matchesPrefix = (queryKey: readonly unknown[], prefix: readonly string[]): boolean => {
      return prefix.every((segment, i) => queryKey[i] === segment);
    };

    // Analyze each family
    const familyStatus = criticalFamilies.map(family => {
      const allQueries = queryClient.getQueryCache().getAll();
      
      const matchingQueries = allQueries.filter(query => {
        return family.prefixes.some(prefix => {
          if (family.needsProjectId && projectId !== 'unknown') {
            const expectedPrefix = [...prefix, projectId];
            return matchesPrefix(query.queryKey, expectedPrefix);
          } else {
            return matchesPrefix(query.queryKey, prefix);
          }
        });
      });

      const totalQueries = matchingQueries.length;
      const totalObservers = matchingQueries.reduce((sum, q) => sum + q.getObserversCount(), 0);
      const anyHasData = matchingQueries.some(q => !!q.state.data);
      const anyFetching = matchingQueries.some(q => q.state.fetchStatus === 'fetching');

      return {
        name: family.name,
        totalQueries,
        totalObservers,
        anyHasData,
        anyFetching,
        sampleKeys: matchingQueries.slice(0, 3).map(q => q.queryKey.slice(0, 5)),
        healthStatus: totalQueries === 0 ? 'NO_QUERIES' : totalObservers > 0 ? 'HEALTHY' : 'NEEDS_ATTENTION'
      };
    });

    const summary = {
      projectId,
      visibilityState: document.visibilityState,
      clientType: boundaryClient ? 'boundary' : 'outer',
      clientIds,
      totalObservers: familyStatus.reduce((sum, f) => sum + f.totalObservers, 0),
      totalQueries: familyStatus.reduce((sum, f) => sum + f.totalQueries, 0),
      familiesWithObservers: familyStatus.filter(f => f.totalObservers > 0).length,
      familiesWithData: familyStatus.filter(f => f.anyHasData).length,
      healthStatus: familyStatus.every(f => f.totalQueries === 0 || f.totalObservers > 0) ? 'HEALTHY' : 'NEEDS_ATTENTION',
      families: familyStatus,
      timestamp: Date.now()
    };

    console.log('[TabReactivation] Current status:', summary);
    return summary;
  };

  // Continuous monitoring toggle
  let monitorInterval: number | null = null;
  (window as any).__TAB_REACTIVATION_MONITOR__ = (enable: boolean = true) => {
    if (monitorInterval) {
      clearInterval(monitorInterval);
      monitorInterval = null;
    }

    if (enable) {
      console.log('[TabReactivation] Starting continuous monitoring (every 10s)');
      monitorInterval = setInterval(() => {
        const status = (window as any).__TAB_REACTIVATION_STATUS__();
        if (status.healthStatus !== 'HEALTHY') {
          console.warn('[TabReactivation] Health check failed:', status);
        }
      }, 10000) as any;
      return 'Monitoring started';
    } else {
      return 'Monitoring stopped';
    }
  };

  console.log('[TabReactivation] Testing utilities initialized. Available commands:');
  console.log('- __TAB_REACTIVATION_TEST__() - Manual boundary swap');
  console.log('- __TAB_REACTIVATION_STATUS__() - Check observer health');
  console.log('- __TAB_REACTIVATION_MONITOR__(true/false) - Toggle monitoring');
}
