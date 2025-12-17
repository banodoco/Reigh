import React, { useState, useCallback, useRef } from 'react';
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
import { Plus, Upload, Loader2 } from 'lucide-react';
import { getDragType, getGenerationDropData, isFileDrag, type GenerationDropData, type DragType } from '@/shared/lib/dragDrop';
import { isVideoGeneration } from '@/shared/lib/typeGuards';

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
  onFilesDropOnShot?: (shotId: string, files: File[]) => Promise<void>;
  // Expose skeleton setup for modal-based shot creation
  onSkeletonSetupReady?: (setup: (imageCount: number) => void, clear: () => void) => void;
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
  onFilesDropOnShot,
  onSkeletonSetupReady,
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
  // Processing state for showing loading during upload (legacy - kept for generation drops)
  const [isNewShotProcessing, setIsNewShotProcessing] = useState(false);
  
  // Optimistic skeleton shot state (computed during render like SortableShotItem)
  const pendingNewShotCountRef = useRef(0); // Number of images expected in new shot
  const baselineShotIdsRef = useRef<Set<string> | null>(null); // Shot IDs at drop time
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track newly created shot to transfer pending count to it
  const [newlyCreatedShotId, setNewlyCreatedShotId] = useState<string | null>(null);
  const [newlyCreatedShotExpectedImages, setNewlyCreatedShotExpectedImages] = useState(0);
  const [newlyCreatedShotBaselineNonVideoCount, setNewlyCreatedShotBaselineNonVideoCount] = useState(0);
  
  // Get current shot IDs
  const currentShotIds = shots?.map(s => s.id) || [];
  const currentShotIdsKey = React.useMemo(() => currentShotIds.join('|'), [currentShotIds]);
  
  // If a new shot appears, transfer expected image count to that shot card.
  // (Must be in an effect—never set state during render.)
  // Note: pendingNewShotCountRef can be 0 for empty shots, so only check baselineShotIdsRef
  React.useEffect(() => {
    if (!baselineShotIdsRef.current) return;
    const baseline = baselineShotIdsRef.current;
    const newShotId = currentShotIds.find(id => !baseline.has(id));
    if (!newShotId) return;

    const expectedImages = pendingNewShotCountRef.current;
    const newShot = shots?.find(s => s.id === newShotId);
    const existingNonVideoCount = (newShot?.images || []).filter(img => !isVideoGeneration(img)).length;
    // Pass *remaining* expected images (avoids forever-skeleton for generation drops where the image already exists)
    const remainingExpectedImages = Math.max(0, expectedImages - existingNonVideoCount);

    setNewlyCreatedShotId(newShotId);
    setNewlyCreatedShotExpectedImages(remainingExpectedImages);
    setNewlyCreatedShotBaselineNonVideoCount(existingNonVideoCount);

    // Clear skeleton-shot refs
    pendingNewShotCountRef.current = 0;
    baselineShotIdsRef.current = null;
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
  }, [currentShotIdsKey]);

  // Compute pending skeleton shot during render (no flicker)
  // Only show skeleton if the new shot hasn't appeared in the data yet
  // Note: pendingNewShotCountRef can be 0 for empty shots, so check baselineShotIdsRef instead
  let pendingSkeletonShot: { imageCount: number } | null = null;
  if (baselineShotIdsRef.current) {
    const baseline = baselineShotIdsRef.current;
    const newShotAlreadyInData = currentShotIds.some(id => !baseline.has(id));
    if (!newShotAlreadyInData) {
      // Still waiting - show skeleton
      pendingSkeletonShot = { imageCount: pendingNewShotCountRef.current };
    }
  }

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

  // Helper to setup optimistic skeleton shot
  const setupPendingNewShot = useCallback((imageCount: number) => {
    baselineShotIdsRef.current = new Set(currentShotIds);
    pendingNewShotCountRef.current = imageCount;
    
    // Safety timeout - clear after 15s
    if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
    safetyTimeoutRef.current = setTimeout(() => {
      pendingNewShotCountRef.current = 0;
      baselineShotIdsRef.current = null;
      safetyTimeoutRef.current = null;
    }, 15000);
  }, [currentShotIds]);
  
  const clearPendingNewShot = useCallback(() => {
    pendingNewShotCountRef.current = 0;
    baselineShotIdsRef.current = null;
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
  }, []);

  // Expose skeleton setup/clear to parent for modal-based shot creation
  React.useEffect(() => {
    if (onSkeletonSetupReady) {
      onSkeletonSetupReady(setupPendingNewShot, clearPendingNewShot);
    }
  }, [onSkeletonSetupReady, setupPendingNewShot, clearPendingNewShot]);

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

      // Show skeleton shot with 1 image
      setupPendingNewShot(1);
      
      try {
        await onGenerationDropForNewShot(generationData);
      } catch (error) {
        console.error('[ShotDrop] Error creating new shot from generation:', error);
        toast.error(`Failed to create shot: ${(error as Error).message}`);
        clearPendingNewShot();
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

      // Show skeleton shot with N images
      setupPendingNewShot(validFiles.length);
      
      try {
        await onFilesDropForNewShot(validFiles);
      } catch (error) {
        console.error('[ShotDrop] Error creating new shot from files:', error);
        toast.error(`Failed to create shot: ${(error as Error).message}`);
        clearPendingNewShot();
      }
    }
  }, [onGenerationDropForNewShot, onFilesDropForNewShot, setupPendingNewShot, clearPendingNewShot]);

  // Show loading skeleton while data is being fetched
  if (shotsLoading || shots === undefined) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-x-6 md:gap-y-5 pb-6 md:pb-8 px-4 pt-4 pb-2 items-start">
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
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-x-6 md:gap-y-5 pb-6 md:pb-8 px-4 pt-4 pb-2">
          {/* New Shot Drop Zone - matches collapsed shot card structure for consistent height */}
          {(onGenerationDropForNewShot || onFilesDropForNewShot) && (
            <div
              onDragEnter={handleNewShotDragEnter}
              onDragOver={handleNewShotDragOver}
              onDragLeave={handleNewShotDragLeave}
              onDrop={handleNewShotDrop}
              onClick={isNewShotProcessing ? undefined : onCreateNewShot}
              className={cn(
                'group p-4 border-2 border-dashed rounded-lg transition-all duration-200 flex flex-col self-start relative',
                isNewShotProcessing
                  ? 'border-primary/50 bg-primary/5 cursor-wait'
                  : isNewShotDropTarget 
                    ? 'border-green-500 bg-green-500/10 scale-105 cursor-pointer' 
                    : 'border-border hover:border-[hsl(40,55%,58%)] cursor-pointer'
              )}
            >
              {/* Invisible structure to match shot card height */}
              <div className="h-8 mb-3" aria-hidden="true" /> {/* Header row height */}
              <div className="aspect-[3/1]" aria-hidden="true" /> {/* Image area height */}
              
              {/* Centered content overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                {isNewShotProcessing ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                    <span className="text-sm font-medium text-primary">
                      Creating shot...
                    </span>
                  </div>
                ) : isNewShotDropTarget ? (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-green-500 animate-bounce" />
                    <span className="text-sm font-medium text-green-500">
                      {newShotDropType === 'file' ? 'Drop files to create new shot' : 'Drop to create new shot'}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="plus-icon-container flex items-center justify-center w-8 h-8 rounded-full border-2 border-dashed border-muted-foreground/50 group-hover:border-[hsl(40,55%,58%)] transition-all duration-200 group-hover:bg-[hsl(40,55%,58%,0.15)] group-hover:shadow-[0_0_16px_hsl(40,55%,58%,0.4)]">
                      <Plus className="w-4 h-4 text-muted-foreground group-hover:text-[hsl(40,55%,58%)] transition-all duration-200" />
                    </div>
                    <p className="text-muted-foreground text-center text-sm group-hover:text-[hsl(40,55%,58%)] transition-colors duration-200">
                      Create new shot
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Skeleton shot card - appears when creating new shot via drop/modal */}
          {pendingSkeletonShot && (
            <div className="p-4 border rounded-lg bg-card/50 opacity-70 animate-pulse self-start">
              {/* Header skeleton */}
              <div className="flex justify-between items-start mb-3">
                <div className="h-7 w-32 bg-muted rounded" />
                <div className="flex items-center space-x-1">
                  <div className="h-8 w-8 bg-muted rounded" />
                  <div className="h-8 w-8 bg-muted rounded" />
                  <div className="h-8 w-8 bg-muted rounded" />
                </div>
              </div>
              {/* Image grid skeleton */}
              <div className="grid grid-cols-3 gap-2 relative">
                {pendingSkeletonShot.imageCount > 0 ? (
                  <>
                    {Array.from({ length: Math.min(3, pendingSkeletonShot.imageCount) }).map((_, idx) => (
                      <div
                        key={`skeleton-img-${idx}`}
                        className="w-full aspect-square rounded border-2 border-dashed border-primary/30 bg-primary/5 flex items-center justify-center"
                      >
                        <Loader2 className="h-5 w-5 text-primary/60 animate-spin" />
                      </div>
                    ))}
                    {/* Show "Show All" badge if more than 3 images */}
                    {pendingSkeletonShot.imageCount > 3 && (
                      <div className="absolute bottom-1 right-1 text-xs bg-black/60 text-white px-2 py-0.5 rounded flex items-center gap-1">
                        Show All ({pendingSkeletonShot.imageCount})
                      </div>
                    )}
                  </>
                ) : (
                  /* Empty shot placeholder - matches VideoShotDisplay empty state */
                  <div className="col-span-3 aspect-[3/1] flex items-center justify-center text-sm text-muted-foreground border-2 border-dashed border-border rounded">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creating...
                  </div>
                )}
              </div>
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
                onFilesDrop={onFilesDropOnShot}
                initialPendingUploads={shot.id === newlyCreatedShotId ? newlyCreatedShotExpectedImages : 0}
                initialPendingBaselineNonVideoCount={shot.id === newlyCreatedShotId ? newlyCreatedShotBaselineNonVideoCount : undefined}
                onInitialPendingUploadsConsumed={shot.id === newlyCreatedShotId ? () => {
                  setNewlyCreatedShotId(null);
                  setNewlyCreatedShotExpectedImages(0);
                  setNewlyCreatedShotBaselineNonVideoCount(0);
                } : undefined}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
};

export default ShotListDisplay; 