import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { deepEqual } from '@/shared/lib/deepEqual';
import { supabase } from '@/integrations/supabase/client';

/**
 * Options for configuring the tool page settings hook
 */
export interface UseToolPageSettingsOptions {
  /** How long to wait before auto-saving after a change (ms). Default: 300ms */
  debounceMs?: number;
  /** Whether to enable detailed debug logging */
  debug?: boolean;
  /** Custom debug tag for logs */
  debugTag?: string;
  /** Callback when save completes successfully */
  onSaveSuccess?: () => void;
  /** Callback when save fails */
  onSaveError?: (error: Error) => void;
}

/**
 * Return type for the tool page settings hook
 */
export interface UseToolPageSettingsReturn<T> {
  // State
  settings: T;
  status: 'idle' | 'loading' | 'ready' | 'saving' | 'error';
  isDirty: boolean;
  error: Error | null;
  
  // Field Updates
  updateField: <K extends keyof T>(key: K, value: T[K]) => void;
  updateFields: (updates: Partial<T>) => void;
  
  // Saving
  save: () => Promise<void>;
  saveImmediate: (settingsToSave?: T) => Promise<void>;
  revert: () => void;
  
  // Utilities
  reset: (newDefaults?: T) => void;
}

/**
 * Generic hook for managing tool page settings with:
 * - Debounced auto-save
 * - Deep equality checks to prevent unnecessary saves
 * - Smart sync between DB and local state
 * - Dirty tracking
 * - Loading states
 * - Error handling
 * 
 * @example
 * // Project-level settings
 * const settings = useToolPageSettings<JoinClipsSettings>(
 *   'join-clips',
 *   'project',
 *   selectedProjectId,
 *   DEFAULT_JOIN_CLIPS_SETTINGS
 * );
 * 
 * @example
 * // Shot-level settings
 * const settings = useToolPageSettings<VideoTravelSettings>(
 *   'travel-between-images',
 *   'shot',
 *   selectedShotId,
 *   DEFAULT_VIDEO_TRAVEL_SETTINGS
 * );
 */
export function useToolPageSettings<T extends Record<string, any>>(
  toolId: string,
  scope: 'shot' | 'project',
  scopeId: string | null | undefined,
  defaultSettings: T,
  options: UseToolPageSettingsOptions = {}
): UseToolPageSettingsReturn<T> {
  const {
    debounceMs = 300,
    debug = false,
    debugTag = `[useToolPageSettings:${toolId}]`,
    onSaveSuccess,
    onSaveError,
  } = options;
  
  // Local state - single source of truth
  const [settings, setSettings] = useState<T>(defaultSettings);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'saving' | 'error'>('idle');
  const [error, setError] = useState<Error | null>(null);
  
  // Track original loaded settings for dirty checking
  const loadedSettingsRef = useRef<T | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentScopeIdRef = useRef<string | null>(null);
  const pendingSettingsRef = useRef<T | null>(null);
  const isUserEditingRef = useRef<boolean>(false);
  
  // Fetch settings from database
  const { 
    settings: dbSettings, 
    isLoading,
    update: updateSettings 
  } = useToolSettings<T>(
    toolId,
    { 
      [scope === 'shot' ? 'shotId' : 'projectId']: scopeId || null,
      enabled: !!scopeId 
    }
  );
  
  // Dirty flag - has user changed anything since load?
  const isDirty = useMemo(() => 
    !deepEqual(settings, loadedSettingsRef.current),
    [settings]
  );
  
  // Flush pending saves when scope changes (e.g., switching shots/projects)
  useEffect(() => {
    if (scopeId !== currentScopeIdRef.current) {
      const previousScopeId = currentScopeIdRef.current;
      
      if (debug) {
        console.log(`${debugTag} 🔄 Scope changed from`, previousScopeId?.substring(0, 8), 'to', scopeId?.substring(0, 8));
      }
      
      // CRITICAL: Save any pending changes to the OLD scope before switching
      if (previousScopeId && saveTimeoutRef.current && pendingSettingsRef.current) {
        if (debug) {
          console.log(`${debugTag} 💾 Flushing pending save to OLD scope:`, previousScopeId.substring(0, 8));
        }
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        
        const settingsToFlush = pendingSettingsRef.current;
        const oldLoadedSettings = loadedSettingsRef.current;
        
        // Only save if there are actual changes
        if (!deepEqual(settingsToFlush, oldLoadedSettings)) {
          // CRITICAL: Save directly to Supabase with the OLD scope ID
          // We cannot use updateSettings here because it has the NEW scopeId in its closure
          (async () => {
            try {
              const table = scope === 'shot' ? 'shots' : 'projects';
              const { data: currentRecord, error: fetchError } = await supabase
                .from(table)
                .select('settings')
                .eq('id', previousScopeId)
                .single();
              
              if (fetchError) {
                console.error(`${debugTag} Failed to fetch old ${scope} settings:`, fetchError);
                return;
              }
              
              const currentSettings = (currentRecord?.settings as any) ?? {};
              const updatedSettings = {
                ...currentSettings,
                [toolId]: settingsToFlush
              };
              
              const { error: updateError } = await supabase
                .from(table)
                .update({ settings: updatedSettings })
                .eq('id', previousScopeId);
              
              if (updateError) {
                console.error(`${debugTag} Failed to flush save:`, updateError);
              } else if (debug) {
                console.log(`${debugTag} ✅ Flush successful for previous ${scope}`);
              }
            } catch (err) {
              console.error(`${debugTag} Failed to flush save:`, err);
            }
          })();
        }
        
        pendingSettingsRef.current = null;
      }
      
      // Reset state for new scope
      currentScopeIdRef.current = scopeId || null;
      isUserEditingRef.current = false;
      
      // Reset to defaults until new settings load
      if (!scopeId) {
        setSettings(defaultSettings);
        loadedSettingsRef.current = null;
        setStatus('idle');
      }
    }
  }, [scopeId, scope, toolId, debug, debugTag, defaultSettings]);
  
  // Sync DB → Local (only when not actively editing)
  useEffect(() => {
    if (isLoading) {
      setStatus('loading');
      return;
    }
    
    // User is actively editing - don't overwrite their changes
    if (isUserEditingRef.current) {
      if (debug) {
        console.log(`${debugTag} 🔒 User editing - skipping DB sync to prevent overwrites`);
      }
      return;
    }
    
    // Load settings from DB
    if (dbSettings) {
      // Only update if actually different (avoid unnecessary re-renders)
      if (!deepEqual(settings, dbSettings)) {
        if (debug) {
          console.log(`${debugTag} 📥 Loading settings from DB:`, dbSettings);
        }
        setSettings(dbSettings);
        loadedSettingsRef.current = JSON.parse(JSON.stringify(dbSettings));
      }
    } else if (scopeId) {
      // Scope exists but no settings - use defaults
      if (!deepEqual(settings, defaultSettings)) {
        if (debug) {
          console.log(`${debugTag} 📥 No DB settings found, using defaults`);
        }
        setSettings(defaultSettings);
        loadedSettingsRef.current = JSON.parse(JSON.stringify(defaultSettings));
      }
    }
    
    setStatus('ready');
    setError(null);
    
  }, [scopeId, isLoading, dbSettings, defaultSettings, debug, debugTag]);
  
  // Save implementation
  const saveImmediate = useCallback(async (settingsToSave?: T) => {
    if (!scopeId) {
      if (debug) {
        console.warn(`${debugTag} Cannot save - no ${scope} selected`);
      }
      return;
    }
    
    // Get latest settings if not provided
    let toSave = settingsToSave;
    if (!toSave) {
      // Use promise to get absolute latest state
      toSave = await new Promise<T>((resolve) => {
        setSettings(current => {
          resolve(current);
          return current; // Don't modify
        });
      });
    }
    
    // Don't save if nothing changed
    if (deepEqual(toSave, loadedSettingsRef.current)) {
      if (debug) {
        console.log(`${debugTag} ⏭️ Skipping save - no changes detected`);
      }
      return;
    }
    
    if (debug) {
      console.log(`${debugTag} 💾 Saving settings to database for ${scope}:`, scopeId.substring(0, 8));
    }
    
    setStatus('saving');
    
    try {
      await updateSettings(scope, toSave);
      
      // Update our "clean" reference
      loadedSettingsRef.current = JSON.parse(JSON.stringify(toSave));
      setStatus('ready');
      setError(null);
      
      // Clear editing flag after successful save
      isUserEditingRef.current = false;
      
      if (debug) {
        console.log(`${debugTag} ✅ Save successful`);
      }
      
      onSaveSuccess?.();
    } catch (err) {
      console.error(`${debugTag} ❌ Save failed:`, err);
      setStatus('error');
      setError(err as Error);
      onSaveError?.(err as Error);
      throw err;
    }
  }, [scopeId, scope, updateSettings, debug, debugTag, onSaveSuccess, onSaveError]);
  
  // Update single field with debounced save
  const updateField = useCallback(<K extends keyof T>(
    key: K, 
    value: T[K]
  ) => {
    // Clear existing debounce timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Update local state immediately (optimistic update)
    setSettings(prev => {
      const updated = { ...prev, [key]: value };
      pendingSettingsRef.current = updated;
      return updated;
    });
    
    // Mark as actively editing
    isUserEditingRef.current = true;
    
    if (debug) {
      console.log(`${debugTag} 📝 Field updated:`, key, '=', value);
    }
    
    // Schedule debounced save
    saveTimeoutRef.current = setTimeout(() => {
      if (debug) {
        console.log(`${debugTag} ⏰ Debounce timeout expired, saving...`);
      }
      saveImmediate().catch(err => {
        console.error(`${debugTag} Debounced save failed:`, err);
      });
    }, debounceMs);
  }, [debounceMs, saveImmediate, debug, debugTag]);
  
  // Update multiple fields with debounced save
  const updateFields = useCallback((updates: Partial<T>) => {
    // Clear existing debounce timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Update local state immediately (optimistic update)
    setSettings(prev => {
      const updated = { ...prev, ...updates };
      pendingSettingsRef.current = updated;
      return updated;
    });
    
    // Mark as actively editing
    isUserEditingRef.current = true;
    
    if (debug) {
      console.log(`${debugTag} 📝 Multiple fields updated:`, Object.keys(updates));
    }
    
    // Schedule debounced save
    saveTimeoutRef.current = setTimeout(() => {
      if (debug) {
        console.log(`${debugTag} ⏰ Debounce timeout expired, saving...`);
      }
      saveImmediate().catch(err => {
        console.error(`${debugTag} Debounced save failed:`, err);
      });
    }, debounceMs);
  }, [debounceMs, saveImmediate, debug, debugTag]);
  
  // Manual save (flushes debounce immediately)
  const save = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    await saveImmediate();
  }, [saveImmediate]);
  
  // Revert to last saved state
  const revert = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    
    if (loadedSettingsRef.current) {
      if (debug) {
        console.log(`${debugTag} ↩️ Reverting to last saved state`);
      }
      setSettings(loadedSettingsRef.current);
      pendingSettingsRef.current = null;
      isUserEditingRef.current = false;
    }
  }, [debug, debugTag]);
  
  // Reset to defaults (or provided settings)
  const reset = useCallback((newDefaults?: T) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    
    const resetTo = newDefaults || defaultSettings;
    if (debug) {
      console.log(`${debugTag} 🔄 Resetting to defaults`);
    }
    
    setSettings(resetTo);
    loadedSettingsRef.current = JSON.parse(JSON.stringify(resetTo));
    pendingSettingsRef.current = null;
    isUserEditingRef.current = false;
  }, [defaultSettings, debug, debugTag]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);
  
  return {
    settings,
    status,
    isDirty,
    error,
    updateField,
    updateFields,
    save,
    saveImmediate,
    revert,
    reset,
  };
}

