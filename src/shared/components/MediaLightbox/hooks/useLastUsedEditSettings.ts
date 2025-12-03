import { useCallback, useEffect, useRef } from 'react';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import type { EditMode, LoraMode } from './useGenerationEditSettings';

/**
 * "Last used" settings - stored at user/project level, no prompt
 * Used as defaults when opening a generation for the first time
 */
export interface LastUsedEditSettings {
  editMode: EditMode;
  loraMode: LoraMode;
  customLoraUrl: string;
  numGenerations: number;
}

export const DEFAULT_LAST_USED: LastUsedEditSettings = {
  editMode: 'text',
  loraMode: 'in-scene',
  customLoraUrl: '',
  numGenerations: 4,
};

// localStorage keys for instant access (no loading delay)
const STORAGE_KEY_PROJECT = (projectId: string) => `lightbox-edit-last-used-${projectId}`;
const STORAGE_KEY_GLOBAL = 'lightbox-edit-last-used-global';

export interface UseLastUsedEditSettingsReturn {
  lastUsed: LastUsedEditSettings;
  updateLastUsed: (settings: Partial<LastUsedEditSettings>) => void;
  isLoading: boolean;
}

interface UseLastUsedEditSettingsProps {
  projectId: string | null;
  enabled?: boolean;
}

/**
 * Hook for managing "last used" edit settings
 * 
 * Storage strategy (following shotSettingsInheritance pattern):
 * 1. localStorage (project-specific) - instant access
 * 2. localStorage (global) - fallback for new projects
 * 3. useToolSettings (user → project) - cross-device sync
 * 
 * On update: saves to all locations
 * On load: localStorage first (instant), then syncs from DB
 */
export function useLastUsedEditSettings({
  projectId,
  enabled = true,
}: UseLastUsedEditSettingsProps): UseLastUsedEditSettingsReturn {
  
  // Database storage via useToolSettings (cascades: user → project)
  const { 
    settings: dbSettings, 
    isLoading: isDbLoading,
    update: updateDbSettings,
  } = useToolSettings<LastUsedEditSettings>('lightbox-edit', { 
    projectId: projectId || undefined,
    enabled: enabled && !!projectId,
  });
  
  // Track if we've synced from DB yet
  const hasSyncedFromDbRef = useRef(false);
  const lastProjectIdRef = useRef<string | null>(null);
  
  // Get instant localStorage value (for zero-delay loading)
  const getLocalStorageValue = useCallback((): LastUsedEditSettings => {
    if (!projectId) return DEFAULT_LAST_USED;
    
    try {
      // Try project-specific first
      const projectStored = localStorage.getItem(STORAGE_KEY_PROJECT(projectId));
      if (projectStored) {
        const parsed = JSON.parse(projectStored);
        console.log('[EditSettingsPersist] 📥 LAST-USED LOAD: From project localStorage');
        console.log('[EditSettingsPersist] 📥 LAST-USED LOAD: projectId:', projectId.substring(0, 8));
        console.log('[EditSettingsPersist] 📥 LAST-USED LOAD: editMode:', parsed.editMode);
        console.log('[EditSettingsPersist] 📥 LAST-USED LOAD: loraMode:', parsed.loraMode);
        return { ...DEFAULT_LAST_USED, ...parsed };
      }
      
      // Fall back to global (for new projects)
      const globalStored = localStorage.getItem(STORAGE_KEY_GLOBAL);
      if (globalStored) {
        const parsed = JSON.parse(globalStored);
        console.log('[EditSettingsPersist] 📥 LAST-USED LOAD: From GLOBAL localStorage (new project fallback)');
        console.log('[EditSettingsPersist] 📥 LAST-USED LOAD: editMode:', parsed.editMode);
        console.log('[EditSettingsPersist] 📥 LAST-USED LOAD: loraMode:', parsed.loraMode);
        return { ...DEFAULT_LAST_USED, ...parsed };
      }
      
      console.log('[EditSettingsPersist] ⚠️ LAST-USED LOAD: No localStorage found, using defaults');
    } catch (e) {
      console.warn('[EditSettingsPersist] ❌ LAST-USED LOAD: Failed to read localStorage:', e);
    }
    
    return DEFAULT_LAST_USED;
  }, [projectId]);
  
  // Use ref for current value to avoid re-render on every access
  const currentValueRef = useRef<LastUsedEditSettings>(getLocalStorageValue());
  
  // Reset on project change
  useEffect(() => {
    if (projectId !== lastProjectIdRef.current) {
      console.log('[EditSettingsPersist] 🔄 LAST-USED: Project changed');
      console.log('[EditSettingsPersist] 🔄 LAST-USED: from:', lastProjectIdRef.current?.substring(0, 8) || 'none');
      console.log('[EditSettingsPersist] 🔄 LAST-USED: to:', projectId?.substring(0, 8) || 'none');
      lastProjectIdRef.current = projectId;
      hasSyncedFromDbRef.current = false;
      currentValueRef.current = getLocalStorageValue();
    }
  }, [projectId, getLocalStorageValue]);
  
  // Sync from DB when loaded (DB is source of truth for cross-device)
  useEffect(() => {
    if (!isDbLoading && dbSettings && !hasSyncedFromDbRef.current && projectId) {
      hasSyncedFromDbRef.current = true;
      
      // Merge DB settings (may have newer values from other device)
      const merged = { ...currentValueRef.current, ...dbSettings };
      currentValueRef.current = merged;
      
      console.log('[EditSettingsPersist] 🔄 LAST-USED SYNC: Synced from DB to localStorage');
      console.log('[EditSettingsPersist] 🔄 LAST-USED SYNC: editMode:', merged.editMode);
      console.log('[EditSettingsPersist] 🔄 LAST-USED SYNC: loraMode:', merged.loraMode);
      
      // Update localStorage with DB values
      try {
        localStorage.setItem(STORAGE_KEY_PROJECT(projectId), JSON.stringify(merged));
        localStorage.setItem(STORAGE_KEY_GLOBAL, JSON.stringify(merged));
      } catch (e) {
        console.warn('[EditSettingsPersist] ❌ LAST-USED SYNC: Failed to sync to localStorage:', e);
      }
    }
  }, [isDbLoading, dbSettings, projectId]);
  
  // Update all storage locations
  const updateLastUsed = useCallback((updates: Partial<LastUsedEditSettings>) => {
    const merged = { ...currentValueRef.current, ...updates };
    currentValueRef.current = merged;
    
    console.log('[EditSettingsPersist] 💾 LAST-USED SAVE: Updating "last used" settings');
    console.log('[EditSettingsPersist] 💾 LAST-USED SAVE: editMode:', merged.editMode);
    console.log('[EditSettingsPersist] 💾 LAST-USED SAVE: loraMode:', merged.loraMode);
    console.log('[EditSettingsPersist] 💾 LAST-USED SAVE: numGenerations:', merged.numGenerations);
    console.log('[EditSettingsPersist] 💾 LAST-USED SAVE: customLoraUrl:', merged.customLoraUrl || '(empty)');
    
    // 1. Update localStorage (instant for next time)
    try {
      if (projectId) {
        localStorage.setItem(STORAGE_KEY_PROJECT(projectId), JSON.stringify(merged));
        console.log('[EditSettingsPersist] 💾 LAST-USED SAVE: Saved to project localStorage');
      }
      localStorage.setItem(STORAGE_KEY_GLOBAL, JSON.stringify(merged));
      console.log('[EditSettingsPersist] 💾 LAST-USED SAVE: Saved to global localStorage');
    } catch (e) {
      console.warn('[EditSettingsPersist] ❌ LAST-USED SAVE: Failed to save to localStorage:', e);
    }
    
    // 2. Update database (cross-device sync)
    // Save at user level (persists across projects)
    console.log('[EditSettingsPersist] 💾 LAST-USED SAVE: Saving to DB (user level)');
    updateDbSettings('user', merged);
    
    // Also save at project level (overrides user for this project)
    if (projectId) {
      console.log('[EditSettingsPersist] 💾 LAST-USED SAVE: Saving to DB (project level)');
      updateDbSettings('project', merged);
    }
  }, [projectId, updateDbSettings]);
  
  return {
    lastUsed: currentValueRef.current,
    updateLastUsed,
    isLoading: isDbLoading && !hasSyncedFromDbRef.current,
  };
}

