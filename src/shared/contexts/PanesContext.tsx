import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
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
  const [isGenerationsPaneLocked, setIsGenerationsPaneLocked] = useState(false);
  const [generationsPaneHeight, setGenerationsPaneHeight] = useState(350);

  const [isShotsPaneLocked, setIsShotsPaneLocked] = useState(false);
  const [shotsPaneWidth, setShotsPaneWidth] = useState(300);

  const [isTasksPaneLocked, setIsTasksPaneLocked] = useState(false);
  const [tasksPaneWidth, setTasksPaneWidth] = useState(350);

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

  const { settings: persistedSettings, isLoading: isLoadingSettings, update } = useToolSettings<PaneLockSettings>('pane-locks', userId);

  useEffect(() => {
    if (!isLoadingSettings && persistedSettings) {
      if (persistedSettings.isGenerationsPaneLocked !== undefined) {
        setIsGenerationsPaneLocked(persistedSettings.isGenerationsPaneLocked);
      }
      if (persistedSettings.isShotsPaneLocked !== undefined) {
        setIsShotsPaneLocked(persistedSettings.isShotsPaneLocked);
      }
      if (persistedSettings.isTasksPaneLocked !== undefined) {
        setIsTasksPaneLocked(persistedSettings.isTasksPaneLocked);
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

  const value = {
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
  };

  return <PanesContext.Provider value={value}>{children}</PanesContext.Provider>;
};

export const usePanes = () => {
  const context = useContext(PanesContext);
  if (context === undefined) {
    throw new Error('usePanes must be used within a PanesProvider');
  }
  return context;
}; 