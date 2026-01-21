/**
 * Image Preloading Types
 *
 * Central type definitions for the preloading system.
 */

export interface PreloadConfig {
  /** Maximum concurrent image loads */
  maxConcurrent: number;
  /** Debounce delay before starting preload (ms) */
  debounceMs: number;
  /** Maximum images to preload per page */
  maxImagesPerPage: number;
  /** Whether to only preload thumbnails (faster, less bandwidth) */
  preloadThumbnailsOnly: boolean;
}

export interface PreloadableImage {
  id: string;
  url?: string;
  thumbUrl?: string;
}

export type PreloadPriority = 'high' | 'normal' | 'low';

/** Maps priority names to numeric values for queue sorting */
export const PRIORITY_VALUES: Record<PreloadPriority, number> = {
  high: 100,
  normal: 50,
  low: 10,
};
