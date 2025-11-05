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
  sortMode?: 'ordered' | 'newest' | 'oldest'; // Sort mode for shots
}



const ShotListDisplay: React.FC<ShotListDisplayProps> = ({
  onSelectShot,
  onCreateNewShot,
  shots: propShots,
  sortMode = 'ordered',
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
      return baseList;
    }
    
    // Apply sorting based on sortMode
    let sorted: Shot[];
    if (sortMode === 'newest') {
      // Sort by created_at descending (newest first)
      sorted = [...baseList].sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA;
      });
    } else if (sortMode === 'oldest') {
      // Sort by created_at ascending (oldest first)
      sorted = [...baseList].sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateA - dateB;
      });
    } else {
      // Default 'ordered' mode - sort by position
      sorted = [...baseList].sort((a, b) => (a.position || 0) - (b.position || 0));
    }
    
    // Only log if debug flag is enabled to reduce mobile console overhead
    if (process.env.NODE_ENV === 'development') {
      });
    }
    return sorted;
  }, [propShots, optimisticShots, reorderShotsMutation.isPending, sortMode]);

  // Clear optimistic overlay when mutation settles
  React.useEffect(() => {
    if (!reorderShotsMutation.isPending && optimisticShots) {
      setOptimisticShots(null);
    }
  }, [reorderShotsMutation.isPending, optimisticShots]);
  
  // [ShotReorderDebug] Log data source to confirm fix - only in development
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      });
    }
  }, [propShots?.length, shots?.length]);

  // [ShotReorderDebug] Log what's actually being rendered visually - only in development
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development' && shots && shots.length > 0) {
      });
      
      // [ShotReorderDebug] Log each visual position individually - limit to first 10
      shots.slice(0, 10).forEach((shot, index) => {
        }) - Position: ${shot.position}`);
      });
    }
  }, [shots]);

  // [ShotReorderDebug] Log shots data only when count changes (to reduce noise) - only in development
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      });
    }
  }, [shots?.length, currentProjectId, shotsLoading]);

  // [ShotReorderDebug] Log mutation state changes - only in development
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      });
    }
  }, [reorderShotsMutation.isPending, reorderShotsMutation.isError, reorderShotsMutation.error]);

  // Check if focus is on an input element to conditionally disable KeyboardSensor
  const [isInputFocused, setIsInputFocused] = React.useState(false);
  
  React.useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      const isFormElement = target.tagName === 'INPUT' || 
                           target.tagName === 'TEXTAREA' || 
                           target.contentEditable === 'true';
      setIsInputFocused(isFormElement);
    };
    
    const handleFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      const isFormElement = target.tagName === 'INPUT' || 
                           target.tagName === 'TEXTAREA' || 
                           target.contentEditable === 'true';
      if (isFormElement) {
        setIsInputFocused(false);
      }
    };
    
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  // Set up sensors for drag and drop
  // Always create the keyboard sensor but conditionally disable it
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });
  
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
    keyboardSensor
  );

  const handleDragStart = (event: any) => {
    // Prevent drag if an input is focused
    if (isInputFocused) {
      return false;
    }
    
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    });

    if (!over || !shots || !currentProjectId) {
      return;
    }

    if (active.id !== over.id) {
      const oldIndex = shots.findIndex((shot) => shot.id === active.id);
      const newIndex = shots.findIndex((shot) => shot.id === over.id);

      )
      });

      if (oldIndex === -1 || newIndex === -1) {
        return;
      }

      // Create new order array
      const reorderedShots = arrayMove(shots, oldIndex, newIndex);
      
      ,
        reorderedOrder: reorderedShots.map(s => s.id),
        movedFrom: oldIndex,
        movedTo: newIndex
      });
      
      // Update positions on the reordered shots
      const shotsWithNewPositions = reorderedShots.map((shot, index) => ({
        ...shot,
        position: index + 1,
      }));

      )
      });

      // Apply local optimistic overlay for immediate visual feedback
      setOptimisticShots(shotsWithNewPositions);

      // Optimistically update query cache with the correct key
      // Update the unlimited shots cache (used by ShotsContext -> useListShots(projectId))
      // Cache key is ['shots', projectId, 0] where 0 = unlimited maxImagesPerShot
      queryClient.setQueryData(['shots', currentProjectId, 0], shotsWithNewPositions);
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
          onSuccess: (data) => {
            )
            });
          },
          // Note: No onSuccess callback - we don't want to invalidate and refetch
          // The optimistic update is already in place and will stay unless there's an error
        }
      );
    } else {
      }
  };

  // [ShotReorderDebug] Additional drag event handlers for debugging

  const handleDragMove = (event: any) => {
    // Only log when over a different item to reduce noise
    if (event.over && event.active.id !== event.over.id) {
      });
    }
  };

  const handleDragCancel = () => {
    });
  };

  // [ShotReorderDebug] Memoize sortable items
  const sortableItems = React.useMemo(() => {
    if (!shots) return [];
    const items = shots.map((shot) => shot.id);
    return items;
  }, [shots]);

  // Show loading skeleton while data is being fetched
  if (shotsLoading || shots === undefined) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-x-8 md:gap-y-8 pb-6 md:pb-8 px-4 pt-4 pb-2">
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

  // Determine if dragging should be disabled (when not in 'ordered' mode or during mutation)
  const isDragDisabled = sortMode !== 'ordered' || reorderShotsMutation.isPending;

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-x-8 md:gap-y-8 pb-6 md:pb-8 px-4 pt-4 pb-2">
          {shots.map((shot, index) => {
            return (
              <SortableShotItem
                key={shot.id}
                shot={shot}
                onSelectShot={() => onSelectShot(shot)}
                currentProjectId={currentProjectId}
                isDragDisabled={isDragDisabled}
                disabledReason={sortMode !== 'ordered' ? 'Only available in ordered mode' : undefined}
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