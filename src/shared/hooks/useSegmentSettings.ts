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
  summarizeSettings,
  type ShotVideoSettings,
} from '@/shared/utils/settingsMigration';
import { updateToolSettingsSupabase } from '@/shared/hooks/useToolSettings';

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
  /**
   * Callback to update structure video defaults when "Save as Shot Defaults" is clicked.
   * Structure videos are stored separately from tool settings, so the parent must provide this.
   * Returns a Promise so we can await it before showing success.
   */
  onUpdateStructureVideoDefaults?: (updates: {
    motionStrength?: number;
    treatment?: 'adjust' | 'clip';
    uni3cEndPercent?: number;
  }) => Promise<void>;
}

/** Tracks which fields have pair-level overrides vs using shot defaults */
export interface FieldOverrides {
  prompt: boolean;
  negativePrompt: boolean;
  textBeforePrompts: boolean;
  textAfterPrompts: boolean;
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
  textBeforePrompts: string;
  textAfterPrompts: string;
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
  /** Save a single field's current value as shot default */
  saveFieldAsDefault: (field: keyof SegmentSettings, value: any) => Promise<boolean>;
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
  /** AI-generated enhanced prompt (stored separately from user settings) */
  enhancedPrompt: string | undefined;
  /** The base prompt that was used when enhanced prompt was created (for comparison) */
  basePromptForEnhancement: string | undefined;
  /** Clear the enhanced prompt from metadata */
  clearEnhancedPrompt: () => Promise<boolean>;
}

// Track hook instances for debugging
let hookInstanceCounter = 0;

export function useSegmentSettings({
  pairShotGenerationId,
  shotId,
  defaults,
  structureVideoDefaults,
  onUpdateStructureVideoDefaults,
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
      // Use migration utility to show actual overrides (handles both old and new format)
      const overrides = readSegmentOverrides(metadata as Record<string, any> | null);
      console.log('[useSegmentSettings] 📦 Pair metadata loaded:', {
        pairId: pairShotGenerationId.substring(0, 8),
        hasPrompt: overrides.prompt !== undefined,
        promptPreview: overrides.prompt?.substring(0, 30) || '(none)',
        hasNegPrompt: overrides.negativePrompt !== undefined,
        motionMode: overrides.motionMode ?? 'not set',
        amountOfMotion: overrides.amountOfMotion ?? 'not set',
        hasPhaseConfig: overrides.phaseConfig !== undefined,
        phaseConfigFlowShift: overrides.phaseConfig?.flow_shift,
        hasLoras: overrides.loras !== undefined,
        loraCount: overrides.loras?.length ?? 0,
        numFrames: overrides.numFrames ?? 'not set',
        randomSeed: overrides.randomSeed ?? 'not set',
        seed: overrides.seed ?? 'not set',
        selectedPhasePresetId: overrides.selectedPhasePresetId ?? 'not set',
        // Also show if data is in old vs new location (for migration debugging)
        hasOldFormat: !!metadata?.pair_prompt || !!metadata?.pair_motion_settings,
        hasNewFormat: !!metadata?.segmentOverrides,
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

      console.log('[ShotDefaultsDebug] 📦 Shot batch settings loaded (via migration):', {
        shotId: shotId.substring(0, 8),
        // Raw fields from DB (before migration)
        rawPrompt: rawSettings.prompt?.substring(0, 50) || '(undefined)',
        rawBatchVideoPrompt: rawSettings.batchVideoPrompt?.substring(0, 50) || '(undefined)',
        rawSteerableNegPrompt: rawSettings.steerableMotionSettings?.negative_prompt?.substring(0, 30) || '(undefined)',
        rawLorasCount: rawSettings.selectedLoras?.length ?? rawSettings.loras?.length ?? 0,
        // Result after migration
        resultPrompt: result.prompt?.substring(0, 50) || '(empty)',
        resultNegPrompt: result.negativePrompt?.substring(0, 30) || '(empty)',
        resultLorasCount: result.loras?.length ?? 0,
      });
      return result;
    },
    enabled: !!shotId,
    staleTime: 0, // Always refetch - shot settings can change from BatchSettingsForm
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
      textBeforePrompts: pairOverrides.textBeforePrompts,
      textAfterPrompts: pairOverrides.textAfterPrompts,

      // Motion settings: only include if segment has override (undefined = use shot default)
      motionMode: pairOverrides.motionMode as 'basic' | 'advanced' | undefined,
      amountOfMotion: pairOverrides.amountOfMotion,
      phaseConfig: pairOverrides.phaseConfig,
      selectedPhasePresetId: pairOverrides.selectedPhasePresetId,
      // Keep loras as undefined when no override, so effectiveLoras can fall back to shot defaults
      // When user edits other fields, loras stays undefined and shot defaults are preserved
      loras: pairOverrides.loras,

      // Frame count: always from timeline (source of truth)
      numFrames: defaults.numFrames ?? 25,

      // Seed settings from segment overrides (via migration utility)
      randomSeed: pairOverrides.randomSeed ?? true,
      seed: pairOverrides.seed,

      // Default for regeneration behavior
      makePrimaryVariant: false,

      // Structure video: only include if segment has override
      structureMotionStrength: pairOverrides.structureMotionStrength,
      structureTreatment: pairOverrides.structureTreatment,
      structureUni3cEndPercent: pairOverrides.structureUni3cEndPercent,
    };

    return formSettings;
  }, [pairMetadata, defaults]);

  // Shot-level defaults (for showing as placeholder/fallback when no pair override)
  const shotDefaultsValue = useMemo((): ShotDefaults => {
    const defaults = {
      prompt: shotVideoSettings?.prompt || '',
      negativePrompt: shotVideoSettings?.negativePrompt || '',
      motionMode: shotVideoSettings?.motionMode || 'basic',
      amountOfMotion: shotVideoSettings?.amountOfMotion ?? 50,
      phaseConfig: shotVideoSettings?.phaseConfig,
      loras: shotVideoSettings?.loras || [],
      selectedPhasePresetId: shotVideoSettings?.selectedPhasePresetId ?? null,
      textBeforePrompts: shotVideoSettings?.textBeforePrompts || '',
      textAfterPrompts: shotVideoSettings?.textAfterPrompts || '',
    };
    console.log('[ShotDefaultsDebug] Computing shotDefaultsValue:', {
      hasShotVideoSettings: !!shotVideoSettings,
      shotVideoSettingsPrompt: shotVideoSettings?.prompt?.substring(0, 50) || '(none)',
      resultPrompt: defaults.prompt?.substring(0, 50) || '(empty)',
      resultLoraCount: defaults.loras?.length ?? 0,
      textBeforePrompts: defaults.textBeforePrompts?.substring(0, 30) || '(empty)',
      textAfterPrompts: defaults.textAfterPrompts?.substring(0, 30) || '(empty)',
    });
    return defaults;
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

  // Compute which fields have pair-level overrides (vs using shot defaults)
  // This tells the form whether to show the value as actual content or as placeholder
  // Returns undefined during loading so form knows to show merged settings (not empty)
  //
  // IMPORTANT: This considers BOTH local state AND DB state.
  // - If localSettings exists and field is explicitly undefined → no override (user cleared it)
  // - If localSettings exists and field has a value → has override
  // - If localSettings is null → check DB state (pairOverrides)
  // This ensures UI updates immediately when user clicks "Set as Default" (which clears local override)
  const hasOverride = useMemo((): FieldOverrides | undefined => {
    // Return undefined while loading - form will show merged settings
    if (isLoadingPair) return undefined;

    // Use migration utility to read pair overrides from either old or new format
    const pairOverrides = readSegmentOverrides(pairMetadata as Record<string, any> | null);

    // Helper: check if field has override considering local state
    // - If we have local settings and field is explicitly in it, use local state
    // - Otherwise, fall back to DB state
    const hasFieldOverride = (field: keyof typeof pairOverrides): boolean => {
      if (localSettings !== null && field in localSettings) {
        // Local state exists for this field - use it
        // undefined means "no override", any other value means "has override"
        return (localSettings as any)[field] !== undefined;
      }
      // No local state - check DB
      return pairOverrides[field] !== undefined;
    };

    return {
      prompt: hasFieldOverride('prompt'),
      negativePrompt: hasFieldOverride('negativePrompt'),
      textBeforePrompts: hasFieldOverride('textBeforePrompts'),
      textAfterPrompts: hasFieldOverride('textAfterPrompts'),
      motionMode: hasFieldOverride('motionMode'),
      amountOfMotion: hasFieldOverride('amountOfMotion'),
      phaseConfig: hasFieldOverride('phaseConfig'),
      loras: hasFieldOverride('loras'),
      selectedPhasePresetId: hasFieldOverride('selectedPhasePresetId'),
      structureMotionStrength: hasFieldOverride('structureMotionStrength'),
      structureTreatment: hasFieldOverride('structureTreatment'),
      structureUni3cEndPercent: hasFieldOverride('structureUni3cEndPercent'),
    };
  }, [pairMetadata, isLoadingPair, localSettings]);

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
    console.log(`[SegmentSaveDebug] updateSettings called:`, {
      pairId: pairShotGenerationId?.substring(0, 8) || '(none)',
      keys: Object.keys(updates),
      promptUpdate: updates.prompt?.substring(0, 30) || '(undefined or empty)',
      negPromptUpdate: updates.negativePrompt?.substring(0, 30) || '(undefined or empty)',
      lorasUpdate: updates.loras?.length,
    });
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
  // Optional settingsOverride parameter allows passing settings directly (e.g., for resetSettings)
  // This avoids React closure issues where the captured `settings` might be stale
  const saveSettings = useCallback(async (settingsOverride?: SegmentSettings): Promise<boolean> => {
    // Use override if provided, otherwise use current settings from state
    const settingsToSave = settingsOverride ?? settings;

    if (!pairShotGenerationId) {
      console.warn('[useSegmentSettings] ⚠️ Cannot save - no pairShotGenerationId (lightbox may be opened from non-travel context)');
      return false;
    }

    console.log(`[useSegmentSettings:${instanceId}] 💾 Saving settings to pair:`, pairShotGenerationId.substring(0, 8), {
      prompt: settingsToSave.prompt?.substring(0, 30) + '...',
      negPrompt: settingsToSave.negativePrompt?.substring(0, 30) + '...',
      motionMode: settingsToSave.motionMode,
      amountOfMotion: settingsToSave.amountOfMotion,
      hasPhaseConfig: !!settingsToSave.phaseConfig,
      phaseConfigFlowShift: settingsToSave.phaseConfig?.flow_shift,
      loraCount: settingsToSave.loras?.length ?? 0,
      willSavePhaseConfig: settingsToSave.motionMode !== 'basic',
      numFrames: settingsToSave.numFrames,
      randomSeed: settingsToSave.randomSeed,
      seed: settingsToSave.seed,
      selectedPhasePresetId: settingsToSave.selectedPhasePresetId,
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

      // Build update from settings to save
      // Note: numFrames is NOT saved - timeline positions are the source of truth
      const newMetadata = buildMetadataUpdate(currentMetadata, {
        prompt: settingsToSave.prompt,
        negativePrompt: settingsToSave.negativePrompt,
        textBeforePrompts: settingsToSave.textBeforePrompts,
        textAfterPrompts: settingsToSave.textAfterPrompts,
        motionMode: settingsToSave.motionMode,
        amountOfMotion: settingsToSave.amountOfMotion, // Store in 0-100 scale (UI scale) - new format
        phaseConfig: settingsToSave.motionMode === 'basic' ? null : settingsToSave.phaseConfig,
        loras: settingsToSave.loras,
        // numFrames intentionally omitted - timeline positions are source of truth
        randomSeed: settingsToSave.randomSeed,
        seed: settingsToSave.seed,
        selectedPhasePresetId: settingsToSave.selectedPhasePresetId,
        // Structure video overrides (only saved if set)
        structureMotionStrength: settingsToSave.structureMotionStrength,
        structureTreatment: settingsToSave.structureTreatment,
        structureUni3cEndPercent: settingsToSave.structureUni3cEndPercent,
      });

      // Log the new format (segmentOverrides) since buildMetadataUpdate writes there and deletes old pair_* fields
      const savedOverrides = newMetadata.segmentOverrides || {};
      console.log(`[useSegmentSettings:${instanceId}] 📝 Built metadata update:`, {
        pairId: pairShotGenerationId.substring(0, 8),
        hasSegmentOverrides: !!newMetadata.segmentOverrides,
        segmentOverrides: {
          prompt: savedOverrides.prompt !== undefined,
          promptPreview: savedOverrides.prompt?.substring(0, 30) || '(none)',
          negativePrompt: savedOverrides.negativePrompt !== undefined,
          motionMode: savedOverrides.motionMode,
          amountOfMotion: savedOverrides.amountOfMotion,
          hasPhaseConfig: savedOverrides.phaseConfig !== undefined,
          loraCount: savedOverrides.loras?.length ?? 0,
          numFrames: savedOverrides.numFrames,
          randomSeed: savedOverrides.randomSeed,
          seed: savedOverrides.seed,
          selectedPhasePresetId: savedOverrides.selectedPhasePresetId,
        },
      });

      // Save
      console.log(`[SegmentSaveDebug] 🔄 Executing database UPDATE...`, {
        pairId: pairShotGenerationId.substring(0, 8),
        metadataToSave: JSON.stringify(newMetadata).substring(0, 200),
      });
      const { data: updateResult, error: updateError } = await supabase
        .from('shot_generations')
        .update({ metadata: newMetadata })
        .eq('id', pairShotGenerationId)
        .select('metadata')
        .single();

      if (updateError) {
        console.error('[useSegmentSettings] Error saving metadata:', updateError);
        return false;
      }

      // Verify the save by checking the returned data
      const savedData = updateResult?.metadata as Record<string, any> | null;
      console.log(`[SegmentSaveDebug] ✅ Database UPDATE completed:`, {
        pairId: pairShotGenerationId.substring(0, 8),
        returnedSegmentOverrides: savedData?.segmentOverrides,
        returnedPrompt: savedData?.segmentOverrides?.prompt?.substring(0, 30) || '(none)',
        returnedLoraCount: savedData?.segmentOverrides?.loras?.length ?? 0,
      });

      console.log(`[useSegmentSettings:${instanceId}] ✅ Settings saved`, {
        pairShotGenerationId: pairShotGenerationId?.substring(0, 8),
        shotId: shotId?.substring(0, 8),
        savedPrompt: settingsToSave.prompt?.substring(0, 50),
        savedNegativePrompt: settingsToSave.negativePrompt?.substring(0, 50),
      });

      // Refetch the cache so mergedSettings uses fresh data immediately
      // Using refetchQueries (not invalidateQueries) ensures the data is actually fetched before continuing
      // This is critical for resetSettings which clears localSettings and relies on fresh mergedSettings
      console.log(`[SegmentSaveDebug] 🔄 Refetching pair-metadata cache for:`, pairShotGenerationId.substring(0, 8));
      await queryClient.refetchQueries({ queryKey: ['pair-metadata', pairShotGenerationId] });
      console.log(`[SegmentSaveDebug] ✅ pair-metadata cache refetched`);

      // Refetch (not just invalidate) shot generations so timeline/pairDataByIndex updates immediately
      // Using refetchQueries ensures the query is actively refetched and events are reliably emitted
      if (shotId) {
        console.log(`[SegmentSaveDebug] 🔄 Refetching all-shot-generations for:`, shotId.substring(0, 8));
        queryClient.refetchQueries({ queryKey: ['all-shot-generations', shotId] });
        console.log(`[SegmentSaveDebug] ✅ all-shot-generations refetch queued`);
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

    // Get the effective/displayed values by merging segment overrides with shot defaults
    // This is what the user actually sees in the form
    const effectivePrompt = settings.prompt || shotDefaultsValue.prompt || '';
    const effectiveNegativePrompt = settings.negativePrompt || shotDefaultsValue.negativePrompt || '';
    const effectiveMotionMode = settings.motionMode ?? shotDefaultsValue.motionMode ?? 'basic';
    const effectiveAmountOfMotion = settings.amountOfMotion ?? shotDefaultsValue.amountOfMotion ?? 50;
    const effectivePhaseConfig = settings.phaseConfig ?? shotDefaultsValue.phaseConfig;
    const effectiveSelectedPhasePresetId = settings.selectedPhasePresetId ?? shotDefaultsValue.selectedPhasePresetId ?? null;
    // Use segment loras if explicitly set (even empty array), otherwise use shot defaults
    // Consistent with effectiveLoras in SegmentSettingsForm
    const effectiveLoras = settings.loras !== undefined ? settings.loras : (shotDefaultsValue.loras ?? []);
    // Text before/after prompts
    const effectiveTextBeforePrompts = settings.textBeforePrompts ?? shotDefaultsValue.textBeforePrompts ?? '';
    const effectiveTextAfterPrompts = settings.textAfterPrompts ?? shotDefaultsValue.textAfterPrompts ?? '';
    // Seed settings
    const effectiveRandomSeed = settings.randomSeed ?? true;
    const effectiveSeed = settings.seed;

    console.log(`[useSegmentSettings:${instanceId}] 💾 Saving as shot defaults:`, shotId.substring(0, 8), {
      // Raw settings (segment overrides only)
      rawPrompt: settings.prompt?.substring(0, 30) || '(none)',
      rawLoras: settings.loras?.length ?? 0,
      // Shot defaults being used as fallback
      shotDefaultPrompt: shotDefaultsValue.prompt?.substring(0, 30) || '(none)',
      shotDefaultLoras: shotDefaultsValue.loras?.length ?? 0,
      // Effective values that will be saved
      effectivePrompt: effectivePrompt?.substring(0, 30) + '...',
      effectiveNegPrompt: effectiveNegativePrompt?.substring(0, 30) + '...',
      effectiveMotionMode,
      effectiveAmountOfMotion,
      hasPhaseConfig: !!effectivePhaseConfig,
      effectiveLoraCount: effectiveLoras?.length ?? 0,
      effectiveTextBeforePrompts: effectiveTextBeforePrompts?.substring(0, 30) || '(empty)',
      effectiveTextAfterPrompts: effectiveTextAfterPrompts?.substring(0, 30) || '(empty)',
      effectiveRandomSeed,
      effectiveSeed: effectiveSeed ?? '(random)',
    });

    try {
      // Build the patch for shot-level settings using EFFECTIVE values
      // (what the user sees in the form, merging segment overrides with shot defaults)
      const shotPatch = {
        prompt: effectivePrompt,
        negativePrompt: effectiveNegativePrompt,
        motionMode: effectiveMotionMode,
        amountOfMotion: effectiveAmountOfMotion,
        phaseConfig: effectivePhaseConfig,
        selectedPhasePresetId: effectiveSelectedPhasePresetId,
        loras: effectiveLoras,
        textBeforePrompts: effectiveTextBeforePrompts,
        textAfterPrompts: effectiveTextAfterPrompts,
        randomSeed: effectiveRandomSeed,
        seed: effectiveSeed,
        // Note: numFrames intentionally not included - timeline positions are source of truth
        // Note: structure video settings are stored per-video in structure_videos table, not here
      };

      console.log(`[SetAsShotDefaults] 📤 Sending patch to updateToolSettingsSupabase:`, {
        shotId: shotId.substring(0, 8),
        shotPatch: {
          prompt: shotPatch.prompt?.substring(0, 50) || '(empty)',
          negativePrompt: shotPatch.negativePrompt?.substring(0, 50) || '(empty)',
          motionMode: shotPatch.motionMode,
          amountOfMotion: shotPatch.amountOfMotion,
          hasPhaseConfig: !!shotPatch.phaseConfig,
          loraCount: shotPatch.loras?.length ?? 0,
          loraNames: shotPatch.loras?.map((l: any) => l.name) ?? [],
          textBeforePrompts: shotPatch.textBeforePrompts?.substring(0, 30) || '(empty)',
          textAfterPrompts: shotPatch.textAfterPrompts?.substring(0, 30) || '(empty)',
          randomSeed: shotPatch.randomSeed,
          seed: shotPatch.seed ?? '(random)',
        },
      });

      // Use the proper settings update function which:
      // 1. Merges with existing settings (preserves batch-specific fields)
      // 2. Updates localStorage for settings inheritance
      // 3. Uses atomic RPC for consistency
      const result = await updateToolSettingsSupabase({
        scope: 'shot',
        id: shotId,
        toolId: 'travel-between-images',
        patch: shotPatch,
      }, undefined, 'immediate');

      console.log(`[SetAsShotDefaults] ✅ updateToolSettingsSupabase returned:`, {
        shotId: shotId.substring(0, 8),
        resultPrompt: result?.prompt?.substring(0, 50) || '(none in result)',
        resultLoraCount: result?.loras?.length ?? 0,
      });

      // Refetch query caches so changes are visible everywhere:
      console.log(`[SetAsShotDefaults] 🔄 Refetching query caches...`);
      // 1. useSegmentSettings uses this key - refetch to update placeholders immediately
      await queryClient.refetchQueries({ queryKey: ['shot-batch-settings', shotId] });
      // 2. useToolSettings / useShotSettings uses 'toolSettings' (not 'tool-settings')
      //    Key format: ['toolSettings', toolId, projectId, shotId]
      await queryClient.refetchQueries({ queryKey: ['toolSettings', 'travel-between-images'] });
      console.log(`[SetAsShotDefaults] ✅ Query caches refetched`);

      // Update structure video defaults if callback provided and segment has overrides
      if (onUpdateStructureVideoDefaults) {
        const hasStructureOverrides =
          settings.structureMotionStrength !== undefined ||
          settings.structureTreatment !== undefined ||
          settings.structureUni3cEndPercent !== undefined;

        if (hasStructureOverrides) {
          // Calculate effective values (segment override → shot default)
          const effectiveStructureMotionStrength = settings.structureMotionStrength ?? structureVideoDefaults?.motionStrength;
          const effectiveStructureTreatment = settings.structureTreatment ?? structureVideoDefaults?.treatment;
          const effectiveStructureUni3cEndPercent = settings.structureUni3cEndPercent ?? structureVideoDefaults?.uni3cEndPercent;

          console.log(`[SetAsShotDefaults] 🎬 Updating structure video defaults:`, {
            motionStrength: effectiveStructureMotionStrength,
            treatment: effectiveStructureTreatment,
            uni3cEndPercent: effectiveStructureUni3cEndPercent,
          });

          // Await the structure video update so UI refreshes before we return
          await onUpdateStructureVideoDefaults({
            motionStrength: effectiveStructureMotionStrength,
            treatment: effectiveStructureTreatment,
            uni3cEndPercent: effectiveStructureUni3cEndPercent,
          });

          // Clear segment's structure video overrides from local state AND DB
          // so form shows "Default" badges (values are now the shot defaults)
          // Convention: null = clear the override, undefined = don't touch
          const clearedStructureSettings: SegmentSettings = {
            ...settings,
            structureMotionStrength: null as any,  // null = clear override
            structureTreatment: null as any,
            structureUni3cEndPercent: null as any,
          };
          await saveSettings(clearedStructureSettings);
          // For local state, set to undefined so form falls back to shot defaults
          setLocalSettings({
            ...settings,
            structureMotionStrength: undefined,
            structureTreatment: undefined,
            structureUni3cEndPercent: undefined,
          });
        }
      }

      return true;
    } catch (error) {
      console.error('[useSegmentSettings] Exception saving shot defaults:', error);
      return false;
    }
  }, [shotId, settings, shotDefaultsValue, instanceId, queryClient, onUpdateStructureVideoDefaults, structureVideoDefaults]);

  // Save a single field's current value as shot default
  const saveFieldAsDefault = useCallback(async (field: keyof SegmentSettings, value: any): Promise<boolean> => {
    if (!shotId) {
      console.warn('[useSegmentSettings] ⚠️ Cannot save field as shot default - no shotId');
      return false;
    }

    console.log(`[useSegmentSettings:${instanceId}] 💾 Saving field as shot default:`, {
      shotId: shotId.substring(0, 8),
      field,
      value: typeof value === 'string' ? value.substring(0, 50) : value,
    });

    try {
      // Build a patch with just this field
      const shotPatch: Record<string, any> = {
        [field]: value,
      };

      // Use the proper settings update function
      await updateToolSettingsSupabase({
        scope: 'shot',
        id: shotId,
        toolId: 'travel-between-images',
        patch: shotPatch,
      }, undefined, 'immediate');

      // Refetch query caches so changes are visible everywhere
      await queryClient.refetchQueries({ queryKey: ['shot-batch-settings', shotId] });
      await queryClient.refetchQueries({ queryKey: ['toolSettings', 'travel-between-images'] });

      console.log(`[useSegmentSettings:${instanceId}] ✅ Field saved as shot default:`, field);
      return true;
    } catch (error) {
      console.error('[useSegmentSettings] Exception saving field as shot default:', error);
      return false;
    }
  }, [shotId, instanceId, queryClient]);

  // Get effective settings for task creation (merges segment overrides with shot defaults)
  // This is what should be passed to buildTaskParams() when generating
  const getSettingsForTaskCreation = useCallback((): SegmentSettings => {
    // Merge settings with shot defaults, respecting override flags
    // For fields without overrides, use shot defaults

    // Get the base prompt (segment override or shot default)
    const basePrompt = settings.prompt ?? shotDefaultsValue.prompt ?? '';

    // Merge textBeforePrompts and textAfterPrompts into the final prompt
    // Use segment override if exists, otherwise shot defaults
    const textBefore = settings.textBeforePrompts ?? shotDefaultsValue.textBeforePrompts ?? '';
    const textAfter = settings.textAfterPrompts ?? shotDefaultsValue.textAfterPrompts ?? '';
    const mergedPrompt = [textBefore, basePrompt, textAfter]
      .map(s => s.trim())
      .filter(Boolean)
      .join(' ');

    const effectiveSettings: SegmentSettings = {
      // Prompts: merged with before/after text from shot defaults
      prompt: mergedPrompt,
      negativePrompt: settings.negativePrompt ?? shotDefaultsValue.negativePrompt ?? '',

      // Motion settings: segment override > shot default > defaults
      motionMode: settings.motionMode ?? shotDefaultsValue.motionMode ?? 'basic',
      amountOfMotion: settings.amountOfMotion ?? shotDefaultsValue.amountOfMotion ?? 50,
      phaseConfig: settings.phaseConfig ?? shotDefaultsValue.phaseConfig,
      selectedPhasePresetId: settings.selectedPhasePresetId ?? shotDefaultsValue.selectedPhasePresetId ?? null,

      // LoRAs: if segment has override (even empty array), use it; otherwise use shot defaults
      loras: hasOverride?.loras ? settings.loras : (shotDefaultsValue.loras?.map(l => ({
        id: l.id || l.path,
        name: l.name || l.path.split('/').pop()?.replace('.safetensors', '') || l.path,
        path: l.path,
        strength: l.strength,
      })) ?? []),

      // These don't fall back to shot defaults
      numFrames: settings.numFrames,
      randomSeed: settings.randomSeed ?? true,
      seed: settings.seed,
      makePrimaryVariant: settings.makePrimaryVariant ?? false,

      // Structure video overrides
      structureMotionStrength: settings.structureMotionStrength,
      structureTreatment: settings.structureTreatment,
      structureUni3cEndPercent: settings.structureUni3cEndPercent,
    };

    console.log(`[useSegmentSettings:${instanceId}] 📦 getSettingsForTaskCreation:`, {
      hasSegmentPrompt: settings.prompt !== undefined,
      usingShotDefaultPrompt: settings.prompt === undefined && !!shotDefaultsValue.prompt,
      effectivePrompt: effectiveSettings.prompt?.substring(0, 50) || '(empty)',
      hasLoraOverride: hasOverride?.loras,
      effectiveLoraCount: effectiveSettings.loras?.length ?? 0,
    });

    return effectiveSettings;
  }, [settings, shotDefaultsValue, hasOverride, instanceId]);

  // Keep saveSettingsRef updated
  useEffect(() => {
    saveSettingsRef.current = saveSettings;
  }, [saveSettings]);

  // Auto-save on changes (debounced)
  useEffect(() => {
    // Only auto-save if user has edited and we have a pairShotGenerationId
    console.log(`[SegmentSaveDebug] Auto-save check:`, {
      hasUserEdited: hasUserEdited.current,
      pairShotGenerationId: pairShotGenerationId?.substring(0, 8) || null,
      isDirty,
      willSave: hasUserEdited.current && pairShotGenerationId && isDirty,
      localSettingsPrompt: localSettings?.prompt?.substring(0, 30) || '(no local)',
      mergedSettingsPrompt: mergedSettings?.prompt?.substring(0, 30) || '(no merged)',
    });
    if (!hasUserEdited.current || !pairShotGenerationId || !isDirty) {
      return;
    }

    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce the save
    saveTimeoutRef.current = setTimeout(async () => {
      console.log(`[SegmentSaveDebug] ⏱️ Auto-save triggered (debounced)`, {
        pairId: pairShotGenerationId.substring(0, 8),
        settingsPrompt: settings.prompt?.substring(0, 30) || '(none)',
        settingsLoraCount: settings.loras?.length ?? 0,
      });
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

  // Clear enhanced prompt from metadata
  const clearEnhancedPrompt = useCallback(async (): Promise<boolean> => {
    if (!pairShotGenerationId) {
      console.warn('[useSegmentSettings] ⚠️ Cannot clear enhanced prompt - no pairShotGenerationId');
      return false;
    }

    console.log(`[useSegmentSettings:${instanceId}] 🧹 Clearing enhanced prompt for:`, pairShotGenerationId.substring(0, 8));

    try {
      // Fetch current metadata
      const { data: current, error: fetchError } = await supabase
        .from('shot_generations')
        .select('metadata')
        .eq('id', pairShotGenerationId)
        .single();

      if (fetchError) {
        console.error('[useSegmentSettings] Error fetching metadata for clear:', fetchError);
        return false;
      }

      const currentMetadata = (current?.metadata as Record<string, any>) || {};
      const updatedMetadata = {
        ...currentMetadata,
        enhanced_prompt: '', // Clear the enhanced prompt
      };

      const { error: updateError } = await supabase
        .from('shot_generations')
        .update({ metadata: updatedMetadata })
        .eq('id', pairShotGenerationId);

      if (updateError) {
        console.error('[useSegmentSettings] Error clearing enhanced prompt:', updateError);
        return false;
      }

      // Invalidate cache
      await queryClient.invalidateQueries({ queryKey: ['pair-metadata', pairShotGenerationId] });

      console.log(`[useSegmentSettings:${instanceId}] ✅ Enhanced prompt cleared`);
      return true;
    } catch (error) {
      console.error('[useSegmentSettings] Exception clearing enhanced prompt:', error);
      return false;
    }
  }, [pairShotGenerationId, instanceId, queryClient]);

  // Reset to shot defaults by clearing all segment overrides AND enhanced prompt
  // This saves the cleared state to DB, then clears local state so form shows defaults immediately
  const resetSettings = useCallback(async () => {
    const clearedSettings: SegmentSettings = {
      // Clear all overridable fields
      // '' for strings = clear override (buildMetadataUpdate interprets this as "delete from DB")
      // null for other types = clear override
      prompt: '',
      negativePrompt: '',
      textBeforePrompts: '',
      textAfterPrompts: '',
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

    console.log(`[useSegmentSettings:${instanceId}] 🔄 Clearing segment overrides + enhanced prompt (will use shot defaults):`, {
      shotId: shotId?.substring(0, 8) || null,
    });

    // Save immediately by passing cleared settings directly
    // This avoids React closure issues - we don't rely on setLocalSettings being applied
    if (pairShotGenerationId) {
      // Cancel any pending auto-save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      // Pass clearedSettings directly to avoid stale closure
      await saveSettings(clearedSettings);

      // Clear enhanced prompt AFTER saveSettings completes to avoid race condition
      // Both functions do read-modify-write on metadata, so they must be sequential
      await clearEnhancedPrompt();
    }

    // Clear local state so form falls back to mergedSettings (which shows shot defaults)
    setLocalSettings(null);
    setIsDirty(false);
  }, [instanceId, shotId, settings.numFrames, clearEnhancedPrompt, pairShotGenerationId, saveSettings]);

  // Extract enhanced prompt and base prompt from pair metadata (AI-generated, stored separately)
  const enhancedPrompt = (pairMetadata as Record<string, any> | null)?.enhanced_prompt as string | undefined;
  const basePromptForEnhancement = (pairMetadata as Record<string, any> | null)?.base_prompt_for_enhancement as string | undefined;

  return {
    settings,
    updateSettings,
    saveSettings,
    resetSettings,
    saveAsShotDefaults,
    saveFieldAsDefault,
    getSettingsForTaskCreation,
    isLoading: isLoadingPair || isLoadingBatch,
    isDirty,
    pairMetadata: pairMetadata ?? null,
    shotBatchSettings: shotBatchSettings ?? null,
    hasOverride,
    shotDefaults: shotDefaultsValue,
    enhancedPrompt: enhancedPrompt?.trim() || undefined,
    basePromptForEnhancement: basePromptForEnhancement?.trim() || undefined,
    clearEnhancedPrompt,
  };
}
