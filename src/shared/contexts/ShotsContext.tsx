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
  const { selectedProjectId } = useProject();
  const { data: shots, isLoading, error, refetch } = useListShots(selectedProjectId); // Default to unlimited images

  const value: ShotsContextType = {
    shots,
    isLoading,
    error,
    refetchShots: refetch,
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