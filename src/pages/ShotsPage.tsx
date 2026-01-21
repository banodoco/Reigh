import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { 
  useListShots, 
  useRemoveImageFromShot, 
  useUpdateShotImageOrder,
  useAddImageToShot,
  useAddImageToShotWithoutPosition
} from '@/shared/hooks/useShots';
import { Shot, GenerationRow } from '@/types/shots';
import ShotListDisplay from '@/tools/travel-between-images/components/ShotListDisplay';
import ShotImageManager from '@/shared/components/ShotImageManager';
import { Button } from '@/shared/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { useAllShotGenerations } from '@/shared/hooks/useShotGenerations';

const ShotsPage: React.FC = () => {
  const { selectedProjectId } = useProject();
  const { data: shots, isLoading: isLoadingShots, error: shotsError } = useListShots(selectedProjectId);
  const { currentShotId, setCurrentShotId } = useCurrentShot();

  const queryClient = useQueryClient();
  const removeImageFromShotMutation = useRemoveImageFromShot();
  const updateShotImageOrderMutation = useUpdateShotImageOrder();
  const addImageToShotMutation = useAddImageToShot();
  const addImageToShotWithoutPositionMutation = useAddImageToShotWithoutPosition();
  const location = useLocation();
  const navigate = useNavigate();

  // DERIVE selectedShot from the single source of truth (the `shots` query)
  const selectedShot = useMemo(() => {
    if (!currentShotId || !shots) return null;
    return shots.find(s => s.id === currentShotId) || null;
  }, [currentShotId, shots]);

  // When a shot is selected, fetch full images for that shot to avoid thumbnail-only limitation
  const { data: fullSelectedShotImages = [] } = useAllShotGenerations(selectedShot?.id ?? null);

  // Local state for the images being managed, which can be updated optimistically.
  const [managedImages, setManagedImages] = useState<GenerationRow[]>([]);

  // This effect syncs the managedImages with the derived selectedShot, preferring full data
  useEffect(() => {
    if (fullSelectedShotImages && fullSelectedShotImages.length > 0) {
      setManagedImages(fullSelectedShotImages);
    } else if (selectedShot?.images) {
      setManagedImages(selectedShot.images);
    } else {
      setManagedImages([]);
    }
  }, [selectedShot, fullSelectedShotImages]);

  // This effect handles selecting a shot based on navigation state.
  useEffect(() => {
    const shotIdFromLocation = location.state?.selectedShotId;
    if (shotIdFromLocation && shots && shots.length > 0) {
      const shotToSelect = shots.find(s => s.id === shotIdFromLocation);
      if (shotToSelect) {
        setCurrentShotId(shotIdFromLocation);
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [location.state, shots, navigate, location.pathname, setCurrentShotId]);

  const handleSelectShot = (shot: Shot) => {
    setCurrentShotId(shot.id);
  };

  const handleBackToList = () => {
    setCurrentShotId(null);
  };

  const refreshSelectedShotImages = async () => {
    if (currentShotId && selectedProjectId) {
      await queryClient.invalidateQueries({ queryKey: ['shots', selectedProjectId] });
    }
  };

  // id parameter is shot_generations.id (unique per entry)
  const handleDeleteImage = (id: string) => {
    if (!selectedShot || !selectedProjectId) {
      toast.error('Cannot delete image: Shot or Project ID is missing.');
      return;
    }

    const originalImages = selectedShot.images || [];
    // img.id is shot_generations.id - unique per entry
    const updatedImages = originalImages.filter(img => img.id !== id);
    setManagedImages(updatedImages); // Optimistic update

    removeImageFromShotMutation.mutate({
      shot_id: selectedShot.id,
      shotImageEntryId: id, // API still expects this parameter name
      project_id: selectedProjectId,
    }, {
      onSuccess: () => {
        // The query invalidation will trigger a refetch and update the view.
        // NOTE: This removes timeline_frame, not deleting the generation
      },
      onError: (error) => {
        toast.error(`Failed to remove image from timeline: ${error.message}`);
        setManagedImages(originalImages); // Revert optimistic update
      },
    });
  };

  const handleReorderImage = (orderedShotGenerationIds: string[]) => {
    if (!selectedShot || !selectedProjectId) {
      toast.error('Cannot reorder images: Shot or Project ID is missing.');
      return;
    }

    const originalImages = selectedShot.images || [];
    // img.id is shot_generations.id - unique per entry
    const imageMap = new Map(originalImages.map(img => [img.id, img]));
    const reorderedImages = orderedShotGenerationIds
      .map(id => imageMap.get(id))
      .filter((img): img is GenerationRow => !!img);
    setManagedImages(reorderedImages); // Optimistic update

    updateShotImageOrderMutation.mutate({
      shotId: selectedShot.id,
      orderedShotGenerationIds,
      projectId: selectedProjectId,
    }, {
      onError: (error) => {
        toast.error(`Failed to update image order: ${error.message}`);
        setManagedImages(originalImages); // Revert optimistic update
      },
    });
  };

  // Simplified shot options for the lightbox shot selector
  const simplifiedShotOptions = useMemo(() => 
    shots ? shots.map(s => ({ id: s.id, name: s.name })) : [],
    [shots]
  );

  // Handler for adding a generation to a shot with position
  const handleAddToShot = useCallback(async (
    generationId: string,
    imageUrl?: string,
    thumbUrl?: string
  ): Promise<boolean> => {
    if (!currentShotId || !selectedProjectId) {
      toast.error('Cannot add to shot: No shot or project selected');
      return false;
    }

    try {
      console.log('[ShotsPage] Adding generation to shot with position', {
        generationId: generationId.substring(0, 8),
        shotId: currentShotId.substring(0, 8)
      });

      // Let the mutation calculate the next available position using centralized function
      // Don't pass timelineFrame - mutation will query DB and use calculateNextAvailableFrame
      await addImageToShotMutation.mutateAsync({
        shot_id: currentShotId,
        generation_id: generationId,
        imageUrl: imageUrl,
        thumbUrl: thumbUrl,
        project_id: selectedProjectId,
        // timelineFrame not passed - mutation calculates using centralized calculateNextAvailableFrame
      });

      await refreshSelectedShotImages();
      return true;
    } catch (error) {
      console.error('[ShotsPage] Error adding to shot:', error);
      toast.error(`Failed to add to shot: ${(error as Error).message}`);
      return false;
    }
  }, [currentShotId, selectedProjectId, managedImages, addImageToShotMutation, refreshSelectedShotImages]);

  // Handler for adding a generation to a shot without position
  const handleAddToShotWithoutPosition = useCallback(async (
    generationId: string,
    imageUrl?: string,
    thumbUrl?: string
  ): Promise<boolean> => {
    if (!currentShotId || !selectedProjectId) {
      toast.error('Cannot add to shot: No shot or project selected');
      return false;
    }

    try {
      console.log('[ShotsPage] Adding generation to shot without position', {
        generationId: generationId.substring(0, 8),
        shotId: currentShotId.substring(0, 8)
      });

      await addImageToShotWithoutPositionMutation.mutateAsync({
        shot_id: currentShotId,
        generation_id: generationId,
        imageUrl: imageUrl,
        thumbUrl: thumbUrl,
        project_id: selectedProjectId,
      });

      await refreshSelectedShotImages();
      return true;
    } catch (error) {
      console.error('[ShotsPage] Error adding to shot without position:', error);
      toast.error(`Failed to add to shot: ${(error as Error).message}`);
      return false;
    }
  }, [currentShotId, selectedProjectId, addImageToShotWithoutPositionMutation, refreshSelectedShotImages]);

  // Handler for changing the selected shot in the lightbox
  const handleShotChange = useCallback((shotId: string) => {
    console.log('[ShotsPage] Shot change requested:', shotId);
    setCurrentShotId(shotId);
  }, [setCurrentShotId]);

  if (!selectedProjectId) {
    return <div className="container mx-auto p-4">Please select a project to view shots.</div>;
  }

  if (isLoadingShots) {
    return <div className="container mx-auto p-4">Loading shots...</div>;
  }

  if (shotsError) {
    const isCancelled = shotsError?.message?.includes('CancelledError') || shotsError?.message?.includes('cancelled');
    if (isCancelled) {
      console.warn('[DeadModeInvestigation] Shots query cancelled; preserving previous data and retrying soon');
      return <div className="container mx-auto p-4">Loading shots...</div>;
    }
    return <div className="container mx-auto p-4">Error loading shots: {shotsError.message}</div>;
  }

  return (
    <div className="container mx-auto p-4">
      {!selectedShot ? (
        <>
          <h1 className="text-3xl font-light mb-6">All Shots</h1>
          <ShotListDisplay
            shots={shots}
            onSelectShot={handleSelectShot}
          />
        </>
      ) : (
        <>
          <Button onPointerUp={handleBackToList} className="mb-4">Back to All Shots</Button>
          <h2 className="text-2xl font-normal mb-4">Images in: <span className="preserve-case">{selectedShot.name}</span></h2>
          <ShotImageManager
            images={managedImages}
            onImageDelete={handleDeleteImage}
            onImageReorder={handleReorderImage}
            columns={8}
            generationMode="batch"
            allShots={simplifiedShotOptions}
            selectedShotId={currentShotId || undefined}
            onShotChange={handleShotChange}
            onAddToShot={handleAddToShot}
            onAddToShotWithoutPosition={handleAddToShotWithoutPosition}
          />
          {/* Debug logging */}
          {console.log('[ShotSelectorDebug] ShotsPage -> ShotImageManager', {
            component: 'ShotsPage',
            allShotsLength: simplifiedShotOptions.length,
            selectedShotId: currentShotId,
            hasOnAddToShot: !!handleAddToShot,
            hasOnAddToShotWithoutPosition: !!handleAddToShotWithoutPosition,
            hasOnShotChange: !!handleShotChange,
            imagesCount: managedImages.length,
            generationMode: 'batch'
          })}
        </>
      )}
    </div>
  );
};

export default ShotsPage; 