/**
 * useSegmentSettings Hook
 *
 * Manages segment settings for video regeneration.
 * Handles data fetching, merging, and persistence.
 *
 * Settings priority (highest to lowest):
 * 1. pairMetadata - Per-pair overrides from shot_generations.metadata
 * 2. shotBatchSettings - Shot-level defaults from shots.settings
 * 3. defaults - Hardcoded fallbacks
 *
 * Note: Shot settings inheritance (copying from previous shot) is handled
 * separately when a new shot is created - see shotSettingsInheritance.ts
 *
 * Usage:
 * ```tsx
 * const { settings, updateSettings, saveSettings, isLoading } = useSegmentSettings({
 *   pairShotGenerationId,
 *   shotId,
 *   defaults: { prompt: '', negativePrompt: '', numFrames: 25 },
 * });
 *
 * <SegmentSettingsForm
 *   settings={settings}
 *   onChange={updateSettings}
 *   onSubmit={async () => {
 *     await saveSettings();
 *     await createTask(...);
 *   }}
 * />
 * ```
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  type SegmentSettings,
  type PairMetadata,
  type ShotBatchSettings,
  createDefaultSettings,
  mergeSegmentSettings,
  mergedToFormSettings,
  buildMetadataUpdate,
} from '@/shared/components/segmentSettingsUtils';
import {
  readShotSettings,
  readSegmentOverrides,
  writeShotSettings,
  summarizeSettings,
  type ShotVideoSettings,
} from '@/shared/utils/settingsMigration';

export interface UseSegmentSettingsOptions {
  /** Shot generation ID for pair-specific settings */
  pairShotGenerationId?: string | null;
  /** Shot ID for batch settings */
  shotId?: string | null;
  /** Default prompts and settings (hardcoded fallbacks) */
  defaults: {
    prompt: string;
    negativePrompt: string;
    /** Frame count from timeline positions (source of truth) */
    numFrames?: number;
  };
  /** Structure video defaults for this segment (from shot-level config) */
  structureVideoDefaults?: {
    motionStrength: number;
    treatment: 'adjust' | 'clip';
    uni3cEndPercent: number;
  } | null;
}

/** Tracks which fields have pair-level overrides vs using shot defaults */
export interface FieldOverrides {
  prompt: boolean;
  negativePrompt: boolean;
  motionMode: boolean;
  amountOfMotion: boolean;
  phaseConfig: boolean;
  loras: boolean;
  selectedPhasePresetId: boolean;
  structureMotionStrength: boolean;
  structureTreatment: boolean;
  structureUni3cEndPercent: boolean;
}

/** Shot-level default values (for showing as placeholder when no override) */
export interface ShotDefaults {
  prompt: string;
  negativePrompt: string;
  motionMode: 'basic' | 'advanced';
  amountOfMotion: number;
  phaseConfig?: import('@/tools/travel-between-images/settings').PhaseConfig;
  loras: import('@/shared/types/segmentSettings').LoraConfig[];
  selectedPhasePresetId: string | null;
}

export interface UseSegmentSettingsReturn {
  /** Current settings (merged from all sources + user edits) */
  settings: SegmentSettings;
  /** Update settings (local state only) */
  updateSettings: (updates: Partial<SegmentSettings>) => void;
  /** Save current settings to database */
  saveSettings: () => Promise<boolean>;
  /** Reset to merged defaults (discards local edits) */
  resetSettings: () => void;
  /** Save current settings as shot-level defaults */
  saveAsShotDefaults: () => Promise<boolean>;
  /** Whether data is still loading */
  isLoading: boolean;
  /** Whether user has made local edits */
  isDirty: boolean;
  /** Raw pair metadata (for debugging) */
  pairMetadata: PairMetadata | null;
  /** Raw shot batch settings (for debugging) */
  shotBatchSettings: ShotBatchSettings | null;
  /** Which fields have pair-level overrides (vs using shot defaults). Undefined during loading. */
  hasOverride: FieldOverrides | undefined;
  /** Shot-level default values (for showing as placeholder) */
  shotDefaults: ShotDefaults;
}

// Track hook instances for debugging
let hookInstanceCounter = 0;

export function useSegmentSettings({
  pairShotGenerationId,
  shotId,
  defaults,
  structureVideoDefaults,
}: UseSegmentSettingsOptions): UseSegmentSettingsReturn {
  // Unique instance ID for debugging
  const instanceIdRef = useRef<number | null>(null);
  if (instanceIdRef.current === null) {
    instanceIdRef.current = ++hookInstanceCounter;
  }
  const instanceId = instanceIdRef.current;

  const queryClient = useQueryClient();

  // Log context on init (only when key IDs change)
  // Guard against non-string values to prevent crashes
  useEffect(() => {
    const safeSubstr = (val: unknown): string | null =>
      typeof val === 'string' ? val.substring(0, 8) : null;
    console.log(`[useSegmentSettings:${instanceId}] 📋 Hook initialized:`, {
      hasPairShotGenerationId: !!pairShotGenerationId,
      pairShotGenerationId: safeSubstr(pairShotGenerationId),
      hasShotId: !!shotId,
      shotId: safeSubstr(shotId),
    });
  }, [pairShotGenerationId, shotId, instanceId]);

  // Fetch pair metadata from shot_generations
  const { data: pairMetadata, isLoading: isLoadingPair } = useQuery({
    queryKey: ['pair-metadata', pairShotGenerationId],
    queryFn: async () => {
      if (!pairShotGenerationId) return null;
      console.log('[useSegmentSettings] 📥 Fetching pair metadata for:', pairShotGenerationId.substring(0, 8));
      const { data, error } = await supabase
        .from('shot_generations')
        .select('metadata')
        .eq('id', pairShotGenerationId)
        .single();
      if (error) {
        console.error('[useSegmentSettings] Error fetching pair metadata:', error);
        return null;
      }
      const metadata = (data?.metadata as PairMetadata) || null;
      console.log('[useSegmentSettings] 📦 Pair metadata loaded:', {
        pairId: pairShotGenerationId.substring(0, 8),
        hasPrompt: !!metadata?.pair_prompt,
        hasNegPrompt: !!metadata?.pair_negative_prompt,
        motionMode: metadata?.pair_motion_settings?.motion_mode ?? metadata?.user_overrides?.motion_mode ?? 'not set',
        motionAmount: metadata?.pair_motion_settings?.amount_of_motion ?? metadata?.user_overrides?.amount_of_motion ?? 'not set',
        hasPhaseConfig: !!metadata?.pair_phase_config,
        phaseConfigFlowShift: metadata?.pair_phase_config?.flow_shift,
        hasLoras: !!metadata?.pair_loras?.length,
        numFrames: metadata?.pair_num_frames ?? 'not set',
        randomSeed: metadata?.pair_random_seed ?? 'not set',
        seed: metadata?.pair_seed ?? 'not set',
        selectedPhasePresetId: metadata?.pair_selected_phase_preset_id ?? 'not set',
      });
      return metadata;
    },
    enabled: !!pairShotGenerationId,
    staleTime: 10000,
  });

  // Fetch shot batch settings using migration utility
  const { data: shotVideoSettings, isLoading: isLoadingBatch } = useQuery({
    queryKey: ['shot-batch-settings', shotId],
    queryFn: async (): Promise<ShotVideoSettings | null> => {
      if (!shotId) return null;
      console.log('[useSegmentSettings] 📥 Fetching shot batch settings for:', shotId.substring(0, 8));
      const { data, error } = await supabase
        .from('shots')
        .select('settings')
        .eq('id', shotId)
        .single();
      if (error) {
        console.error('[useSegmentSettings] Error fetching batch settings:', error);
        return null;
      }
      const allSettings = data?.settings as Record<string, any>;
      const rawSettings = allSettings?.['travel-between-images'] ?? {};

      // Use migration utility to normalize field names
      const result = readShotSettings(rawSettings);

      console.log('[useSegmentSettings] 📦 Shot batch settings loaded (via migration):', {
        shotId: shotId.substring(0, 8),
        ...summarizeSettings(result),
        // Also log raw for debugging during migration
        rawBatchVideoPrompt: rawSettings.batchVideoPrompt?.substring(0, 30) || null,
        rawSteerableNegPrompt: rawSettings.steerableMotionSettings?.negative_prompt?.substring(0, 30) || null,
      });
      return result;
    },
    enabled: !!shotId,
    staleTime: 30000,
  });

  // Convert ShotVideoSettings to ShotBatchSettings for compatibility with existing merge logic
  const shotBatchSettings = useMemo((): ShotBatchSettings | null => {
    if (!shotVideoSettings) return null;
    return {
      amountOfMotion: shotVideoSettings.amountOfMotion / 100, // Convert to 0-1 for merge function
      motionMode: shotVideoSettings.motionMode,
      selectedLoras: shotVideoSettings.loras,
      phaseConfig: shotVideoSettings.phaseConfig,
      prompt: shotVideoSettings.prompt,
      negativePrompt: shotVideoSettings.negativePrompt,
    };
  }, [shotVideoSettings]);

  // Compute settings from segment overrides ONLY (not merged with shot defaults)
  // This prevents "baking in" shot defaults as segment overrides when saving
  // The form will use shotDefaults prop for display when fields are undefined
  const mergedSettings = useMemo(() => {
    // Read segment-specific overrides from pair metadata
    const pairOverrides = readSegmentOverrides(pairMetadata as Record<string, any> | null);

    // Build settings with ONLY segment overrides
    // undefined = no override (use shot default)
    // '' = explicitly cleared (remove override when saving)
    // 'value' = override exists
    const formSettings: SegmentSettings = {
      // Prompts: undefined if no override, string if override exists
      prompt: pairOverrides.prompt,
      negativePrompt: pairOverrides.negativePrompt,

      // Motion settings: only include if segment has override (undefined = use shot default)
      motionMode: pairOverrides.motionMode as 'basic' | 'advanced' | undefined,
      amountOfMotion: pairOverrides.amountOfMotion,
      phaseConfig: pairOverrides.phaseConfig,
      selectedPhasePresetId: pairOverrides.selectedPhasePresetId,
      loras: pairOverrides.loras ?? [],

      // Frame count: always from timeline (source of truth)
      numFrames: defaults.numFrames ?? 25,

      // Seed settings from pair metadata
      randomSeed: pairMetadata?.pair_random_seed ?? true,
      seed: pairMetadata?.pair_seed,

      // Default for regeneration behavior
      makePrimaryVariant: false,

      // Structure video: only include if segment has override
      structureMotionStrength: pairOverrides.structureMotionStrength,
      structureTreatment: pairOverrides.structureTreatment,
      structureUni3cEndPercent: pairOverrides.structureUni3cEndPercent,
    };

    return formSettings;
  }, [pairMetadata, defaults]);

  // Compute which fields have pair-level overrides (vs using shot defaults)
  // This tells the form whether to show the value as actual content or as placeholder
  // Returns undefined during loading so form knows to show merged settings (not empty)
  const hasOverride = useMemo((): FieldOverrides | undefined => {
    // Return undefined while loading - form will show merged settings
    if (isLoadingPair) return undefined;

    // Use migration utility to read pair overrides from either old or new format
    const pairOverrides = readSegmentOverrides(pairMetadata as Record<string, any> | null);
    return {
      prompt: !!pairOverrides.prompt,
      negativePrompt: !!pairOverrides.negativePrompt,
      motionMode: pairOverrides.motionMode !== undefined,
      amountOfMotion: pairOverrides.amountOfMotion !== undefined,
      phaseConfig: pairOverrides.phaseConfig !== undefined,
      loras: pairOverrides.loras !== undefined && pairOverrides.loras.length > 0,
      selectedPhasePresetId: pairOverrides.selectedPhasePresetId !== undefined,
      structureMotionStrength: pairOverrides.structureMotionStrength !== undefined,
      structureTreatment: pairOverrides.structureTreatment !== undefined,
      structureUni3cEndPercent: pairOverrides.structureUni3cEndPercent !== undefined,
    };
  }, [pairMetadata, isLoadingPair]);

  // Shot-level defaults (for showing as placeholder/fallback when no pair override)
  const shotDefaultsValue = useMemo((): ShotDefaults => {
    return {
      prompt: shotVideoSettings?.prompt || '',
      negativePrompt: shotVideoSettings?.negativePrompt || '',
      motionMode: shotVideoSettings?.motionMode || 'basic',
      amountOfMotion: shotVideoSettings?.amountOfMotion ?? 50,
      phaseConfig: shotVideoSettings?.phaseConfig,
      loras: shotVideoSettings?.loras || [],
      selectedPhasePresetId: shotVideoSettings?.selectedPhasePresetId ?? null,
    };
  }, [shotVideoSettings]);

  // Log merged settings when data loads (separate effect to avoid log spam)
  useEffect(() => {
    if (pairMetadata !== undefined || shotBatchSettings !== undefined) {
      console.log('[useSegmentSettings] 🔀 Merged settings:', {
        hasPairMetadata: !!pairMetadata,
        hasShotBatch: !!shotBatchSettings,
        result: {
          prompt: mergedSettings.prompt?.substring(0, 30) + (mergedSettings.prompt?.length > 30 ? '...' : ''),
          negPrompt: mergedSettings.negativePrompt?.substring(0, 30) + (mergedSettings.negativePrompt?.length > 30 ? '...' : ''),
          motionMode: mergedSettings.motionMode,
          amountOfMotion: mergedSettings.amountOfMotion,
          hasPhaseConfig: !!mergedSettings.phaseConfig,
          phaseConfigFlowShift: mergedSettings.phaseConfig?.flow_shift,
          numFrames: mergedSettings.numFrames,
          randomSeed: mergedSettings.randomSeed,
          seed: mergedSettings.seed,
          selectedPhasePresetId: mergedSettings.selectedPhasePresetId,
          loraCount: mergedSettings.loras?.length ?? 0,
        },
      });
    }
  }, [pairMetadata, shotBatchSettings]); // Only log when fetched data changes

  // Local state for user edits
  const [localSettings, setLocalSettings] = useState<SegmentSettings | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Refs for auto-save (defined before use)
  const prevPairIdRef = useRef(pairShotGenerationId);
  const hasUserEdited = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Store saveSettings in a ref so unmount effect doesn't re-run on settings change
  const saveSettingsRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  // Track dirty state in a ref for unmount flush (state won't be captured correctly)
  const isDirtyRef = useRef(false);

  // Reset local state only when switching to a different pair
  useEffect(() => {
    if (pairShotGenerationId !== prevPairIdRef.current) {
      // Note: We don't save here because saveSettings would capture the new pairShotGenerationId.
      // The auto-save debounce (500ms) should complete before user can switch pairs.
      // If there's a pending timeout, clear it (the save will be lost for the old pair).
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      console.log(`[useSegmentSettings:${instanceId}] 🔄 Pair changed, resetting local state`);
      setLocalSettings(null);
      setIsDirty(false);
      hasUserEdited.current = false;
      prevPairIdRef.current = pairShotGenerationId;
    }
  }, [pairShotGenerationId, instanceId]);

  // Current settings = local edits or merged
  const settings = localSettings ?? mergedSettings;

  // Update settings (local state only)
  const updateSettings = useCallback((updates: Partial<SegmentSettings>) => {
    setLocalSettings(prev => {
      const current = prev ?? mergedSettings;
      const next = { ...current, ...updates };

      // Enforce invariant: basic mode = no phase config
      if (updates.motionMode === 'basic') {
        next.phaseConfig = undefined;
      }

      return next;
    });
    setIsDirty(true);
  }, [mergedSettings]);

  // Keep refs in sync with state for unmount flush
  useEffect(() => {
    isDirtyRef.current = isDirty;
    if (isDirty) {
      hasUserEdited.current = true;
    }
  }, [isDirty]);

  // Save settings to database
  const saveSettings = useCallback(async (): Promise<boolean> => {
    if (!pairShotGenerationId) {
      console.warn('[useSegmentSettings] ⚠️ Cannot save - no pairShotGenerationId (lightbox may be opened from non-travel context)');
      return false;
    }

    console.log(`[useSegmentSettings:${instanceId}] 💾 Saving settings to pair:`, pairShotGenerationId.substring(0, 8), {
      prompt: settings.prompt?.substring(0, 30) + '...',
      negPrompt: settings.negativePrompt?.substring(0, 30) + '...',
      motionMode: settings.motionMode,
      amountOfMotion: settings.amountOfMotion,
      hasPhaseConfig: !!settings.phaseConfig,
      phaseConfigFlowShift: settings.phaseConfig?.flow_shift,
      loraCount: settings.loras?.length ?? 0,
      willSavePhaseConfig: settings.motionMode !== 'basic',
      numFrames: settings.numFrames,
      randomSeed: settings.randomSeed,
      seed: settings.seed,
      selectedPhasePresetId: settings.selectedPhasePresetId,
    });

    try {
      // Fetch current metadata
      const { data: current, error: fetchError } = await supabase
        .from('shot_generations')
        .select('metadata')
        .eq('id', pairShotGenerationId)
        .single();

      if (fetchError) {
        console.error('[useSegmentSettings] Error fetching current metadata:', fetchError);
        return false;
      }

      const currentMetadata = (current?.metadata as Record<string, any>) || {};

      // Build update from current settings
      // Note: numFrames is NOT saved - timeline positions are the source of truth
      const newMetadata = buildMetadataUpdate(currentMetadata, {
        prompt: settings.prompt,
        negativePrompt: settings.negativePrompt,
        motionMode: settings.motionMode,
        amountOfMotion: settings.amountOfMotion, // Store in 0-100 scale (UI scale) - new format
        phaseConfig: settings.motionMode === 'basic' ? null : settings.phaseConfig,
        loras: settings.loras,
        // numFrames intentionally omitted - timeline positions are source of truth
        randomSeed: settings.randomSeed,
        seed: settings.seed,
        selectedPhasePresetId: settings.selectedPhasePresetId,
        // Structure video overrides (only saved if set)
        structureMotionStrength: settings.structureMotionStrength,
        structureTreatment: settings.structureTreatment,
        structureUni3cEndPercent: settings.structureUni3cEndPercent,
      });

      console.log(`[useSegmentSettings:${instanceId}] 📝 Built metadata update:`, {
        pairId: pairShotGenerationId.substring(0, 8),
        updatedFields: {
          pair_prompt: !!newMetadata.pair_prompt,
          pair_negative_prompt: !!newMetadata.pair_negative_prompt,
          pair_motion_settings: newMetadata.pair_motion_settings,
          pair_phase_config: newMetadata.pair_phase_config,
          pair_loras: newMetadata.pair_loras?.length || 0,
          pair_num_frames: newMetadata.pair_num_frames,
          pair_random_seed: newMetadata.pair_random_seed,
          pair_seed: newMetadata.pair_seed,
          pair_selected_phase_preset_id: newMetadata.pair_selected_phase_preset_id,
        },
      });

      // Save
      const { error: updateError } = await supabase
        .from('shot_generations')
        .update({ metadata: newMetadata })
        .eq('id', pairShotGenerationId);

      if (updateError) {
        console.error('[useSegmentSettings] Error saving metadata:', updateError);
        return false;
      }

      console.log(`[useSegmentSettings:${instanceId}] ✅ Settings saved`, {
        pairShotGenerationId: pairShotGenerationId?.substring(0, 8),
        shotId: shotId?.substring(0, 8),
        savedPrompt: settings.prompt?.substring(0, 50),
        savedNegativePrompt: settings.negativePrompt?.substring(0, 50),
      });

      // Invalidate the cache so the next read gets fresh data
      console.log(`[PairPromptDebug] 🔄 Invalidating pair-metadata cache...`);
      await queryClient.invalidateQueries({ queryKey: ['pair-metadata', pairShotGenerationId] });

      // Refetch (not just invalidate) shot generations so timeline/pairDataByIndex updates immediately
      // Using refetchQueries ensures the query is actively refetched and events are reliably emitted
      if (shotId) {
        console.log(`[PairPromptDebug] 🔄 Refetching all-shot-generations...`, { shotId: shotId.substring(0, 8) });
        queryClient.refetchQueries({ queryKey: ['all-shot-generations', shotId] });
      }

      setIsDirty(false);
      return true;
    } catch (error) {
      console.error('[useSegmentSettings] Exception saving metadata:', error);
      return false;
    }
  }, [pairShotGenerationId, shotId, settings, instanceId, queryClient]);

  // Save current settings as shot-level defaults
  const saveAsShotDefaults = useCallback(async (): Promise<boolean> => {
    if (!shotId) {
      console.warn('[useSegmentSettings] ⚠️ Cannot save as shot defaults - no shotId');
      return false;
    }

    console.log(`[useSegmentSettings:${instanceId}] 💾 Saving as shot defaults:`, shotId.substring(0, 8), {
      prompt: settings.prompt?.substring(0, 30) + '...',
      negPrompt: settings.negativePrompt?.substring(0, 30) + '...',
      motionMode: settings.motionMode,
      amountOfMotion: settings.amountOfMotion,
      hasPhaseConfig: !!settings.phaseConfig,
      loraCount: settings.loras?.length ?? 0,
    });

    try {
      // Fetch current shot settings
      const { data: shot, error: fetchError } = await supabase
        .from('shots')
        .select('settings')
        .eq('id', shotId)
        .single();

      if (fetchError) {
        console.error('[useSegmentSettings] Error fetching shot settings:', fetchError);
        return false;
      }

      const currentSettings = (shot?.settings as Record<string, any>) || {};
      const currentTravelSettings = currentSettings['travel-between-images'] || {};

      // Build new shot settings from current segment settings
      // Merge with existing shot settings to preserve batch-specific fields
      const newShotVideoSettings: ShotVideoSettings = {
        // From current segment settings (what user sees in the form)
        prompt: settings.prompt || '',
        negativePrompt: settings.negativePrompt || '',
        motionMode: settings.motionMode ?? 'basic',
        amountOfMotion: settings.amountOfMotion ?? 50,
        phaseConfig: settings.phaseConfig,
        selectedPhasePresetId: settings.selectedPhasePresetId ?? null,
        loras: settings.loras ?? [],
        numFrames: settings.numFrames ?? 25,
        randomSeed: settings.randomSeed ?? true,
        seed: settings.seed,
        makePrimaryVariant: settings.makePrimaryVariant ?? false,

        // Preserve existing batch-specific settings (not editable in segment form)
        batchVideoFrames: currentTravelSettings.batchVideoFrames ?? 25,
        textBeforePrompts: currentTravelSettings.textBeforePrompts ?? '',
        textAfterPrompts: currentTravelSettings.textAfterPrompts ?? '',
        enhancePrompt: currentTravelSettings.enhancePrompt ?? false,
        generationTypeMode: currentTravelSettings.generationTypeMode ?? 'i2v',
      };

      // Write in new format
      const newTravelSettings = writeShotSettings(newShotVideoSettings);

      // Update shot settings
      const { error: updateError } = await supabase
        .from('shots')
        .update({
          settings: {
            ...currentSettings,
            'travel-between-images': newTravelSettings,
          },
        })
        .eq('id', shotId);

      if (updateError) {
        console.error('[useSegmentSettings] Error saving shot defaults:', updateError);
        return false;
      }

      console.log(`[useSegmentSettings:${instanceId}] ✅ Saved as shot defaults`);

      // Invalidate shot batch settings cache
      await queryClient.invalidateQueries({ queryKey: ['shot-batch-settings', shotId] });

      return true;
    } catch (error) {
      console.error('[useSegmentSettings] Exception saving shot defaults:', error);
      return false;
    }
  }, [shotId, settings, instanceId, queryClient]);

  // Keep saveSettingsRef updated
  useEffect(() => {
    saveSettingsRef.current = saveSettings;
  }, [saveSettings]);

  // Auto-save on changes (debounced)
  useEffect(() => {
    // Only auto-save if user has edited and we have a pairShotGenerationId
    if (!hasUserEdited.current || !pairShotGenerationId || !isDirty) {
      return;
    }

    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce the save
    saveTimeoutRef.current = setTimeout(async () => {
      console.log(`[useSegmentSettings:${instanceId}] ⏱️ Auto-save triggered (debounced)`);
      await saveSettings();
    }, 500);

    // Cleanup on unmount or when settings change
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [localSettings, isDirty, pairShotGenerationId, saveSettings, instanceId]);

  // Flush pending save on unmount (using ref to avoid re-running on settings change)
  useEffect(() => {
    const currentInstanceId = instanceId;

    return () => {
      // Clear any pending debounce timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      // Save if there are unsaved changes
      if (isDirtyRef.current && hasUserEdited.current) {
        console.log(`[useSegmentSettings:${currentInstanceId}] 🚿 Flushing save on unmount`);
        saveSettingsRef.current();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount/unmount

  // Reset to shot defaults by clearing all segment overrides
  // Convention: '' for strings, null for other types = clear the override
  const resetSettings = useCallback(() => {
    const clearedSettings: SegmentSettings = {
      // Clear all overridable fields
      // '' for strings = clear override
      // null for other types = clear override
      prompt: '',
      negativePrompt: '',
      motionMode: null as any, // null = clear override
      amountOfMotion: null as any,
      phaseConfig: null,
      selectedPhasePresetId: null as any,
      loras: null as any,

      // Keep timeline-derived values
      numFrames: settings.numFrames,
      randomSeed: true,
      seed: undefined,
      makePrimaryVariant: false,

      // Clear structure video overrides
      structureMotionStrength: null as any,
      structureTreatment: null as any,
      structureUni3cEndPercent: null as any,
    };

    console.log(`[useSegmentSettings:${instanceId}] 🔄 Clearing segment overrides (will use shot defaults):`, {
      shotId: shotId?.substring(0, 8) || null,
    });

    setLocalSettings(clearedSettings);
    setIsDirty(true); // Mark dirty so cleared state gets saved
  }, [instanceId, shotId, settings.numFrames]);

  return {
    settings,
    updateSettings,
    saveSettings,
    resetSettings,
    isLoading: isLoadingPair || isLoadingBatch,
    isDirty,
    pairMetadata: pairMetadata ?? null,
    shotBatchSettings: shotBatchSettings ?? null,
    hasOverride,
    shotDefaults: shotDefaultsValue,
  };
}
