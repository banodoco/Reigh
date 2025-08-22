import { useState, useEffect, useMemo } from 'react';
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
const isInPreloaderCache = (url: string): boolean => {
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
 * Check if the browser already has the image decoded/cached
 */
const isInBrowserCache = (url: string): boolean => {
  if (!url) return false;
  try {
    const testImg = new Image();
    testImg.src = url;
    return testImg.complete && testImg.naturalWidth > 0;
  } catch {
    return false;
  }
};

/**
 * Hook to manage thumbnail loading state with cache detection
 */
export const useThumbnailLoader = (video: GenerationRow) => {
  const hasThumbnail = video.thumbUrl && 
    video.thumbUrl !== video.location && 
    video.thumbUrl !== video.imageUrl;
  
  // Stable initial cache check - only computed once on mount
  const initialCacheStatus = useMemo(() => {
    if (!hasThumbnail || !video.thumbUrl) {
      return { inPreloaderCache: false, inBrowserCache: false, isInitiallyCached: false };
    }
    
    const inPreloaderCache = isInPreloaderCache(video.thumbUrl);
    const inBrowserCache = isInBrowserCache(video.thumbUrl);
    const isInitiallyCached = inPreloaderCache || inBrowserCache;
    
    console.log(`[VideoGalleryPreload] INITIAL_CACHE_CHECK - URL: ${video.thumbUrl}`, {
      inPreloaderCache,
      inBrowserCache,
      isInitiallyCached,
      videoId: video.id?.substring(0, 8)
    });
    
    return { inPreloaderCache, inBrowserCache, isInitiallyCached };
  }, [hasThumbnail, video.thumbUrl, video.id]);
  
  const [thumbnailLoaded, setThumbnailLoaded] = useState(initialCacheStatus.isInitiallyCached);
  const [thumbnailError, setThumbnailError] = useState(false);

  // Live cache check for updates after preloader runs
  const currentCacheStatus = useMemo(() => {
    if (!hasThumbnail || !video.thumbUrl) {
      return { inPreloaderCache: false, inBrowserCache: false, isCurrentlyCached: false };
    }
    
    const inPreloaderCache = isInPreloaderCache(video.thumbUrl);
    const inBrowserCache = isInBrowserCache(video.thumbUrl);
    const isCurrentlyCached = inPreloaderCache || inBrowserCache;
    
    return { inPreloaderCache, inBrowserCache, isCurrentlyCached };
  }, [hasThumbnail, video.thumbUrl]);
  
  // Update state when cache status changes (e.g., when preloader completes)
  useEffect(() => {
    if (currentCacheStatus.isCurrentlyCached && !thumbnailLoaded) {
      console.log(`[VideoGalleryPreload] FIXING_CACHE_STATE - Setting thumbnailLoaded to true for newly cached image: ${video.thumbUrl}`);
      setThumbnailLoaded(true);
    }
  }, [currentCacheStatus.isCurrentlyCached, thumbnailLoaded, video.thumbUrl]);

  // Comprehensive cache debugging
  useEffect(() => {
    if (hasThumbnail && video.thumbUrl) {
      console.log(`[VideoGalleryPreload] CACHE_CHECK - URL: ${video.thumbUrl}`, {
        hasThumbnail,
        initialCache: initialCacheStatus.isInitiallyCached,
        currentCache: currentCacheStatus.isCurrentlyCached,
        inPreloaderCache: currentCacheStatus.inPreloaderCache,
        inBrowserCache: currentCacheStatus.inBrowserCache,
        thumbnailLoadedState: thumbnailLoaded,
        videoId: video.id?.substring(0, 8),
        timestamp: Date.now()
      });
      
      if (currentCacheStatus.isCurrentlyCached) {
        console.log(`[VideoGalleryPreload] INSTANT_LOAD (cached) - URL: ${video.thumbUrl}`);
      }
    }
  }, [hasThumbnail, video.thumbUrl, initialCacheStatus.isInitiallyCached, currentCacheStatus, thumbnailLoaded, video.id]);

  return {
    thumbnailLoaded,
    setThumbnailLoaded,
    thumbnailError,
    setThumbnailError,
    hasThumbnail,
    // Expose cache debug info
    isInitiallyCached: initialCacheStatus.isInitiallyCached,
    inPreloaderCache: currentCacheStatus.inPreloaderCache,
    inBrowserCache: currentCacheStatus.inBrowserCache
  };
};
