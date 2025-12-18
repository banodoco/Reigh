import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { useListShots, useProjectImageStats } from '@/shared/hooks/useShots';
import { useProject } from '@/shared/contexts/ProjectContext';
import { Shot } from '@/types/shots';

interface ShotsContextType {
  shots: Shot[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetchShots: () => void;
  // Stats for 'all' and 'no-shot' filters
  allImagesCount?: number;
  noShotImagesCount?: number;
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

  const { data: shots, isLoading: isShotsLoading, error: shotsError, refetch } = useListShots(selectedProjectId, { maxImagesPerShot });
  
  // Load project-wide image stats
  const { data: projectStats, isLoading: isStatsLoading } = useProjectImageStats(selectedProjectId);

  const isLoading = isShotsLoading || isStatsLoading;
  const error = shotsError;

  // [ShotReorderDebug] Log shots context data changes
  React.useEffect(() => {
    console.log(`${REORDER_DEBUG_TAG} ShotsContext data updated:`, {
      selectedProjectId,
      shotsCount: shots?.length || 0,
      allImagesCount: projectStats?.allCount,
      noShotImagesCount: projectStats?.noShotCount,
      isLoading,
      error: error?.message,
      timestamp: Date.now()
    });
  }, [shots, projectStats, selectedProjectId, isLoading, error]);

  // [ShotReorderDebug] Log refetch calls
  const debugRefetch = React.useCallback(() => {
    console.log(`${REORDER_DEBUG_TAG} ShotsContext refetch called:`, {
      selectedProjectId,
      timestamp: Date.now()
    });
    return refetch();
  }, [refetch, selectedProjectId]);

  // Memoize context value to prevent unnecessary re-renders of consumers
  const value = useMemo<ShotsContextType>(() => ({
    shots,
    isLoading,
    error,
    refetchShots: debugRefetch,
    allImagesCount: projectStats?.allCount,
    noShotImagesCount: projectStats?.noShotCount,
  }), [shots, isLoading, error, debugRefetch, projectStats]);

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