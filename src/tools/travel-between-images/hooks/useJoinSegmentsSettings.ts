import { useCallback, useRef, useMemo, useEffect } from 'react';
import { useAutoSaveSettings } from '@/shared/hooks/useAutoSaveSettings';
import { updateToolSettingsSupabase } from '@/shared/hooks/useToolSettings';
import { JoinClipsSettings } from '@/tools/join-clips/settings';
import { DEFAULT_JOIN_CLIPS_PHASE_CONFIG, BUILTIN_JOIN_CLIPS_DEFAULT_ID } from '@/tools/join-clips/components/JoinClipsSettingsForm';
import { ActiveLora } from '@/shared/hooks/useLoraManager';
import { STORAGE_KEYS } from '../storageKeys';

/**
 * Extended settings for Join Segments in travel-between-images
 * Adds generateMode toggle and full LoRA objects (with names for display)
 */
export interface JoinSegmentsSettings extends JoinClipsSettings {
  /** Which mode the user last had selected: 'batch' for Batch Generate, 'join' for Join Segments */
  generateMode: 'batch' | 'join';
  /** Full LoRA objects with names for display (extends the base loras array which only has id/strength) */
  selectedLoras: ActiveLora[];
}

/**
 * Default settings for Join Segments (within travel-between-images tool)
 * Same structure as JoinClipsSettings but with slightly different defaults
 * for the shot-level context.
 */
const DEFAULT_JOIN_SEGMENTS_SETTINGS: JoinSegmentsSettings = {
  // Keep these aligned with ShotEditor's "Restore defaults" behavior
  // (and the historical defaults used in travel-between-images).
  contextFrameCount: 15,
  gapFrameCount: 23,
  replaceMode: true,
  keepBridgingImages: false,
  model: 'wan_2_2_vace_lightning_baseline_2_2_2',
  numInferenceSteps: 6,
  guidanceScale: 3.0,
  seed: -1,
  negativePrompt: '',
  priority: 0,
  prompt: '',
  randomSeed: true,
  useIndividualPrompts: false,
  enhancePrompt: true,
  useInputVideoResolution: false,
  useInputVideoFps: false,
  noisedInputVideo: 0,
  loopFirstClip: false,
  // Motion settings (Basic/Advanced mode)
  motionMode: 'basic',
  phaseConfig: DEFAULT_JOIN_CLIPS_PHASE_CONFIG,
  selectedPhasePresetId: BUILTIN_JOIN_CLIPS_DEFAULT_ID,
  // Legacy two-video format (not used in join segments)
  startingVideoUrl: undefined,
  startingVideoPosterUrl: undefined,
  endingVideoUrl: undefined,
  endingVideoPosterUrl: undefined,
  // New multi-clip format (not used - clips come from timeline)
  clips: [],
  transitionPrompts: [],
  loras: [],
  hasEverSetLoras: false,
  // Generate mode toggle (persisted per shot)
  generateMode: 'batch',
  // Full LoRA objects for Join Segments (persisted per shot)
  selectedLoras: [],
};

export interface UseJoinSegmentsSettingsReturn {
  // State
  settings: JoinSegmentsSettings;
  status: 'idle' | 'loading' | 'ready' | 'saving' | 'error';
  /** The shot ID these settings are confirmed for (null if not yet loaded) */
  shotId: string | null;
  isDirty: boolean;
  error: Error | null;
  
  // Field Updates
  updateField: <K extends keyof JoinSegmentsSettings>(
    key: K, 
    value: JoinSegmentsSettings[K]
  ) => void;
  
  updateFields: (updates: Partial<JoinSegmentsSettings>) => void;
  
  // Saving
  save: () => Promise<void>;
  saveImmediate: () => Promise<void>;
  revert: () => void;
}

/**
 * Hook for managing Join Segments settings at the SHOT level
 * 
 * This is separate from useJoinClipsSettings (which is project-level)
 * because the Join Segments form in ShotEditor should persist settings
 * per-shot, similar to how video generation settings work.
 * 
 * Settings are stored in shots.settings under the 'join-segments' tool key.
 * 
 * Features:
 * - Session storage inheritance for new shots
 * - localStorage persistence for cross-shot inheritance
 * - All join settings (gap frames, context frames, prompt, etc.)
 * - Generate mode toggle (batch vs join)
 * - LoRAs for join segments (full objects with names)
 * 
 * @param shotId - The shot ID to persist settings for
 * @param projectId - The project ID (for localStorage inheritance keys)
 */
export function useJoinSegmentsSettings(
  shotId: string | null | undefined,
  projectId?: string | null
): UseJoinSegmentsSettingsReturn {
  // Track if we've applied inherited settings for this shot
  const appliedInheritanceRef = useRef<string | null>(null);
  
  // Check for session storage inheritance BEFORE useAutoSaveSettings loads from DB
  // This is for newly created shots that should inherit settings
  const inheritedSettings = useMemo(() => {
    if (!shotId || typeof window === 'undefined') return null;
    
    // Only check once per shot
    if (appliedInheritanceRef.current === shotId) return null;
    
    const storageKey = STORAGE_KEYS.APPLY_JOIN_SEGMENTS_DEFAULTS(shotId);
    const storedDefaults = sessionStorage.getItem(storageKey);
    
    if (storedDefaults) {
      try {
        const defaults = JSON.parse(storedDefaults);
        // Remove sessionStorage immediately to prevent re-processing
        sessionStorage.removeItem(storageKey);
        appliedInheritanceRef.current = shotId;
        
        console.log('[useJoinSegmentsSettings] 📦 Found inherited settings for new shot:', {
          shotId: shotId.substring(0, 8),
          generateMode: defaults.generateMode,
          loraCount: defaults.selectedLoras?.length || 0,
        });
        
        // Merge with defaults
        return {
          ...DEFAULT_JOIN_SEGMENTS_SETTINGS,
          ...defaults,
        } as JoinSegmentsSettings;
      } catch (e) {
        console.error('[useJoinSegmentsSettings] Failed to parse inherited settings:', e);
        sessionStorage.removeItem(storageKey);
      }
    }
    
    return null;
  }, [shotId]);
  
  // Use the shared auto-save hook with inherited settings as initial defaults
  const autoSave = useAutoSaveSettings<JoinSegmentsSettings>({
    toolId: 'join-segments',
    shotId,
    projectId: projectId || undefined,
    scope: 'shot',
    defaults: inheritedSettings || DEFAULT_JOIN_SEGMENTS_SETTINGS,
    enabled: !!shotId,
    debounceMs: 300,
  });
  
  // Save inherited settings to DB immediately if we have them
  // CRITICAL: Only save if the shot doesn't already have settings in DB
  useEffect(() => {
    if (inheritedSettings && shotId && autoSave.status === 'ready') {
      if (!autoSave.hasShotSettings) {
        console.log('[useJoinSegmentsSettings] 💾 Saving inherited settings to DB (new shot confirmed - no DB settings)');
        updateToolSettingsSupabase({
          scope: 'shot',
          id: shotId,
          toolId: 'join-segments',
          patch: inheritedSettings,
        }, undefined, 'immediate').catch(err => {
          console.error('[useJoinSegmentsSettings] Failed to save inherited settings:', err);
        });
      } else {
        console.log('[useJoinSegmentsSettings] ⚠️ Skipping inherited settings save - shot already has DB settings');
      }
    }
  }, [inheritedSettings, shotId, autoSave.status, autoSave.hasShotSettings]);
  
  // Persist settings to localStorage for future inheritance
  useEffect(() => {
    if (shotId && projectId && autoSave.status === 'ready' && autoSave.settings) {
      try {
        // Project-specific key
        const projectStorageKey = STORAGE_KEYS.LAST_ACTIVE_JOIN_SEGMENTS_SETTINGS(projectId);
        localStorage.setItem(projectStorageKey, JSON.stringify(autoSave.settings));
        
        // Global key (for cross-project inheritance)
        // Clear prompt when inheriting to new project (shot-specific)
        const globalSettings = { ...autoSave.settings, prompt: '', negativePrompt: '' };
        localStorage.setItem(STORAGE_KEYS.GLOBAL_LAST_ACTIVE_JOIN_SEGMENTS_SETTINGS, JSON.stringify(globalSettings));
      } catch (e) {
        console.error('[useJoinSegmentsSettings] Failed to save to localStorage:', e);
      }
    }
  }, [autoSave.settings, shotId, projectId, autoSave.status]);
  
  // Memoize return value
  return useMemo(() => ({
    settings: autoSave.settings,
    status: autoSave.status as 'idle' | 'loading' | 'ready' | 'saving' | 'error',
    shotId: autoSave.entityId,
    isDirty: autoSave.isDirty,
    error: autoSave.error,
    updateField: autoSave.updateField,
    updateFields: autoSave.updateFields,
    save: autoSave.saveImmediate,
    saveImmediate: autoSave.saveImmediate,
    revert: autoSave.revert,
  }), [
    autoSave.settings,
    autoSave.status,
    autoSave.entityId,
    autoSave.isDirty,
    autoSave.error,
    autoSave.updateField,
    autoSave.updateFields,
    autoSave.saveImmediate,
    autoSave.revert,
  ]);
}
