import React, { useState, useEffect } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useListShots, useRemoveImageFromShot, useUpdateShotImageOrder } from '@/shared/hooks/useShots';
import { Shot, GenerationRow } from '@/types/shots';
import ShotListDisplay from '@/tools/video-travel/components/ShotListDisplay'; // Reusing this component
import ShotImageManager from '@/shared/components/ShotImageManager';
import { Button } from '@/shared/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { arrayMove } from '@dnd-kit/sortable';
import { toast } from 'sonner';
import { useLocation, useNavigate } from 'react-router-dom';

const ShotsPage: React.FC = () => {
  const { selectedProjectId } = useProject();
  const { data: shots, isLoading: isLoadingShots, error: shotsError, refetch: refetchShots } = useListShots(selectedProjectId);
  const [selectedShot, setSelectedShot] = useState<Shot | null>(null);
  const [managedImages, setManagedImages] = useState<GenerationRow[]>([]);

  const queryClient = useQueryClient();
  const removeImageFromShotMutation = useRemoveImageFromShot();
  const updateShotImageOrderMutation = useUpdateShotImageOrder();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // If project changes, or selected shot is no longer in the fetched list, deselect it
    if (selectedShot && selectedProjectId) {
      const currentShotExists = shots?.find(s => s.id === selectedShot.id && s.project_id === selectedProjectId);
      if (!currentShotExists) {
        setSelectedShot(null);
        setManagedImages([]);
      }
    } else if (!selectedProjectId) {
      setSelectedShot(null);
      setManagedImages([]);
    }
  }, [selectedProjectId, shots, selectedShot]);

  useEffect(() => {
    // Update managedImages when selectedShot changes
    if (selectedShot && selectedShot.images) {
      setManagedImages(selectedShot.images);
    } else {
      setManagedImages([]);
    }
  }, [selectedShot]);

  useEffect(() => {
    if (location.state?.selectedShotId && shots && shots.length > 0) {
      const shotToSelect = shots.find(s => s.id === location.state.selectedShotId);
      if (shotToSelect) {
        setSelectedShot(shotToSelect);
        // Clear the state from location to prevent re-triggering on unrelated re-renders
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [location.state, shots, navigate, location.pathname]);

  const handleSelectShot = (shot: Shot) => {
    // Fetch the full shot details if necessary, or use the one from the list
    // For now, assume `shot` from `useListShots` contains `images` array
    setSelectedShot(shot);
  };

  const handleBackToList = () => {
    setSelectedShot(null);
  };

  const refreshSelectedShotImages = async () => {
    if (selectedShot && selectedProjectId) {
      // Invalidate and refetch the specific shot or the whole list
      // For simplicity, refetching the whole list for the project will update the selected shot
      await queryClient.invalidateQueries({ queryKey: ['shots', selectedProjectId] });
      // After refetch, the useEffect for [shots, selectedShot, selectedProjectId] should update selectedShot if it changed
      // And then the useEffect for [selectedShot] will update managedImages
    }
  };

  const handleDeleteImage = (generationId: string) => {
    if (!selectedShot || !selectedProjectId) {
      toast.error('Cannot delete image: Shot or Project ID is missing.');
      return;
    }

    removeImageFromShotMutation.mutate({
      shot_id: selectedShot.id,
      generation_id: generationId,
      project_id: selectedProjectId,
    }, {
      onSuccess: () => {
        const updatedImages = managedImages.filter(img => img.id !== generationId);
        setManagedImages(updatedImages);
        refreshSelectedShotImages();
      },
      onError: (error) => {
        toast.error(`Failed to remove image: ${error.message}`);
      },
    });
  };

  const handleReorderImage = (activeId: string, overId: string) => {
    if (!selectedShot || !selectedProjectId) {
      toast.error('Cannot reorder images: Shot or Project ID is missing.');
      return;
    }

    const oldIndex = managedImages.findIndex(img => img.id === activeId);
    const newIndex = managedImages.findIndex(img => img.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(managedImages, oldIndex, newIndex);
    setManagedImages(newOrder); // Optimistic update

    const orderedGenerationIds = newOrder.map(img => img.id);
    updateShotImageOrderMutation.mutate({
      shotId: selectedShot.id,
      orderedGenerationIds,
      projectId: selectedProjectId,
    }, {
      onSuccess: () => {        
        // setSelectedShot(prev => prev ? { ...prev, images: newOrder } : null); // also update selectedShot
        refreshSelectedShotImages(); // Refresh from source after optimistic update
      },
      onError: (error) => {
        toast.error(`Failed to update image order: ${error.message}`);
        // Revert optimistic update
        setManagedImages(selectedShot.images || []); // Revert to original order from selectedShot
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
          <Button onClick={handleBackToList} className="mb-4">Back to All Shots</Button>
          <h2 className="text-2xl font-bold mb-4">Images in: {selectedShot.name}</h2>
          <ShotImageManager
            images={managedImages} // Use the local managedImages state for optimistic updates
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