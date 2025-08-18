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
  tier: 'immediate' | 'high' | 'medium' | 'low';
  shouldLoadInInitialBatch: boolean;
  progressiveDelay: number; // Only delay used - for progressive loading system
  batchGroup: number;
}

/**
 * Unified batch configuration - single source of truth
 * Now uses mobile performance detection for better adaptation
 */
export const getUnifiedBatchConfig = (isMobile: boolean) => {
  // For backward compatibility, provide a simple fallback
  // New code should use getPerformanceConfig from mobilePerformanceUtils
  if (isMobile) {
    // Mobile settings - also load full page for consistent UX
    return {
      initialBatchSize: 25, // Load full page on mobile too
      staggerDelay: 120,
      maxStaggerDelay: 300
    };
  }
  
  // Desktop settings - load full page immediately
  return {
    initialBatchSize: 25, // Load full page of images immediately
    staggerDelay: 80,
    maxStaggerDelay: 200
  };
};

/**
 * Main function: determines loading strategy for an image
 * This is the ONLY function components should use
 */
export const getImageLoadingStrategy = (
  index: number, 
  config: LoadingConfig
): ImageLoadingStrategy => {
  const { isMobile, isPreloaded } = config;
  
  const batchConfig = getUnifiedBatchConfig(isMobile);
  const { initialBatchSize, staggerDelay } = batchConfig;
  
  // Determine which batch this image belongs to
  const batchGroup = Math.floor(index / initialBatchSize);
  
  // Calculate strategy with unified logic
  let tier: ImageLoadingStrategy['tier'];
  let progressiveDelay: number;
  let shouldLoadInInitialBatch: boolean;
  
  if (index === 0) {
    // First image always loads immediately
    tier = 'immediate';
    progressiveDelay = 0;
    shouldLoadInInitialBatch = true;
  } else if (index < 3) {
    // Next 2 images get high priority  
    tier = 'high';
    progressiveDelay = isPreloaded ? 0 : 16; // Single frame delay
    shouldLoadInInitialBatch = true;
  } else if (index < initialBatchSize) {
    // Rest of initial batch gets medium priority
    tier = 'medium';
    progressiveDelay = isPreloaded ? 0 : 32; // Two frame delay
    shouldLoadInInitialBatch = true;
  } else {
    // Beyond initial batch gets low priority with staggered delays
    tier = 'low';
    const staggerMultiplier = index - initialBatchSize + 1;
    progressiveDelay = isPreloaded ? 0 : staggerDelay * staggerMultiplier;
    shouldLoadInInitialBatch = false;
  }
  
  return {
    tier,
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
