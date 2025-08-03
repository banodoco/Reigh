import { useState, useEffect, useMemo, useContext } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useGenerations, useDeleteGeneration, useToggleGenerationStar } from '@/shared/hooks/useGenerations';
import { useListShots, useAddImageToShot, usePositionExistingGenerationInShot } from '@/shared/hooks/useShots';
import { LastAffectedShotContext } from '@/shared/contexts/LastAffectedShotContext';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { toast } from 'sonner';
import { GeneratedImageWithMetadata } from '@/shared/components/ImageGallery';
import usePersistentState from '@/shared/hooks/usePersistentState';

interface UseGenerationsPageLogicOptions {
  itemsPerPage?: number;
  mediaType?: 'all' | 'image' | 'video';
  toolType?: string;
  enableDataLoading?: boolean;
}

// Interface for per-shot GenerationsPane settings
interface GenerationsPaneSettings {
  selectedShotFilter: string;
  excludePositioned: boolean;
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
  const [isPageChange, setIsPageChange] = useState(false);
  
  const { data: shotsData } = useListShots(selectedProjectId);
  const { currentShotId } = useCurrentShot();

  // Use persistent state to store per-shot settings
  const [shotSettings, setShotSettings] = usePersistentState<Record<string, GenerationsPaneSettings>>(
    'generations-pane-shot-settings',
    {}
  );

  // Function to get settings for a specific shot
  const getShotSettings = (shotId: string): GenerationsPaneSettings => {
    return shotSettings[shotId] || {
      selectedShotFilter: shotId,
      excludePositioned: true
    };
  };

  // Function to save settings for a specific shot
  const saveShotSettings = (shotId: string, settings: GenerationsPaneSettings) => {
    setShotSettings(prev => ({
      ...prev,
      [shotId]: settings
    }));
  };

  // Set shot filter to current shot when it changes, but respect saved settings
  useEffect(() => {
    if (currentShotId && shotsData?.length && shotsData.some(shot => shot.id === currentShotId)) {
      // Load saved settings for this shot, or use defaults
      const savedSettings = getShotSettings(currentShotId);
      setSelectedShotFilter(savedSettings.selectedShotFilter);
      setExcludePositioned(savedSettings.excludePositioned);
    } else if (!currentShotId) {
      // When no shot is selected, revert to 'all' shots
      setSelectedShotFilter('all');
      setExcludePositioned(true);
    }
  }, [currentShotId, shotsData]);

  // Save settings whenever the user changes them (only when viewing a specific shot)
  useEffect(() => {
    if (currentShotId && shotsData?.some(shot => shot.id === currentShotId)) {
      const currentSettings: GenerationsPaneSettings = {
        selectedShotFilter,
        excludePositioned
      };
      saveShotSettings(currentShotId, currentSettings);
    }
  }, [currentShotId, selectedShotFilter, excludePositioned, shotsData]);

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
    if (!lastAffectedShotId && shotsData && shotsData.length > 0) {
      setLastAffectedShotId(shotsData[0].id);
    }
  }, [lastAffectedShotId, shotsData, setLastAffectedShotId]);

  const scrollPosRef = { current: 0 }; // Simple ref-like object for scroll position

  const handleServerPageChange = (newPage: number) => {
    scrollPosRef.current = window.scrollY;
    setIsPageChange(true);
    setPage(newPage);
  };

  // Restore scroll position after data loads - but only for page changes, not filter changes
  useEffect(() => {
    if (generationsResponse && isPageChange) {
      window.scrollTo({ top: scrollPosRef.current, behavior: 'auto' });
      setIsPageChange(false);
    }
  }, [generationsResponse, isPageChange]);

  const handleDeleteGeneration = (id: string) => {
    deleteGenerationMutation.mutate(id);
  };

  const handleToggleStar = (id: string, starred: boolean) => {
    toggleStarMutation.mutate({ id, starred });
  };

  const handleAddToShot = (generationId: string, imageUrl?: string) => {
    console.log('[ADDTOSHOT] handleAddToShot called', {
      generationId,
      imageUrl: imageUrl?.substring(0, 50) + '...',
      lastAffectedShotId,
      selectedProjectId,
      excludePositioned,
      timestamp: Date.now()
    });

    if (!lastAffectedShotId) {
      console.log('[ADDTOSHOT] Error: No lastAffectedShotId available');
      toast.error("No shot selected", {
        description: "Please select a shot in the gallery or create one first.",
      });
      return Promise.resolve(false);
    }
    
    // Check if we're trying to add to the same shot that's currently filtered with excludePositioned enabled
    const shouldPositionExisting = selectedShotFilter === lastAffectedShotId && 
                                  excludePositioned;
    
    console.log('[ADDTOSHOT] Determined action type', {
      shouldPositionExisting,
      selectedShotFilter,
      lastAffectedShotId,
      excludePositioned
    });

    return new Promise<boolean>((resolve) => {
      if (shouldPositionExisting) {
        console.log('[ADDTOSHOT] Using positionExistingGenerationMutation');
        // Use the position existing function for items in the filtered list
        positionExistingGenerationMutation.mutate({
          shot_id: lastAffectedShotId,
          generation_id: generationId,
          project_id: selectedProjectId!,
        }, {
          onSuccess: () => {          
            console.log('[ADDTOSHOT] positionExistingGenerationMutation SUCCESS');
            resolve(true);
          },
          onError: (error) => {
            console.log('[ADDTOSHOT] positionExistingGenerationMutation ERROR', error);
            toast.error("Failed to position image in shot", {
              description: error.message,
            });
            resolve(false);
          }
        });
      } else {
        console.log('[ADDTOSHOT] Using addImageToShotMutation');
        // Use the regular add function
        addImageToShotMutation.mutate({
          shot_id: lastAffectedShotId,
          generation_id: generationId,
          project_id: selectedProjectId!,
        }, {
          onSuccess: () => {          
            console.log('[ADDTOSHOT] addImageToShotMutation SUCCESS');
            resolve(true);
          },
          onError: (error) => {
            console.log('[ADDTOSHOT] addImageToShotMutation ERROR', error);
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
    setSelectedShotFilter,
    setExcludePositioned,
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