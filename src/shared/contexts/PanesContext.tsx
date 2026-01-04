import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { useIsMobile, useIsTablet } from '@/shared/hooks/use-mobile';
import { PANE_CONFIG } from '@/shared/config/panes';
import { updateToolSettingsSupabase } from '@/shared/hooks/useToolSettings';
import { supabase } from '@/integrations/supabase/client';

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

  // Reset all pane locks (used by ProductTour)
  resetAllPaneLocks: () => void;
}

const PanesContext = createContext<PanesContextType | undefined>(undefined);

export const PanesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  
  // On tablets, allow locking but only one pane at a time
  // On phones (mobile but not tablet), no locking allowed
  const isSmallMobile = isMobile && !isTablet;
  
  // Load pane locks from user settings (desktop and tablet)
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

  // Hydrate local state once when settings load (desktop and tablet)
  useEffect(() => {
    if (isSmallMobile) {
      // On small mobile (phones), always start with unlocked state
      setLocks({
        shots: false,
        tasks: false,
        gens: false,
      });
      return;
    }

    if (!isLoading) {
      // Hydrating pane locks from server (desktop and tablet)
      // On tablets, only keep one lock if multiple are saved
      if (isTablet) {
        const activeLocks = Object.entries(paneLocks).filter(([_, locked]) => locked);
        if (activeLocks.length > 1) {
          // Keep only the first locked pane on tablets
          const firstLocked = activeLocks[0][0] as 'shots' | 'tasks' | 'gens';
          setLocks({
            shots: firstLocked === 'shots',
            tasks: firstLocked === 'tasks',
            gens: firstLocked === 'gens',
          });
        } else {
          setLocks(paneLocks);
        }
      } else {
        setLocks(paneLocks);
      }
    }
  }, [isLoading, paneLocks, isSmallMobile, isTablet]);

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
  // On tablets, locking one pane unlocks all others (only one lock allowed at a time)
  const setIsGenerationsPaneLocked = useCallback((isLocked: boolean) => {
    setLocks(prev => {
      if (prev.gens === isLocked) return prev;
      
      // On mobile/tablets, unlock other panes when locking this one (only one pane can be locked at a time)
      const newLocks = (isMobile || isTablet) && isLocked
        ? { shots: false, tasks: false, gens: isLocked }
        : { ...prev, gens: isLocked };
      
      // Save to database (desktop and tablet only, not small phones)
      if (!isSmallMobile) {
        savePaneLocks((isMobile || isTablet) && isLocked ? newLocks : { gens: isLocked });
      }
      
      return newLocks;
    });
  }, [savePaneLocks, isSmallMobile, isMobile, isTablet]);

  const setIsShotsPaneLocked = useCallback((isLocked: boolean) => {
    setLocks(prev => {
      if (prev.shots === isLocked) return prev;
      
      // On mobile/tablets, unlock other panes when locking this one (only one pane can be locked at a time)
      const newLocks = (isMobile || isTablet) && isLocked
        ? { shots: isLocked, tasks: false, gens: false }
        : { ...prev, shots: isLocked };
      
      // Save to database (desktop and tablet only, not small phones)
      if (!isSmallMobile) {
        savePaneLocks((isMobile || isTablet) && isLocked ? newLocks : { shots: isLocked });
      }
      
      return newLocks;
    });
  }, [savePaneLocks, isSmallMobile, isMobile, isTablet]);

  const setIsTasksPaneLocked = useCallback((isLocked: boolean) => {
    setLocks(prev => {
      if (prev.tasks === isLocked) return prev;
      
      // On mobile/tablets, unlock other panes when locking this one (only one pane can be locked at a time)
      const newLocks = (isMobile || isTablet) && isLocked
        ? { shots: false, tasks: isLocked, gens: false }
        : { ...prev, tasks: isLocked };
      
      // Save to database (desktop and tablet only, not small phones)
      if (!isSmallMobile) {
        savePaneLocks((isMobile || isTablet) && isLocked ? newLocks : { tasks: isLocked });
      }
      
      return newLocks;
    });
  }, [savePaneLocks, isSmallMobile, isMobile, isTablet]);

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

  // Reset all pane locks immediately (used by ProductTour)
  // This updates local state, useUserUIState value, and database without debounce
  const resetAllPaneLocks = useCallback(async () => {
    const unlockedState = { shots: false, tasks: false, gens: false };

    // Update local locks state immediately
    setLocks(unlockedState);

    // Update the useUserUIState local value (prevents sync effect from restoring old value)
    savePaneLocks(unlockedState);

    // Also save to database immediately (no debounce) for reliability
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await updateToolSettingsSupabase({
          scope: 'user',
          id: user.id,
          toolId: 'ui',
          patch: { paneLocks: unlockedState },
        }, undefined, 'immediate');
        console.log('[PanesContext] All pane locks reset in database');
      }
    } catch (error) {
      console.error('[PanesContext] Error resetting pane locks in database:', error);
    }
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
      // Return actual lock state for all device types (mobile locking is now supported)
      isGenerationsPaneLocked: locks.gens,
      setIsGenerationsPaneLocked,
      isGenerationsPaneOpen: isGenerationsPaneOpenState,
      setIsGenerationsPaneOpen,
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
      activeTaskId,
      setActiveTaskId,
      isTasksPaneOpen: isTasksPaneOpenState,
      setIsTasksPaneOpen,
      resetAllPaneLocks,
    }),
    [
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
      resetAllPaneLocks,
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