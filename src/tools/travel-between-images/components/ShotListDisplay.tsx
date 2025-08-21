import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { Shot } from '@/types/shots';
import SortableShotItem from './SortableShotItem';
import { Button } from '@/shared/components/ui/button';
import { useReorderShots } from '@/shared/hooks/useShots';
import { useShots } from '@/shared/contexts/ShotsContext';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface ShotListDisplayProps {
  onSelectShot: (shot: Shot) => void;
  onCreateNewShot?: () => void;
}



const ShotListDisplay: React.FC<ShotListDisplayProps> = ({
  onSelectShot,
  onCreateNewShot,
}) => {
  // Get shots data from the same context that ShotsPane uses
  const { shots, isLoading: shotsLoading, error: shotsError } = useShots();
  const { selectedProjectId: currentProjectId } = useProject();
  const reorderShotsMutation = useReorderShots();
  const queryClient = useQueryClient();

  // Set up sensors for drag and drop
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8, // 8px of movement required before drag starts
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || !shots || !currentProjectId) return;

    if (active.id !== over.id) {
      const oldIndex = shots.findIndex((shot) => shot.id === active.id);
      const newIndex = shots.findIndex((shot) => shot.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      // Create new order array
      const reorderedShots = arrayMove(shots, oldIndex, newIndex);
      
      // Update positions on the reordered shots
      const shotsWithNewPositions = reorderedShots.map((shot, index) => ({
        ...shot,
        position: index + 1,
      }));

      // Optimistically update BOTH query caches immediately
      // Update the full shots cache (used by useShots context)
      queryClient.setQueryData(['shots', currentProjectId], shotsWithNewPositions);
      // Update the limited shots cache (used by useListShots in VideoTravelToolPage) 
      queryClient.setQueryData(['shots', currentProjectId, 5], shotsWithNewPositions);
      
      // Generate position updates for database
      const shotOrders = reorderedShots.map((shot, index) => ({
        shotId: shot.id,
        position: index + 1,
      }));

      // Update positions in database
      reorderShotsMutation.mutate(
        { projectId: currentProjectId, shotOrders },
        {
          onError: (error) => {
            // Revert optimistic updates on both caches on error
            queryClient.setQueryData(['shots', currentProjectId], shots);
            queryClient.setQueryData(['shots', currentProjectId, 5], shots);
            toast.error(`Failed to reorder shots: ${error.message}`);
          },
          // Note: No onSuccess callback - we don't want to invalidate and refetch
          // The optimistic update is already in place and will stay unless there's an error
        }
      );
    }
  };

  // Show loading skeleton while data is being fetched
  if (shotsLoading || shots === undefined) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-x-8 md:gap-y-8 pb-6 md:pb-8">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="h-40 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  // Show error state if there's an error loading shots
  if (shotsError) {
    return (
      <div className="py-8">
        <p className="mb-6 text-red-500">Error loading shots: {shotsError.message}</p>
        {onCreateNewShot && (
          <Button onClick={onCreateNewShot}>New Shot</Button>
        )}
      </div>
    );
  }

  // Show empty state only when we definitively have no shots
  if (!shots || shots.length === 0) {
    return (
      <div className="py-8">
        <p className="mb-6">No shots available for this project. You can create one using the button below.</p>
        {onCreateNewShot && (
          <Button onClick={onCreateNewShot}>New Shot</Button>
        )}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext 
        items={shots.map((shot) => shot.id)} 
        strategy={rectSortingStrategy}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-x-8 md:gap-y-8 pb-6 md:pb-8">
          {shots.map((shot, index) => {
            return (
              <SortableShotItem
                key={shot.id}
                shot={shot}
                onSelectShot={() => onSelectShot(shot)}
                currentProjectId={currentProjectId}
                isDragDisabled={reorderShotsMutation.isPending}
                shouldLoadImages={true} // Always load images since they're from context
                shotIndex={index}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
};

export default ShotListDisplay; 