import { useCallback, useEffect, useRef } from 'react';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import type { EditMode, LoraMode, EditAdvancedSettings } from './useGenerationEditSettings';
import { DEFAULT_ADVANCED_SETTINGS } from './useGenerationEditSettings';

// Video edit sub-mode type
export type VideoEditSubMode = 'trim' | 'replace' | 'regenerate';

// Panel mode type (Info vs Edit)
export type PanelMode = 'info' | 'edit';

/**
 * "Last used" settings - stored at user/project level, no prompt
 * Used as defaults when opening a generation for the first time
 */
export interface LastUsedEditSettings {
  editMode: EditMode;
  loraMode: LoraMode;
  customLoraUrl: string;
  numGenerations: number;
  // Img2Img specific
  img2imgStrength: number;
  img2imgEnablePromptExpansion: boolean;
  // Advanced settings for two-pass generation
  advancedSettings: EditAdvancedSettings;
  // Video edit sub-mode (trim/replace/regenerate)
  videoEditSubMode: VideoEditSubMode;
  // Panel mode (info/edit) - whether user was last viewing Info or Edit panel
  panelMode: PanelMode;
}

export const DEFAULT_LAST_USED: LastUsedEditSettings = {
  editMode: 'text',
  loraMode: 'none', // Default to no preset LoRA - use Add LoRA button instead
  customLoraUrl: '',
  numGenerations: 1,
  // Img2Img defaults
  img2imgStrength: 0.6,
  img2imgEnablePromptExpansion: false,
  // Advanced settings defaults
  advancedSettings: DEFAULT_ADVANCED_SETTINGS,
  // Video defaults
  videoEditSubMode: 'trim',
  // Panel defaults
  panelMode: 'info',
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
        const merged = { ...DEFAULT_LAST_USED, ...parsed };
        console.log('[PanelRestore] LOADED from localStorage:', { panelMode: merged.panelMode, projectId: projectId.substring(0, 8) });
        return merged;
      }

      // Fall back to global (for new projects)
      const globalStored = localStorage.getItem(STORAGE_KEY_GLOBAL);
      if (globalStored) {
        const parsed = JSON.parse(globalStored);
        const merged = { ...DEFAULT_LAST_USED, ...parsed };
        console.log('[PanelRestore] LOADED from GLOBAL localStorage (fallback):', { panelMode: merged.panelMode });
        return merged;
      }

      console.log('[PanelRestore] No localStorage found, using defaults:', { panelMode: DEFAULT_LAST_USED.panelMode });
    } catch (e) {
      console.warn('[EDIT_DEBUG] ❌ LAST-USED LOAD: Failed to read localStorage:', e);
    }
    
    return DEFAULT_LAST_USED;
  }, [projectId]);
  
  // Use ref for current value to avoid re-render on every access
  const currentValueRef = useRef<LastUsedEditSettings>(getLocalStorageValue());
  
  // Reset on project change
  useEffect(() => {
    if (projectId !== lastProjectIdRef.current) {
      console.log('[EDIT_DEBUG] 🔄 LAST-USED: Project changed');
      console.log('[EDIT_DEBUG] 🔄 LAST-USED: from:', lastProjectIdRef.current?.substring(0, 8) || 'none');
      console.log('[EDIT_DEBUG] 🔄 LAST-USED: to:', projectId?.substring(0, 8) || 'none');
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

      console.log('[PanelRestore] Synced from DB:', { panelMode: merged.panelMode });
      
      // Update localStorage with DB values
      try {
        localStorage.setItem(STORAGE_KEY_PROJECT(projectId), JSON.stringify(merged));
        localStorage.setItem(STORAGE_KEY_GLOBAL, JSON.stringify(merged));
      } catch (e) {
        console.warn('[EDIT_DEBUG] ❌ LAST-USED SYNC: Failed to sync to localStorage:', e);
      }
    }
  }, [isDbLoading, dbSettings, projectId]);
  
  // Update all storage locations
  const updateLastUsed = useCallback((updates: Partial<LastUsedEditSettings>) => {
    const prev = currentValueRef.current;
    const merged = { ...prev, ...updates };

    // If nothing actually changed, don't write (prevents save loops)
    // IMPORTANT: Check ALL fields in LastUsedEditSettings, not just a subset
    const advancedSettingsChanged =
      JSON.stringify(prev.advancedSettings) !== JSON.stringify(merged.advancedSettings);

    if (
      prev.editMode === merged.editMode &&
      prev.loraMode === merged.loraMode &&
      prev.customLoraUrl === merged.customLoraUrl &&
      prev.numGenerations === merged.numGenerations &&
      prev.img2imgStrength === merged.img2imgStrength &&
      prev.img2imgEnablePromptExpansion === merged.img2imgEnablePromptExpansion &&
      prev.videoEditSubMode === merged.videoEditSubMode &&
      prev.panelMode === merged.panelMode &&
      !advancedSettingsChanged
    ) {
      console.log('[EDIT_DEBUG] 💾 LAST-USED SAVE: No changes detected, skipping save');
      return;
    }

    currentValueRef.current = merged;

    // Only log panelMode changes for PanelRestore debugging
    if (prev.panelMode !== merged.panelMode) {
      console.log('[PanelRestore] PERSISTING to localStorage:', { panelMode: merged.panelMode });
    }

    // 1. Update localStorage (instant for next time)
    try {
      if (projectId) {
        localStorage.setItem(STORAGE_KEY_PROJECT(projectId), JSON.stringify(merged));
      }
      localStorage.setItem(STORAGE_KEY_GLOBAL, JSON.stringify(merged));
    } catch (e) {
      console.warn('[PanelRestore] Failed to save to localStorage:', e);
    }

    // 2. Update database (cross-device sync)
    // Save at user level only - "last used" is a personal preference, not project-specific
    void updateDbSettings('user', merged).catch(() => {
      // Swallow to avoid spam - useToolSettings handles errors
    });
  }, [projectId, updateDbSettings]);
  
  return {
    lastUsed: currentValueRef.current,
    updateLastUsed,
    isLoading: isDbLoading && !hasSyncedFromDbRef.current,
  };
}

