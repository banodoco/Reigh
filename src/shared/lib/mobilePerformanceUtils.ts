/**
 * Mobile Performance Detection and Optimization Utilities
 * 
 * Provides adaptive configurations based on device capabilities to prevent
 * performance issues and stalls, especially on mobile devices.
 */

interface DeviceCapabilities {
  isMobile: boolean;
  hasLowMemory: boolean;
  hasSlowCPU: boolean;
  hasSlowConnection: boolean;
  estimatedPerformanceTier: 'low' | 'medium' | 'high';
}

interface PerformanceConfig {
  // Progressive loading
  initialBatchSize: number;
  staggerDelay: number;
  maxStaggerDelay: number;
  maxConcurrentLoads: number;
  
  // Drag and drop
  enableOptimisticUpdates: boolean;
  dragCalculationThrottle: number;
  
  // Touch handling
  touchDebounceMs: number;
  scrollThresholdPx: number;
  
  // Memory management
  maxCacheEntries: number;
  memoryCleanupThreshold: number;
  
  // Timeline
  enableComplexAnimations: boolean;
  positionUpdateDebounce: number;
}

/**
 * Detect device capabilities for performance optimization
 */
export const detectDeviceCapabilities = (): DeviceCapabilities => {
  // Mobile detection
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  
  // Memory detection
  const hasLowMemory = 'deviceMemory' in navigator && 
    (navigator as any).deviceMemory <= 4;
  
  // CPU detection
  const hasSlowCPU = 'hardwareConcurrency' in navigator && 
    navigator.hardwareConcurrency <= 4;
  
  // Connection detection
  const hasSlowConnection = 'connection' in navigator && (
    !(navigator as any).connection ||
    (navigator as any).connection?.effectiveType === '2g' ||
    (navigator as any).connection?.effectiveType === 'slow-2g'
  );
  
  // Determine performance tier
  let estimatedPerformanceTier: 'low' | 'medium' | 'high' = 'high';
  
  if (isMobile && (hasLowMemory || hasSlowCPU || hasSlowConnection)) {
    estimatedPerformanceTier = 'low';
  } else if (isMobile || hasLowMemory || hasSlowCPU) {
    estimatedPerformanceTier = 'medium';
  }
  
  return {
    isMobile,
    hasLowMemory,
    hasSlowCPU,
    hasSlowConnection,
    estimatedPerformanceTier
  };
};

/**
 * Get performance-optimized configuration based on device capabilities
 */
export const getPerformanceConfig = (capabilities?: DeviceCapabilities): PerformanceConfig => {
  const caps = capabilities || detectDeviceCapabilities();
  
  // Base configuration for high-performance devices
  const baseConfig: PerformanceConfig = {
    initialBatchSize: 6,
    staggerDelay: 80,
    maxStaggerDelay: 200,
    maxConcurrentLoads: 3,
    enableOptimisticUpdates: true,
    dragCalculationThrottle: 0,
    touchDebounceMs: 0,
    scrollThresholdPx: 10,
    maxCacheEntries: 1000,
    memoryCleanupThreshold: 0.8,
    enableComplexAnimations: true,
    positionUpdateDebounce: 100
  };
  
  // Adjust for different performance tiers
  switch (caps.estimatedPerformanceTier) {
    case 'low':
      return {
        ...baseConfig,
        initialBatchSize: 2,
        staggerDelay: 300,
        maxStaggerDelay: 600,
        maxConcurrentLoads: 1,
        enableOptimisticUpdates: false, // Disable to prevent race conditions
        dragCalculationThrottle: 100,
        touchDebounceMs: 50,
        scrollThresholdPx: 15,
        maxCacheEntries: 100,
        memoryCleanupThreshold: 0.6,
        enableComplexAnimations: false,
        positionUpdateDebounce: 300
      };
      
    case 'medium':
      return {
        ...baseConfig,
        initialBatchSize: 4,
        staggerDelay: 120,
        maxStaggerDelay: 300,
        maxConcurrentLoads: 2,
        enableOptimisticUpdates: true,
        dragCalculationThrottle: 50,
        touchDebounceMs: 25,
        scrollThresholdPx: 12,
        maxCacheEntries: 500,
        memoryCleanupThreshold: 0.7,
        enableComplexAnimations: true,
        positionUpdateDebounce: 150
      };
      
    default:
      return baseConfig;
  }
};

/**
 * Throttle function optimized for performance
 */
export const createPerformanceThrottle = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): T => {
  let timeoutId: NodeJS.Timeout | null = null;
  let lastExecTime = 0;
  
  return ((...args: any[]) => {
    const currentTime = Date.now();
    
    if (currentTime - lastExecTime > wait) {
      lastExecTime = currentTime;
      return func(...args);
    }
    
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      lastExecTime = Date.now();
      func(...args);
      timeoutId = null;
    }, wait);
  }) as T;
};

/**
 * Debounce function with immediate execution option
 */
export const createPerformanceDebounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate = false
): T => {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return ((...args: any[]) => {
    const callNow = immediate && !timeoutId;
    
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      timeoutId = null;
      if (!immediate) func(...args);
    }, wait);
    
    if (callNow) func(...args);
  }) as T;
};

/**
 * Monitor memory pressure and trigger cleanup if needed
 */
export const createMemoryPressureMonitor = (
  onMemoryPressure: () => void,
  threshold = 0.8
) => {
  let isMonitoring = false;
  let intervalId: NodeJS.Timeout | null = null;
  
  const startMonitoring = () => {
    if (isMonitoring || typeof window === 'undefined') return;
    
    isMonitoring = true;
    intervalId = setInterval(() => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        const usageRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
        
        if (usageRatio > threshold) {
          console.warn(`[MemoryPressure] High memory usage detected: ${(usageRatio * 100).toFixed(1)}%`);
          onMemoryPressure();
        }
      }
    }, 5000); // Check every 5 seconds
  };
  
  const stopMonitoring = () => {
    isMonitoring = false;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
  
  return {
    startMonitoring,
    stopMonitoring,
    isMonitoring: () => isMonitoring
  };
};

/**
 * Check if device is in low-power mode (battery saver)
 */
export const isLowPowerMode = (): boolean => {
  // Check if battery API is available
  if ('getBattery' in navigator) {
    // This is async, so we can't get immediate results
    // In practice, you'd want to set this up once and cache the result
    return false;
  }
  
  // Fallback: assume low power mode if device has limited capabilities
  const caps = detectDeviceCapabilities();
  return caps.estimatedPerformanceTier === 'low';
};

/**
 * Create a performance-aware state updater that batches updates
 */
export const createBatchedStateUpdater = <T>(
  setState: React.Dispatch<React.SetStateAction<T>>,
  batchDelay = 16 // One frame
) => {
  let pendingUpdate: T | null = null;
  let timeoutId: NodeJS.Timeout | null = null;
  
  return (newState: T | ((prev: T) => T)) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    // If it's a function, we need to apply it immediately to get the value
    if (typeof newState === 'function') {
      setState(prev => {
        const result = (newState as (prev: T) => T)(prev);
        pendingUpdate = result;
        return result;
      });
    } else {
      pendingUpdate = newState;
    }
    
    timeoutId = setTimeout(() => {
      if (pendingUpdate !== null) {
        setState(pendingUpdate);
        pendingUpdate = null;
      }
      timeoutId = null;
    }, batchDelay);
  };
};
