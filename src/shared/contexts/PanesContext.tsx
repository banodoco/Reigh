import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { Loading } from '@/shared/components/ui/loading';
import { useIsMobile } from '@/shared/hooks/use-mobile';

interface PanesContextType {
  isGenerationsPaneLocked: boolean;
  setIsGenerationsPaneLocked: (isLocked: boolean) => void;
  generationsPaneHeight: number;
  setGenerationsPaneHeight: (height: number) => void;

  isShotsPaneLocked: boolean;
  setIsShotsPaneLocked: (isLocked: boolean) => void;
  shotsPaneWidth: number;
  setShotsPaneWidth: (width: number) => void;

  isTasksPaneLocked: boolean;
  setIsTasksPaneLocked: (isLocked: boolean) => void;
  tasksPaneWidth: number;
  setTasksPaneWidth: (width: number) => void;
}

const PanesContext = createContext<PanesContextType | undefined>(undefined);

export const PanesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const isMobile = useIsMobile();
  
  // Load pane locks from user settings (desktop only)
  const { value: paneLocks, update: savePaneLocks, isLoading } = useUserUIState('paneLocks', {
    shots: false,
    tasks: false,
    gens: false,
  });

  // Local state for lock status (source of truth for UI)
  const [locks, setLocks] = useState(paneLocks);

  // Pane dimensions (not persisted)
  const [generationsPaneHeight, setGenerationsPaneHeightState] = useState(350);
  const [shotsPaneWidth, setShotsPaneWidthState] = useState(300);
  const [tasksPaneWidth, setTasksPaneWidthState] = useState(300);

  // Hydrate local state once when settings load (desktop only)
  useEffect(() => {
    if (isMobile) {
      // On mobile, always start with unlocked state
      setLocks({
        shots: false,
        tasks: false,
        gens: false,
      });
      return;
    }

    if (!isLoading) {
      console.log('[PanesContext] Hydrating pane locks from server:', paneLocks);
      setLocks(paneLocks);
    }
  }, [isLoading, paneLocks, isMobile]);

  // Lock toggle functions
  const toggleLock = useCallback((pane: 'shots' | 'tasks' | 'gens') => {
    setLocks(prev => {
      const newValue = !prev[pane];
      const newLocks = { ...prev, [pane]: newValue };
      
      console.log(`[PanesContext] Toggling ${pane} lock to ${newValue}`);
      
      // Save to database only on desktop
      if (!isMobile) {
        savePaneLocks({ [pane]: newValue });
      }
      
      return newLocks;
    });
  }, [savePaneLocks, isMobile]);

  // Individual setters for backward compatibility
  const setIsGenerationsPaneLocked = useCallback((isLocked: boolean) => {
    setLocks(prev => {
      if (prev.gens === isLocked) return prev;
      const newLocks = { ...prev, gens: isLocked };
      
      // Save to database only on desktop
      if (!isMobile) {
        savePaneLocks({ gens: isLocked });
      }
      
      return newLocks;
    });
  }, [savePaneLocks, isMobile]);

  const setIsShotsPaneLocked = useCallback((isLocked: boolean) => {
    setLocks(prev => {
      if (prev.shots === isLocked) return prev;
      const newLocks = { ...prev, shots: isLocked };
      
      // Save to database only on desktop
      if (!isMobile) {
        savePaneLocks({ shots: isLocked });
      }
      
      return newLocks;
    });
  }, [savePaneLocks, isMobile]);

  const setIsTasksPaneLocked = useCallback((isLocked: boolean) => {
    setLocks(prev => {
      if (prev.tasks === isLocked) return prev;
      const newLocks = { ...prev, tasks: isLocked };
      
      // Save to database only on desktop
      if (!isMobile) {
        savePaneLocks({ tasks: isLocked });
      }
      
      return newLocks;
    });
  }, [savePaneLocks, isMobile]);

  // Dimension setters
  const setGenerationsPaneHeight = useCallback((height: number) => {
    setGenerationsPaneHeightState(height);
  }, []);

  const setShotsPaneWidth = useCallback((width: number) => {
    setShotsPaneWidthState(width);
  }, []);

  const setTasksPaneWidth = useCallback((width: number) => {
    setTasksPaneWidthState(width);
  }, []);

  const value = useMemo(
    () => ({
      // On mobile, always return false for locks
      isGenerationsPaneLocked: isMobile ? false : locks.gens,
      setIsGenerationsPaneLocked,
      generationsPaneHeight,
      setGenerationsPaneHeight,
      isShotsPaneLocked: isMobile ? false : locks.shots,
      setIsShotsPaneLocked,
      shotsPaneWidth,
      setShotsPaneWidth,
      isTasksPaneLocked: isMobile ? false : locks.tasks,
      setIsTasksPaneLocked,
      tasksPaneWidth,
      setTasksPaneWidth,
    }),
    [
      isMobile,
      locks.gens,
      locks.shots,
      locks.tasks,
      setIsGenerationsPaneLocked,
      setIsShotsPaneLocked,
      setIsTasksPaneLocked,
      generationsPaneHeight,
      setGenerationsPaneHeight,
      shotsPaneWidth,
      setShotsPaneWidth,
      tasksPaneWidth,
      setTasksPaneWidth,
    ]
  );

  return (
    <PanesContext.Provider value={value}>
      {(isLoading && !isMobile) ? (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <Loading size="lg" />
        </div>
      ) : (
        children
      )}
    </PanesContext.Provider>
  );
};

export const usePanes = () => {
  const context = useContext(PanesContext);
  if (context === undefined) {
    throw new Error('usePanes must be used within a PanesProvider');
  }
  return context;
}; 