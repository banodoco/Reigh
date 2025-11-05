/**
 * Progressive Loading Settings
 * 
 * Configuration for progressive image loading behavior
 */

export interface ProgressiveLoadingSettings {
  // Feature toggles
  enableProgressiveImages: boolean;
  enableLightboxPrefetch: boolean;
  enableLazyLoading: boolean;
  
  // Timing settings
  crossfadeMs: number;
  thumbnailDelayMs: number;
  fullImageDelayMs: number;
  
  // Intersection Observer settings
  ioRootMargin: string;
  ioThreshold: number;
  
  // Performance settings
  lightboxNeighborPrefetchCount: number;
  maxConcurrentLoads: number;
  upgradeOnIdleForOffscreen: boolean;
  
  // Cache settings
  urlCacheMaxAge: number;
  urlCacheCleanupInterval: number;
}

export const DEFAULT_PROGRESSIVE_LOADING_SETTINGS: ProgressiveLoadingSettings = {
  // Feature toggles
  enableProgressiveImages: true,
  enableLightboxPrefetch: true,
  enableLazyLoading: true,
  
  // Timing settings
  crossfadeMs: 180,
  thumbnailDelayMs: 0,
  fullImageDelayMs: 50,
  
  // Intersection Observer settings
  ioRootMargin: '200px',
  ioThreshold: 0.1,
  
  // Performance settings
  lightboxNeighborPrefetchCount: 2,
  maxConcurrentLoads: 6,
  upgradeOnIdleForOffscreen: true,
  
  // Cache settings
  urlCacheMaxAge: 30 * 60 * 1000, // 30 minutes
  urlCacheCleanupInterval: 5 * 60 * 1000, // 5 minutes
};

// Global settings instance
let globalSettings = { ...DEFAULT_PROGRESSIVE_LOADING_SETTINGS };

export const getProgressiveLoadingSettings = (): ProgressiveLoadingSettings => {
  return { ...globalSettings };
};

export const updateProgressiveLoadingSettings = (updates: Partial<ProgressiveLoadingSettings>): void => {
  globalSettings = { ...globalSettings, ...updates };
  };

export const resetProgressiveLoadingSettings = (): void => {
  globalSettings = { ...DEFAULT_PROGRESSIVE_LOADING_SETTINGS };
  };

// Convenience getters for commonly used settings
export const isProgressiveLoadingEnabled = (): boolean => globalSettings.enableProgressiveImages;
export const getCrossfadeDuration = (): number => globalSettings.crossfadeMs;
export const getIntersectionObserverMargin = (): string => globalSettings.ioRootMargin;
export const getLightboxPrefetchCount = (): number => globalSettings.lightboxNeighborPrefetchCount;
