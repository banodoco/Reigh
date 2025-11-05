import { useState, useEffect, useMemo, useContext } from 'react';
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
  const { selectedProjectId } = useProject();
  
  // Gate all data loading based on project availability and enableDataLoading flag
  const shouldLoadData = enableDataLoading && !!selectedProjectId;
  const [page, setPage] = useState(1);
  
  // Use regular state for the current filter values
  const [selectedShotFilter, setSelectedShotFilter] = useState<string>('all');
  const [excludePositioned, setExcludePositioned] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [starredOnly, setStarredOnly] = useState<boolean>(false);
  
  const { data: shotsData } = useListShots(shouldLoadData ? selectedProjectId : null);
  const { currentShotId } = useCurrentShot();

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
    return (shot?.images?.length || 0) > 0;
  };

  // Helper function to check if a shot has unpositioned images (when excludePositioned matters)
  const shotHasUnpositionedImages = (shotId: string): boolean => {
    if (!shotsData) return false;
    const shot = shotsData.find(s => s.id === shotId);
    if (!shot?.images) return false;
    
    // Check if any images have timeline_frame === null/undefined (i.e., unpositioned)
    const unpositionedImages = shot.images.filter(img => (img as any).timeline_frame === null || (img as any).timeline_frame === undefined);
    .slice(0, 3) // Show first 3 for debugging
    });
    
    return unpositionedImages.length > 0;
  };

  // Function to determine the appropriate shot filter based on current shot and settings
  const getDefaultShotFilter = (shotId: string): string => {
    // When excludePositioned is true (default), check for unpositioned images
    if (excludePositioned) {
      if (!shotHasUnpositionedImages(shotId)) {
        return 'all';
      }
      return shotId;
    }
    
    // When excludePositioned is false, check for any images
    if (!shotHasImages(shotId)) {
      return 'all';
    }
    
    return shotId;
  };

  // Function to get the appropriate settings for the current shot
  const getCurrentShotSettings = (): GenerationsPaneSettings => {
    if (!currentShotId) {
      return {
        selectedShotFilter: 'all',
        excludePositioned: true,
        userHasCustomized: false
      };
    }

    // If user has previously customized settings for this shot, always use them
    if (shotSettings?.userHasCustomized) {
      return shotSettings;
    }

    // Otherwise, determine default based on whether shot has images
    const defaultFilter = getDefaultShotFilter(currentShotId);
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
    
    updateShotSettings('shot', updatedSettings);
  };

  // Track when we switch shots to apply appropriate settings
  const [lastCurrentShotId, setLastCurrentShotId] = useState<string | null>(null);

  // Apply shot filter settings when current shot changes or settings are loaded
  useEffect(() => {
    // Wait for shots data to be available
    if (!shotsData?.length) {
      return;
    }

    if (currentShotId && shotsData.some(shot => shot.id === currentShotId)) {
      // We're viewing a specific shot
      // Don't update if we're still loading settings for this shot
      if (isLoadingShotSettings) {
        return;
      }
      
      const settingsToApply = getCurrentShotSettings();
      setSelectedShotFilter(settingsToApply.selectedShotFilter);
      setExcludePositioned(settingsToApply.excludePositioned);
      setLastCurrentShotId(currentShotId);
      
    } else if (!currentShotId) {
      // When no shot is selected, revert to 'all' shots
      setSelectedShotFilter('all');
      setExcludePositioned(true);
      setLastCurrentShotId(null);
    } else {
      }
  }, [currentShotId, shotsData, isLoadingShotSettings, shotSettings]);

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

  const lastAffectedShotContext = useContext(LastAffectedShotContext);
  const { lastAffectedShotId = null, setLastAffectedShotId = () => {} } = lastAffectedShotContext || {};
  
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
    if (!lastAffectedShotId && shotsData && shotsData.length > 0) {
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

  const handleAddToShot = async (generationId: string, imageUrl?: string): Promise<boolean> => {
    // Fast path: minimal validation and direct execution
    const targetShotId = currentShotId || lastAffectedShotId;
    
    + '...',
      currentShotId,
      lastAffectedShotId,
      targetShotId,
      selectedProjectId,
      selectedShotFilter,
      excludePositioned,
      timestamp: Date.now()
    });
    
    if (!targetShotId || !selectedProjectId) {
      toast.error("No shot selected", {
        description: "Please select a shot in the gallery or create one first.",
      });
      return false;
    }
    
    // Check if we're trying to add to the same shot that's currently filtered with excludePositioned enabled
    const shouldPositionExisting = selectedShotFilter === targetShotId && excludePositioned;
    
    });
    
    try {
      if (shouldPositionExisting) {
        // Use the position existing function for items in the filtered list
        const result = await positionExistingGenerationMutation.mutateAsync({
          shot_id: targetShotId,
          generation_id: generationId,
          project_id: selectedProjectId,
        });
        
        });
      } else {
        // Use the regular add function
        const result = await addImageToShotMutation.mutateAsync({
          shot_id: targetShotId,
          generation_id: generationId,
          imageUrl: imageUrl,
          project_id: selectedProjectId,
        });
        
        });
      }
      
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

  const handleAddToShotWithoutPosition = async (generationId: string, imageUrl?: string): Promise<boolean> => {
    // Fast path: minimal validation and direct execution
    const targetShotId = currentShotId || lastAffectedShotId;
    
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