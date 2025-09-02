import React, { useContext } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import { Toaster as Sonner } from "@/shared/components/ui/sonner";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverlay } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useHandleExternalImageDrop, useCreateShot, useAddImageToShot } from "@/shared/hooks/useShots";
import { useShots } from '@/shared/contexts/ShotsContext';
import { NEW_GROUP_DROPPABLE_ID } from '@/shared/components/ShotsPane/NewGroupDropZone';
import { LastAffectedShotProvider, LastAffectedShotContext } from '@/shared/contexts/LastAffectedShotContext';
import { AppRoutes } from "./routes";
import { ProjectProvider, useProject } from "@/shared/contexts/ProjectContext";
import { useWebSocket } from '@/shared/hooks/useWebSocket';
import { RealtimeProvider } from '@/shared/providers/RealtimeProvider';
import { PanesProvider } from '@/shared/contexts/PanesContext';
import { CurrentShotProvider } from '@/shared/contexts/CurrentShotContext';
import { ToolPageHeaderProvider } from '@/shared/contexts/ToolPageHeaderContext';
import { ShotsProvider } from '@/shared/contexts/ShotsContext';
import { GenerationTaskProvider } from '@/shared/contexts/GenerationTaskContext';
// [MobileStallFix] Import debug utilities for console debugging
import '@/shared/lib/mobileProjectDebug';
import { initPollingDebugHelpers } from '@/shared/lib/pollingDebugHelpers';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Mobile-optimized retry strategy for network reliability
      retry: (failureCount, error) => {
        // Don't retry auth errors or client errors (4xx)
        if (error?.message?.includes('unauthorized') || error?.message?.includes('forbidden')) {
          return false;
        }
        // Retry up to 2 times for network errors (reduced from default 3 for faster UX)
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 3000), // Exponential backoff, max 3s
      // Ensure queries don't refetch on window focus by default
      refetchOnWindowFocus: false,
      // Prevent stale time issues
      staleTime: 5 * 60 * 1000, // 5 minutes
      // Enable network mode for better mobile handling
      networkMode: 'online',
    },
    mutations: {
      // Enable retries for mutations on mobile to handle network hiccups
      retry: (failureCount, error) => {
        // Don't retry auth/permission errors
        if (error?.message?.includes('unauthorized') || error?.message?.includes('forbidden')) {
          return false;
        }
        // Retry once for network errors
        return failureCount < 1;
      },
      retryDelay: 1500, // Fixed 1.5s delay for mutations
      networkMode: 'online',
    },
  },
});

// New inner component that uses the context
const AppInternalContent = () => {
  const { selectedProjectId } = useProject();
  // Initialize legacy WebSocket only if legacy listeners are enabled (temporary)
  // Note: provider now owns channels; this is gated to prevent double-subscribe
  // import at top remains; we keep this minimal for fallback

  const context = useContext(LastAffectedShotContext);
  if (!context) throw new Error("useLastAffectedShot must be used within a LastAffectedShotProvider");
  const { setLastAffectedShotId } = context;

  const { shots: shotsFromHook, isLoading: isLoadingShots } = useShots();

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
    // Initialize debug helpers for console debugging
    console.log('[DebugHelpers] Initializing polling debug helpers...');
    try {
      initPollingDebugHelpers(queryClient);
      console.log('[DebugHelpers] Debug helpers initialized successfully');
      console.log('[DebugHelpers] Try: debugPolling.inspectAllCaches("your-project-id")');
    } catch (error) {
      console.error('[DebugHelpers] Failed to initialize debug helpers:', error);
    }
    
    return () => {
    };
  }, []);

  // Foreground recovery: when tab becomes visible, aggressively recover from dead mode
  React.useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        try {
          const now = Date.now();
          const qc: any = (window as any).__REACT_QUERY_CLIENT__;
          const projectId = (window as any)?.selectedProjectId || undefined;
          console.log('[DeadModeRecovery] Tab visible - starting foreground recovery', {
            timestamp: now,
            projectId,
            hasQueryClient: !!qc
          });
          // Add DeadModeInvestigation marker for correlation
          try {
            const socket: any = (window as any)?.supabase?.realtime?.socket;
            console.warn('[DeadModeInvestigation] Visibility change -> recovery start', {
              timestamp: now,
              visibility: document.visibilityState,
              connected: socket && socket.isConnected ? socket.isConnected() : undefined,
              state: socket?.connectionState,
            });
          } catch {}

          // 1) Try realtime recovery hint via custom event
          try {
            window.dispatchEvent(new CustomEvent('realtime:visibility-recover'));
          } catch {}

          // 2) Invalidate critical task/gen queries immediately
          if (qc) {
            try {
              qc.invalidateQueries({ queryKey: ['task-status-counts'] });
              qc.invalidateQueries({ queryKey: ['tasks', 'paginated'] });
              qc.invalidateQueries({ queryKey: ['unified-generations'] });
              qc.invalidateQueries({ queryKey: ['unified-generations'] });
            } catch (e) {
              console.warn('[DeadModeRecovery] Invalidation error', e);
            }
          }

          // 3) Last-resort recovery to cancel stuck queries/mutations
          try {
            (window as any).deadMode?.recover?.();
          } catch (e) {
            console.warn('[DeadModeRecovery] deadMode.recover failed', e);
          }

          console.log('[DeadModeRecovery] Foreground recovery scheduled');
        } catch (e) {
          console.warn('[DeadModeRecovery] Foreground recovery handler error', e);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ProjectProvider>
        <RealtimeProvider>
          <ShotsProvider>
            <GenerationTaskProvider>
              <PanesProvider>
                <LastAffectedShotProvider>
                  <CurrentShotProvider>
                    <ToolPageHeaderProvider>
                      <AppInternalContent />
                    </ToolPageHeaderProvider>
                  </CurrentShotProvider>
                </LastAffectedShotProvider>
              </PanesProvider>
            </GenerationTaskProvider>
          </ShotsProvider>
        </RealtimeProvider>
      </ProjectProvider>
    </QueryClientProvider>
  );
}

export default App;
