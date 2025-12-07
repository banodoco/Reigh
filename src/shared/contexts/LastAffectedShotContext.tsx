import React, { createContext, useState, ReactNode, useCallback, useMemo, useEffect, useRef } from 'react';
import { useProject } from './ProjectContext';
import { useToolSettings } from '@/shared/hooks/useToolSettings';

interface LastAffectedShotContextType {
  lastAffectedShotId: string | null;
  setLastAffectedShotId: React.Dispatch<React.SetStateAction<string | null>>;
}

export const LastAffectedShotContext = createContext<LastAffectedShotContextType | undefined>(undefined);

interface LastAffectedShotSettings {
  lastAffectedShotId?: string | null;
}

/**
 * Provider for tracking the last shot that content was added to.
 * Persists to database via useToolSettings for cross-device sync.
 */
export const LastAffectedShotProvider = ({ children }: { children: ReactNode }) => {
  const { selectedProjectId } = useProject();
  const [lastAffectedShotId, setLastAffectedShotIdInternal] = useState<string | null>(null);
  
  // Track if we've loaded from settings to prevent re-loading
  const hasLoadedFromSettings = useRef(false);
  const prevProjectIdRef = useRef<string | null>(null);

  // Use database persistence via useToolSettings (syncs across devices)
  const { 
    settings, 
    update: updateSettings,
    isLoading 
  } = useToolSettings<LastAffectedShotSettings>('last-affected-shot', { 
    projectId: selectedProjectId,
    enabled: !!selectedProjectId 
  });

  // Reset loaded flag when project changes
  useEffect(() => {
    if (prevProjectIdRef.current !== selectedProjectId) {
      hasLoadedFromSettings.current = false;
      prevProjectIdRef.current = selectedProjectId;
    }
  }, [selectedProjectId]);

  // Load from database settings when available
  useEffect(() => {
    if (isLoading || hasLoadedFromSettings.current) return;
    
    const stored = settings?.lastAffectedShotId;
    hasLoadedFromSettings.current = true;
    
    if (stored) {
      setLastAffectedShotIdInternal(stored);
    } else {
      // Clear state when switching to a project without stored value
      setLastAffectedShotIdInternal(null);
    }
  }, [settings?.lastAffectedShotId, isLoading]);

  // Memoize the setter that also persists to database
  const setLastAffectedShotId = useCallback((shotIdOrUpdater: React.SetStateAction<string | null>) => {
    setLastAffectedShotIdInternal(prev => {
      const newValue = typeof shotIdOrUpdater === 'function' 
        ? shotIdOrUpdater(prev) 
        : shotIdOrUpdater;
      
      // Persist to database (project scope for cross-device sync)
      if (selectedProjectId) {
        updateSettings('project', { lastAffectedShotId: newValue });
      }
      
      return newValue;
    });
  }, [selectedProjectId, updateSettings]);

  const value = useMemo(
    () => ({ lastAffectedShotId, setLastAffectedShotId }),
    [lastAffectedShotId, setLastAffectedShotId]
  );

  return (
    <LastAffectedShotContext.Provider value={value}>
      {children}
    </LastAffectedShotContext.Provider>
  );
}; 