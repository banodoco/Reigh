import { useState, useEffect, useMemo, useContext } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useGenerations, useDeleteGeneration, useToggleGenerationStar } from '@/shared/hooks/useGenerations';
import { useListShots, useAddImageToShot, usePositionExistingGenerationInShot } from '@/shared/hooks/useShots';
import { LastAffectedShotContext } from '@/shared/contexts/LastAffectedShotContext';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { toast } from 'sonner';
import { GeneratedImageWithMetadata } from '@/shared/components/ImageGallery';

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
  const [selectedShotFilter, setSelectedShotFilter] = useState<string>('all');
  const [excludePositioned, setExcludePositioned] = useState(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [starredOnly, setStarredOnly] = useState<boolean>(false);
  const [lastKnownTotal, setLastKnownTotal] = useState<number>(0);
  const [currentItems, setCurrentItems] = useState<GeneratedImageWithMetadata[]>([]);
  const [isPageChange, setIsPageChange] = useState(false);
  
  const { data: shotsData } = useListShots(selectedProjectId);
  const { currentShotId } = useCurrentShot();

  // Set shot filter to current shot when it changes
  useEffect(() => {
    if (currentShotId && shotsData?.length && shotsData.some(shot => shot.id === currentShotId)) {
      setSelectedShotFilter(currentShotId);
    }
  }, [currentShotId, shotsData]);

  // Reset to page 1 when shot filter or position filter changes
  useEffect(() => {
    setPage(1);
    // Don't clear items when filters change - let them transition smoothly
    // setCurrentItems([]) was causing layout jump
  }, [selectedShotFilter, excludePositioned]);

  // Reset to page 1 when media type or starred filter changes
  useEffect(() => {
    setPage(1);
  }, [mediaType, starredOnly]);

  const { data: generationsResponse, isLoading, isError, error } = useGenerations(
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

  // Update last known total when we get valid data
  useEffect(() => {
    if (generationsResponse?.total !== undefined && generationsResponse.total > 0) {
      setLastKnownTotal(generationsResponse.total);
    }
  }, [generationsResponse?.total]);

  // Update current items when generationsResponse changes, maintaining previous items during loading
  useEffect(() => {
    if (generationsResponse?.items) {
      setCurrentItems(generationsResponse.items);
    }
  }, [generationsResponse?.items]);

  // Server-side pagination - data is already paginated
  const paginatedData = useMemo(() => {
    const total = generationsResponse?.total ?? lastKnownTotal;
    const totalPages = Math.ceil(total / itemsPerPage);
    
    return { 
      items: currentItems, 
      totalPages, 
      currentPage: page 
    };
  }, [currentItems, generationsResponse?.total, lastKnownTotal, page, itemsPerPage]);

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
    if (!lastAffectedShotId) {
      toast.error("No shot selected", {
        description: "Please select a shot in the gallery or create one first.",
      });
      return Promise.resolve(false);
    }
    
    // Check if we're trying to add to the same shot that's currently filtered with excludePositioned enabled
    const shouldPositionExisting = selectedShotFilter !== 'all' && 
                                  selectedShotFilter === lastAffectedShotId && 
                                  excludePositioned;
    
    return new Promise<boolean>((resolve) => {
      if (shouldPositionExisting) {
        // Use the position existing function for items in the filtered list
        positionExistingGenerationMutation.mutate({
          shot_id: lastAffectedShotId,
          generation_id: generationId,
          project_id: selectedProjectId!,
        }, {
          onSuccess: () => {          
            resolve(true);
          },
          onError: (error) => {
            toast.error("Failed to position image in shot", {
              description: error.message,
            });
            resolve(false);
          }
        });
      } else {
        // Use the regular add function
        addImageToShotMutation.mutate({
          shot_id: lastAffectedShotId,
          generation_id: generationId,
          project_id: selectedProjectId!,
        }, {
          onSuccess: () => {          
            resolve(true);
          },
          onError: (error) => {
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
    totalCount: generationsResponse?.total ?? lastKnownTotal,
    
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