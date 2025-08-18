/**
 * Unified Image Loading Priority System
 * 
 * This module provides a centralized way to calculate loading priorities
 * and delays for images across the entire application, ensuring consistency
 * between progressive loading and individual image loading logic.
 */

export interface LoadingConfig {
  isMobile: boolean;
  totalImages: number;
  isPreloaded: boolean;
}

export interface ImagePriority {
  tier: 'immediate' | 'high' | 'medium' | 'low';
  delay: number;
  shouldLoad: boolean;
  batchGroup: number; // Which batch this image belongs to (0 = first batch)
}

/**
 * Calculate the unified priority for an image based on its index and context
 */
export const calculateImagePriority = (
  index: number, 
  config: LoadingConfig
): ImagePriority => {
  const { isMobile, totalImages, isPreloaded } = config;
  
  // Adaptive batch size based on mobile/desktop
  const initialBatchSize = isMobile ? 4 : 6;
  
  // Determine which batch this image belongs to
  const batchGroup = Math.floor(index / initialBatchSize);
  
  // Calculate tier and delay with unified logic
  let tier: ImagePriority['tier'];
  let delay: number;
  
  if (index === 0) {
    // First image always loads immediately
    tier = 'immediate';
    delay = 0;
  } else if (index < 3) {
    // Next 2 images get high priority  
    tier = 'high';
    delay = isPreloaded ? 0 : (isMobile ? 15 : 10);
  } else if (index < initialBatchSize) {
    // Rest of initial batch gets medium priority
    tier = 'medium';
    delay = isPreloaded ? 0 : (isMobile ? 25 : 20);
  } else {
    // Beyond initial batch gets low priority with staggered delays
    tier = 'low';
    const staggerMultiplier = index - initialBatchSize + 1;
    delay = isPreloaded ? 0 : (isMobile ? 80 : 60) + (staggerMultiplier * (isMobile ? 20 : 15));
  }
  
  return {
    tier,
    delay,
    shouldLoad: index < initialBatchSize, // Only initial batch loads immediately
    batchGroup
  };
};

/**
 * Get the batch configuration for progressive loading
 */
export const getBatchConfig = (isMobile: boolean) => ({
  initialBatchSize: isMobile ? 4 : 6,
  staggerDelay: isMobile ? 120 : 80,
  maxStaggerDelay: isMobile ? 300 : 200
});

/**
 * Determine if an image should be considered "priority" for legacy compatibility
 */
export const isImagePriority = (index: number, isMobile: boolean): boolean => {
  const { initialBatchSize } = getBatchConfig(isMobile);
  return index < initialBatchSize;
};

/**
 * Get loading delay for an image with unified priority logic
 */
export const getImageLoadingDelay = (
  index: number,
  config: LoadingConfig
): number => {
  const priority = calculateImagePriority(index, config);
  return priority.delay;
};

/**
 * Check if an image should be included in the progressive loading initial batch
 */
export const shouldIncludeInInitialBatch = (
  index: number,
  isMobile: boolean
): boolean => {
  const { initialBatchSize } = getBatchConfig(isMobile);
  return index < initialBatchSize;
};
