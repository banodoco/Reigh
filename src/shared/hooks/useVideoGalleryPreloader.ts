import { useRef, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useShots } from '@/shared/contexts/ShotsContext';
import { useProject } from "@/shared/contexts/ProjectContext";
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { useProjectVideoCountsCache } from '@/shared/hooks/useProjectVideoCountsCache';
import { Shot } from '@/types/shots';

// Global cache type declaration
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
 * Smart thumbnail preloader for video gallery performance optimization
 * 
 * Preloads thumbnail images for:
 * 1. First page of shots in ShotsPane (likely to be clicked)
 * 2. When viewing a shot: ensures page 1 is preloaded, then preloads page 2
 * 3. Newest shots (for quick browsing)
 * 
 * Only preloads placeholder images, not videos. Uses network-aware strategies.
 */
export const useVideoGalleryPreloader = (options?: {
  selectedShot?: Shot | null;
  shouldShowShotEditor?: boolean;
}) => {
  const { selectedShot, shouldShowShotEditor } = options || {};
  
  const GALLERY_PAGE_SIZE = 6; // Match VideoGallery's itemsPerPage
  const SHOTS_PANE_PAGE_SIZE = 5; // Match ShotsPane's pageSize
  const MAX_CONCURRENT_PRELOADS = 4;
  const PRELOAD_IDLE_TIMEOUT = 150;
  const TARGET_CACHED_IMAGES = 48; // Target number of images to cache (8 shots × 6 images)

  // Get project and shots data from contexts
  const { selectedProjectId } = useProject();
  const { shots } = useShots();
  const { getShotVideoCount } = useProjectVideoCountsCache(selectedProjectId);

  // Global singleton cache that persists across component instances
  if (!window.videoGalleryPreloaderCache) {
    window.videoGalleryPreloaderCache = {
      preloadedUrlSetByProject: {},
      preloadedPagesByShot: {},
      hasStartedPreloadForProject: {}
    };
  }
  
  // Per-component processing queue (but shared cache)
  const preloadQueue = useRef<Array<() => Promise<void>>>([]);
  const isProcessingQueue = useRef(false);

  // Get shots pane sort order settings to match ShotsPane behavior
  const { settings: shotsPaneSettings } = useToolSettings<{
    sortOrder?: 'oldest' | 'newest';
  }>('shots-pane-ui-state', { 
    projectId: selectedProjectId, 
    enabled: !!selectedProjectId 
  });

  const sortOrder = shotsPaneSettings?.sortOrder || 'newest';

  // Network condition checks
  const shouldSkipPreload = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    
    // Check for data saver mode
    if ((navigator as any).connection?.saveData) {
      console.log('[VideoGalleryPreload] Skipping preload due to saveData mode');
      return true;
    }
    
    // Check for slow connection
    const effectiveType = (navigator as any).connection?.effectiveType;
    if (effectiveType === '2g' || effectiveType === 'slow-2g') {
      console.log('[VideoGalleryPreload] Skipping preload due to slow connection:', effectiveType);
      return true;
    }
    
    return false;
  }, []);

  // Helper to build thumbnail URLs for a shot's video gallery page
  const buildThumbnailUrlsForPage = useCallback(async (shotId: string, pageIndex: number): Promise<string[]> => {
    if (!selectedProjectId) return [];
    
    const startIndex = pageIndex * GALLERY_PAGE_SIZE;
    const endIndex = startIndex + GALLERY_PAGE_SIZE - 1;
    
    try {
      // Fetch thumbnail URLs for the specific page using the same query as VideoGallery
      const { data, error } = await supabase
        .from('shot_generations')
        .select(`
          generation:generations(
            id,
            thumbnail_url,
            location
          )
        `)
        .eq('shot_id', shotId)
        // IMPORTANT: Match gallery sort (newest first)
        .order('created_at', { ascending: false })
        .order('position', { ascending: true })
        .range(startIndex, endIndex);

      if (error) {
        console.warn('[VideoGalleryPreload] Failed to fetch thumbnail URLs:', error);
        return [];
      }

      const urls = (data || [])
        .filter((sg: any) => sg.generation)
        .map((sg: any) => {
          const thumbUrl = sg.generation.thumbnail_url;
          const mainUrl = sg.generation.location;
          
          // Use exact same logic as useUnifiedGenerations: thumbnail_url || location
          // Don't try to construct URLs - trust what the database returns
          return thumbUrl || mainUrl;
        })
        .filter((url: string) => url) as string[];
      
      console.log(`[VideoGalleryPreload] Shot ${shotId.slice(0, 8)} URLs - Found ${urls.length} URLs, ${data?.filter((sg: any) => sg.generation?.thumbnail_url && sg.generation.thumbnail_url !== sg.generation.location).length || 0} with separate thumbnails`);
      console.log(`[VideoGalleryPreload] ORDER_STRATEGY: created_at desc (matching gallery)`);
      console.log(`[VideoGalleryPreload] Sample URLs:`, urls.slice(0, 2));
      console.log(`[VideoGalleryPreload] Raw URLs from database (no transformation):`, urls.slice(0, 3));
      return urls;
    } catch (error) {
      console.warn('[VideoGalleryPreload] Error building thumbnail URLs:', error);
      return [];
    }
  }, [selectedProjectId]);

  // Image preloader with Promise-based loading
  const preloadImage = useCallback((url: string): Promise<void> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve(); // Don't fail the whole batch on single image error
      img.src = url;
    });
  }, []);

  // Queue processor with concurrency limiting and idle callback optimization
  const processPreloadQueue = useCallback(async () => {
    if (isProcessingQueue.current || preloadQueue.current.length === 0) return;
    
    isProcessingQueue.current = true;
    
    const processNextBatch = async () => {
      const batch = preloadQueue.current.splice(0, MAX_CONCURRENT_PRELOADS);
      if (batch.length === 0) {
        isProcessingQueue.current = false;
        return;
      }

      console.log(`[VideoGalleryPreload] Processing batch of ${batch.length} preload tasks`);
      
      try {
        await Promise.all(batch.map(task => task()));
      } catch (error) {
        console.warn('[VideoGalleryPreload] Batch processing error:', error);
      }

      // Schedule next batch with idle callback for better performance
      if (preloadQueue.current.length > 0) {
        const scheduleNext = () => processNextBatch();
        if ('requestIdleCallback' in window) {
          requestIdleCallback(scheduleNext, { timeout: PRELOAD_IDLE_TIMEOUT });
        } else {
          setTimeout(scheduleNext, PRELOAD_IDLE_TIMEOUT);
        }
      } else {
        isProcessingQueue.current = false;
      }
    };

    processNextBatch();
  }, []);

  // Queue preload tasks for a shot's specific page
  const queuePreloadForShotPage = useCallback((shotId: string, pageIndex: number) => {
    if (shouldSkipPreload) return;
    if (!selectedProjectId) return;
    
    // Check if already preloaded
    const projectCache = window.videoGalleryPreloaderCache!.preloadedPagesByShot[shotId] || new Set();
    if (projectCache.has(pageIndex)) {
      console.log(`[VideoGalleryPreload] Page ${pageIndex} for shot ${shotId.slice(0, 8)} already preloaded`);
      return;
    }

    console.log(`[VideoGalleryPreload] Queueing preload for shot ${shotId.slice(0, 8)}, page ${pageIndex}`);
    
    const preloadTask = async () => {
      const urls = await buildThumbnailUrlsForPage(shotId, pageIndex);
      
      // Ensure cache Set exists for this project
      if (!window.videoGalleryPreloaderCache!.preloadedUrlSetByProject[selectedProjectId]) {
        window.videoGalleryPreloaderCache!.preloadedUrlSetByProject[selectedProjectId] = new Set();
      }
      const projectUrlCache = window.videoGalleryPreloaderCache!.preloadedUrlSetByProject[selectedProjectId];
      
      // Filter out already preloaded URLs
      const newUrls = urls.filter(url => !projectUrlCache.has(url));
      
      if (newUrls.length === 0) {
        console.log(`[VideoGalleryPreload] All URLs already preloaded for shot ${shotId.slice(0, 8)}, page ${pageIndex}`);
        return;
      }

      console.log(`[VideoGalleryPreload] Preloading ${newUrls.length} thumbnails for shot ${shotId.slice(0, 8)}, page ${pageIndex}`);
      console.log(`[VideoGalleryPreload] URLs to preload:`, newUrls.slice(0, 3).map(url => url.slice(-50))); // Show last 50 chars of first 3 URLs
      console.log(`[VideoGalleryPreload] Full URLs being preloaded:`, newUrls.slice(0, 2)); // Show first 2 full URLs for debugging
      
      // Preload the images
      await Promise.all(newUrls.map(url => preloadImage(url)));
      
      // Mark URLs as preloaded
      newUrls.forEach(url => projectUrlCache.add(url));
      window.videoGalleryPreloaderCache!.preloadedUrlSetByProject[selectedProjectId] = projectUrlCache;
      
      console.log(`[VideoGalleryPreload] Cache updated - project ${selectedProjectId} now has ${projectUrlCache.size} preloaded URLs`);
      
      // Mark page as preloaded
      if (!window.videoGalleryPreloaderCache!.preloadedPagesByShot[shotId]) {
        window.videoGalleryPreloaderCache!.preloadedPagesByShot[shotId] = new Set();
      }
      window.videoGalleryPreloaderCache!.preloadedPagesByShot[shotId].add(pageIndex);
      
      console.log(`[VideoGalleryPreload] Completed preloading for shot ${shotId.slice(0, 8)}, page ${pageIndex}`);
    };

    preloadQueue.current.push(preloadTask);
    processPreloadQueue();
  }, [shouldSkipPreload, selectedProjectId, buildThumbnailUrlsForPage, preloadImage, processPreloadQueue]);

  // Effect: Preload images until target cache size is reached
  useEffect(() => {
    if (!selectedProjectId || !shots || shouldSkipPreload) return;
    
    // Check if we've already started preloading for this project
    if (window.videoGalleryPreloaderCache!.hasStartedPreloadForProject[selectedProjectId]) {
      console.log(`[VideoGalleryPreload] Already started preloading for project ${selectedProjectId}`);
      return;
    }
    
    // Check current cache size
    const currentCacheSize = window.videoGalleryPreloaderCache!.preloadedUrlSetByProject[selectedProjectId]?.size || 0;
    console.log(`[VideoGalleryPreload] Current cache state for ${selectedProjectId}:`, {
      cacheSize: currentCacheSize,
      cacheExists: !!window.videoGalleryPreloaderCache!.preloadedUrlSetByProject[selectedProjectId],
      totalProjects: Object.keys(window.videoGalleryPreloaderCache!.preloadedUrlSetByProject).length
    });
    
    if (currentCacheSize >= TARGET_CACHED_IMAGES) {
      console.log(`[VideoGalleryPreload] Target cache size reached: ${currentCacheSize}/${TARGET_CACHED_IMAGES} images`);
      window.videoGalleryPreloaderCache!.hasStartedPreloadForProject[selectedProjectId] = true;
      return;
    }
    
    // Mark that we've started preloading for this project
    window.videoGalleryPreloaderCache!.hasStartedPreloadForProject[selectedProjectId] = true;
    console.log(`[VideoGalleryPreload] Marking project ${selectedProjectId} as preload started`);
    
    // Sort shots by priority: ShotsPane order first, then newest
    const sortedShots = [...shots].sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      
      if (sortOrder === 'oldest') {
        return dateA - dateB;
      } else {
        return dateB - dateA;
      }
    });

    // Create priority-ordered shot list
    const shotsPaneFirstPage = sortedShots.slice(0, SHOTS_PANE_PAGE_SIZE);
    const remainingShots = sortedShots.slice(SHOTS_PANE_PAGE_SIZE);
    
    // Prioritize: ShotsPane first page, then newest shots
    const priorityOrderedShots = [
      ...shotsPaneFirstPage,
      ...remainingShots.sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA; // Always newest first for remaining shots
      })
    ];

    console.log(`[VideoGalleryPreload] Starting preload to reach ${TARGET_CACHED_IMAGES} images (current: ${currentCacheSize})`);
    console.log(`[VideoGalleryPreload] Priority order: ShotsPane first ${SHOTS_PANE_PAGE_SIZE}, then newest of ${remainingShots.length} remaining`);
    
    // Queue preload for shots until we estimate reaching target
    let estimatedCacheSize = currentCacheSize;
    for (const shot of priorityOrderedShots) {
      if (estimatedCacheSize >= TARGET_CACHED_IMAGES) break;
      
      // Estimate how many images this shot will add (page 1 only for now)
      const estimatedImagesInShot = Math.min(GALLERY_PAGE_SIZE, getShotVideoCount?.(shot.id) || GALLERY_PAGE_SIZE);
      
      // Only queue if this shot's page 1 hasn't been preloaded yet
      const shotCache = window.videoGalleryPreloaderCache!.preloadedPagesByShot[shot.id] || new Set();
      if (!shotCache.has(0)) {
        console.log(`[VideoGalleryPreload] Queueing shot ${shot.id.slice(0, 8)} (est. ${estimatedImagesInShot} images)`);
        queuePreloadForShotPage(shot.id, 0);
        estimatedCacheSize += estimatedImagesInShot;
      }
    }
    
    console.log(`[VideoGalleryPreload] Queued shots to reach estimated ${estimatedCacheSize} images`);
  }, [selectedProjectId, shots]); // Simplified dependencies to prevent re-runs

  // Effect: When viewing a shot, ensure page 1 is preloaded and preload page 2
  useEffect(() => {
    if (!shouldShowShotEditor || !selectedShot || shouldSkipPreload) return;
    
    console.log(`[VideoGalleryPreload] Ensuring pages preloaded for current shot: ${selectedShot.id.slice(0, 8)}`);
    
    // Ensure page 1 is preloaded
    queuePreloadForShotPage(selectedShot.id, 0);
    
    // Preload page 2 if shot has enough videos
    if (getShotVideoCount) {
      const videoCount = getShotVideoCount(selectedShot.id);
      if (videoCount && videoCount > GALLERY_PAGE_SIZE) {
        console.log(`[VideoGalleryPreload] Shot has ${videoCount} videos, preloading page 2`);
        queuePreloadForShotPage(selectedShot.id, 1); // Page 2 = index 1
      }
    }
  }, [shouldShowShotEditor, selectedShot, shouldSkipPreload, queuePreloadForShotPage, getShotVideoCount]);

  // Cleanup on project change - Clear cache for new project
  useEffect(() => {
    if (!selectedProjectId) {
      // Clear only the processing queue when no project
      preloadQueue.current = [];
    } else {
      // When switching to a new project, clear the cache for the new project to start fresh
      // This ensures users see the most up-to-date content for each project
      if (window.videoGalleryPreloaderCache!.preloadedUrlSetByProject[selectedProjectId]) {
        console.log(`[VideoGalleryPreload] Clearing cache for project ${selectedProjectId} on project switch`);
        delete window.videoGalleryPreloaderCache!.preloadedUrlSetByProject[selectedProjectId];
        delete window.videoGalleryPreloaderCache!.hasStartedPreloadForProject[selectedProjectId];
        
        // Clear shot-specific cache for this project's shots
        if (shots) {
          shots.forEach(shot => {
            delete window.videoGalleryPreloaderCache!.preloadedPagesByShot[shot.id];
          });
        }
      }
    }
  }, [selectedProjectId, shots]);

  return {
    // Expose some state for debugging if needed
    isProcessingQueue: isProcessingQueue.current,
    queueLength: preloadQueue.current.length,
    preloadedProjectUrls: selectedProjectId ? window.videoGalleryPreloaderCache!.preloadedUrlSetByProject[selectedProjectId]?.size || 0 : 0,
    targetCacheSize: TARGET_CACHED_IMAGES,
    cacheUtilization: selectedProjectId ? Math.round(((window.videoGalleryPreloaderCache!.preloadedUrlSetByProject[selectedProjectId]?.size || 0) / TARGET_CACHED_IMAGES) * 100) : 0,
  };
};
