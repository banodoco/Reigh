import { GenerationRow } from '@/types/shots';

/**
 * Interface for skeleton calculation parameters
 */
export interface SkeletonCalculationParams {
  isLoadingGenerations: boolean;
  isFetchingGenerations: boolean;
  showVideosAfterDelay: boolean;
  videoOutputs: GenerationRow[];
  currentVideoOutputs: GenerationRow[];
  currentPage: number;
  itemsPerPage: number;
  shotId: string | null;
  generationsData: any;
  getCachedCount: (shotId: string | null) => number | null;
  getShotVideoCount?: (shotId: string | null) => number | null;
  lastGoodCountRef: React.MutableRefObject<number | null>;
}

/**
 * Calculate skeleton count for loading states
 * Uses priority-based fallback system to prevent jarring transitions
 */
export const calculateSkeletonCount = (params: SkeletonCalculationParams): number => {
  const {
    isLoadingGenerations,
    isFetchingGenerations,
    showVideosAfterDelay,
    videoOutputs,
    currentPage,
    itemsPerPage,
    shotId,
    generationsData,
    getCachedCount,
    getShotVideoCount,
    lastGoodCountRef
  } = params;

  // Only gate on initial loading, not background refetches
  const isDataLoading = isLoadingGenerations; 
  
  // SIMPLIFIED FIX: Show skeletons if data is loading OR videos haven't had time to load yet
  const shouldShowSkeletons = isDataLoading || (!showVideosAfterDelay && videoOutputs.length > 0);
  
  // Get cached count for instant display
  const cachedCount = getCachedCount(shotId);
  // Get project-wide preloaded count (highest priority for instant display)
  const projectVideoCount = getShotVideoCount?.(shotId) ?? null;
  
  console.log('[VideoLoadingFix] Getting skeleton count:', {
    isLoadingGenerations,
    isFetchingGenerations,
    isDataLoading,
    shouldShowSkeletons,
    showVideosAfterDelay,
    videoOutputsLength: videoOutputs.length,
    currentPage,
    itemsPerPage,
    shotId,
    projectVideoCount,
    cachedCount,
    timestamp: Date.now()
  });
  
  // SIMPLIFIED FIX: Show skeletons during data loading or video delay period
  if (shouldShowSkeletons) {
    // Priority 1: Use current data if available AND it's from current shot (most accurate)
    const totalVideos = generationsData?.total;
    const isDataFresh = !isFetchingGenerations; // Data is fresh if not currently fetching
    
    // Priority 2: Use project-wide preloaded count (instant display) 
    // Priority 3: Use cached count for fallback
    // Priority 4: Use last good count to prevent data loss
    const lastGoodCount = lastGoodCountRef.current;
    // ONLY use project cache during loading - never use cached/lastGood during transitions
    const countToUse = (totalVideos !== null && totalVideos !== undefined && isDataFresh) ? totalVideos :
                      (projectVideoCount !== null && projectVideoCount >= 0) ? projectVideoCount : 0;
    
    console.log('[SkeletonOptimization] Loading state - count sources (SAFE MODE):', {
      totalVideos,
      isDataFresh,
      projectVideoCount,
      countToUse,
      usingFreshData: (totalVideos !== null && totalVideos !== undefined && isDataFresh),
      usingProject: !(totalVideos !== null && totalVideos !== undefined && isDataFresh) && projectVideoCount !== null,
      usingFallback: !(totalVideos !== null && totalVideos !== undefined && isDataFresh) && projectVideoCount === null,
      generationsData: generationsData ? 'exists' : 'null',
      shotId,
      timestamp: Date.now()
    });
    
    // If we have count information (current or cached), calculate accurate skeleton count
    if (countToUse > 0) {
      // Calculate how many videos should be on the current page
      const startIndex = (currentPage - 1) * itemsPerPage;
      
      // Handle case where currentPage is beyond available data
      if (startIndex >= countToUse) {
        console.log('[VideoLoadingFix] Current page beyond available data, returning 0 skeletons:', {
          startIndex,
          countToUse,
          currentPage,
          itemsPerPage
        });
        return 0;
      }
      
      // SIMPLIFIED: No partial skeleton logic - just show all or none
      const videosOnCurrentPage = Math.min(countToUse - startIndex, itemsPerPage);
      const result = Math.max(0, videosOnCurrentPage);
      const source = (totalVideos !== null && totalVideos !== undefined && isDataFresh) ? 'fresh-current' : 'project';
      console.log('[VideoLoadingFix] Calculated skeleton count from count:', {
        countToUse,
        startIndex,
        videosOnCurrentPage,
        result,
        currentPage,
        itemsPerPage,
        source
      });
      return result;
    }
    
    // Do NOT use existing data from previous shot to derive skeletons; avoid cross-shot contamination
    
    // For initial load with no data and no cache, show 0 skeletons
    // Most conservative approach - no jarring transitions
    console.log('[SkeletonOptimization] SAFE FALLBACK: No fresh data or project cache, returning 0 skeletons to prevent stale data');
    return 0;
  }
  
  console.log('[SkeletonOptimization] Not loading, returning 0 skeletons');
  return 0;
};

/**
 * Determine if empty state should be shown
 */
export const shouldShowEmptyState = (
  getShotVideoCount: ((shotId: string | null) => number | null) | undefined,
  shotId: string | null,
  generationsData: any,
  sortedVideoOutputs: GenerationRow[],
  isLoadingGenerations: boolean,
  isFetchingGenerations: boolean,
  skeletonCount: number
): boolean => {
  const projectVideoCount = getShotVideoCount?.(shotId) ?? null;
  const currentDataTotal = generationsData?.total ?? null;
  
  const shouldShow = (projectVideoCount === 0) || 
                    (currentDataTotal === 0) ||
                    (sortedVideoOutputs.length === 0 && !isLoadingGenerations && !isFetchingGenerations);

  // When loading and we have no skeletons to show and no videos loaded, show the 0-videos message
  // This avoids a temporary blank state while we await confirmation of zero
  const showZeroMessageWhileLoading = (isLoadingGenerations || isFetchingGenerations) && skeletonCount === 0 && sortedVideoOutputs.length === 0;
  
  return shouldShow || showZeroMessageWhileLoading;
};
