import React, { createContext, useContext, ReactNode } from 'react';
import { useListShots } from '@/shared/hooks/useShots';
import { useProject } from '@/shared/contexts/ProjectContext';
import { Shot } from '@/types/shots';

interface ShotsContextType {
  shots: Shot[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetchShots: () => void;
}

const ShotsContext = createContext<ShotsContextType | undefined>(undefined);

interface ShotsProviderProps {
  children: ReactNode;
}

export const ShotsProvider: React.FC<ShotsProviderProps> = ({ children }) => {
  // [ShotReorderDebug] Debug tag for shot reordering issues
  const REORDER_DEBUG_TAG = '[ShotReorderDebug]';
  
  const { selectedProjectId } = useProject();

  // Load all images per shot (0 = unlimited)
  // Previously limited to 2 on mobile for performance, but this broke expand/collapse UI
  const maxImagesPerShot = 0;

  const { data: shots, isLoading, error, refetch } = useListShots(selectedProjectId, { maxImagesPerShot });

  // [ShotReorderDebug] Log shots context data changes
  React.useEffect(() => {
    console.log(`${REORDER_DEBUG_TAG} ShotsContext data updated:`, {
      selectedProjectId,
      shotsCount: shots?.length || 0,
      isLoading,
      error: error?.message,
      shotsData: shots?.map(s => ({ 
        id: s.id.substring(0, 8), 
        position: s.position, 
        name: s.name,
        imagesCount: s.images?.length || 0,
        hasImages: !!s.images && s.images.length > 0
      })) || [],
      timestamp: Date.now()
    });
    
    // [ShotImageDebug] Log detailed image data for first few shots
    if (shots && shots.length > 0) {
      console.log('[ShotImageDebug] First 3 shots with image details:', 
        shots.slice(0, 3).map(shot => ({
          shotId: shot.id.substring(0, 8),
          shotName: shot.name,
          imagesCount: shot.images?.length || 0,
          sampleImages: shot.images?.slice(0, 2).map(img => ({
            id: img.id, // shot_generations.id
            hasImageUrl: !!img.imageUrl,
            hasThumbUrl: !!img.thumbUrl,
            hasLocation: !!img.location,
            type: img.type,
            timeline_frame: (img as any).timeline_frame
          })) || []
        }))
      );
    }
  }, [shots, selectedProjectId, isLoading, error]);

  // [ShotReorderDebug] Log refetch calls
  const debugRefetch = React.useCallback(() => {
    console.log(`${REORDER_DEBUG_TAG} ShotsContext refetch called:`, {
      selectedProjectId,
      timestamp: Date.now()
    });
    return refetch();
  }, [refetch, selectedProjectId]);

  const value: ShotsContextType = {
    shots,
    isLoading,
    error,
    refetchShots: debugRefetch,
  };

  return (
    <ShotsContext.Provider value={value}>
      {children}
    </ShotsContext.Provider>
  );
};

export const useShots = (): ShotsContextType => {
  const context = useContext(ShotsContext);
  if (context === undefined) {
    throw new Error('useShots must be used within a ShotsProvider');
  }
  return context;
}; 