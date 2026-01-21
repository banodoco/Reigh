/**
 * Image Preloading Module
 *
 * A clean, focused system for preloading adjacent page images.
 *
 * Usage:
 *   import { PreloadQueue, getPreloadConfig, preloadImages } from '@/shared/lib/imagePreloading';
 *
 *   const queue = new PreloadQueue(config.maxConcurrent);
 *   await preloadImages(images, queue, config, priority);
 */

// Types
export type {
  PreloadConfig,
  PreloadableImage,
  PreloadPriority,
} from './types';

export { PRIORITY_VALUES } from './types';

// Configuration
export { getPreloadConfig, getPreloadConfigWithOverrides } from './config';

// Queue
export { PreloadQueue } from './PreloadQueue';

// Preloader
export { preloadImages, getPageImages } from './preloader';
