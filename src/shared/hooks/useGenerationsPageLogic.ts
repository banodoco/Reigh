import { useState, useEffect, useMemo, useContext } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useGenerations, useDeleteGeneration, useToggleGenerationStar } from '@/shared/hooks/useGenerations';
import { useListShots, useAddImageToShot, useAddImageToShotWithoutPosition, usePositionExistingGenerationInShot } from '@/shared/hooks/useShots';
import { LastAffectedShotContext } from '@/shared/contexts/LastAffectedShotContext';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
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



export function useGenerationsPageLogic({
  itemsPerPage = 45,
  mediaType = 'image',
  toolType,
  enableDataLoading = true
}: UseGenerationsPageLogicOptions = {}) {
  const queryClient = useQueryClient();
  const { selectedProjectId } = useProject();
  
  // Gate all data loading based on project availability and enableDataLoading flag
  const shouldLoadData = enableDataLoading && !!selectedProjectId;
  const [page, setPage] = useState(1);
  
  // Use regular state for the current filter values
  const [selectedShotFilter, setSelectedShotFilter] = useState<string>('all');
  const [excludePositioned, setExcludePositioned] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [starredOnly, setStarredOnly] = useState<boolean>(false);
  
  // Track if we've auto-fallen back to 'all' for the current shot (to prevent main effect from overriding)
  const [hasAutoFallenBack, setHasAutoFallenBack] = useState(false);
  
  const { data: shotsData } = useListShots(shouldLoadData ? selectedProjectId : null);
  const { currentShotId } = useCurrentShot();
  
  // Get last affected shot context early so it's available for effects below
  const lastAffectedShotContext = useContext(LastAffectedShotContext);
  const { lastAffectedShotId = null, setLastAffectedShotId = () => {} } = lastAffectedShotContext || {};

  // Use shots.settings to store GenerationsPane settings for the current shot
  const { 
    settings: shotSettings, 
    update: updateShotSettings,
    isLoading: isLoadingShotSettings 
  } = useToolSettings<GenerationsPaneSettings>('generations-pane', { 
    shotId: currentShotId || undefined, 
    enabled: shouldLoadData && !!currentShotId 
  });

  // Helper function to check if a shot has any images
  const shotHasImages = (shotId: string): boolean => {
    if (!shotsData) return false;
    const shot = shotsData.find(s => s.id === shotId);
    const hasImages = (shot?.images?.length || 0) > 0;
    console.log('[PaneFilterDebug] shotHasImages check:', {
      shotId: shotId?.substring(0, 8),
      hasImages,
      imageCount: shot?.images?.length || 0
    });
    return hasImages;
  };

  // Helper function to check if a shot has unpositioned images (when excludePositioned matters)
  const shotHasUnpositionedImages = (shotId: string): boolean => {
    if (!shotsData) {
      console.log('[PaneFilterDebug] shotHasUnpositionedImages: no shotsData yet');
      return false;
    }
    const shot = shotsData.find(s => s.id === shotId);
    if (!shot?.images) {
      console.log('[PaneFilterDebug] shotHasUnpositionedImages: shot not found or no images array', {
        shotId: shotId?.substring(0, 8),
        shotFound: !!shot
      });
      return false;
    }
    
    // Check if any images have timeline_frame === null/undefined (i.e., unpositioned)
    const unpositionedImages = shot.images.filter(img => (img as any).timeline_frame === null || (img as any).timeline_frame === undefined);
    console.log('[PaneFilterDebug] shotHasUnpositionedImages result:', {
      shotId: shotId?.substring(0, 8),
      totalImages: shot.images.length,
      unpositionedCount: unpositionedImages.length,
      hasUnpositioned: unpositionedImages.length > 0
    });
    
    return unpositionedImages.length > 0;
  };

  // Function to determine the appropriate shot filter based on current shot and settings
  const getDefaultShotFilter = (shotId: string): string => {
    console.log('[PaneFilterDebug] getDefaultShotFilter called:', {
      shotId: shotId?.substring(0, 8),
      excludePositioned
    });
    
    // When excludePositioned is true (default), check for unpositioned images
    if (excludePositioned) {
      const hasUnpositioned = shotHasUnpositionedImages(shotId);
      if (!hasUnpositioned) {
        console.log('[PaneFilterDebug] 🔴 getDefaultShotFilter → "all" (no unpositioned images with excludePositioned=true)');
        return 'all';
      }
      console.log('[PaneFilterDebug] 🟢 getDefaultShotFilter → shot (has unpositioned images)');
      return shotId;
    }
    
    // When excludePositioned is false, check for any images
    const hasImages = shotHasImages(shotId);
    if (!hasImages) {
      console.log('[PaneFilterDebug] 🔴 getDefaultShotFilter → "all" (no images at all)');
      return 'all';
    }
    
    console.log('[PaneFilterDebug] 🟢 getDefaultShotFilter → shot (has images with excludePositioned=false)');
    return shotId;
  };

  // Function to get the appropriate settings for the current shot
  const getCurrentShotSettings = (): GenerationsPaneSettings => {
    console.log('[PaneFilterDebug] getCurrentShotSettings called:', {
      currentShotId: currentShotId?.substring(0, 8),
      hasStoredSettings: !!shotSettings,
      userHasCustomized: shotSettings?.userHasCustomized,
      storedFilter: shotSettings?.selectedShotFilter?.substring(0, 8)
    });
    
    if (!currentShotId) {
      console.log('[PaneFilterDebug] getCurrentShotSettings → no currentShotId, returning "all"');
      return {
        selectedShotFilter: 'all',
        excludePositioned: true,
        userHasCustomized: false
      };
    }

    // If user has previously customized settings for this shot, always use them
    if (shotSettings?.userHasCustomized) {
      console.log('[PaneFilterDebug] ⚠️ getCurrentShotSettings → using CUSTOMIZED settings:', {
        filter: shotSettings.selectedShotFilter?.substring(0, 8),
        excludePositioned: shotSettings.excludePositioned
      });
      return shotSettings;
    }

    // Otherwise, determine default based on whether shot has images
    const defaultFilter = getDefaultShotFilter(currentShotId);
    console.log('[PaneFilterDebug] getCurrentShotSettings → using DEFAULT filter:', defaultFilter?.substring(0, 8));
    return {
      selectedShotFilter: defaultFilter,
      excludePositioned: true,
      userHasCustomized: false
    };
  };

  // Function to save settings when user makes changes
  const saveUserCustomization = (newSettings: Partial<GenerationsPaneSettings>) => {
    if (!currentShotId) return;
    
    const updatedSettings: GenerationsPaneSettings = {
      ...getCurrentShotSettings(),
      ...newSettings,
      userHasCustomized: true // Mark as customized so it's never auto-reset
    };
    
    console.log('[ShotFilterLogic] Saving user customization for shot:', currentShotId, updatedSettings);
    updateShotSettings('shot', updatedSettings);
  };

  // Track when we switch shots to apply appropriate settings
  const [lastCurrentShotId, setLastCurrentShotId] = useState<string | null>(null);

  // Apply shot filter settings when current shot changes or settings are loaded
  useEffect(() => {
    console.log('[PaneFilterDebug] 🔄 Main filter effect triggered:', {
      currentShotId: currentShotId?.substring(0, 8),
      lastCurrentShotId: lastCurrentShotId?.substring(0, 8),
      shotsDataLength: shotsData?.length,
      isLoadingShotSettings,
      shotSettingsExists: !!shotSettings,
      userHasCustomized: shotSettings?.userHasCustomized
    });

    // Wait for shots data to be available
    if (!shotsData?.length) {
      console.log('[PaneFilterDebug] ⏳ Waiting for shots data...');
      return;
    }

    if (currentShotId && shotsData.some(shot => shot.id === currentShotId)) {
      // We're viewing a specific shot
      console.log('[PaneFilterDebug] 📍 In shot context:', currentShotId?.substring(0, 8));
      
      // If we've already auto-fallen back to 'all' for this shot, don't re-apply stored settings
      // This prevents the main effect from overriding the fallback
      if (hasAutoFallenBack) {
        console.log('[PaneFilterDebug] ⏹ Skipping filter apply - already auto-fallen back to "all"');
        return;
      }
      
      // Don't update if we're still loading settings for this shot
      if (isLoadingShotSettings) {
        console.log('[PaneFilterDebug] ⏳ Still loading shot settings...');
        return;
      }
      
      const settingsToApply = getCurrentShotSettings();
      console.log('[PaneFilterDebug] ✨ APPLYING filter settings:', {
        shotId: currentShotId?.substring(0, 8),
        filterToApply: settingsToApply.selectedShotFilter === 'all' ? 'all' : settingsToApply.selectedShotFilter?.substring(0, 8),
        excludePositioned: settingsToApply.excludePositioned,
        reason: shotSettings?.userHasCustomized ? 'USER_CUSTOMIZED' : 'AUTO_DEFAULT'
      });
      
      setSelectedShotFilter(settingsToApply.selectedShotFilter);
      setExcludePositioned(settingsToApply.excludePositioned);
      setLastCurrentShotId(currentShotId);
      
      // Sync the dropdown selection to the current shot when navigating to a shot
      // This pre-selects the current shot in the "Add to Shot" dropdown
      setLastAffectedShotId(currentShotId);
      
    } else if (!currentShotId) {
      // When no shot is selected, revert to 'all' shots
      console.log('[PaneFilterDebug] No current shot, reverting to "all"');
      setSelectedShotFilter('all');
      setExcludePositioned(true);
      setLastCurrentShotId(null);
    } else {
      console.log('[PaneFilterDebug] Shot not found in shots data');
    }
  }, [currentShotId, shotsData, isLoadingShotSettings, shotSettings, setLastAffectedShotId, hasAutoFallenBack]);

  // Create wrapper functions that save user customizations when called
  const handleShotFilterChange = (newShotFilter: string) => {
    setSelectedShotFilter(newShotFilter);
    // Save this as a user customization
    saveUserCustomization({ selectedShotFilter: newShotFilter });
  };

  const handleExcludePositionedChange = (newExcludePositioned: boolean) => {
    setExcludePositioned(newExcludePositioned);
    // Save this as a user customization
    saveUserCustomization({ excludePositioned: newExcludePositioned });
  };

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
  const filters = useMemo(() => ({
    mediaType,
    toolType,
    shotId: selectedShotFilter === 'all' ? undefined : selectedShotFilter,
    excludePositioned: selectedShotFilter !== 'all' ? excludePositioned : undefined,
    starredOnly
  }), [mediaType, toolType, selectedShotFilter, excludePositioned, starredOnly]);

  const { data: generationsResponse, isLoading, isFetching, isError, error } = useGenerations(
    shouldLoadData ? selectedProjectId : null, 
    page, 
    itemsPerPage, 
    shouldLoadData,
    filters
  );
  
  // Fallback: if filtering by a specific shot returns 0 items, automatically switch to 'all'
  // This handles cases where shotHasUnpositionedImages check was based on stale data
  
  // Debug logging for fallback conditions
  useEffect(() => {
    if (selectedShotFilter !== 'all') {
      console.log('[PaneFilterDebug] 🔍 Fallback check:', {
        filter: selectedShotFilter?.substring(0, 8),
        isLoading,
        isFetching,
        total: generationsResponse?.total,
        hasAutoFallenBack,
        page,
        shouldFallback: !isLoading && !isFetching && generationsResponse?.total === 0 && !hasAutoFallenBack && page === 1
      });
    }
  }, [selectedShotFilter, isLoading, isFetching, generationsResponse?.total, hasAutoFallenBack, page]);
  
  useEffect(() => {
    // Only auto-fallback if:
    // 1. We're filtering by a specific shot (not 'all')
    // 2. Query has completed (not loading AND not fetching)
    // 3. Result is 0 items
    // 4. We haven't already auto-fallen back for this shot (prevent loops)
    // 5. We're on page 1 (not a pagination edge case)
    if (
      selectedShotFilter !== 'all' &&
      !isLoading &&
      !isFetching &&
      generationsResponse?.total === 0 &&
      !hasAutoFallenBack &&
      page === 1
    ) {
      console.log('[PaneFilterDebug] ✅ FALLBACK TRIGGERED → switching to "all" (query returned 0 items)');
      setSelectedShotFilter('all');
      setHasAutoFallenBack(true);
    }
  }, [selectedShotFilter, isLoading, isFetching, generationsResponse?.total, hasAutoFallenBack, page]);
  
  // Reset the auto-fallback flag when switching shots
  useEffect(() => {
    setHasAutoFallenBack(false);
  }, [currentShotId]);

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
    
    console.log('[PATH_COMPARE] 🔵 BUTTON PATH START - handleAddToShot:', {
      generationId: generationId?.substring(0, 8),
      imageUrl: imageUrl?.substring(0, 60),
      thumbUrl: thumbUrl?.substring(0, 60),
      currentShotId: currentShotId?.substring(0, 8),
      lastAffectedShotId: lastAffectedShotId?.substring(0, 8),
      targetShotId: targetShotId?.substring(0, 8),
      selectedProjectId: selectedProjectId?.substring(0, 8),
      selectedShotFilter: selectedShotFilter?.substring(0, 8),
      excludePositioned,
      timestamp: Date.now()
    });
    
    if (!targetShotId || !selectedProjectId) {
      console.log('[PositionFix] Missing required IDs:', {
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
        console.log('[PositionFix] Using positionExistingGenerationMutation with params:', {
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
        
        console.log('[PositionFix] positionExistingGenerationMutation result:', {
          result,
          timestamp: Date.now()
        });
      } else {
        // Calculate the target frame BEFORE calling mutation (same as drag path)
        // This lets us show the skeleton immediately
        const currentCache = queryClient.getQueryData<any[]>(['all-shot-generations', targetShotId]) || [];
        const positionedImages = currentCache.filter((img: any) => img.timeline_frame !== null && img.timeline_frame !== undefined);
        const maxFrame = positionedImages.length > 0 
          ? Math.max(...positionedImages.map((g: any) => g.timeline_frame || 0)) 
          : -60;
        const calculatedFrame = maxFrame + 60;
        
        console.log('[PATH_COMPARE] 🔵 BUTTON PATH - calculated frame BEFORE mutation:', {
          calculatedFrame,
          maxFrame,
          positionedImagesCount: positionedImages.length,
          timestamp: Date.now()
        });
        
        // Emit skeleton event BEFORE mutation (same timing as drag path)
        if (typeof window !== 'undefined') {
          const event = new CustomEvent('timeline:pending-add', {
            detail: { 
              frame: calculatedFrame,
              shotId: targetShotId
            }
          });
          console.log('[PATH_COMPARE] 🔵 BUTTON PATH - emitting skeleton event BEFORE mutation:', {
            frame: calculatedFrame,
            shotId: targetShotId?.substring(0, 8),
            eventType: event.type,
            eventDetail: event.detail,
            timestamp: Date.now()
          });
          window.dispatchEvent(event);
          console.log('[PATH_COMPARE] 🔵 BUTTON PATH - event dispatched');
        }
        
        console.log('[PATH_COMPARE] 🔵 BUTTON PATH - calling addImageToShotMutation.mutateAsync:', {
          shot_id: targetShotId?.substring(0, 8),
          generation_id: generationId?.substring(0, 8),
          imageUrl: imageUrl?.substring(0, 60),
          thumbUrl: thumbUrl?.substring(0, 60),
          project_id: selectedProjectId?.substring(0, 8),
          timelineFrame: calculatedFrame,
          timestamp: Date.now()
        });
        
        // Use the regular add function - now with pre-calculated frame!
        const result = await addImageToShotMutation.mutateAsync({
          shot_id: targetShotId,
          generation_id: generationId,
          imageUrl: imageUrl,
          thumbUrl: thumbUrl,
          timelineFrame: calculatedFrame, // Pass the pre-calculated frame
          project_id: selectedProjectId,
        });
        
        console.log('[PositionFix] addImageToShotMutation result:', {
          result,
          timestamp: Date.now()
        });
      }
      
      console.log('[PositionFix] handleAddToShot completed successfully');
      return true;
    } catch (error) {
      console.error('[ADDTOSHOT] Error:', error);
      console.error('[PositionFix] handleAddToShot failed:', {
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
    
    // Handlers
    handleServerPageChange,
    handleDeleteGeneration,
    handleAddToShot,
    handleAddToShotWithoutPosition,
    handleToggleStar,
  };
} 