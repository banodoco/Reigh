/**
 * Unified Image Loading Priority System
 * 
 * Single source of truth for all image loading behavior.
 * Progressive loading is the primary mechanism - individual items no longer have separate delays.
 */

export interface LoadingConfig {
  isMobile: boolean;
  totalImages: number;
  isPreloaded: boolean;
}

export interface ImageLoadingStrategy {
  shouldLoadInInitialBatch: boolean;
  progressiveDelay: number; // Unified delay calculation
  batchGroup: number;
}

/**
 * Device capability detection for adaptive loading
 */
const getDeviceCapabilities = () => {
  const isMobile = window.innerWidth <= 768;
  const hasLowMemory = 'deviceMemory' in navigator && (navigator as any).deviceMemory <= 4;
  const hasLowEndCPU = 'hardwareConcurrency' in navigator && navigator.hardwareConcurrency <= 2;
  const hasVeryLowEndCPU = 'hardwareConcurrency' in navigator && navigator.hardwareConcurrency === 1;
  const hasSlowConnection = 'connection' in navigator && 
    ((navigator as any).connection?.effectiveType === '2g' || 
     (navigator as any).connection?.effectiveType === 'slow-2g');
  
  return {
    isMobile,
    hasLowMemory,
    hasLowEndCPU,
    hasVeryLowEndCPU,
    hasSlowConnection,
    isLowEnd: hasSlowConnection || (hasLowMemory && hasLowEndCPU),
    isVeryLowEnd: hasVeryLowEndCPU || (hasSlowConnection && hasLowMemory)
  };
};

// Performance tracking
interface PerformanceMetrics {
  avgLoadTime: number;
  loadTimes: number[];
  adjustedDelayMultiplier: number;
}

const performanceMetrics: PerformanceMetrics = {
  avgLoadTime: 0,
  loadTimes: [],
  adjustedDelayMultiplier: 1.0
};

/**
 * Track image load time and adjust delays based on performance
 */
export const trackImageLoadTime = (loadTimeMs: number): void => {
  performanceMetrics.loadTimes.push(loadTimeMs);
  
  // Keep only last 20 measurements
  if (performanceMetrics.loadTimes.length > 20) {
    performanceMetrics.loadTimes.shift();
  }
  
  // Calculate average
  const sum = performanceMetrics.loadTimes.reduce((a, b) => a + b, 0);
  performanceMetrics.avgLoadTime = sum / performanceMetrics.loadTimes.length;
  
  // Adjust delay multiplier based on average load time
  if (performanceMetrics.avgLoadTime > 500) {
    // Slow loading: increase delays
    performanceMetrics.adjustedDelayMultiplier = Math.min(2.0, performanceMetrics.adjustedDelayMultiplier + 0.1);
  } else if (performanceMetrics.avgLoadTime < 200) {
    // Fast loading: decrease delays
    performanceMetrics.adjustedDelayMultiplier = Math.max(0.5, performanceMetrics.adjustedDelayMultiplier - 0.1);
  }
};

/**
 * Adaptive batch configuration based on device capabilities
 */
export const getUnifiedBatchConfig = (isMobile: boolean) => {
  const capabilities = getDeviceCapabilities();
  
  // Very low-end mobile: minimal initial batch
  if (capabilities.isVeryLowEnd && isMobile) {
    return {
      initialBatchSize: 2, // Only 2 images immediately
      staggerDelay: 60, // Slower stagger for weak devices
      maxStaggerDelay: 150
    };
  }
  
  // Low-end or mobile: conservative settings
  if (capabilities.isLowEnd || isMobile) {
    return {
      initialBatchSize: 3, // First 3 load immediately
      staggerDelay: capabilities.hasSlowConnection ? 50 : 40, // Adaptive based on connection
      maxStaggerDelay: 120
    };
  }
  
  // Desktop/high-end: aggressive settings
  return {
    initialBatchSize: 4, // First 4 load immediately
    staggerDelay: 25, // Fast delays for good hardware
    maxStaggerDelay: 100
  };
};

/**
 * Main function: determines loading strategy for an image
 * Simplified to use a single progressive delay calculation
 */
export const getImageLoadingStrategy = (
  index: number, 
  config: LoadingConfig
): ImageLoadingStrategy => {
  const { isMobile, isPreloaded } = config;
  
  const batchConfig = getUnifiedBatchConfig(isMobile);
  const { initialBatchSize, staggerDelay, maxStaggerDelay } = batchConfig;
  
  // Determine which batch this image belongs to
  const batchGroup = Math.floor(index / initialBatchSize);
  
  // Simplified progressive delay calculation
  let progressiveDelay: number;
  const shouldLoadInInitialBatch = index < initialBatchSize;
  
  if (isPreloaded) {
    // Preloaded images always load immediately
    progressiveDelay = 0;
  } else if (index === 0) {
    // First image always loads immediately
    progressiveDelay = 0;
  } else if (shouldLoadInInitialBatch) {
    // Initial batch with minimal delays for smooth appearance
    progressiveDelay = index * 8; // 0ms, 8ms, 16ms, 24ms for first 4
  } else {
    // Progressive stagger for remaining images
    const staggerIndex = index - initialBatchSize;
    progressiveDelay = Math.min(
      staggerDelay * (staggerIndex + 1),
      maxStaggerDelay // Cap maximum delay
    );
  }
  
  return {
    shouldLoadInInitialBatch,
    progressiveDelay,
    batchGroup
  };
};

/**
 * Check if an image should be included in the initial batch
 */
export const shouldIncludeInInitialBatch = (
  index: number,
  isMobile: boolean
): boolean => {
  const { initialBatchSize } = getUnifiedBatchConfig(isMobile);
  return index < initialBatchSize;
};

// Legacy functions removed - use getImageLoadingStrategy and getUnifiedBatchConfig instead
