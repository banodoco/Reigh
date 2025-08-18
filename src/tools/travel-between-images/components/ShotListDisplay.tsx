import React, { useState, useEffect, useRef } from 'react';
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
import { FadeInSection } from '@/shared/components/transitions';
import { useReorderShots } from '@/shared/hooks/useShots';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface ShotListDisplayProps {
  shots: Shot[] | undefined | null;
  onSelectShot: (shot: Shot) => void;
  currentProjectId: string | null;
  onCreateNewShot?: () => void;
}

// Hook for progressive shot loading
const usePrioritizedShotLoading = (shots: Shot[] | undefined | null) => {
  const [loadedShotIndices, setLoadedShotIndices] = useState<Set<number>>(new Set());
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

  useEffect(() => {
    if (!shots || shots.length === 0) return;

    // Clear any existing timeouts
    timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    timeoutsRef.current = [];

    // Reset and load first 3 shots immediately
    const initialIndices = new Set(Array.from({ length: Math.min(3, shots.length) }, (_, i) => i));
    setLoadedShotIndices(initialIndices);

    console.log('[ShotListDisplay] Loading first 3 shots immediately:', Array.from(initialIndices));

    // Progressive loading for remaining shots (if more than 3)
    if (shots.length > 3) {
      const remainingShots = shots.length - 3;
      const batchSize = 3;
      const batches = Math.ceil(remainingShots / batchSize);

      for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
        const delay = (batchIndex + 1) * 500; // 500ms delay between batches
        const startIndex = 3 + (batchIndex * batchSize);
        const endIndex = Math.min(startIndex + batchSize, shots.length);

        const timeout = setTimeout(() => {
          setLoadedShotIndices(prev => {
            const newSet = new Set(prev);
            for (let i = startIndex; i < endIndex; i++) {
              newSet.add(i);
            }
            console.log(`[ShotListDisplay] Loading batch ${batchIndex + 1}, shots ${startIndex}-${endIndex - 1}`);
            return newSet;
          });
        }, delay);

        timeoutsRef.current.push(timeout);
      }
    }

    // Cleanup function
    return () => {
      timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      timeoutsRef.current = [];
    };
  }, [shots]);

  return { loadedShotIndices };
};

const ShotListDisplay: React.FC<ShotListDisplayProps> = ({
  shots,
  onSelectShot,
  currentProjectId,
  onCreateNewShot,
}) => {
  const reorderShotsMutation = useReorderShots();
  const queryClient = useQueryClient();
  const { loadedShotIndices } = usePrioritizedShotLoading(shots);

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
  if (shots === undefined) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="h-40 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  // Show empty state only when we definitively have no shots
  if (shots.length === 0) {
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shots.map((shot, index) => {
            const shouldLoadImages = loadedShotIndices.has(index);
            
            return (
              <SortableShotItem
                key={shot.id}
                shot={shot}
                onSelectShot={() => onSelectShot(shot)}
                currentProjectId={currentProjectId}
                isDragDisabled={reorderShotsMutation.isPending}
                shouldLoadImages={shouldLoadImages}
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