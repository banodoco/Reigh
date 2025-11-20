import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { PANE_CONFIG } from '@/shared/config/panes';

interface PanesContextType {
  isGenerationsPaneLocked: boolean;
  setIsGenerationsPaneLocked: (isLocked: boolean) => void;
  isGenerationsPaneOpen: boolean;
  setIsGenerationsPaneOpen: (isOpen: boolean) => void;
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
  
  // Active task tracking for highlighting
  activeTaskId: string | null;
  setActiveTaskId: (taskId: string | null) => void;
  
  // Programmatic tasks pane control (desktop only)
  isTasksPaneOpen: boolean;
  setIsTasksPaneOpen: (isOpen: boolean) => void;
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

  // Pane open states (not persisted, runtime only)
  const [isGenerationsPaneOpenState, setIsGenerationsPaneOpenState] = useState(false);
  const [isTasksPaneOpenState, setIsTasksPaneOpenState] = useState(false);

  // Pane dimensions (not persisted)
  const [generationsPaneHeight, setGenerationsPaneHeightState] = useState<number>(PANE_CONFIG.dimensions.DEFAULT_HEIGHT);
  const [shotsPaneWidth, setShotsPaneWidthState] = useState<number>(PANE_CONFIG.dimensions.DEFAULT_WIDTH);
  const [tasksPaneWidth, setTasksPaneWidthState] = useState<number>(PANE_CONFIG.dimensions.DEFAULT_WIDTH);
  
  // Active task tracking (not persisted)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

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
      // Hydrating pane locks from server
      setLocks(paneLocks);
    }
  }, [isLoading, paneLocks, isMobile]);

  // Lock toggle functions
  const toggleLock = useCallback((pane: 'shots' | 'tasks' | 'gens') => {
    setLocks(prev => {
      const newValue = !prev[pane];
      const newLocks = { ...prev, [pane]: newValue };
      
      // Toggling pane lock
      
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

  // Open state setters
  const setIsGenerationsPaneOpen = useCallback((isOpen: boolean) => {
    setIsGenerationsPaneOpenState(isOpen);
  }, []);
  
  const setIsTasksPaneOpen = useCallback((isOpen: boolean) => {
    // Only works on desktop - mobile uses hover/tap behavior
    if (!isMobile) {
      setIsTasksPaneOpenState(isOpen);
    }
  }, [isMobile]);

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
      isGenerationsPaneOpen: isGenerationsPaneOpenState,
      setIsGenerationsPaneOpen,
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
      activeTaskId,
      setActiveTaskId,
      isTasksPaneOpen: isTasksPaneOpenState,
      setIsTasksPaneOpen,
    }),
    [
      isMobile,
      locks.gens,
      locks.shots,
      locks.tasks,
      setIsGenerationsPaneLocked,
      setIsShotsPaneLocked,
      setIsTasksPaneLocked,
      isGenerationsPaneOpenState,
      setIsGenerationsPaneOpen,
      generationsPaneHeight,
      setGenerationsPaneHeight,
      shotsPaneWidth,
      setShotsPaneWidth,
      tasksPaneWidth,
      setTasksPaneWidth,
      activeTaskId,
      setActiveTaskId,
      isTasksPaneOpenState,
      setIsTasksPaneOpen,
    ]
  );

  return (
    <PanesContext.Provider value={value}>
      {children}
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