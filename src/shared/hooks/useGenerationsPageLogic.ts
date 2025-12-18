import { useState, useEffect, useMemo, useContext, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useGenerations, useDeleteGeneration, useToggleGenerationStar, type GenerationsPaginatedResponse } from '@/shared/hooks/useGenerations';
import { useAddImageToShot, useAddImageToShotWithoutPosition, usePositionExistingGenerationInShot } from '@/shared/hooks/useShots';
import { LastAffectedShotContext } from '@/shared/contexts/LastAffectedShotContext';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { useShots } from '@/shared/contexts/ShotsContext';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { toast } from 'sonner';
import { GeneratedImageWithMetadata } from '@/shared/components/ImageGallery';
import { GenerationsPaneSettings } from '@/tools/travel-between-images/components/ShotEditor/state/types';

interface UseGenerationsPageLogicOptions {
  itemsPerPage?: number;
  mediaType?: 'all' | 'image' | 'video';
  toolType?: string;
  enableDataLoading?: boolean;
}

/**
 * Filter state for a single shot.
 * Tracks both the current filter and whether it was explicitly set by the user.
 */
interface ShotFilterState {
  filter: string; // 'all' or the shotId
  isUserOverride: boolean; // true if user explicitly set this, false if it's the computed default
}

/**
 * A map of shotId -> filter state.
 * This allows us to track filter preferences per-shot without reactive flicker.
 */
type ShotFilterStateMap = Map<string, ShotFilterState>;



export function useGenerationsPageLogic({
  itemsPerPage = 45,
  mediaType = 'image',
  toolType,
  enableDataLoading = true
}: UseGenerationsPageLogicOptions = {}) {
  const queryClient = useQueryClient();
  const { selectedProjectId } = useProject();
  const { shots: shotsData, allImagesCount, noShotImagesCount } = useShots();
  
  // Gate all data loading based on project availability and enableDataLoading flag
  const shouldLoadData = enableDataLoading && !!selectedProjectId;
  const [page, setPage] = useState(1);
  
  // Use regular state for the current filter values
  const [selectedShotFilter, setSelectedShotFilter] = useState<string>('all');
  const [excludePositioned, setExcludePositioned] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [starredOnly, setStarredOnly] = useState<boolean>(false);
  
  const { currentShotId } = useCurrentShot();
  
  // Get last affected shot context early so it's available for effects below
  const lastAffectedShotContext = useContext(LastAffectedShotContext);
  const { lastAffectedShotId = null, setLastAffectedShotId = () => {} } = lastAffectedShotContext || {};

  // Use shots.settings to store GenerationsPane settings for the current shot (for persistence)
  const { 
    settings: shotSettings, 
    update: updateShotSettings,
    isLoading: isLoadingShotSettings 
  } = useToolSettings<GenerationsPaneSettings>('generations-pane', { 
    shotId: currentShotId || undefined, 
    enabled: shouldLoadData && !!currentShotId 
  });

  // ============================================================================
  // STABLE FILTER STATE MAP
  // This map tracks the filter state for each shot, avoiding reactive flicker.
  // It uses pre-computed stats from shotsData (hasUnpositionedImages) for defaults.
  // ============================================================================
  
  const filterStateMapRef = useRef<ShotFilterStateMap>(new Map());
  
  // Track which shot we last applied settings for (to detect shot changes)
  const lastAppliedShotIdRef = useRef<string | null>(null);
  
  // Track the last known unpositioned count for each shot (to detect when images are added/removed)
  const lastUnpositionedCountsRef = useRef<Map<string, number>>(new Map());

  /**
   * Get the filter state for a shot from the map.
   * Uses pre-computed stats from shotsData for the default.
   */
  const getFilterStateForShot = useCallback((shotId: string): ShotFilterState => {
    // Check if we have an existing state (possibly with user override)
    const existingState = filterStateMapRef.current.get(shotId);
    if (existingState) {
      return existingState;
    }
    
    // No existing state - compute default from pre-computed stats
    const shot = shotsData?.find(s => s.id === shotId);
    const hasUnpositioned = shot?.hasUnpositionedImages ?? false;
    
    // Default: show shot's images if it has unpositioned ones, otherwise show all
    const defaultFilter = hasUnpositioned ? shotId : 'all';
    
    return {
      filter: defaultFilter,
      isUserOverride: false
    };
  }, [shotsData]);

  /**
   * Set the filter state for a shot.
   * If isUserOverride is true, this will persist until explicitly changed again.
   */
  const setFilterStateForShot = useCallback((shotId: string, filter: string, isUserOverride: boolean) => {
    filterStateMapRef.current.set(shotId, { filter, isUserOverride });
    
    console.log('[StableFilter] Set filter state:', {
      shotId: shotId?.substring(0, 8),
      filter: filter === 'all' ? 'all' : filter?.substring(0, 8),
      isUserOverride
    });
  }, []);

  // ============================================================================
  // INITIALIZE FILTER STATE FROM PERSISTED SETTINGS
  // When shot settings load, populate the map with user's previous choice.
  // The main effect below reads from the map and applies the filter.
  // This avoids races where both effects try to setSelectedShotFilter.
  // ============================================================================
  
  useEffect(() => {
    if (!currentShotId || isLoadingShotSettings) return;
    
    // Check if we already have a user override in the map
    const existingState = filterStateMapRef.current.get(currentShotId);
    if (existingState?.isUserOverride) {
      console.log('[StableFilter] Already have user override in map, skipping settings restore');
      return;
    }
    
    // Populate map from persisted settings if user had customized
    // NOTE: We only update the map here, NOT setSelectedShotFilter.
    // The main effect below is the single source of truth for applying filters.
    if (shotSettings?.userHasCustomized && shotSettings.selectedShotFilter) {
      console.log('[StableFilter] Populating map from persisted settings:', {
        shotId: currentShotId?.substring(0, 8),
        filter: shotSettings.selectedShotFilter === 'all' ? 'all' : shotSettings.selectedShotFilter?.substring(0, 8)
      });
      
      setFilterStateForShot(currentShotId, shotSettings.selectedShotFilter, true);
      // Also restore excludePositioned preference
      setExcludePositioned(shotSettings.excludePositioned ?? true);
    }
  }, [currentShotId, isLoadingShotSettings, shotSettings, setFilterStateForShot]);

  // ============================================================================
  // APPLY FILTER WHEN NAVIGATING TO A SHOT
  // This is the main effect that applies the filter when currentShotId changes.
  // It does NOT depend on shotsData to avoid flicker from data updates.
  // ============================================================================
  
  useEffect(() => {
    // Don't apply defaults while per-shot settings are still loading.
    // If we apply a shotsData-based default first, then apply settings a moment later,
    // the dropdown can "flip" (all -> shot -> all) or get stuck (all -> stays all).
    if (currentShotId && isLoadingShotSettings) {
      console.log('[StableFilter] Shot changed but settings still loading - deferring filter apply:', {
        shotId: currentShotId.substring(0, 8),
      });
      return;
    }

    // Only run when the shot actually changes (or when we deferred previously and settings finished loading)
    if (currentShotId === lastAppliedShotIdRef.current) {
      return;
    }
    
    const previousShotId = lastAppliedShotIdRef.current;
    
    console.log('[StableFilter] Shot changed:', {
      from: previousShotId?.substring(0, 8),
      to: currentShotId?.substring(0, 8),
      currentFilter: selectedShotFilter
    });
    
    if (!currentShotId) {
      // No shot selected - show all
      console.log('[StableFilter] No current shot, showing all');
      setSelectedShotFilter('all');
      setExcludePositioned(true);
      lastAppliedShotIdRef.current = currentShotId;
      return;
    }
    
    // Get the filter state for this shot
    const filterState = getFilterStateForShot(currentShotId);
    
    console.log('[StableFilter] Applying filter for shot:', {
      shotId: currentShotId?.substring(0, 8),
      filter: filterState.filter === 'all' ? 'all' : filterState.filter?.substring(0, 8),
      isUserOverride: filterState.isUserOverride
    });
    
    setSelectedShotFilter(filterState.filter);

    // Default behavior: when entering a shot, we default to "exclude positioned" = true
    // (i.e., we primarily care about unpositioned items). If the user previously customized
    // this shot's settings, the settings-restore effect will override this value.
    setExcludePositioned(true);
    
    // If not a user override, store this as the default in the map
    if (!filterState.isUserOverride) {
      setFilterStateForShot(currentShotId, filterState.filter, false);
    }
    
    // Sync the dropdown selection to the current shot
    setLastAffectedShotId(currentShotId);

    // Mark as applied only after we actually apply the filter for this shot
    lastAppliedShotIdRef.current = currentShotId;
    
  }, [
    currentShotId,
    isLoadingShotSettings,
    getFilterStateForShot,
    setFilterStateForShot,
    setLastAffectedShotId,
  ]);

  // ============================================================================
  // UPDATE DEFAULTS WHEN SHOT IMAGE COUNTS CHANGE
  // If a shot gains/loses unpositioned images, update the default (but not user overrides).
  // This runs separately from navigation to avoid flicker.
  // ============================================================================
  
  useEffect(() => {
    if (!shotsData?.length) return;
    
    // Check each shot for changes in unpositioned image count
    shotsData.forEach(shot => {
      const lastCount = lastUnpositionedCountsRef.current.get(shot.id);
      const currentCount = shot.unpositionedImageCount ?? 0;
      
      // If count changed, update the default (but not user overrides)
      if (lastCount !== undefined && lastCount !== currentCount) {
        const existingState = filterStateMapRef.current.get(shot.id);
        
        // Only update if NOT a user override
        if (!existingState?.isUserOverride) {
          const newDefault = currentCount > 0 ? shot.id : 'all';
          
          console.log('[StableFilter] Unpositioned count changed, updating default:', {
            shotId: shot.id?.substring(0, 8),
            oldCount: lastCount,
            newCount: currentCount,
            newDefault: newDefault === 'all' ? 'all' : 'shot'
          });
          
          setFilterStateForShot(shot.id, newDefault, false);
          
          // If this is the current shot, update the active filter too
          if (shot.id === currentShotId) {
            setSelectedShotFilter(newDefault);
          }
        }
      }
      
      // Update tracked count
      lastUnpositionedCountsRef.current.set(shot.id, currentCount);
    });
  }, [shotsData, currentShotId, setFilterStateForShot]);

  // ============================================================================
  // USER OVERRIDE HANDLERS
  // When user explicitly changes the filter, mark it as a user override.
  // ============================================================================

  const handleShotFilterChange = useCallback((newShotFilter: string) => {
    setSelectedShotFilter(newShotFilter);
    
    // Mark as user override so it persists
    if (currentShotId) {
      setFilterStateForShot(currentShotId, newShotFilter, true);
      
      // Also persist to shot settings for long-term storage
      const updatedSettings: GenerationsPaneSettings = {
        selectedShotFilter: newShotFilter,
        excludePositioned,
        userHasCustomized: true
      };
      updateShotSettings('shot', updatedSettings);
      
      console.log('[StableFilter] User changed filter (override):', {
        shotId: currentShotId?.substring(0, 8),
        newFilter: newShotFilter === 'all' ? 'all' : newShotFilter?.substring(0, 8)
      });
    }
  }, [currentShotId, excludePositioned, setFilterStateForShot, updateShotSettings]);

  const handleExcludePositionedChange = useCallback((newExcludePositioned: boolean) => {
    setExcludePositioned(newExcludePositioned);
    
    // Persist to shot settings
    if (currentShotId) {
      const updatedSettings: GenerationsPaneSettings = {
        selectedShotFilter,
        excludePositioned: newExcludePositioned,
        userHasCustomized: true
      };
      updateShotSettings('shot', updatedSettings);
    }
  }, [currentShotId, selectedShotFilter, updateShotSettings]);

  // Reset to page 1 when shot filter or position filter changes
  useEffect(() => {
    setPage(1);
  }, [selectedShotFilter, excludePositioned]);

  // Reset to page 1 when media type or starred filter changes
  useEffect(() => {
    setPage(1);
  }, [mediaType, starredOnly]);

  // Reset excludePositioned when switching to video to avoid confusion
  useEffect(() => {
    if (mediaType === 'video') {
      setExcludePositioned(false);
    }
  }, [mediaType]);

  // Memoize filters to prevent unnecessary re-renders and duplicate progressive loading sessions
  const filters = useMemo(() => {
    const computedFilters = {
    mediaType,
    toolType,
    shotId: selectedShotFilter === 'all' ? undefined : selectedShotFilter,
    // Only apply excludePositioned for specific shots (not 'all' or 'no-shot')
    excludePositioned: (selectedShotFilter !== 'all' && selectedShotFilter !== 'no-shot') ? excludePositioned : undefined,
    starredOnly
    };
    
    // [SkeletonCountDebug]
    console.log('[SkeletonCountDebug] 🔄 Filters changed:', {
      shotId: computedFilters.shotId === undefined ? 'all' : computedFilters.shotId?.substring(0, 8),
      excludePositioned: computedFilters.excludePositioned,
      mediaType: computedFilters.mediaType,
      starredOnly: computedFilters.starredOnly
    });
    
    return computedFilters;
  }, [mediaType, toolType, selectedShotFilter, excludePositioned, starredOnly]);

  const generationsQuery = useGenerations(
    shouldLoadData ? selectedProjectId : null, 
    page, 
    itemsPerPage, 
    shouldLoadData,
    filters
  );
  const generationsResponse = generationsQuery.data as GenerationsPaginatedResponse | undefined;
  const isFetching = generationsQuery.isFetching;
  const isError = generationsQuery.isError;
  const error = generationsQuery.error;
  
  // Track if we're showing stale/placeholder data during a filter change
  // This happens when keepPreviousData is active and we're fetching new data
  const isPlaceholderData = generationsQuery.isPlaceholderData;
  
  // Show loading state when:
  // 1. Initial load (no data yet), OR
  // 2. Filter changed and we're showing stale placeholder data
  // This prevents showing "all" items when user just switched to a specific shot
  const isLoading = generationsQuery.isLoading || (isFetching && isPlaceholderData);
  
  // [SkeletonCountDebug] Log loading state transitions
  useEffect(() => {
    console.log('[SkeletonCountDebug] 📊 State update:', {
      selectedShotFilter: selectedShotFilter === 'all' ? 'all' : selectedShotFilter?.substring(0, 8),
      'query.isLoading': generationsQuery.isLoading,
      'query.isFetching': isFetching,
      'query.isPlaceholderData': isPlaceholderData,
      'computed.isLoading': isLoading,
      'data.total': generationsResponse?.total,
      'data.itemCount': generationsResponse?.items?.length,
      timestamp: Date.now()
    });
    
    // [SkeletonCountDebug] When data arrives, log what we got vs what we expected
    if (!isLoading && generationsResponse?.items && selectedShotFilter !== 'all') {
      const shot = shotsData?.find(s => s.id === selectedShotFilter);
      console.log('[SkeletonCountDebug] 🔍 Data comparison:', {
        shotId: selectedShotFilter?.substring(0, 8),
        'fromQuery.total': generationsResponse.total,
        'fromQuery.itemCount': generationsResponse.items.length,
        'fromShotsData.unpositionedCount': shot?.unpositionedImageCount,
        'fromShotsData.totalImageCount': shot?.imageCount,
        excludePositioned,
        'expectedFromShotsData': excludePositioned ? shot?.unpositionedImageCount : shot?.imageCount,
        // Show the actual items from the query
        queryItems: generationsResponse.items.slice(0, 10).map(item => ({
          id: item.id?.substring(0, 8),
          generation_id: (item as any).generation_id?.substring(0, 8),
        }))
      });
    }
  }, [selectedShotFilter, generationsQuery.isLoading, isFetching, isPlaceholderData, isLoading, generationsResponse?.total, generationsResponse?.items?.length, shotsData, excludePositioned, generationsResponse?.items]);
  
  // Track the last known count for each filter to use for skeletons
  // This is more accurate than pre-computed stats which can be stale
  const lastKnownCountsRef = useRef<Map<string, number>>(new Map());
  
  // Update last known count when we get real data
  useEffect(() => {
    if (!isLoading && generationsResponse?.total !== undefined) {
      const filterKey = `${selectedShotFilter}-${excludePositioned}`;
      lastKnownCountsRef.current.set(filterKey, generationsResponse.total);
    }
  }, [isLoading, generationsResponse?.total, selectedShotFilter, excludePositioned]);
  
  // Get expected count for skeletons when switching to a shot filter
  // Priority: 1) Last known count for this exact filter, 2) Pre-computed stats, 3) Default
  const expectedItemCount = useMemo(() => {
    const filterKey = `${selectedShotFilter}-${excludePositioned}`;
    
    // First, check if we have a cached count from a previous fetch
    const lastKnown = lastKnownCountsRef.current.get(filterKey);
    if (lastKnown !== undefined) {
      // Safety cap: don't show too many skeletons even if folder is huge
      const cappedLastKnown = Math.min(lastKnown, 60);
      
      // [SkeletonCountDebug]
      console.log('[SkeletonCountDebug] 🔢 Using last known count:', {
        shotId: selectedShotFilter === 'all' ? 'all' : selectedShotFilter?.substring(0, 8),
        lastKnown,
        cappedLastKnown,
        source: 'cache'
      });
      return cappedLastKnown;
    }
    
    // Fall back to pre-computed stats from shotsData
    if (selectedShotFilter === 'all') {
      return Math.min(allImagesCount ?? 12, 60);
    }
    if (selectedShotFilter === 'no-shot') {
      return Math.min(noShotImagesCount ?? 12, 60);
    }
    const shot = shotsData?.find(s => s.id === selectedShotFilter);
    if (!shot) return 12;
    
    // Return the appropriate count based on excludePositioned setting
    const count = excludePositioned 
      ? shot.unpositionedImageCount 
      : shot.imageCount;
    
    // [SkeletonCountDebug]
    // Capped for performance (don't render 1000s of skeletons) but allowing enough to fill the screen
    const cappedCount = Math.min(count ?? 12, 60);
    
    console.log('[SkeletonCountDebug] 🔢 Using pre-computed count:', {
      shotId: selectedShotFilter?.substring(0, 8),
      excludePositioned,
      allImagesCount,
      noShotImagesCount,
      rawCount: count,
      cappedCount,
      source: 'shotsData'
    });
    
    return cappedCount;
  }, [selectedShotFilter, shotsData, excludePositioned, allImagesCount, noShotImagesCount]);
  
  // ============================================================================
  // QUERY-BASED FALLBACK
  // If the query returns 0 results for a specific shot filter, fall back to 'all'.
  // This is a safety net in case pre-computed stats were stale.
  // Unlike the old approach, this doesn't use reactive state that causes flicker.
  // ============================================================================
  
  const lastQueryResultRef = useRef<{ filter: string; total: number } | null>(null);
  
  useEffect(() => {
    // Only check when query has completed and we're filtering by a specific shot
    if (isLoading || isFetching || selectedShotFilter === 'all' || page !== 1) {
      return;
    }
    
    const total = generationsResponse?.total ?? 0;
    const lastResult = lastQueryResultRef.current;
    
    // Check if this is a NEW result for this filter (not a re-render with same data)
    if (lastResult?.filter === selectedShotFilter && lastResult?.total === total) {
      return; // Same result, don't re-process
    }
    
    lastQueryResultRef.current = { filter: selectedShotFilter, total };
    
    if (total === 0) {
      console.log('[StableFilter] Query returned 0 results, falling back to "all":', {
        filter: selectedShotFilter?.substring(0, 8),
        total
      });
      
      // Update the filter state map (NOT as user override - this is auto-fallback)
      if (currentShotId) {
        const existingState = filterStateMapRef.current.get(currentShotId);
        if (!existingState?.isUserOverride) {
          setFilterStateForShot(currentShotId, 'all', false);
        }
      }
      
      setSelectedShotFilter('all');
    }
  }, [selectedShotFilter, isLoading, isFetching, generationsResponse?.total, page, currentShotId, setFilterStateForShot]);

  const addImageToShotMutation = useAddImageToShot();
  const addImageToShotWithoutPositionMutation = useAddImageToShotWithoutPosition();
  const positionExistingGenerationMutation = usePositionExistingGenerationInShot();
  const deleteGenerationMutation = useDeleteGeneration();
  const toggleStarMutation = useToggleGenerationStar();

  // Server-side pagination - data is now derived directly from the query response
  const paginatedData = useMemo(() => {
    const items = generationsResponse?.items ?? [];
    const total = generationsResponse?.total ?? 0;
    const totalPages = Math.ceil(total / itemsPerPage);
    
    return { 
      items, 
      totalPages, 
      currentPage: page 
    };
  }, [generationsResponse, page, itemsPerPage]);

  useEffect(() => {
    // If there is no "last affected shot" but there are shots available,
    // default to the first shot in the list (which is the most recent).
    console.log('[ADDTOSHOT] lastAffectedShotId initialization check:', {
      lastAffectedShotId,
      shotsDataLength: shotsData?.length,
      firstShotId: shotsData?.[0]?.id,
      firstShotName: shotsData?.[0]?.name,
      currentShotId,
      selectedShotFilter
    });
    
    if (!lastAffectedShotId && shotsData && shotsData.length > 0) {
      console.log('[ADDTOSHOT] 🎯 Setting lastAffectedShotId to first shot:', shotsData[0].id);
      setLastAffectedShotId(shotsData[0].id);
    }
  }, [lastAffectedShotId, shotsData, setLastAffectedShotId, currentShotId, selectedShotFilter]);

  const handleServerPageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleDeleteGeneration = (id: string) => {
    deleteGenerationMutation.mutate(id);
  };

  const handleToggleStar = (id: string, starred: boolean) => {
    toggleStarMutation.mutate({ id, starred });
  };

  const handleAddToShot = async (generationId: string, imageUrl?: string, thumbUrl?: string): Promise<boolean> => {
    // Fast path: minimal validation and direct execution
    // Priority: dropdown selection (lastAffectedShotId) > current viewing shot (currentShotId)
    const targetShotId = lastAffectedShotId || currentShotId;

    console.log('[AddDebug] 🔵 BUTTON PATH START - handleAddToShot:', {
      generationId: generationId?.substring(0, 8),
      currentShotId: currentShotId?.substring(0, 8),
      lastAffectedShotId: lastAffectedShotId?.substring(0, 8),
      targetShotId: targetShotId?.substring(0, 8),
      selectedProjectId: selectedProjectId?.substring(0, 8),
      timestamp: Date.now()
    });

    if (!targetShotId || !selectedProjectId) {
      console.log('[AddDebug] Missing required IDs:', {
        targetShotId,
        selectedProjectId
      });
      toast.error("No shot selected", {
        description: "Please select a shot in the gallery or create one first.",
      });
      return false;
    }
    
    // Check if we're trying to add to the same shot that's currently filtered with excludePositioned enabled
    const shouldPositionExisting = selectedShotFilter === targetShotId && excludePositioned;
    
    console.log('[PositionFix] Positioning decision:', {
      shouldPositionExisting,
      selectedShotFilter,
      targetShotId,
      excludePositioned,
      filterMatchesTarget: selectedShotFilter === targetShotId,
      willUsePositionExisting: shouldPositionExisting,
      timestamp: Date.now()
    });
    
    try {
      if (shouldPositionExisting) {
        console.log('[AddDebug] Using positionExistingGenerationMutation with params:', {
          shot_id: targetShotId,
          generation_id: generationId,
          project_id: selectedProjectId,
        });
        
        // Use the position existing function for items in the filtered list
        const result = await positionExistingGenerationMutation.mutateAsync({
          shot_id: targetShotId,
          generation_id: generationId,
          project_id: selectedProjectId,
        });
        
        console.log('[AddDebug] positionExistingGenerationMutation result:', {
          result,
          timestamp: Date.now()
        });
      } else {
        // Let the mutation calculate the frame from the database (same as drag-drop path)
        // This ensures correct positioning even when adding to a shot we're not currently viewing
        // The mutation will query the DB for existing frames and append at the end
        
        console.log('[AddDebug] 🔵 BUTTON PATH - calling addImageToShotMutation.mutateAsync:', {
          shot_id: targetShotId?.substring(0, 8),
          generation_id: generationId?.substring(0, 8),
          project_id: selectedProjectId?.substring(0, 8),
          timestamp: Date.now()
        });
        
        // Use the regular add function - let mutation calculate frame from DB
        const result = await addImageToShotMutation.mutateAsync({
          shot_id: targetShotId,
          generation_id: generationId,
          imageUrl: imageUrl,
          thumbUrl: thumbUrl,
          // Don't pass timelineFrame - let mutation query DB for correct position
          project_id: selectedProjectId,
        });
        
        console.log('[AddDebug] addImageToShotMutation result:', {
          result,
          timestamp: Date.now()
        });
      }
      
      console.log('[AddDebug] handleAddToShot completed successfully');
      return true;
    } catch (error) {
      console.error('[AddDebug] Error:', error);
      console.error('[AddDebug] handleAddToShot failed:', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: Date.now()
      });
      toast.error("Failed to add image to shot", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    }
  };

  const handleAddToShotWithoutPosition = async (generationId: string, imageUrl?: string, thumbUrl?: string): Promise<boolean> => {
    // Fast path: minimal validation and direct execution
    // Priority: dropdown selection (lastAffectedShotId) > current viewing shot (currentShotId)
    const targetShotId = lastAffectedShotId || currentShotId;
    
    if (!targetShotId || !selectedProjectId) {
      toast.error("No shot selected", {
        description: "Please select a shot in the gallery or create one first.",
      });
      return false;
    }
    
    try {
      // Always use the add without position function - never position existing items
      await addImageToShotWithoutPositionMutation.mutateAsync({
        shot_id: targetShotId,
        generation_id: generationId,
        imageUrl: imageUrl,
        thumbUrl: thumbUrl,
        project_id: selectedProjectId,
      });
      return true;
    } catch (error) {
      console.error('[ADDTOSHOT_NOPOS] Error:', error);
      toast.error("Failed to add image to shot without position", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    }
  };

  return {
    // Data
    selectedProjectId,
    shotsData,
    generationsResponse,
    paginatedData,
    lastAffectedShotId,
    totalCount: generationsResponse?.total ?? 0,
    
    // State
    page,
    selectedShotFilter,
    excludePositioned,
    searchTerm,
    starredOnly,
    
    // State setters
    setPage,
    setSelectedShotFilter: handleShotFilterChange,
    setExcludePositioned: handleExcludePositionedChange,
    setSearchTerm,
    setStarredOnly,
    
    // Loading states
    isLoading,
    isFetching,
    isError,
    error,
    isDeleting: deleteGenerationMutation.isPending ? deleteGenerationMutation.variables as string : null,
    
    // For skeleton display when filter changes
    expectedItemCount, // Pre-computed count from shot stats (or undefined for "all")
    
    // Handlers
    handleServerPageChange,
    handleDeleteGeneration,
    handleAddToShot,
    handleAddToShotWithoutPosition,
    handleToggleStar,
  };
} 