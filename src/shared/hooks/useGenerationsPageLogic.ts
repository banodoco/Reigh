import { useState, useEffect, useMemo, useContext } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useGenerations, useDeleteGeneration, useToggleGenerationStar } from '@/shared/hooks/useGenerations';
import { useListShots, useAddImageToShot, usePositionExistingGenerationInShot } from '@/shared/hooks/useShots';
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
  const [page, setPage] = useState(1);
  
  // Use regular state for the current filter values
  const [selectedShotFilter, setSelectedShotFilter] = useState<string>('all');
  const [excludePositioned, setExcludePositioned] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [starredOnly, setStarredOnly] = useState<boolean>(false);
  
  const { data: shotsData } = useListShots(selectedProjectId);
  const { currentShotId } = useCurrentShot();

  // Use shots.settings to store GenerationsPane settings for the current shot
  const { 
    settings: shotSettings, 
    update: updateShotSettings,
    isLoading: isLoadingShotSettings 
  } = useToolSettings<GenerationsPaneSettings>('generations-pane', { 
    shotId: currentShotId || undefined, 
    enabled: !!currentShotId 
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
    
    // Check if any images have position === null/undefined (i.e., unpositioned)
    const unpositionedImages = shot.images.filter(img => img.position === null || img.position === undefined);
    console.log('[ShotFilterLogic] Shot unpositioned images check:', {
      shotId,
      totalImages: shot.images.length,
      unpositionedCount: unpositionedImages.length,
      unpositionedImageIds: unpositionedImages.map(img => img.id).slice(0, 3) // Show first 3 for debugging
    });
    
    return unpositionedImages.length > 0;
  };

  // Function to determine the appropriate shot filter based on current shot and settings
  const getDefaultShotFilter = (shotId: string): string => {
    // When excludePositioned is true (default), check for unpositioned images
    if (excludePositioned) {
      if (!shotHasUnpositionedImages(shotId)) {
        console.log('[ShotFilterLogic] Shot has no unpositioned images with excludePositioned=true, defaulting to "all":', shotId);
        return 'all';
      }
      console.log('[ShotFilterLogic] Shot has unpositioned images, defaulting to shot filter:', shotId);
      return shotId;
    }
    
    // When excludePositioned is false, check for any images
    if (!shotHasImages(shotId)) {
      console.log('[ShotFilterLogic] Shot has no images, defaulting to "all":', shotId);
      return 'all';
    }
    
    console.log('[ShotFilterLogic] Shot has images with excludePositioned=false, defaulting to shot filter:', shotId);
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
      console.log('[ShotFilterLogic] Using customized settings for shot:', currentShotId, shotSettings);
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
    
    console.log('[ShotFilterLogic] Saving user customization for shot:', currentShotId, updatedSettings);
    updateShotSettings('shot', updatedSettings);
  };

  // Track when we switch shots to apply appropriate settings
  const [lastCurrentShotId, setLastCurrentShotId] = useState<string | null>(null);

  // Apply shot filter settings when current shot changes or settings are loaded
  useEffect(() => {
    console.log('[ShotFilterLogic] Effect triggered:', {
      currentShotId,
      lastCurrentShotId,
      shotsDataLength: shotsData?.length,
      isLoadingShotSettings,
      shotSettings
    });

    // Wait for shots data to be available
    if (!shotsData?.length) {
      console.log('[ShotFilterLogic] Waiting for shots data');
      return;
    }

    if (currentShotId && shotsData.some(shot => shot.id === currentShotId)) {
      // We're viewing a specific shot
      console.log('[ShotFilterLogic] In shot context:', currentShotId);
      
      // Don't update if we're still loading settings for this shot
      if (isLoadingShotSettings) {
        console.log('[ShotFilterLogic] Still loading shot settings');
        return;
      }
      
      const settingsToApply = getCurrentShotSettings();
      console.log('[ShotFilterLogic] Applying settings for shot:', {
        currentShotId,
        settingsToApply
      });
      
      setSelectedShotFilter(settingsToApply.selectedShotFilter);
      setExcludePositioned(settingsToApply.excludePositioned);
      setLastCurrentShotId(currentShotId);
      
    } else if (!currentShotId) {
      // When no shot is selected, revert to 'all' shots
      console.log('[ShotFilterLogic] No current shot, reverting to all shots');
      setSelectedShotFilter('all');
      setExcludePositioned(true);
      setLastCurrentShotId(null);
    } else {
      console.log('[ShotFilterLogic] Shot not found in shots data');
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

  const { data: generationsResponse, isLoading, isFetching, isError, error } = useGenerations(
    selectedProjectId, 
    page, 
    itemsPerPage, 
    enableDataLoading,
    {
      mediaType,
      toolType,
      shotId: selectedShotFilter === 'all' ? undefined : selectedShotFilter,
      excludePositioned: selectedShotFilter !== 'all' ? excludePositioned : undefined,
      starredOnly
    }
  );

  const lastAffectedShotContext = useContext(LastAffectedShotContext);
  const { lastAffectedShotId = null, setLastAffectedShotId = () => {} } = lastAffectedShotContext || {};
  
  const addImageToShotMutation = useAddImageToShot();
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

  const handleAddToShot = (generationId: string, imageUrl?: string) => {
    console.log('[ADDTOSHOT] ===== handleAddToShot called =====', {
      generationId,
      imageUrl: imageUrl?.substring(0, 50) + '...',
      lastAffectedShotId,
      selectedProjectId,
      excludePositioned,
      selectedShotFilter,
      shotsDataLength: shotsData?.length,
      currentShotId,
      timestamp: Date.now()
    });

    // 🎯 PRIORITY LOGIC: When viewing a specific shot, always use that shot
    const targetShotId = currentShotId || lastAffectedShotId;
    
    if (!targetShotId) {
      console.log('[ADDTOSHOT] ❌ ERROR: No target shot available', {
        currentShotId,
        lastAffectedShotId,
        shotsData: shotsData?.map(shot => ({ id: shot.id, name: shot.name }))
      });
      toast.error("No shot selected", {
        description: "Please select a shot in the gallery or create one first.",
      });
      return Promise.resolve(false);
    }

    // Validate that the target shot exists in shotsData
    const targetShot = shotsData?.find(shot => shot.id === targetShotId);
    if (!targetShot) {
      console.log('[ADDTOSHOT] ❌ ERROR: Target shot not found in shotsData', {
        targetShotId,
        currentShotId,
        lastAffectedShotId,
        shotsData: shotsData?.map(shot => ({ id: shot.id, name: shot.name }))
      });
      toast.error("Target shot not found", {
        description: "The selected shot could not be found. Please refresh and try again.",
      });
      return Promise.resolve(false);
    }
    
    // Check if we're trying to add to the same shot that's currently filtered with excludePositioned enabled
    const shouldPositionExisting = selectedShotFilter === targetShotId && 
                                  excludePositioned;
    
    console.log('[ADDTOSHOT] 🎯 Determined action type', {
      shouldPositionExisting,
      selectedShotFilter,
      targetShotId,
      currentShotId,
      lastAffectedShotId,
      usingCurrentShot: !!currentShotId,
      excludePositioned,
      targetShot: { id: targetShot.id, name: targetShot.name }
    });

    return new Promise<boolean>((resolve) => {
      if (shouldPositionExisting) {
        console.log('[ADDTOSHOT] 📍 Using positionExistingGenerationMutation', {
          shot_id: targetShotId,
          generation_id: generationId,
          project_id: selectedProjectId
        });
        
        // Use the position existing function for items in the filtered list
        positionExistingGenerationMutation.mutate({
          shot_id: targetShotId,
          generation_id: generationId,
          project_id: selectedProjectId!,
        }, {
          onSuccess: (data) => {          
            console.log('[ADDTOSHOT] ✅ positionExistingGenerationMutation SUCCESS', data);
            resolve(true);
          },
          onError: (error) => {
            console.log('[ADDTOSHOT] ❌ positionExistingGenerationMutation ERROR', {
              error,
              message: error.message,
              stack: error.stack,
              shot_id: targetShotId,
              generation_id: generationId,
              project_id: selectedProjectId
            });
            toast.error("Failed to position image in shot", {
              description: error.message,
            });
            resolve(false);
          }
        });
      } else {
        console.log('[ADDTOSHOT] ➕ Using addImageToShotMutation', {
          shot_id: targetShotId,
          generation_id: generationId,
          imageUrl: imageUrl?.substring(0, 50) + '...',
          project_id: selectedProjectId
        });
        
        // Use the regular add function
        addImageToShotMutation.mutate({
          shot_id: targetShotId,
          generation_id: generationId,
          imageUrl: imageUrl,
          project_id: selectedProjectId!,
        }, {
          onSuccess: (data) => {          
            console.log('[ADDTOSHOT] ✅ addImageToShotMutation SUCCESS', data);
            resolve(true);
          },
          onError: (error) => {
            console.log('[ADDTOSHOT] ❌ addImageToShotMutation ERROR', {
              error,
              message: error.message,
              stack: error.stack,
              shot_id: targetShotId,
              generation_id: generationId,
              imageUrl: imageUrl?.substring(0, 50) + '...',
              project_id: selectedProjectId
            });
            toast.error("Failed to add image to shot", {
              description: error.message,
            });
            resolve(false);
          }
        });
      }
    });
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
    handleToggleStar,
  };
} 