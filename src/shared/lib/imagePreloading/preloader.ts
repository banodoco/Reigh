/**
 * Image Preloader
 *
 * Core preloading logic - takes images and loads them via the queue.
 * Marks images as cached when they complete.
 */

import { PreloadableImage, PreloadConfig } from './types';
import { PreloadQueue } from './PreloadQueue';
import { setImageCacheStatus, isImageCached } from '@/shared/lib/imageCacheManager';
import { getDisplayUrl } from '@/shared/lib/utils';

/**
 * Preload a batch of images using the provided queue.
 * Marks images as cached in the cache manager when they complete.
 *
 * @param images - Images to preload
 * @param queue - The preload queue to use
 * @param config - Preload configuration
 * @param priority - Base priority for these images (higher = load first)
 */
export async function preloadImages(
  images: PreloadableImage[],
  queue: PreloadQueue,
  config: PreloadConfig,
  priority = 0
): Promise<void> {
  // Limit to max images per page
  const limitedImages = images.slice(0, config.maxImagesPerPage);

  // Filter out already-cached images
  const toPreload = limitedImages.filter((img) => !isImageCached(img));

  if (toPreload.length === 0) {
    return;
  }

  // Create promises for each image
  const promises = toPreload.map(async (img, idx) => {
    const url = getImageUrl(img, config.preloadThumbnailsOnly);

    if (!url) {
      return;
    }

    // Skip invalid URLs (e.g., join-clips outputs with non-existent thumbnails)
    if (url.includes('_joined_frame.jpg')) {
      return;
    }

    try {
      // Slightly decrease priority for later images in the batch
      await queue.add(url, priority - idx);
      setImageCacheStatus(img, true);
    } catch {
      // Preloading is best-effort - don't throw on failure
    }
  });

  // Wait for all to settle (don't fail if some images fail)
  await Promise.allSettled(promises);
}

/**
 * Get images for a specific page from a full list.
 */
export function getPageImages(
  allImages: PreloadableImage[],
  page: number,
  itemsPerPage: number
): PreloadableImage[] {
  const start = page * itemsPerPage;
  return allImages.slice(start, start + itemsPerPage);
}

/**
 * Get the URL to preload for an image (thumbnail or full based on config)
 */
function getImageUrl(
  img: PreloadableImage,
  thumbnailOnly: boolean
): string | null {
  const rawUrl = thumbnailOnly
    ? (img.thumbUrl || img.url)
    : img.url;

  if (!rawUrl) {
    return null;
  }

  return getDisplayUrl(rawUrl);
}
