import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToolSettings, updateToolSettingsSupabase } from '@/shared/hooks/useToolSettings';
import { VideoTravelSettings, DEFAULT_PHASE_CONFIG } from '../settings';
import { STORAGE_KEYS } from '../storageKeys';
import { deepEqual } from '@/shared/lib/deepEqual';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DEFAULT_STEERABLE_MOTION_SETTINGS } from '../components/ShotEditor/state/types';

// Default settings for new shots
const DEFAULT_SETTINGS: VideoTravelSettings = {
  videoControlMode: 'batch',
  batchVideoPrompt: '',
  batchVideoFrames: 60,
  batchVideoSteps: 6,
  steerableMotionSettings: DEFAULT_STEERABLE_MOTION_SETTINGS,
  enhancePrompt: false,
  turboMode: false,
  amountOfMotion: 50,
  motionMode: 'basic',  // Must be included to prevent reset during loading
  advancedMode: false,
  phaseConfig: undefined,
  generationMode: 'timeline',
  pairConfigs: [],
  selectedLoras: [], // LoRAs now synced with all other settings
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
  // Query client for cache invalidation
  const queryClient = useQueryClient();
  
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
  const justAppliedInheritedSettingsRef = useRef<boolean>(false); // Prevent DB load from overwriting inherited settings
  
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

  // Persist last active settings to localStorage for inheritance
  // This allows new shots to inherit from the *currently edited* shot, not just the last created one
  // We save to both project-specific AND global keys for cross-project inheritance
  useEffect(() => {
    if (shotId && projectId && status === 'ready' && settings) {
        try {
          // Save to project-specific key (for same-project inheritance)
          const projectStorageKey = STORAGE_KEYS.LAST_ACTIVE_SHOT_SETTINGS(projectId);
          localStorage.setItem(projectStorageKey, JSON.stringify(settings));
          
          // Also save to global key (for cross-project inheritance when creating first shot in new project)
          // Exclude pairConfigs as they're shot-specific and don't make sense cross-project
          const globalSettings = { ...settings, pairConfigs: [] };
          localStorage.setItem(STORAGE_KEYS.GLOBAL_LAST_ACTIVE_SHOT_SETTINGS, JSON.stringify(globalSettings));
          
          console.log('[ShotSettingsInherit] 💾 Saved active settings to localStorage (project + global)', { 
            shotId: shotId.substring(0, 8),
            prompt: settings.batchVideoPrompt?.substring(0, 20),
            generationMode: settings.generationMode,
            motionMode: settings.motionMode
          });
        } catch (e) {
          console.error('Failed to save settings to localStorage', e);
        }
    }
  }, [settings, shotId, projectId, status]);
  
  // Flush pending saves when shot changes - runs BEFORE settings load
  useEffect(() => {
    if (!shotId) {
      // When shotId becomes null (e.g., modal closes), flush any pending saves first
      const previousShotId = currentShotIdRef.current;
      
      // Only log if there's actually something to flush (reduces spam from rapid remounts)
      if (previousShotId || pendingSettingsRef.current) {
        console.log('[VTDebug] 🚪 shotId became null (modal closing?):', {
          previousShotId: previousShotId?.substring(0, 8),
          hasPendingSave: !!saveTimeoutRef.current,
          hasPendingSettings: !!pendingSettingsRef.current,
          pendingMotionMode: pendingSettingsRef.current?.motionMode,
          timestamp: Date.now()
        });
      }
      
      if (previousShotId && pendingSettingsRef.current) {
        // Clear the timeout if exists
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        
        const settingsToFlush = pendingSettingsRef.current;
        const oldLoadedSettings = loadedSettingsRef.current;
        
        // Only save if there are actual changes
        if (!deepEqual(settingsToFlush, oldLoadedSettings)) {
          // Save directly to Supabase
          (async () => {
            try {
              const { data: currentShot, error: fetchError } = await supabase
                .from('shots')
                .select('settings')
                .eq('id', previousShotId)
                .single();
              
              if (fetchError) {
                console.error('[useShotSettings] Failed to fetch shot settings for flush:', fetchError);
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
                console.error('[useShotSettings] Failed to flush save on modal close:', updateError);
              } else {
                console.log('[VTDebug] ✅ Modal close flush successful:', {
                  previousShotId: previousShotId.substring(0, 8),
                  motionMode: settingsToFlush.motionMode,
                  timestamp: Date.now()
                });
                // CRITICAL: Invalidate the React Query cache so ShotEditor loads fresh data
                queryClient.invalidateQueries({ 
                  queryKey: ['toolSettings', 'travel-between-images'],
                  refetchType: 'all'
                });
              }
            } catch (err) {
              console.error('[useShotSettings] Failed to flush save on modal close:', err);
            }
          })();
        }
      }
      
      // Reset all refs when shotId becomes null
      // This ensures proper re-initialization when shotId becomes valid again
      setStatus('idle');
      currentShotIdRef.current = null;
      isUserEditingRef.current = false;
      pendingSettingsRef.current = null;
      justAppliedInheritedSettingsRef.current = false;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
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
          
          // [VTDebug] Log motionMode being flushed
          console.log('[VTDebug] 💾 Flushing motionMode:', {
            previousShotId: previousShotId.substring(0, 8),
            motionMode: settingsToFlush.motionMode,
            advancedMode: settingsToFlush.advancedMode,
            oldMotionMode: oldLoadedSettings?.motionMode,
            timestamp: Date.now()
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
                // Invalidate cache so if user navigates back, they get fresh data
                queryClient.invalidateQueries({ 
                  queryKey: ['toolSettings', 'travel-between-images'],
                  refetchType: 'all'
                });
              }
            } catch (err) {
              console.error('[useShotSettings] Failed to flush save:', err);
            }
          })();
        }
        
        pendingSettingsRef.current = null;
      }
      
      // 🔧 FIX: Clear editing flags when shot changes to allow new shot's settings to load
      // This prevents "settings bleeding" where the old shot's settings persist in state
      console.log('[useShotSettings] 🧹 Clearing editing flags for shot change');
      isUserEditingRef.current = false;
      pendingSettingsRef.current = null;
      justAppliedInheritedSettingsRef.current = false; // Reset inherited settings flag on shot change
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      
      currentShotIdRef.current = shotId;
      setStatus('loading');
    } else if (!previousShotId) {
      // First load
      currentShotIdRef.current = shotId;
      justAppliedInheritedSettingsRef.current = false; // Reset on first load too
      setStatus('loading');
    }
  }, [shotId]); // Removed updateSettings dependency since we save directly to Supabase
  
  // Loading flow - when settings are fetched
  useEffect(() => {
    if (!shotId) {
      return;
    }

    // Check for one-time initialization from session storage (for new shots created with inheritance)
    if (typeof window !== 'undefined') {
      const storageKey = STORAGE_KEYS.APPLY_PROJECT_DEFAULTS(shotId);
      const storedDefaults = sessionStorage.getItem(storageKey);
      
      console.log('[ShotSettingsInherit] 🔍 useShotSettings checking sessionStorage for:', shotId.substring(0, 8));
      console.log('[ShotSettingsInherit] storageKey:', storageKey);
      console.log('[ShotSettingsInherit] storedDefaults:', storedDefaults ? 'FOUND' : 'NOT FOUND');
      
      if (storedDefaults) {
        console.log('[ShotSettingsInherit] 📦 Found session storage defaults for new shot:', shotId.substring(0, 8));
        console.log('[ShotSettingsInherit] Raw storedDefaults (first 500 chars):', storedDefaults.substring(0, 500));
        
        try {
          const defaults = JSON.parse(storedDefaults);
          console.log('[ShotSettingsInherit] Parsed defaults keys:', Object.keys(defaults));
          console.log('[ShotSettingsInherit] defaults.motionMode:', defaults.motionMode);
          console.log('[ShotSettingsInherit] defaults.amountOfMotion:', defaults.amountOfMotion);
          console.log('[ShotSettingsInherit] defaults.advancedMode:', defaults.advancedMode);
          console.log('[ShotSettingsInherit] defaults.generationMode:', defaults.generationMode);
          console.log('[ShotSettingsInherit] defaults.phaseConfig:', defaults.phaseConfig ? 'HAS DATA' : 'NULL');
          console.log('[ShotSettingsInherit] defaults.steerableMotionSettings:', defaults.steerableMotionSettings);
          console.log('[ShotSettingsInherit] defaults.batchVideoPrompt:', defaults.batchVideoPrompt?.substring(0, 50) || '(empty)');
          
          // remove _uiSettings if present as it's handled elsewhere
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { _uiSettings, ...validSettings } = defaults;
          
          const mergedSettings: VideoTravelSettings = {
            ...DEFAULT_SETTINGS,
            ...validSettings,
             // Ensure nested objects are properly initialized
            steerableMotionSettings: {
              ...DEFAULT_STEERABLE_MOTION_SETTINGS,
              ...(validSettings.steerableMotionSettings || {}),
            },
          };
          
          console.log('[ShotSettingsInherit] Merged settings:');
          console.log('[ShotSettingsInherit] mergedSettings.motionMode:', mergedSettings.motionMode);
          console.log('[ShotSettingsInherit] mergedSettings.amountOfMotion:', mergedSettings.amountOfMotion);
          console.log('[ShotSettingsInherit] mergedSettings.advancedMode:', mergedSettings.advancedMode);
          console.log('[ShotSettingsInherit] mergedSettings.generationMode:', mergedSettings.generationMode);
          console.log('[ShotSettingsInherit] mergedSettings.phaseConfig:', mergedSettings.phaseConfig ? 'HAS DATA' : 'NULL');
          console.log('[ShotSettingsInherit] mergedSettings.steerableMotionSettings:', mergedSettings.steerableMotionSettings);
          
          // Deep clone
          const deepClonedSettings = JSON.parse(JSON.stringify(mergedSettings));
          
          setSettings(deepClonedSettings);
          loadedSettingsRef.current = JSON.parse(JSON.stringify(deepClonedSettings));
          setStatus('ready');
          setError(null);
          
          // Set flag to prevent subsequent DB loads from overwriting these settings
          justAppliedInheritedSettingsRef.current = true;
          
          console.log('[ShotSettingsInherit] ✅ Applied settings to state (flag set to prevent DB overwrite)');
          
          // Clear storage FIRST to prevent re-processing on subsequent effect runs
          sessionStorage.removeItem(storageKey);
          console.log('[ShotSettingsInherit] 🗑️ Cleared sessionStorage key:', storageKey);
          
          // Persist to DB immediately so the settings stick
          // Use updateToolSettingsSupabase directly (async function) instead of the hook's update method
          // which is debounced and doesn't return a promise
          console.log('[ShotSettingsInherit] 💾 Saving to database...');
          updateToolSettingsSupabase({
            scope: 'shot',
            id: shotId,
            toolId: 'travel-between-images',
            patch: deepClonedSettings
          })
            .then(() => {
              console.log('[ShotSettingsInherit] ✅ Successfully saved inherited settings to database');
              // Update our "clean" reference to match what was saved
              loadedSettingsRef.current = JSON.parse(JSON.stringify(deepClonedSettings));
              // Clear the flag after successful save - DB should now have correct data
              justAppliedInheritedSettingsRef.current = false;
              console.log('[ShotSettingsInherit] 🔓 Cleared inherited settings flag');
            })
            .catch((err) => {
              console.error('[ShotSettingsInherit] ❌ Failed to save inherited settings:', err);
              // Keep the flag set on error to prevent bad DB data from overwriting
            });
          
          return; // Skip normal loading from DB
        } catch (e) {
          console.error('[ShotSettingsInherit] ❌ Failed to parse session storage defaults', e);
        }
      } else {
        console.log('[ShotSettingsInherit] ℹ️ No sessionStorage defaults found, loading from DB normally');
      }
    }
    
    if (isLoading) {
      console.log('[ShotNavPerf] ⏳ useShotSettings WAITING for useToolSettings', {
        shotId: shotId.substring(0, 8),
        isLoading,
        hasDbSettings: !!dbSettings,
        timestamp: Date.now()
      });
      setStatus('loading');
      return;
    }
    
    console.log('[ShotNavPerf] ✅ useShotSettings useToolSettings LOADED', {
      shotId: shotId.substring(0, 8),
      isLoading,
      hasDbSettings: !!dbSettings,
      timestamp: Date.now()
    });
    
    // [GenerationModeDebug] Log what's coming from DB
    console.log('[GenerationModeDebug] 📥 DB Settings loaded:', {
      shotId: shotId.substring(0, 8),
      dbSettings_generationMode: dbSettings?.generationMode,
      dbSettings_raw: dbSettings,
      default_generationMode: DEFAULT_SETTINGS.generationMode,
      timestamp: Date.now()
    });
    
    // FIX: Don't overwrite user's changes while they're actively editing or have pending saves
    // NOTE: With optimistic cache updates, this protection is now less critical since saves
    // no longer trigger automatic refetches. However, it's still valuable for manual invalidations.
    // 
    // CRITICAL: Only apply this protection when status === 'ready' (we've already loaded once).
    // During initial loading, some effects (like I2V/VACE auto-switch) may set pendingSettingsRef,
    // but those are not real user edits and should NOT block the initial DB load.
    const shouldProtectEdits = status === 'ready' && (
      isUserEditingRef.current || saveTimeoutRef.current !== null || pendingSettingsRef.current !== null
    );
    console.log('[GenerationModeDebug] 🔒 Checking edit protection:', {
      shotId: shotId.substring(0, 8),
      status,
      isUserEditingRef: isUserEditingRef.current,
      hasSaveTimeout: saveTimeoutRef.current !== null,
      hasPendingSettings: pendingSettingsRef.current !== null,
      willSkip: shouldProtectEdits,
    });
    if (shouldProtectEdits) {
      console.log('[useShotSettings] ⚠️ Skipping load - user is actively editing or has pending changes');
      return;
    }
    
    // Clear any pending state from before the load - these are stale
    // This allows the fresh DB values to take precedence
    if (status !== 'ready') {
      isUserEditingRef.current = false;
      pendingSettingsRef.current = null;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    }
    
    // Don't overwrite settings that were just inherited from another shot
    // The DB might have stale data until our save completes
    if (justAppliedInheritedSettingsRef.current) {
      console.log('[ShotSettingsInherit] 🛡️ Skipping DB load - just applied inherited settings, waiting for save to complete');
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
    
    // [GenerationModeDebug] Log merged settings
    console.log('[GenerationModeDebug] 🔀 Merged settings:', {
      shotId: shotId.substring(0, 8),
      merged_generationMode: deepClonedSettings.generationMode,
      fromDb: dbSettings?.generationMode,
      fromDefault: DEFAULT_SETTINGS.generationMode,
      timestamp: Date.now()
    });

    // Migration: ensure motionMode and advancedMode are in sync
    // advancedMode is now derived from motionMode, but old data may have them out of sync
    if (deepClonedSettings.advancedMode && deepClonedSettings.motionMode !== 'advanced') {
      deepClonedSettings.motionMode = 'advanced';
    } else if (!deepClonedSettings.advancedMode && deepClonedSettings.motionMode === 'advanced') {
      deepClonedSettings.advancedMode = true;
    }
    
    console.log('[EnhancePromptDebug] [useShotSettings] 📥 Loading settings from database:', {
      shotId: shotId.substring(0, 8),
      enhancePrompt: deepClonedSettings.enhancePrompt,
      advancedMode: deepClonedSettings.advancedMode,
      hasPhaseConfig: !!deepClonedSettings.phaseConfig,
      phaseConfig: deepClonedSettings.phaseConfig,
      batchVideoPrompt: deepClonedSettings.batchVideoPrompt?.substring(0, 50) + (deepClonedSettings.batchVideoPrompt?.length > 50 ? '...' : ''),
      dbSettings_raw: dbSettings
    });
    
    // [VTDebug] Log motionMode specifically
    console.log('[VTDebug] 📥 Loading motionMode from DB:', {
      shotId: shotId.substring(0, 8),
      motionMode: deepClonedSettings.motionMode,
      advancedMode: deepClonedSettings.advancedMode,
      hasPhaseConfig: !!deepClonedSettings.phaseConfig,
      dbSettings_motionMode: dbSettings?.motionMode,
      dbSettings_advancedMode: dbSettings?.advancedMode,
      timestamp: Date.now()
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
    // CRITICAL: During loading, don't set tracking refs or pending state.
    // Changes during loading are ephemeral (from auto-switch effects etc.) and will be 
    // overwritten by DB values. Setting refs would block the DB load from applying.
    if (status !== 'ready' && status !== 'saving') {
      // Still update local state for UI responsiveness, but:
      // - Don't set isUserEditingRef (would block DB load)
      // - Don't set pendingSettingsRef (would cause stale saves)
      // - Don't trigger save (DB values will overwrite anyway)
      console.log('[VTDebug] 📝 updateField during loading - updating UI only (no refs):', {
        key,
        status,
        timestamp: Date.now()
      });
      setSettings(prev => ({ ...prev, [key]: value }));
      return;
    }
    
    // Mark that user is actively editing (only when ready)
    isUserEditingRef.current = true;
    console.log('[GenerationModeDebug] 🛡️ User editing - set protection flag', { key, status });
    
    setSettings(prev => {
      const updated = { ...prev, [key]: value };
      
      // Handle special case: when switching to advanced mode, initialize phaseConfig
      // Support both direct advancedMode change and motionMode change
      if (key === 'advancedMode' && value === true && !updated.phaseConfig) {
        updated.phaseConfig = DEFAULT_PHASE_CONFIG;
      }
      if (key === 'motionMode' && value === 'advanced' && !updated.phaseConfig) {
        updated.phaseConfig = DEFAULT_PHASE_CONFIG;
      }
      
      // Track pending settings for flush-on-navigation
      pendingSettingsRef.current = updated;
      
      // Auto-save with debounce
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await saveImmediate(updated);
          // Only clear pendingSettingsRef AFTER save succeeds
          pendingSettingsRef.current = null;
          saveTimeoutRef.current = null;
        } catch (err) {
          // Don't clear on error - keep pending so flush can retry
          console.error('[useShotSettings] Save failed, keeping pendingSettingsRef:', err);
        }
      }, 300);
      
      return updated;
    });
  }, [saveImmediate, shotId, status]);
  
  // Update multiple fields at once
  const updateFields = useCallback((updates: Partial<VideoTravelSettings>) => {
    console.log('[EnhancePromptDebug] [useShotSettings] 📝 Multiple fields updated:', { 
      keys: Object.keys(updates),
      enhancePrompt: updates.enhancePrompt,
      batchVideoPrompt: updates.batchVideoPrompt ? (typeof updates.batchVideoPrompt === 'string' ? updates.batchVideoPrompt.substring(0, 50) : updates.batchVideoPrompt) : undefined
    });
    
    // [VTDebug] Log motionMode changes specifically
    if ('motionMode' in updates) {
      console.log('[VTDebug] 📝 updateFields - motionMode change:', {
        newMotionMode: updates.motionMode,
        newAdvancedMode: updates.advancedMode,
        hasPhaseConfig: !!updates.phaseConfig,
        shotId: shotId?.substring(0, 8),
        currentStatus: status,
        timestamp: Date.now()
      });
    }
    
    // CRITICAL: During loading, don't set tracking refs or pending state.
    // Changes during loading are ephemeral (from auto-select/auto-switch effects) and will be 
    // overwritten by DB values. Setting refs would block the DB load from applying.
    if (status !== 'ready' && status !== 'saving') {
      // Still update local state for UI responsiveness, but:
      // - Don't set isUserEditingRef (would block DB load)
      // - Don't set pendingSettingsRef (would cause stale saves)
      // - Don't trigger save (DB values will overwrite anyway)
      console.log('[VTDebug] 📝 updateFields during loading - updating UI only (no refs):', {
        keys: Object.keys(updates),
        status,
        timestamp: Date.now()
      });
      setSettings(prev => ({ ...prev, ...updates }));
      return;
    }
    
    // Mark that user is actively editing (only when ready)
    isUserEditingRef.current = true;
    
    setSettings(prev => {
      const updated = { ...prev, ...updates };
      
      // Track pending settings for flush-on-navigation
      pendingSettingsRef.current = updated;
      
      // Trigger auto-save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(async () => {
        console.log('[VTDebug] ⏰ Debounce timeout fired, saving:', {
          shotId: shotId?.substring(0, 8),
          motionMode: updated.motionMode,
          timestamp: Date.now()
        });
        try {
          await saveImmediate(updated);
          console.log('[VTDebug] ✅ Debounced save completed:', {
            shotId: shotId?.substring(0, 8),
            motionMode: updated.motionMode,
            timestamp: Date.now()
          });
          // Only clear pendingSettingsRef AFTER save succeeds
          pendingSettingsRef.current = null;
          saveTimeoutRef.current = null;
        } catch (err) {
          // Don't clear on error - keep pending so flush can retry
          console.error('[useShotSettings] Save failed, keeping pendingSettingsRef:', err);
        }
      }, 300);
      
      return updated;
    });
  }, [saveImmediate, shotId, status]);
  
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
  
  // 🎯 FIX: Memoize the return object to prevent callback instability in parent components
  // Without this, every render creates a new object, causing all callbacks that depend on
  // this hook (e.g. in VideoTravelToolPage) to be recreated, triggering cascade rerenders
  return useMemo(() => ({
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
  }), [
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
  ]);
};

