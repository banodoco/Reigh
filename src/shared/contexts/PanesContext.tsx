import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToolSettings } from '@/shared/hooks/useToolSettings';

interface PaneLockSettings {
  isGenerationsPaneLocked?: boolean;
  isShotsPaneLocked?: boolean;
  isTasksPaneLocked?: boolean;
}

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
  const [isGenerationsPaneLocked, setIsGenerationsPaneLockedState] = useState(false);
  const [generationsPaneHeight, setGenerationsPaneHeightState] = useState(350);

  const [isShotsPaneLocked, setIsShotsPaneLockedState] = useState(false);
  const [shotsPaneWidth, setShotsPaneWidthState] = useState(300);

  const [isTasksPaneLocked, setIsTasksPaneLockedState] = useState(false);
  const [tasksPaneWidth, setTasksPaneWidthState] = useState(350);

  const [userId, setUserId] = useState<string | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const { settings: persistedSettings, isLoading: isLoadingSettings, update } = useToolSettings<PaneLockSettings>('pane-locks');

  useEffect(() => {
    if (!isLoadingSettings && persistedSettings) {
      if (persistedSettings.isGenerationsPaneLocked !== undefined) {
        setIsGenerationsPaneLockedState(persistedSettings.isGenerationsPaneLocked);
      }
      if (persistedSettings.isShotsPaneLocked !== undefined) {
        setIsShotsPaneLockedState(persistedSettings.isShotsPaneLocked);
      }
      if (persistedSettings.isTasksPaneLocked !== undefined) {
        setIsTasksPaneLockedState(persistedSettings.isTasksPaneLocked);
      }
    }
  }, [isLoadingSettings, persistedSettings]);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isLoadingSettings || !userId) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const patch: PaneLockSettings = {
        isGenerationsPaneLocked,
        isShotsPaneLocked,
        isTasksPaneLocked,
      };
      update('user', patch);
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [isGenerationsPaneLocked, isShotsPaneLocked, isTasksPaneLocked, isLoadingSettings, userId, update]);

  // Memoize setters to prevent re-creation on every render
  const setIsGenerationsPaneLocked = useCallback((isLocked: boolean) => {
    setIsGenerationsPaneLockedState(isLocked);
  }, []);

  const setGenerationsPaneHeight = useCallback((height: number) => {
    setGenerationsPaneHeightState(height);
  }, []);

  const setIsShotsPaneLocked = useCallback((isLocked: boolean) => {
    setIsShotsPaneLockedState(isLocked);
  }, []);

  const setShotsPaneWidth = useCallback((width: number) => {
    setShotsPaneWidthState(width);
  }, []);

  const setIsTasksPaneLocked = useCallback((isLocked: boolean) => {
    setIsTasksPaneLockedState(isLocked);
  }, []);

  const setTasksPaneWidth = useCallback((width: number) => {
    setTasksPaneWidthState(width);
  }, []);

  const value = useMemo(
    () => ({
      isGenerationsPaneLocked,
      setIsGenerationsPaneLocked,
      generationsPaneHeight,
      setGenerationsPaneHeight,
      isShotsPaneLocked,
      setIsShotsPaneLocked,
      shotsPaneWidth,
      setShotsPaneWidth,
      isTasksPaneLocked,
      setIsTasksPaneLocked,
      tasksPaneWidth,
      setTasksPaneWidth,
    }),
    [
      isGenerationsPaneLocked,
      setIsGenerationsPaneLocked,
      generationsPaneHeight,
      setGenerationsPaneHeight,
      isShotsPaneLocked,
      setIsShotsPaneLocked,
      shotsPaneWidth,
      setShotsPaneWidth,
      isTasksPaneLocked,
      setIsTasksPaneLocked,
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