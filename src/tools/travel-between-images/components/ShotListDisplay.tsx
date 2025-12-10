import React, { useState, useCallback } from 'react';
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
import { cn } from '@/shared/lib/utils';
import { Plus, Upload } from 'lucide-react';
import { getDragType, getGenerationDropData, isFileDrag, type GenerationDropData, type DragType } from '@/shared/lib/dragDrop';

interface ShotListDisplayProps {
  onSelectShot: (shot: Shot) => void;
  onCreateNewShot?: () => void;
  shots?: Shot[]; // Optional - if not provided, will use context
  sortMode?: 'ordered' | 'newest' | 'oldest'; // Sort mode for shots
  onSortModeChange?: (mode: 'ordered' | 'newest' | 'oldest') => void; // Callback to change sort mode
  highlightedShotId?: string | null; // Shot to highlight for visual feedback
  // Drop handling for generations from GenerationsPane
  onGenerationDropOnShot?: (shotId: string, data: GenerationDropData) => Promise<void>;
  onGenerationDropForNewShot?: (data: GenerationDropData) => Promise<void>;
  // Drop handling for external files
  onFilesDropForNewShot?: (files: File[]) => Promise<void>;
}



const ShotListDisplay: React.FC<ShotListDisplayProps> = ({
  onSelectShot,
  onCreateNewShot,
  shots: propShots,
  sortMode = 'ordered',
  onSortModeChange,
  highlightedShotId,
  onGenerationDropOnShot,
  onGenerationDropForNewShot,
  onFilesDropForNewShot,
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
      console.log(`${REORDER_DEBUG_TAG} Frontend sorting applied:`, {
        sortMode,
        originalFirst: baseList[0]?.name,
        sortedFirst: sorted[0]?.name,
        originalFirstPosition: baseList[0]?.position,
        sortedFirstPosition: sorted[0]?.position,
        timestamp: Date.now()
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
      console.log(`${REORDER_DEBUG_TAG} Preventing drag start - input is focused`);
      return false;
    }
    
    console.log(`${REORDER_DEBUG_TAG} === DRAG START ===`, {
      activeId: event.active.id,
      activeData: event.active.data,
      timestamp: Date.now()
    });
  };

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

  // [ShotReorderDebug] Additional drag event handlers for debugging

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
    if (!shots) return [];
    const items = shots.map((shot) => shot.id);
    return items;
  }, [shots]);

  // Drop state for "New Shot" drop zone
  const [isNewShotDropTarget, setIsNewShotDropTarget] = useState(false);
  const [newShotDropType, setNewShotDropType] = useState<DragType>('none');

  // Handle drag enter for new shot drop zone
  const handleNewShotDragEnter = useCallback((e: React.DragEvent) => {
    const dragType = getDragType(e);
    if (dragType !== 'none' && (onGenerationDropForNewShot || onFilesDropForNewShot)) {
      e.preventDefault();
      e.stopPropagation();
      setIsNewShotDropTarget(true);
      setNewShotDropType(dragType);
    }
  }, [onGenerationDropForNewShot, onFilesDropForNewShot]);

  // Handle drag over for new shot drop zone
  const handleNewShotDragOver = useCallback((e: React.DragEvent) => {
    const dragType = getDragType(e);
    if (dragType !== 'none' && (onGenerationDropForNewShot || onFilesDropForNewShot)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setIsNewShotDropTarget(true);
      setNewShotDropType(dragType);
    }
  }, [onGenerationDropForNewShot, onFilesDropForNewShot]);

  // Handle drag leave for new shot drop zone
  const handleNewShotDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsNewShotDropTarget(false);
      setNewShotDropType('none');
    }
  }, []);

  // Handle drop for new shot
  const handleNewShotDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsNewShotDropTarget(false);
    setNewShotDropType('none');

    // Try generation drop first
    const generationData = getGenerationDropData(e);
    if (generationData && onGenerationDropForNewShot) {
      console.log('[ShotDrop] Dropping generation to create new shot:', {
        generationId: generationData.generationId?.substring(0, 8),
        timestamp: Date.now()
      });

      try {
        await onGenerationDropForNewShot(generationData);
      } catch (error) {
        console.error('[ShotDrop] Error creating new shot from generation:', error);
        toast.error(`Failed to create shot: ${(error as Error).message}`);
      }
      return;
    }

    // Try file drop
    if (isFileDrag(e) && onFilesDropForNewShot) {
      const files = Array.from(e.dataTransfer.files);
      const validImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      const validFiles = files.filter(file => validImageTypes.includes(file.type));
      
      if (validFiles.length === 0) {
        toast.error('No valid image files. Only JPEG, PNG, and WebP are supported.');
        return;
      }

      console.log('[ShotDrop] Dropping files to create new shot:', {
        fileCount: validFiles.length,
        timestamp: Date.now()
      });

      try {
        await onFilesDropForNewShot(validFiles);
      } catch (error) {
        console.error('[ShotDrop] Error creating new shot from files:', error);
        toast.error(`Failed to create shot: ${(error as Error).message}`);
      }
    }
  }, [onGenerationDropForNewShot, onFilesDropForNewShot]);

  // Show loading skeleton while data is being fetched
  if (shotsLoading || shots === undefined) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-x-8 md:gap-y-8 pb-6 md:pb-8 px-4 pt-4 pb-2">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="h-32 rounded-lg bg-muted animate-pulse" />
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

  // TEMPORARILY DISABLED: Dragging is always disabled (Task 20)
  // To restore: const isDragDisabled = sortMode !== 'ordered' || reorderShotsMutation.isPending;
  const isDragDisabled = true; // Ordered mode & reordering temporarily disabled

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
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-x-8 md:gap-y-8 pb-6 md:pb-8 px-4 pt-4 pb-2">
          {/* New Shot Drop Zone - appears at start of grid */}
          {(onGenerationDropForNewShot || onFilesDropForNewShot) && (
            <div
              onDragEnter={handleNewShotDragEnter}
              onDragOver={handleNewShotDragOver}
              onDragLeave={handleNewShotDragLeave}
              onDrop={handleNewShotDrop}
              onClick={onCreateNewShot}
              className={cn(
                'min-h-32 p-4 border-2 border-dashed rounded-lg bg-card/30 hover:bg-card/50 hover:border-primary/50 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center gap-3',
                isNewShotDropTarget && 'border-primary bg-primary/10 ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.02]'
              )}
            >
              {isNewShotDropTarget ? (
                <>
                  <Upload className="h-10 w-10 text-primary animate-bounce" />
                  <span className="text-sm font-medium text-primary">
                    {newShotDropType === 'file' ? 'Drop files to create new shot' : 'Drop to create new shot'}
                  </span>
                </>
              ) : (
                <>
                  <Plus className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">New Shot</span>
                  <span className="text-xs text-muted-foreground/60">Click or drop image here</span>
                </>
              )}
            </div>
          )}
          
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
                isHighlighted={highlightedShotId === shot.id}
                onGenerationDrop={onGenerationDropOnShot}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
};

export default ShotListDisplay; 