/**
 * Mobile-Optimized State Management Hook
 * 
 * Provides performance-aware state management that adapts to device capabilities
 * to prevent stalls and race conditions on mobile devices.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  detectDeviceCapabilities, 
  getPerformanceConfig, 
  createPerformanceThrottle,
  createPerformanceDebounce,
  createMemoryPressureMonitor 
} from '@/shared/lib/mobilePerformanceUtils';

interface MobileOptimizedStateOptions {
  /** Enable memory pressure monitoring */
  enableMemoryMonitoring?: boolean;
  /** Custom performance config override */
  performanceConfig?: ReturnType<typeof getPerformanceConfig>;
  /** Callback when performance issues are detected */
  onPerformanceIssue?: (issue: string) => void;
}

/**
 * Hook that provides mobile-optimized state management with automatic
 * performance adaptations based on device capabilities.
 */
export const useMobileOptimizedState = <T>(
  initialState: T,
  options: MobileOptimizedStateOptions = {}
) => {
  const { 
    enableMemoryMonitoring = true, 
    performanceConfig: customConfig,
    onPerformanceIssue 
  } = options;

  // Device capabilities detection
  const deviceCapabilities = useRef(detectDeviceCapabilities());
  const performanceConfig = useRef(customConfig || getPerformanceConfig(deviceCapabilities.current));
  
  // Core state
  const [state, setState] = useState<T>(initialState);
  const [isLowMemoryMode, setIsLowMemoryMode] = useState(false);
  
  // Performance monitoring
  const memoryMonitor = useRef(
    enableMemoryMonitoring ? createMemoryPressureMonitor(() => {
      console.warn('[MobileOptimizedState] Memory pressure detected - enabling low memory mode');
      setIsLowMemoryMode(true);
      onPerformanceIssue?.('high_memory_usage');
      
      // Temporarily reduce performance config
      performanceConfig.current = {
        ...performanceConfig.current,
        maxCacheEntries: Math.floor(performanceConfig.current.maxCacheEntries * 0.5),
        initialBatchSize: Math.max(1, Math.floor(performanceConfig.current.initialBatchSize * 0.5)),
        enableOptimisticUpdates: false
      };
    }, performanceConfig.current.memoryCleanupThreshold) : null
  );
  
  // Performance-aware state setter
  const throttledSetState = useRef(
    performanceConfig.current.dragCalculationThrottle > 0 
      ? createPerformanceThrottle(setState, performanceConfig.current.dragCalculationThrottle)
      : setState
  );
  
  const debouncedSetState = useRef(
    createPerformanceDebounce(setState, performanceConfig.current.positionUpdateDebounce)
  );
  
  // Start memory monitoring on mount
  useEffect(() => {
    if (memoryMonitor.current && !memoryMonitor.current.isMonitoring()) {
      memoryMonitor.current.startMonitoring();
    }
    
    return () => {
      memoryMonitor.current?.stopMonitoring();
    };
  }, []);
  
  // Recover from low memory mode after some time
  useEffect(() => {
    if (isLowMemoryMode) {
      const timer = setTimeout(() => {
        console.log('[MobileOptimizedState] Recovering from low memory mode');
        setIsLowMemoryMode(false);
        performanceConfig.current = customConfig || getPerformanceConfig(deviceCapabilities.current);
      }, 30000); // 30 seconds
      
      return () => clearTimeout(timer);
    }
  }, [isLowMemoryMode, customConfig]);
  
  // Performance-aware state updater that chooses appropriate strategy
  const updateState = useCallback((newState: T | ((prev: T) => T), strategy: 'immediate' | 'throttled' | 'debounced' = 'immediate') => {
    // In low memory mode, always use immediate updates to reduce complexity
    if (isLowMemoryMode || strategy === 'immediate') {
      setState(newState);
    } else if (strategy === 'throttled') {
      throttledSetState.current(newState);
    } else if (strategy === 'debounced') {
      debouncedSetState.current(newState);
    }
  }, [isLowMemoryMode]);
  
  // Get current performance configuration
  const getCurrentConfig = useCallback(() => {
    return performanceConfig.current;
  }, []);
  
  // Check if device should use conservative performance settings
  const shouldUseConservativeMode = useCallback(() => {
    return deviceCapabilities.current.estimatedPerformanceTier === 'low' || isLowMemoryMode;
  }, [isLowMemoryMode]);
  
  // Get device capabilities
  const getDeviceCapabilities = useCallback(() => {
    return deviceCapabilities.current;
  }, []);
  
  return {
    state,
    updateState,
    getCurrentConfig,
    shouldUseConservativeMode,
    getDeviceCapabilities,
    isLowMemoryMode,
    deviceCapabilities: deviceCapabilities.current,
    performanceConfig: performanceConfig.current
  };
};

/**
 * Hook specifically for optimistic updates with mobile performance considerations
 */
export const useMobileOptimizedOptimisticState = <T>(
  initialState: T[],
  options: MobileOptimizedStateOptions = {}
) => {
  const {
    state: optimisticState,
    updateState,
    shouldUseConservativeMode,
    getCurrentConfig
  } = useMobileOptimizedState(initialState, options);
  
  const [isOptimisticUpdate, setIsOptimisticUpdate] = useState(false);
  const [reconciliationId, setReconciliationId] = useState(0);
  const reconciliationTimeoutRef = useRef<NodeJS.Timeout>();
  
  // Enhanced optimistic update that respects device capabilities
  const performOptimisticUpdate = useCallback((
    newState: T[],
    onServerUpdate: (state: T[]) => void
  ) => {
    const config = getCurrentConfig();
    
    // Skip optimistic updates on low-end devices to prevent race conditions
    if (!config.enableOptimisticUpdates || shouldUseConservativeMode()) {
      console.log('[MobileOptimizedOptimistic] Skipping optimistic update - conservative mode');
      onServerUpdate(newState);
      return;
    }
    
    // Clear any pending reconciliation
    if (reconciliationTimeoutRef.current) {
      clearTimeout(reconciliationTimeoutRef.current);
    }
    
    // Increment reconciliation ID to track this update
    setReconciliationId(prev => prev + 1);
    setIsOptimisticUpdate(true);
    
    // Update optimistic state immediately
    updateState(newState, 'immediate');
    
    // Trigger server update
    onServerUpdate(newState);
  }, [getCurrentConfig, shouldUseConservativeMode, updateState]);
  
  // Reconcile optimistic state with server state
  const reconcileWithServerState = useCallback((serverState: T[]) => {
    if (!isOptimisticUpdate) {
      updateState(serverState, 'immediate');
      return;
    }
    
    const config = getCurrentConfig();
    const currentReconciliationId = reconciliationId;
    
    // Clear any pending timeout
    if (reconciliationTimeoutRef.current) {
      clearTimeout(reconciliationTimeoutRef.current);
    }
    
    // Debounced reconciliation to prevent race conditions
    reconciliationTimeoutRef.current = setTimeout(() => {
      // Check if this reconciliation is still current
      if (currentReconciliationId !== reconciliationId) {
        console.log('[MobileOptimizedOptimistic] Reconciliation cancelled - newer update in progress');
        return;
      }
      
      // Compare states to see if they match
      const optimisticIds = optimisticState.map((item: any) => item.id || item.shotImageEntryId).join(',');
      const serverIds = serverState.map((item: any) => item.id || item.shotImageEntryId).join(',');
      
      if (optimisticIds === serverIds) {
        console.log('[MobileOptimizedOptimistic] Server caught up with optimistic state');
        setIsOptimisticUpdate(false);
        updateState(serverState, 'immediate');
      } else {
        console.log('[MobileOptimizedOptimistic] Server state differs - keeping optimistic state temporarily');
        
        // Safety timeout: force reconciliation after a reasonable time
        setTimeout(() => {
          if (isOptimisticUpdate) {
            console.warn('[MobileOptimizedOptimistic] Forcing reconciliation - optimistic update took too long');
            setIsOptimisticUpdate(false);
            updateState(serverState, 'immediate');
          }
        }, 5000);
      }
    }, config.positionUpdateDebounce);
  }, [isOptimisticUpdate, reconciliationId, optimisticState, getCurrentConfig, updateState]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconciliationTimeoutRef.current) {
        clearTimeout(reconciliationTimeoutRef.current);
      }
    };
  }, []);
  
  return {
    state: optimisticState,
    isOptimisticUpdate,
    performOptimisticUpdate,
    reconcileWithServerState,
    updateState,
    shouldUseConservativeMode,
    getCurrentConfig
  };
};
