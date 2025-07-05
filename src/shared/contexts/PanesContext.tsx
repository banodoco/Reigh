import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { useUserUIState } from '@/shared/hooks/useUserUIState';

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
  // Load pane locks from user settings
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

  // Hydrate local state once when settings load
  useEffect(() => {
    if (!isLoading) {
      console.log('[PanesContext] Hydrating pane locks from server:', paneLocks);
      setLocks(paneLocks);
    }
  }, [isLoading, paneLocks]);

  // Lock toggle functions
  const toggleLock = useCallback((pane: 'shots' | 'tasks' | 'gens') => {
    setLocks(prev => {
      const newValue = !prev[pane];
      const newLocks = { ...prev, [pane]: newValue };
      
      console.log(`[PanesContext] Toggling ${pane} lock to ${newValue}`);
      
      // Save to database (debounced)
      savePaneLocks({ [pane]: newValue });
      
      return newLocks;
    });
  }, [savePaneLocks]);

  // Individual setters for backward compatibility
  const setIsGenerationsPaneLocked = useCallback((isLocked: boolean) => {
    setLocks(prev => {
      if (prev.gens === isLocked) return prev;
      const newLocks = { ...prev, gens: isLocked };
      savePaneLocks({ gens: isLocked });
      return newLocks;
    });
  }, [savePaneLocks]);

  const setIsShotsPaneLocked = useCallback((isLocked: boolean) => {
    setLocks(prev => {
      if (prev.shots === isLocked) return prev;
      const newLocks = { ...prev, shots: isLocked };
      savePaneLocks({ shots: isLocked });
      return newLocks;
    });
  }, [savePaneLocks]);

  const setIsTasksPaneLocked = useCallback((isLocked: boolean) => {
    setLocks(prev => {
      if (prev.tasks === isLocked) return prev;
      const newLocks = { ...prev, tasks: isLocked };
      savePaneLocks({ tasks: isLocked });
      return newLocks;
    });
  }, [savePaneLocks]);

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
      isGenerationsPaneLocked: locks.gens,
      setIsGenerationsPaneLocked,
      generationsPaneHeight,
      setGenerationsPaneHeight,
      isShotsPaneLocked: locks.shots,
      setIsShotsPaneLocked,
      shotsPaneWidth,
      setShotsPaneWidth,
      isTasksPaneLocked: locks.tasks,
      setIsTasksPaneLocked,
      tasksPaneWidth,
      setTasksPaneWidth,
    }),
    [
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

  return <PanesContext.Provider value={value}>{children}</PanesContext.Provider>;
};

export const usePanes = () => {
  const context = useContext(PanesContext);
  if (context === undefined) {
    throw new Error('usePanes must be used within a PanesProvider');
  }
  return context;
}; 