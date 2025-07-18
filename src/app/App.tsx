import React, { useContext } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import { Toaster as Sonner } from "@/shared/components/ui/sonner";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverlay } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useHandleExternalImageDrop, useCreateShot, useAddImageToShot, useListShots } from "@/shared/hooks/useShots";
import { NEW_GROUP_DROPPABLE_ID } from '@/shared/components/ShotsPane/NewGroupDropZone';
import { LastAffectedShotProvider, LastAffectedShotContext } from '@/shared/contexts/LastAffectedShotContext';
import { AppRoutes } from "./routes";
import { ProjectProvider, useProject } from "@/shared/contexts/ProjectContext";
import { useWebSocket } from '@/shared/hooks/useWebSocket';
import { PanesProvider } from '@/shared/contexts/PanesContext';
import { CurrentShotProvider } from '@/shared/contexts/CurrentShotContext';
import { ToolPageHeaderProvider } from '@/shared/contexts/ToolPageHeaderContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Disable automatic retries to prevent observer issues
      retry: false,
      // Ensure queries don't refetch on window focus by default
      refetchOnWindowFocus: false,
      // Prevent stale time issues
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
    mutations: {
      // Disable retries for mutations too
      retry: false,
    },
  },
});

// New inner component that uses the context
const AppInternalContent = () => {
  const { selectedProjectId } = useProject();
  // Initialize WebSocket connection and listeners, scoped to the active project
  useWebSocket(selectedProjectId);

  const context = useContext(LastAffectedShotContext);
  if (!context) throw new Error("useLastAffectedShot must be used within a LastAffectedShotProvider");
  const { setLastAffectedShotId } = context;

  const { data: shotsFromHook, isLoading: isLoadingShots } = useListShots(selectedProjectId);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const createShotMutation = useCreateShot();
  const addImageToShotMutation = useAddImageToShot();
  const handleExternalImageDropMutation = useHandleExternalImageDrop();

  const [activeDragData, setActiveDragData] = React.useState<any | null>(null);
  const [dropAnimation, setDropAnimation] = React.useState(false);

  const getDisplayUrl = (relativePath: string | undefined): string => {
    if (!relativePath) return '';
    if (relativePath.startsWith('http') || relativePath.startsWith('blob:')) {
      return relativePath;
    }
    const baseUrl = import.meta.env.VITE_API_TARGET_URL || window.location.origin;
    const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const cleanRelative = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
    return `${cleanBase}/${cleanRelative}`;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveDragData(active?.data?.current || null);
    setDropAnimation(false);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!selectedProjectId) {
      return;
    }

    if (!over) {
      return;
    }

    const draggableItem = active.data.current;
    const droppableZone = over.data.current;

    if (!draggableItem || !droppableZone) {
      console.warn('Drag and drop data missing', { active, over });
      return;
    }

    const generationId = draggableItem.generationId;
    const imageUrl = draggableItem.imageUrl;
    const thumbUrl = draggableItem.thumbUrl;
    const isExternalFile = draggableItem.isExternalFile;
    const externalFile = draggableItem.externalFile;

    if (isExternalFile && externalFile) {
      if (droppableZone.type === 'new-group-zone' || droppableZone.type === 'shot-group') {
        const targetShotId = droppableZone.type === 'shot-group' ? droppableZone.shotId : null;
        const currentShotsCount = shotsFromHook?.length || 0;
        
        const result = await handleExternalImageDropMutation.mutateAsync({
            imageFiles: [externalFile], 
            targetShotId, 
            currentProjectQueryKey: selectedProjectId, 
            currentShotCount: currentShotsCount
        });

        if (result && result.shotId) {
            setLastAffectedShotId(result.shotId);
        }
        return;
      }
    }

    if (!generationId) {
      console.warn('generationId missing from draggable item', draggableItem);
      return;
    }

    console.log(`Attempting to process drop: generationId=${generationId}, droppableType=${droppableZone.type}, droppableId=${over.id}, shotId=${droppableZone.shotId}`);

    try {
      if (droppableZone.type === 'shot-group') {
        const shotId = droppableZone.shotId;
        if (!shotId) {
          console.warn('shotId missing from shot-group droppable', droppableZone);
          return;
        }
        await addImageToShotMutation.mutateAsync({ 
          shot_id: shotId, 
          generation_id: generationId,
          imageUrl: imageUrl,
          thumbUrl: thumbUrl,
          project_id: selectedProjectId,
        });
        setLastAffectedShotId(shotId);

      } else if (over.id === NEW_GROUP_DROPPABLE_ID && droppableZone.type === 'new-group-zone') {
        // Determine the next sequential shot number in the current project
        const currentShotsCount = shotsFromHook?.length ?? 0;
        const newShotName = `Shot ${currentShotsCount + 1}`;
        
        const newShot = await createShotMutation.mutateAsync({ name: newShotName, projectId: selectedProjectId });
        if (newShot && newShot.shot && newShot.shot.id) {
          await addImageToShotMutation.mutateAsync({ 
            shot_id: newShot.shot.id,
            generation_id: generationId,
            imageUrl: imageUrl,
            thumbUrl: thumbUrl,
            project_id: selectedProjectId,
          });
          setLastAffectedShotId(newShot.shot.id);
        } else {
          throw new Error('Failed to create new shot or new shot ID is missing.');
        }
      }
    } catch (error) {
      console.error('Error handling drop:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    }

    // trigger shrink/fade animation then remove overlay
    setDropAnimation(true);
    setTimeout(() => {
      setActiveDragData(null);
      setDropAnimation(false);
    }, 300);
  };

  return (
    <TooltipProvider>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <AppRoutes />
        <DragOverlay zIndex={10000} style={{ pointerEvents: 'none' }}>
          {activeDragData && activeDragData.imageUrl ? (
            (() => {
              const url = getDisplayUrl(activeDragData.imageUrl);
              const isVideo = url.match(/\.(webm|mp4|mov)$/i);
              return (
                <div className={dropAnimation ? 'animate-scale-fade' : ''} style={{ zIndex: 10000 }}>
                  {isVideo ? (
                    <video src={url} style={{ maxWidth: '200px', maxHeight: '200px' }} playsInline muted />
                  ) : (
                    <img src={url} style={{ maxWidth: '200px', maxHeight: '200px' }} alt="drag preview" />
                  )}
                </div>
              );
            })()
          ) : null}
        </DragOverlay>
        <Sonner />
      </DndContext>
    </TooltipProvider>
  );
};

function App() {
  React.useEffect(() => {
    return () => {
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ProjectProvider>
        <PanesProvider>
          <LastAffectedShotProvider>
            <CurrentShotProvider>
              <ToolPageHeaderProvider>
                <AppInternalContent />
              </ToolPageHeaderProvider>
            </CurrentShotProvider>
          </LastAffectedShotProvider>
        </PanesProvider>
      </ProjectProvider>
    </QueryClientProvider>
  );
}

export default App;
