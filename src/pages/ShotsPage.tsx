import React, { useState, useEffect, useMemo } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useListShots, useRemoveImageFromShot, useUpdateShotImageOrder } from '@/shared/hooks/useShots';
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

  const handleDeleteImage = (shotImageEntryId: string) => {
    if (!selectedShot || !selectedProjectId) {
      toast.error('Cannot delete image: Shot or Project ID is missing.');
      return;
    }

    const originalImages = selectedShot.images || [];
    const updatedImages = originalImages.filter(img => img.shotImageEntryId !== shotImageEntryId);
    setManagedImages(updatedImages); // Optimistic update

    removeImageFromShotMutation.mutate({
      shot_id: selectedShot.id,
      shotImageEntryId: shotImageEntryId,
      project_id: selectedProjectId,
    }, {
      onSuccess: () => {
        // The query invalidation will trigger a refetch and update the view.
        // No need for refreshSelectedShotImages();
      },
      onError: (error) => {
        toast.error(`Failed to remove image: ${error.message}`);
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
    const imageMap = new Map(originalImages.map(img => [img.shotImageEntryId, img]));
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

  if (!selectedProjectId) {
    return <div className="container mx-auto p-4">Please select a project to view shots.</div>;
  }

  if (isLoadingShots) {
    return <div className="container mx-auto p-4">Loading shots...</div>;
  }

  if (shotsError) {
    return <div className="container mx-auto p-4">Error loading shots: {shotsError.message}</div>;
  }

  return (
    <div className="container mx-auto p-4">
      {!selectedShot ? (
        <>
          <h1 className="text-3xl font-bold mb-6">All Shots</h1>
          <ShotListDisplay
            shots={shots}
            onSelectShot={handleSelectShot}
            currentProjectId={selectedProjectId}
          />
        </>
      ) : (
        <>
          <Button onPointerUp={handleBackToList} className="mb-4">Back to All Shots</Button>
          <h2 className="text-2xl font-bold mb-4">Images in: {selectedShot.name}</h2>
          <ShotImageManager
            images={managedImages}
            onImageDelete={handleDeleteImage}
            onImageReorder={handleReorderImage}
            columns={8}
          />
        </>
      )}
    </div>
  );
};

export default ShotsPage; 