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
import { useCurrentProject } from '@/shared/hooks/useCurrentProject';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface ShotListDisplayProps {
  onSelectShot: (shot: Shot) => void;
  onCreateNewShot?: () => void;
  shots?: Shot[]; // Optional - if not provided, will use context
}



const ShotListDisplay: React.FC<ShotListDisplayProps> = ({
  onSelectShot,
  onCreateNewShot,
  shots: propShots,
}) => {
  // [ShotReorderDebug] Debug tag for shot reordering issues
  const REORDER_DEBUG_TAG = '[ShotReorderDebug]';
  
  // Get hooks first before using them in useMemo
  const { isLoading: shotsLoading, error: shotsError } = useShots();
  const { selectedProjectId: currentProjectId } = useProject();
  const currentProject = useCurrentProject();
  const reorderShotsMutation = useReorderShots();
  const queryClient = useQueryClient();
  const [optimisticShots, setOptimisticShots] = React.useState<Shot[] | null>(null);
  
  // Always use props shots to ensure single source of truth, with optional local optimistic overlay
  // [ShotReorderDebug] Explicitly sort by position, but skip during optimistic updates
  const shots = React.useMemo(() => {
    const baseList = optimisticShots || propShots;
    if (!baseList) return baseList;
    
    // Skip sorting during optimistic updates to allow smooth drag feedback
    if (reorderShotsMutation.isPending) {
      console.log(`${REORDER_DEBUG_TAG} Skipping sort during optimistic update`);
      return baseList;
    }
    
    const sorted = [...baseList].sort((a, b) => (a.position || 0) - (b.position || 0));
    
    // Only log if debug flag is enabled to reduce mobile console overhead
    if (process.env.NODE_ENV === 'development') {
      console.log(`${REORDER_DEBUG_TAG} Frontend sorting applied:`, {
        originalFirst: baseList[0]?.name,
        sortedFirst: sorted[0]?.name,
        originalFirstPosition: baseList[0]?.position,
        sortedFirstPosition: sorted[0]?.position,
        timestamp: Date.now()
      });
    }
    return sorted;
  }, [propShots, optimisticShots, reorderShotsMutation.isPending]);

  // Clear optimistic overlay when mutation settles
  React.useEffect(() => {
    if (!reorderShotsMutation.isPending && optimisticShots) {
      setOptimisticShots(null);
    }
  }, [reorderShotsMutation.isPending, optimisticShots]);
  
  // [ShotReorderDebug] Log data source to confirm fix - only in development
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`${REORDER_DEBUG_TAG} ShotListDisplay data source:`, {
        usingProps: !!propShots,
        propsCount: propShots?.length || 0,
        finalCount: shots?.length || 0,
        timestamp: Date.now()
      });
    }
  }, [propShots?.length, shots?.length]);

  // [ShotReorderDebug] Log what's actually being rendered visually - only in development
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development' && shots && shots.length > 0) {
      console.log(`${REORDER_DEBUG_TAG} === VISUAL RENDER ORDER ===`, {
        shotsCount: shots.length,
        timestamp: Date.now()
      });
      
      // [ShotReorderDebug] Log each visual position individually - limit to first 10
      shots.slice(0, 10).forEach((shot, index) => {
        console.log(`${REORDER_DEBUG_TAG} Visual ${index}: ${shot.name} (ID: ${shot.id.substring(0, 8)}) - Position: ${shot.position}`);
      });
    }
  }, [shots]);

  // [ShotReorderDebug] Log shots data only when count changes (to reduce noise) - only in development
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`${REORDER_DEBUG_TAG} Shots count changed:`, {
        shotsCount: shots?.length || 0,
        currentProjectId,
        shotsLoading,
        timestamp: Date.now()
      });
    }
  }, [shots?.length, currentProjectId, shotsLoading]);

  // [ShotReorderDebug] Log mutation state changes - only in development
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`${REORDER_DEBUG_TAG} Reorder mutation state:`, {
        isPending: reorderShotsMutation.isPending,
        isError: reorderShotsMutation.isError,
        error: reorderShotsMutation.error?.message,
        timestamp: Date.now()
      });
    }
  }, [reorderShotsMutation.isPending, reorderShotsMutation.isError, reorderShotsMutation.error]);

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
    console.log(`${REORDER_DEBUG_TAG} === DRAG END EVENT ===`);
    const { active, over } = event;

    console.log(`${REORDER_DEBUG_TAG} Drag end details:`, {
      activeId: active.id,
      overId: over?.id,
      hasOver: !!over,
      hasShots: !!shots,
      shotsCount: shots?.length || 0,
      currentProjectId,
      timestamp: Date.now()
    });

    if (!over || !shots || !currentProjectId) {
      console.log(`${REORDER_DEBUG_TAG} Early return - missing requirements:`, {
        hasOver: !!over,
        hasShots: !!shots,
        hasCurrentProjectId: !!currentProjectId
      });
      return;
    }

    if (active.id !== over.id) {
      const oldIndex = shots.findIndex((shot) => shot.id === active.id);
      const newIndex = shots.findIndex((shot) => shot.id === over.id);

      console.log(`${REORDER_DEBUG_TAG} Index calculation:`, {
        activeId: active.id,
        overId: over.id,
        oldIndex,
        newIndex,
        shotsBeforeReorder: shots.map(s => ({ id: s.id, position: s.position, name: s.name }))
      });

      if (oldIndex === -1 || newIndex === -1) {
        console.log(`${REORDER_DEBUG_TAG} Invalid indices - aborting reorder:`, {
          oldIndex,
          newIndex,
          activeId: active.id,
          overId: over.id
        });
        return;
      }

      // Create new order array
      const reorderedShots = arrayMove(shots, oldIndex, newIndex);
      
      console.log(`${REORDER_DEBUG_TAG} Array move completed:`, {
        originalOrder: shots.map(s => s.id),
        reorderedOrder: reorderedShots.map(s => s.id),
        movedFrom: oldIndex,
        movedTo: newIndex
      });
      
      // Update positions on the reordered shots
      const shotsWithNewPositions = reorderedShots.map((shot, index) => ({
        ...shot,
        position: index + 1,
      }));

      console.log(`${REORDER_DEBUG_TAG} Position updates calculated:`, {
        shotsWithNewPositions: shotsWithNewPositions.map(s => ({ id: s.id, position: s.position, name: s.name }))
      });

      // Apply local optimistic overlay for immediate visual feedback
      setOptimisticShots(shotsWithNewPositions);

      // Optimistically update query cache with the correct key
      console.log(`${REORDER_DEBUG_TAG} Updating query caches optimistically...`);
      
      // Update the unlimited shots cache (used by ShotsContext -> useListShots(projectId))
      // Cache key is ['shots', projectId, 0] where 0 = unlimited maxImagesPerShot
      queryClient.setQueryData(['shots', currentProjectId, 0], shotsWithNewPositions);
      console.log(`${REORDER_DEBUG_TAG} Updated shots cache with key: ['shots', '${currentProjectId}', 0]`);
      
      // Generate position updates for database
      const shotOrders = reorderedShots.map((shot, index) => ({
        shotId: shot.id,
        position: index + 1,
      }));

      console.log(`${REORDER_DEBUG_TAG} Database update payload:`, {
        projectId: currentProjectId,
        shotOrders,
        mutationPending: reorderShotsMutation.isPending
      });

      // Update positions in database
      console.log(`${REORDER_DEBUG_TAG} Triggering database mutation...`);
      reorderShotsMutation.mutate(
        { projectId: currentProjectId, shotOrders },
        {
          onError: (error) => {
            console.log(`${REORDER_DEBUG_TAG} Database mutation FAILED - reverting optimistic updates:`, {
              error: error.message,
              errorDetails: error
            });
            // Revert optimistic updates on both caches on error
            queryClient.setQueryData(['shots', currentProjectId], shots);
            queryClient.setQueryData(['shots', currentProjectId, 5], shots);
            toast.error(`Failed to reorder shots: ${error.message}`);
          },
          onSuccess: (data) => {
            console.log(`${REORDER_DEBUG_TAG} Database mutation SUCCESS:`, {
              data,
              finalShotOrder: shotsWithNewPositions.map(s => ({ id: s.id, position: s.position, name: s.name }))
            });
          },
          // Note: No onSuccess callback - we don't want to invalidate and refetch
          // The optimistic update is already in place and will stay unless there's an error
        }
      );
    } else {
      console.log(`${REORDER_DEBUG_TAG} No position change - active.id === over.id:`, {
        activeId: active.id,
        overId: over.id
      });
    }
  };

  // Show loading skeleton while data is being fetched
  if (shotsLoading || shots === undefined) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-x-8 md:gap-y-8 pb-6 md:pb-8 px-4 py-4">
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

  // [ShotReorderDebug] Additional drag event handlers for debugging
  const handleDragStart = (event: any) => {
    console.log(`${REORDER_DEBUG_TAG} === DRAG START ===`, {
      activeId: event.active.id,
      activeData: event.active.data,
      timestamp: Date.now()
    });
  };

  const handleDragMove = (event: any) => {
    // Only log when over a different item to reduce noise
    if (event.over && event.active.id !== event.over.id) {
      console.log(`${REORDER_DEBUG_TAG} Drag move over different item:`, {
        activeId: event.active.id,
        overId: event.over.id,
        delta: event.delta,
        timestamp: Date.now()
      });
    }
  };

  const handleDragCancel = () => {
    console.log(`${REORDER_DEBUG_TAG} === DRAG CANCELLED ===`, {
      timestamp: Date.now()
    });
  };

  // [ShotReorderDebug] Memoize sortable items
  const sortableItems = React.useMemo(() => {
    const items = shots.map((shot) => shot.id);
    return items;
  }, [shots]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext 
        items={sortableItems}
        strategy={rectSortingStrategy}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-x-8 md:gap-y-8 pb-6 md:pb-8 px-4 py-4">
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
                projectAspectRatio={currentProject?.aspectRatio}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
};

export default ShotListDisplay; 