import { useState, useEffect } from 'react';
import { GenerationRow } from '@/types/shots';

// TypeScript declaration for the global cache
declare global {
  interface Window {
    videoGalleryPreloaderCache?: {
      preloadedUrlSetByProject: Record<string, Set<string>>;
      preloadedPagesByShot: Record<string, Set<number>>;
      hasStartedPreloadForProject: Record<string, boolean>;
    };
  }
}

/**
 * Check if an image URL is cached by checking our preloader cache
 */
const checkImageCached = (url: string): boolean => {
  // Check if this URL is in our preloader cache
  const cache = window.videoGalleryPreloaderCache;
  if (!cache) return false;
  
  // Look through all project caches to find this URL
  for (const projectId in cache.preloadedUrlSetByProject) {
    const projectCache = cache.preloadedUrlSetByProject[projectId];
    if (projectCache && projectCache.has(url)) {
      return true;
    }
  }
  
  return false;
};

/**
 * Hook to manage thumbnail loading state with cache detection
 */
export const useThumbnailLoader = (video: GenerationRow) => {
  const hasThumbnail = video.thumbUrl && 
    video.thumbUrl !== video.location && 
    video.thumbUrl !== video.imageUrl;
  
  // Check cache immediately during initialization to avoid loading state flicker
  const isInitiallyCached = hasThumbnail && video.thumbUrl ? checkImageCached(video.thumbUrl) : false;
  
  const [thumbnailLoaded, setThumbnailLoaded] = useState(isInitiallyCached);
  const [thumbnailError, setThumbnailError] = useState(false);

  // Log cache hits for debugging
  useEffect(() => {
    if (isInitiallyCached && video.thumbUrl) {
      console.log(`[VideoGalleryPreload] INSTANT_LOAD (cached) - URL: ${video.thumbUrl}`);
    }
  }, [isInitiallyCached, video.thumbUrl]);

  return {
    thumbnailLoaded,
    setThumbnailLoaded,
    thumbnailError,
    setThumbnailError,
    hasThumbnail
  };
};
