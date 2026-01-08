import { useCallback, useRef, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAutoSaveSettings, AutoSaveStatus } from '@/shared/hooks/useAutoSaveSettings';
import { updateToolSettingsSupabase } from '@/shared/hooks/useToolSettings';
import { VideoTravelSettings, DEFAULT_PHASE_CONFIG } from '../settings';
import { STORAGE_KEYS } from '../storageKeys';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DEFAULT_STEERABLE_MOTION_SETTINGS } from '../components/ShotEditor/state/types';

// Default settings for new shots
const DEFAULT_SETTINGS: VideoTravelSettings = {
  videoControlMode: 'batch',
  batchVideoPrompt: '',
  batchVideoFrames: 61, // Must be 4N+1 format for Wan model compatibility (61 = 4*15+1)
  batchVideoSteps: 6,
  steerableMotionSettings: DEFAULT_STEERABLE_MOTION_SETTINGS,
  enhancePrompt: false,
  turboMode: false,
  smoothContinuations: true, // SVI enabled by default for smoother transitions
  amountOfMotion: 50,
  motionMode: 'basic',
  advancedMode: false,
  phaseConfig: undefined,
  generationMode: 'timeline',
  generationTypeMode: 'i2v', // Default to I2V (image-to-video) mode
  pairConfigs: [],
  selectedLoras: [],
};

export interface UseShotSettingsReturn {
  // State
  settings: VideoTravelSettings;
  status: 'idle' | 'loading' | 'ready' | 'saving' | 'error';
  /** The shot ID these settings are confirmed for (null if not yet loaded) */
  shotId: string | null;
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

/**
 * Shot-specific settings hook built on useAutoSaveSettings.
 * 
 * Adds shot-specific functionality:
 * - Session storage inheritance for new shots
 * - localStorage persistence for cross-shot inheritance
 * - Apply settings from another shot
 * - Apply project defaults
 * - Special handling for advancedMode/phaseConfig initialization
 */
export const useShotSettings = (
  shotId: string | null | undefined,
  projectId: string | null | undefined
): UseShotSettingsReturn => {
  const queryClient = useQueryClient();
  
  // Track if we've applied inherited settings for this shot
  const appliedInheritanceRef = useRef<string | null>(null);
  
  // Check for session storage inheritance BEFORE useAutoSaveSettings loads from DB
  // This is for newly created shots that should inherit settings
  const inheritedSettings = useMemo(() => {
    if (!shotId || typeof window === 'undefined') return null;
    
    // Only check once per shot
    if (appliedInheritanceRef.current === shotId) return null;
    
    const storageKey = STORAGE_KEYS.APPLY_PROJECT_DEFAULTS(shotId);
    const storedDefaults = sessionStorage.getItem(storageKey);
    
    if (storedDefaults) {
      try {
        const defaults = JSON.parse(storedDefaults);
        // Remove sessionStorage immediately to prevent re-processing
        sessionStorage.removeItem(storageKey);
        appliedInheritanceRef.current = shotId;
        
        console.log('[useShotSettings] 📦 Found inherited settings for new shot:', {
          shotId: shotId.substring(0, 8),
          hasPrompt: !!defaults.batchVideoPrompt,
        });
        
        // Merge with defaults, ensuring proper nested object initialization
        const { _uiSettings, ...validSettings } = defaults;
        return {
          ...DEFAULT_SETTINGS,
          ...validSettings,
          steerableMotionSettings: {
            ...DEFAULT_STEERABLE_MOTION_SETTINGS,
            ...(validSettings.steerableMotionSettings || {}),
          },
        } as VideoTravelSettings;
      } catch (e) {
        console.error('[useShotSettings] Failed to parse inherited settings:', e);
        sessionStorage.removeItem(storageKey);
      }
    }
    
    return null;
  }, [shotId]);
  
  // Use the shared auto-save hook with inherited settings as initial defaults
  const autoSave = useAutoSaveSettings<VideoTravelSettings>({
    toolId: 'travel-between-images',
    shotId,
    projectId,
    scope: 'shot',
    defaults: inheritedSettings || DEFAULT_SETTINGS,
    enabled: !!shotId,
    debounceMs: 300,
  });
  
  // Save inherited settings to DB immediately if we have them
  // CRITICAL: Only save if the shot doesn't already have settings in DB
  // to prevent overwriting existing settings with inherited defaults
  // We use `hasShotSettings` from useToolSettings which checks at the DB level
  useEffect(() => {
    // Only save inherited settings if:
    // 1. We have inherited settings
    // 2. Status is ready
    // 3. DB did NOT have existing settings (hasShotSettings is false)
    if (inheritedSettings && shotId && autoSave.status === 'ready') {
      if (!autoSave.hasShotSettings) {
        console.log('[useShotSettings] 💾 Saving inherited settings to DB (new shot confirmed - no DB settings)');
        // Use 'immediate' mode - inherited settings should persist right away
        updateToolSettingsSupabase({
          scope: 'shot',
          id: shotId,
          toolId: 'travel-between-images',
          patch: inheritedSettings,
        }, undefined, 'immediate').catch(err => {
          console.error('[useShotSettings] Failed to save inherited settings:', err);
        });
      } else {
        console.log('[useShotSettings] ⚠️ Skipping inherited settings save - shot already has DB settings');
      }
    }
  }, [inheritedSettings, shotId, autoSave.status, autoSave.hasShotSettings]);
  
  // Persist settings to localStorage for future inheritance
  useEffect(() => {
    if (shotId && projectId && autoSave.status === 'ready' && autoSave.settings) {
      try {
        // Project-specific key
        const projectStorageKey = STORAGE_KEYS.LAST_ACTIVE_SHOT_SETTINGS(projectId);
        localStorage.setItem(projectStorageKey, JSON.stringify(autoSave.settings));
        
        // Global key (without pairConfigs which are shot-specific)
        const globalSettings = { ...autoSave.settings, pairConfigs: [] };
        localStorage.setItem(STORAGE_KEYS.GLOBAL_LAST_ACTIVE_SHOT_SETTINGS, JSON.stringify(globalSettings));
      } catch (e) {
        console.error('[useShotSettings] Failed to save to localStorage:', e);
      }
    }
  }, [autoSave.settings, shotId, projectId, autoSave.status]);
  
  // Wrapped updateField with special handling for advancedMode/phaseConfig
  const updateField = useCallback(<K extends keyof VideoTravelSettings>(
    key: K,
    value: VideoTravelSettings[K]
  ) => {
    // Handle special case: when switching to advanced mode, initialize phaseConfig
    if (key === 'advancedMode' && value === true) {
      const currentSettings = autoSave.settings;
      if (!currentSettings.phaseConfig) {
        autoSave.updateFields({
          [key]: value,
          phaseConfig: DEFAULT_PHASE_CONFIG,
        } as Partial<VideoTravelSettings>);
        return;
      }
    }
    if (key === 'motionMode' && value === 'advanced') {
      const currentSettings = autoSave.settings;
      if (!currentSettings.phaseConfig) {
        autoSave.updateFields({
          [key]: value,
          phaseConfig: DEFAULT_PHASE_CONFIG,
        } as Partial<VideoTravelSettings>);
        return;
      }
    }
    
    autoSave.updateField(key, value);
  }, [autoSave]);
  
  // Apply settings from another shot
  const applyShotSettings = useCallback(async (sourceShotId: string) => {
    if (!shotId || !sourceShotId) {
      toast.error('Cannot apply settings: missing shot ID');
      return;
    }
    
    console.log('[useShotSettings] 🔀 Applying settings from shot:', sourceShotId.substring(0, 8));
    
    try {
      const { data, error: fetchError } = await supabase
        .from('shots')
        .select('settings')
        .eq('id', sourceShotId)
        .single();
      
      if (fetchError) throw fetchError;
      
      const sourceSettings = (data?.settings as any)?.['travel-between-images'] as VideoTravelSettings;
      
      if (sourceSettings) {
        // Apply all fields from source
        autoSave.updateFields(sourceSettings);
      } else {
        toast.error('Source shot has no settings');
      }
    } catch (err) {
      console.error('[useShotSettings] Apply failed:', err);
      toast.error('Failed to apply settings');
    }
  }, [shotId, autoSave]);
  
  // Apply project defaults
  const applyProjectDefaults = useCallback(async () => {
    if (!projectId) {
      toast.error('Cannot apply defaults: no project selected');
      return;
    }
    
    console.log('[useShotSettings] 🔀 Applying project defaults');
    
    try {
      const { data, error: fetchError } = await supabase
        .from('projects')
        .select('settings')
        .eq('id', projectId)
        .single();
      
      if (fetchError) throw fetchError;
      
      const projectDefaults = (data?.settings as any)?.['travel-between-images'] as VideoTravelSettings;
      
      if (projectDefaults) {
        autoSave.updateFields(projectDefaults);
      } else {
        toast.error('Project has no default settings');
      }
    } catch (err) {
      console.error('[useShotSettings] Apply defaults failed:', err);
      toast.error('Failed to apply defaults');
    }
  }, [projectId, autoSave]);
  
  // Reset to hardcoded defaults
  const resetToDefaults = useCallback(() => {
    console.log('[useShotSettings] 🔄 Resetting to defaults');
    autoSave.updateFields(DEFAULT_SETTINGS);
  }, [autoSave]);
  
  // Memoize return value
  return useMemo(() => ({
    settings: autoSave.settings,
    status: autoSave.status as 'idle' | 'loading' | 'ready' | 'saving' | 'error',
    shotId: autoSave.entityId,
    isDirty: autoSave.isDirty,
    error: autoSave.error,
    updateField,
    updateFields: autoSave.updateFields,
    applyShotSettings,
    applyProjectDefaults,
    resetToDefaults,
    save: autoSave.saveImmediate,
    saveImmediate: autoSave.saveImmediate,
    revert: autoSave.revert,
  }), [
    autoSave.settings,
    autoSave.status,
    autoSave.entityId,
    autoSave.isDirty,
    autoSave.error,
    updateField,
    autoSave.updateFields,
    autoSave.saveImmediate,
    autoSave.revert,
    applyShotSettings,
    applyProjectDefaults,
    resetToDefaults,
  ]);
};
