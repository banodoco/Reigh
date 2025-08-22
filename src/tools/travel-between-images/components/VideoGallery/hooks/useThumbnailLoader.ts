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
 * Now checks our preloaded image references first for better reliability
 */
const isInBrowserCache = (url: string): boolean => {
  if (!url) return false;
  
  // First check if we have a stored reference from preloading
  const cache = window.videoGalleryPreloaderCache;
  if (cache?.preloadedImageRefs?.has(url)) {
    const storedImg = cache.preloadedImageRefs.get(url);
    if (storedImg && storedImg.complete && storedImg.naturalWidth > 0) {
      return true;
    }
  }
  
  // Fallback to creating a new image element to test
  try {
    const testImg = new Image();
    testImg.src = url;
    
    // For cached images, complete should be true immediately
    // and naturalWidth should be > 0
    const isCached = testImg.complete && testImg.naturalWidth > 0;
    
    // Additional check: if it's complete but no dimensions, might be a broken image
    if (testImg.complete && testImg.naturalWidth === 0 && testImg.naturalHeight === 0) {
      return false;
    }
    
    return isCached;
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

  // Enhanced debug logging for thumbnail loading state
  useEffect(() => {
    if (hasThumbnail && video.thumbUrl) {
      console.log(`[VideoGalleryPreload] THUMBNAIL_STATE_DEBUG - URL: ${video.thumbUrl}`, {
        videoId: video.id?.substring(0, 8),
        thumbnailLoaded,
        thumbnailError,
        initialCacheStatus: initialCacheStatus.isInitiallyCached,
        stateInitializedWith: initialCacheStatus.isInitiallyCached,
        timestamp: Date.now()
      });
    }
  }, [thumbnailLoaded, thumbnailError, hasThumbnail, video.thumbUrl, video.id, initialCacheStatus.isInitiallyCached]);

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
  
  // Listen for global cache updates
  useEffect(() => {
    const handleCacheUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail?.updatedUrls?.includes(video.thumbUrl)) return;
      
      const inPreloaderCache = isInPreloaderCache(video.thumbUrl);
      const inBrowserCache = isInBrowserCache(video.thumbUrl);
      const isCached = inPreloaderCache || inBrowserCache;
      
      if (isCached && !thumbnailLoaded) {
        console.log(`[VideoGalleryPreload] CACHE_UPDATE_EVENT - Setting thumbnailLoaded to true for ${video.thumbUrl}`);
        setThumbnailLoaded(true);
      }
    };
    
    window.addEventListener('videogallery-cache-updated', handleCacheUpdate);
    return () => window.removeEventListener('videogallery-cache-updated', handleCacheUpdate);
  }, [video.thumbUrl, thumbnailLoaded]);

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
