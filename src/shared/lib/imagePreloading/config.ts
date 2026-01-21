/**
 * Image Preloading Configuration
 *
 * Pure function to detect device capabilities and return appropriate config.
 * No side effects, no state - just returns a config object.
 */

import { PreloadConfig } from './types';

/**
 * Detect device capabilities and return appropriate preload configuration.
 */
export function getPreloadConfig(): PreloadConfig {
  // Check if we're on mobile
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  // Check connection speed (if available)
  const connection = typeof navigator !== 'undefined' && 'connection' in navigator
    ? (navigator as any).connection
    : null;
  const hasSlowConnection = connection &&
    ['2g', 'slow-2g'].includes(connection.effectiveType);

  // Check memory (if available)
  const hasLowMemory = typeof navigator !== 'undefined' &&
    'deviceMemory' in navigator &&
    (navigator as any).deviceMemory <= 4;

  // Slow connection: minimal preloading
  if (hasSlowConnection) {
    return {
      maxConcurrent: 1,
      debounceMs: 300,
      maxImagesPerPage: 3,
      preloadThumbnailsOnly: true,
    };
  }

  // Mobile or low memory: conservative preloading
  if (isMobile || hasLowMemory) {
    return {
      maxConcurrent: 2,
      debounceMs: 200,
      maxImagesPerPage: 6,
      preloadThumbnailsOnly: true,
    };
  }

  // Desktop: more aggressive preloading
  return {
    maxConcurrent: 3,
    debounceMs: 150,
    maxImagesPerPage: 10,
    preloadThumbnailsOnly: false,
  };
}

/**
 * Get config with overrides (useful for testing or specific use cases)
 */
export function getPreloadConfigWithOverrides(
  overrides: Partial<PreloadConfig>
): PreloadConfig {
  return {
    ...getPreloadConfig(),
    ...overrides,
  };
}
