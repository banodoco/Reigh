import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { VideoTravelSettings, DEFAULT_PHASE_CONFIG } from '../settings';
import { deepEqual } from '@/shared/lib/deepEqual';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DEFAULT_STEERABLE_MOTION_SETTINGS } from '../components/ShotEditor/state/types';

// Default settings for new shots
const DEFAULT_SETTINGS: VideoTravelSettings = {
  videoControlMode: 'batch',
  batchVideoPrompt: '',
  batchVideoFrames: 60,
  batchVideoContext: 10,
  batchVideoSteps: 6,
  steerableMotionSettings: DEFAULT_STEERABLE_MOTION_SETTINGS,
  enhancePrompt: false,
  autoCreateIndividualPrompts: true,
  turboMode: false,
  amountOfMotion: 50,
  advancedMode: false,
  phaseConfig: undefined,
  generationMode: 'batch',
  pairConfigs: [],
};

export interface UseShotSettingsReturn {
  // State
  settings: VideoTravelSettings;
  status: 'idle' | 'loading' | 'ready' | 'saving' | 'error';
  isDirty: boolean;
  error: Error | null;
  
  // Field Updates
  updateField: <K extends keyof VideoTravelSettings>(
    key: K, 
    value: VideoTravelSettings[K]
  ) => void;
  
  updateFields: (updates: Partial<VideoTravelSettings>) => void;
  
  // Operations
  applyShotSettings: (sourceShotId: string) => Promise<void>;
  applyProjectDefaults: () => Promise<void>;
  resetToDefaults: () => void;
  
  // Saving
  save: () => Promise<void>;
  saveImmediate: () => Promise<void>;
  revert: () => void;
}

export const useShotSettings = (
  shotId: string | null | undefined,
  projectId: string | null | undefined
): UseShotSettingsReturn => {
  // Local state - single source of truth
  const [settings, setSettings] = useState<VideoTravelSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'saving' | 'error'>('idle');
  const [error, setError] = useState<Error | null>(null);
  
  // Track original loaded settings for dirty checking
  const loadedSettingsRef = useRef<VideoTravelSettings | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentShotIdRef = useRef<string | null>(null);
  const pendingSettingsRef = useRef<VideoTravelSettings | null>(null); // Track pending changes for flush
  const isUserEditingRef = useRef<boolean>(false); // Track if user is actively editing to prevent overwrites
  
  // Fetch settings from database
  const { 
    settings: dbSettings, 
    isLoading,
    update: updateSettings 
  } = useToolSettings<VideoTravelSettings>(
    'travel-between-images',
    { 
      shotId: shotId || null,
      enabled: !!shotId 
    }
  );
  
  // Dirty flag - has user changed anything since load?
  const isDirty = useMemo(() => 
    !deepEqual(settings, loadedSettingsRef.current),
    [settings]
  );
  
  // Flush pending saves when shot changes - runs BEFORE settings load
  useEffect(() => {
    if (!shotId) {
      setStatus('idle');
      return;
    }
    
    const previousShotId = currentShotIdRef.current;
    
    // Flush pending saves when shot changes
    if (previousShotId && previousShotId !== shotId) {
      console.log('[useShotSettings] 🔄 Shot changed, flushing pending saves:', {
        from: previousShotId.substring(0, 8),
        to: shotId.substring(0, 8),
        hasPendingSave: !!saveTimeoutRef.current,
        hasPendingSettings: !!pendingSettingsRef.current
      });
      
      // If there's a pending save, execute it immediately for the OLD shot
      if (saveTimeoutRef.current && pendingSettingsRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        
        const settingsToFlush = pendingSettingsRef.current;
        const oldLoadedSettings = loadedSettingsRef.current;
        
        // Only save if there are actual changes
        if (!deepEqual(settingsToFlush, oldLoadedSettings)) {
          console.log('[useShotSettings] 💾 Flushing unsaved changes for previous shot:', {
            previousShotId: previousShotId.substring(0, 8),
            advancedMode: settingsToFlush.advancedMode,
            hasPhaseConfig: !!settingsToFlush.phaseConfig,
            selectedPhasePresetId: settingsToFlush.selectedPhasePresetId
          });
          
          // CRITICAL: Save directly to Supabase using previousShotId to avoid cross-shot contamination
          // We cannot use updateSettings here because it has the NEW shotId in its closure
          (async () => {
            try {
              const { data: currentShot, error: fetchError } = await supabase
                .from('shots')
                .select('settings')
                .eq('id', previousShotId)
                .single();
              
              if (fetchError) {
                console.error('[useShotSettings] Failed to fetch old shot settings:', fetchError);
                return;
              }
              
              const currentSettings = (currentShot?.settings as any) ?? {};
              const updatedSettings = {
                ...currentSettings,
                'travel-between-images': settingsToFlush
              };
              
              const { error: updateError } = await supabase
                .from('shots')
                .update({ settings: updatedSettings })
                .eq('id', previousShotId);
              
              if (updateError) {
                console.error('[useShotSettings] Failed to flush save:', updateError);
              } else {
                console.log('[useShotSettings] ✅ Flush successful for previous shot');
              }
            } catch (err) {
              console.error('[useShotSettings] Failed to flush save:', err);
            }
          })();
        }
        
        pendingSettingsRef.current = null;
      }
      
      currentShotIdRef.current = shotId;
      setStatus('loading');
    } else if (!previousShotId) {
      // First load
      currentShotIdRef.current = shotId;
      setStatus('loading');
    }
  }, [shotId]); // Removed updateSettings dependency since we save directly to Supabase
  
  // Loading flow - when settings are fetched
  useEffect(() => {
    if (!shotId) {
      return;
    }
    
    if (isLoading) {
      setStatus('loading');
      return;
    }
    
    // FIX: Don't overwrite user's changes while they're actively editing or have pending saves
    // NOTE: With optimistic cache updates, this protection is now less critical since saves
    // no longer trigger automatic refetches. However, it's still valuable for manual invalidations.
    if (isUserEditingRef.current || saveTimeoutRef.current !== null || pendingSettingsRef.current !== null) {
      console.log('[useShotSettings] ⚠️ Skipping load - user is actively editing or has pending changes');
      return;
    }
    
    // Load settings into state - deep clone to prevent reference sharing across shots!
    const loadedSettings: VideoTravelSettings = {
      ...DEFAULT_SETTINGS,
      ...(dbSettings || {}),
      // Ensure nested objects are properly initialized
      steerableMotionSettings: {
        ...DEFAULT_STEERABLE_MOTION_SETTINGS,
        ...(dbSettings?.steerableMotionSettings || {}),
      },
    };
    
    // Deep clone to prevent React Query cache reference sharing
    const deepClonedSettings = JSON.parse(JSON.stringify(loadedSettings));
    
    console.log('[EnhancePromptDebug] [useShotSettings] 📥 Loading settings from database:', {
      shotId: shotId.substring(0, 8),
      enhancePrompt: deepClonedSettings.enhancePrompt,
      autoCreateIndividualPrompts: deepClonedSettings.autoCreateIndividualPrompts,
      advancedMode: deepClonedSettings.advancedMode,
      hasPhaseConfig: !!deepClonedSettings.phaseConfig,
      phaseConfig: deepClonedSettings.phaseConfig,
      batchVideoPrompt: deepClonedSettings.batchVideoPrompt?.substring(0, 50) + (deepClonedSettings.batchVideoPrompt?.length > 50 ? '...' : ''),
      dbSettings_raw: dbSettings
    });
    
    setSettings(deepClonedSettings);
    loadedSettingsRef.current = JSON.parse(JSON.stringify(deepClonedSettings));
    setStatus('ready');
    setError(null);
    
  }, [shotId, isLoading, dbSettings]);
  
  // Save implementation
  const saveImmediate = useCallback(async (settingsToSave?: VideoTravelSettings) => {
    if (!shotId) {
      console.warn('[useShotSettings] Cannot save - no shot selected');
      return;
    }
    
    // FIX: If no settings provided, get latest from state via functional update
    let toSave = settingsToSave;
    if (!toSave) {
      // Use a promise to get the absolute latest state
      toSave = await new Promise<VideoTravelSettings>((resolve) => {
        setSettings(current => {
          resolve(current);
          return current; // Don't modify, just read
        });
      });
    }
    
    // Don't save if nothing changed
    if (deepEqual(toSave, loadedSettingsRef.current)) {
      console.log('[useShotSettings] ⏭️ Skipping save - no changes');
      return;
    }
    
    console.log('[EnhancePromptDebug] [useShotSettings] 💾 Saving settings to database:', {
      shotId: shotId.substring(0, 8),
      enhancePrompt: toSave.enhancePrompt,
      autoCreateIndividualPrompts: toSave.autoCreateIndividualPrompts,
      advancedMode: toSave.advancedMode,
      hasPhaseConfig: !!toSave.phaseConfig,
      phaseConfigLoras: toSave.phaseConfig?.phases?.map(p => ({
        phase: p.phase,
        lorasCount: p.loras?.length
      })),
      batchVideoPrompt: toSave.batchVideoPrompt?.substring(0, 50) + (toSave.batchVideoPrompt?.length > 50 ? '...' : '')
    });
    
    setStatus('saving');
    
    try {
      await updateSettings('shot', toSave);
      
      // Update our "clean" reference
      loadedSettingsRef.current = JSON.parse(JSON.stringify(toSave));
      setStatus('ready');
      setError(null);
      
      // Clear editing flag after successful save
      isUserEditingRef.current = false;
      
      console.log('[useShotSettings] ✅ Save successful');
    } catch (err) {
      console.error('[useShotSettings] ❌ Save failed:', err);
      setStatus('error');
      setError(err as Error);
      throw err;
    }
  }, [shotId, updateSettings]);
  
  // Update single field
  const updateField = useCallback(<K extends keyof VideoTravelSettings>(
    key: K,
    value: VideoTravelSettings[K]
  ) => {
    console.log('[EnhancePromptDebug] [useShotSettings] 📝 Field updated:', { 
      key, 
      value: key === 'batchVideoPrompt' && typeof value === 'string' ? value.substring(0, 50) : value,
      isEnhancePrompt: key === 'enhancePrompt',
      isAutoCreateIndividualPrompts: key === 'autoCreateIndividualPrompts'
    });
    
    // Mark that user is actively editing
    isUserEditingRef.current = true;
    
    setSettings(prev => {
      const updated = { ...prev, [key]: value };
      
      // Handle special case: when turning on advancedMode, initialize phaseConfig
      if (key === 'advancedMode' && value === true && !updated.phaseConfig) {
        updated.phaseConfig = DEFAULT_PHASE_CONFIG;
      }
      
      // Track pending settings for flush-on-navigation
      pendingSettingsRef.current = updated;
      
      // Auto-save with debounce
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        saveImmediate(updated);
        pendingSettingsRef.current = null; // Clear after save
      }, 300);
      
      return updated;
    });
  }, [saveImmediate]);
  
  // Update multiple fields at once
  const updateFields = useCallback((updates: Partial<VideoTravelSettings>) => {
    console.log('[EnhancePromptDebug] [useShotSettings] 📝 Multiple fields updated:', { 
      keys: Object.keys(updates),
      enhancePrompt: updates.enhancePrompt,
      autoCreateIndividualPrompts: updates.autoCreateIndividualPrompts,
      batchVideoPrompt: updates.batchVideoPrompt ? (typeof updates.batchVideoPrompt === 'string' ? updates.batchVideoPrompt.substring(0, 50) : updates.batchVideoPrompt) : undefined
    });
    
    // Mark that user is actively editing
    isUserEditingRef.current = true;
    
    setSettings(prev => {
      const updated = { ...prev, ...updates };
      
      // Track pending settings for flush-on-navigation
      pendingSettingsRef.current = updated;
      
      // Trigger auto-save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        saveImmediate(updated);
        pendingSettingsRef.current = null; // Clear after save
      }, 300);
      
      return updated;
    });
  }, [saveImmediate]);
  
  // Public debounced save
  const save = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    return saveImmediate();
  }, [saveImmediate]);
  
  // Apply settings from another shot
  const applyShotSettings = useCallback(async (sourceShotId: string) => {
    if (!shotId || !sourceShotId) {
      toast.error('Cannot apply settings: missing shot ID');
      return;
    }
    
    console.log('[useShotSettings] 🔀 Applying settings from shot:', sourceShotId.substring(0, 8));
    setStatus('loading');
    
    try {
      // Fetch source shot settings
      const { data, error: fetchError } = await supabase
        .from('shots')
        .select('settings')
        .eq('id', sourceShotId)
        .single();
      
      if (fetchError) throw fetchError;
      
      const sourceSettings = (data?.settings as any)?.['travel-between-images'] as VideoTravelSettings;
      
      if (sourceSettings) {
        // Deep clone to prevent reference issues
        const cloned: VideoTravelSettings = JSON.parse(JSON.stringify(sourceSettings));
        
        setSettings(cloned);
        
        // Save immediately (no debounce for explicit operations)
        await saveImmediate(cloned);
      } else {
        toast.error('Source shot has no settings');
        setStatus('ready');
      }
    } catch (err) {
      console.error('[useShotSettings] Apply failed:', err);
      toast.error('Failed to apply settings');
      setStatus('error');
      setError(err as Error);
    }
  }, [shotId, saveImmediate]);
  
  // Apply project defaults
  const applyProjectDefaults = useCallback(async () => {
    if (!projectId) {
      toast.error('Cannot apply defaults: no project selected');
      return;
    }
    
    console.log('[useShotSettings] 🔀 Applying project defaults');
    setStatus('loading');
    
    try {
      const { data, error: fetchError } = await supabase
        .from('projects')
        .select('settings')
        .eq('id', projectId)
        .single();
      
      if (fetchError) throw fetchError;
      
      const projectDefaults = (data?.settings as any)?.['travel-between-images'] as VideoTravelSettings;
      
      if (projectDefaults) {
        const cloned: VideoTravelSettings = JSON.parse(JSON.stringify(projectDefaults));
        setSettings(cloned);
        await saveImmediate(cloned);
      } else {
        toast.error('Project has no default settings');
        setStatus('ready');
      }
    } catch (err) {
      console.error('[useShotSettings] Apply defaults failed:', err);
      toast.error('Failed to apply defaults');
      setStatus('error');
      setError(err as Error);
    }
  }, [projectId, saveImmediate]);
  
  // Reset to hardcoded defaults
  const resetToDefaults = useCallback(() => {
    console.log('[useShotSettings] 🔄 Resetting to defaults');
    const defaults = { ...DEFAULT_SETTINGS };
    setSettings(defaults);
    toast.info('Settings reset to defaults (not saved yet)');
  }, []);
  
  // Revert unsaved changes
  const revert = useCallback(() => {
    if (loadedSettingsRef.current) {
      console.log('[useShotSettings] ↩️ Reverting changes');
      setSettings(JSON.parse(JSON.stringify(loadedSettingsRef.current)));
      toast.info('Changes reverted');
    }
  }, []);
  
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
    applyShotSettings,
    applyProjectDefaults,
    resetToDefaults,
    save,
    saveImmediate,
    revert,
  };
};

