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
  const { data: shots, isLoading, error, refetch } = useListShots(selectedProjectId); // Default to unlimited images

  // [ShotReorderDebug] Log shots context data changes
  React.useEffect(() => {
    console.log(`${REORDER_DEBUG_TAG} ShotsContext data updated:`, {
      selectedProjectId,
      shotsCount: shots?.length || 0,
      isLoading,
      error: error?.message,
      shotsData: shots?.map(s => ({ id: s.id, position: s.position, name: s.name })) || [],
      timestamp: Date.now()
    });
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