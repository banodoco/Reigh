/**
 * Shared Segment Regeneration Controls
 *
 * Used by:
 * - ChildGenerationsView (SegmentCard)
 * - MediaLightbox (SegmentRegenerateForm)
 *
 * Provides consistent UX for regenerating video segments
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';
import { Label } from '@/shared/components/ui/label';
import { Slider } from '@/shared/components/ui/slider';
import { Switch } from '@/shared/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { ChevronDown, ChevronUp, ChevronLeft, Loader2, Check, RotateCcw, Upload } from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { usePersistentToolState } from '@/shared/hooks/usePersistentToolState';
import { createIndividualTravelSegmentTask } from '@/shared/lib/tasks/individualTravelSegment';
import { usePublicLoras } from '@/shared/hooks/useResources';
import { MotionPresetSelector, type BuiltinPreset } from '@/shared/components/MotionPresetSelector';
import { ActiveLoRAsDisplay } from '@/shared/components/ActiveLoRAsDisplay';
import { LoraSelectorModal } from '@/shared/components/LoraSelectorModal';
import { PhaseConfig, DEFAULT_PHASE_CONFIG, DEFAULT_VACE_PHASE_CONFIG } from '@/tools/travel-between-images/settings';
import { quantizeFrameCount, framesToSeconds } from '@/tools/travel-between-images/components/Timeline/utils/time-utils';
import { getNormalizedParams } from '@/shared/lib/normalizeSegmentParams';
import type { LoraModel, ActiveLora } from '@/shared/hooks/useLoraManager';

// Safe substring helper for debug logging (handles non-strings)
const safeSubstr = (val: unknown): string => {
  if (typeof val === 'string') return val.substring(0, 8);
  if (val === null || val === undefined) return 'null';
  return `[${typeof val}]`;
};

// Built-in presets for segment regeneration
const BUILTIN_I2V_PRESET_ID = '__builtin_segment_i2v_default__';
const BUILTIN_VACE_PRESET_ID = '__builtin_segment_vace_default__';

const BUILTIN_I2V_PRESET: BuiltinPreset = {
  id: BUILTIN_I2V_PRESET_ID,
  metadata: {
    name: 'Basic',
    description: 'Standard I2V generation',
    phaseConfig: DEFAULT_PHASE_CONFIG,
    generationTypeMode: 'i2v',
  }
};

const BUILTIN_VACE_PRESET: BuiltinPreset = {
  id: BUILTIN_VACE_PRESET_ID,
  metadata: {
    name: 'Basic',
    description: 'Standard VACE generation with structure video',
    phaseConfig: DEFAULT_VACE_PHASE_CONFIG,
    generationTypeMode: 'vace',
  }
};

// Helper to detect generation mode from model name
const detectGenerationMode = (modelName?: string): 'i2v' | 'vace' => {
  if (!modelName) return 'i2v';
  return modelName.toLowerCase().includes('vace') ? 'vace' : 'i2v';
};

export interface SegmentRegenerateControlsProps {
  /** Generation params from the current video */
  initialParams: Record<string, any>;
  /** Project ID for task creation */
  projectId: string | null;
  /** Generation ID to use as parent for the new child generation (optional if shotId provided) */
  generationId?: string;
  /** Shot ID to link new parent generation to (used when no generationId exists) */
  shotId?: string;
  /** Optional existing child generation ID (for Replace mode) */
  childGenerationId?: string;
  /** Whether this is regenerating an existing segment (shows "Make primary variant" toggle) */
  isRegeneration?: boolean;
  /** Segment index (defaults to 0 for single-segment videos) */
  segmentIndex?: number;
  /** Start image URL for the segment */
  startImageUrl?: string;
  /** End image URL for the segment */
  endImageUrl?: string;
  /** Start image generation ID */
  startImageGenerationId?: string;
  /** End image generation ID */
  endImageGenerationId?: string;
  /** Shot generation ID for the start image (for video-to-timeline tethering) */
  pairShotGenerationId?: string;
  /** Project resolution for output */
  projectResolution?: string;
  /** Unique key prefix for React Query caching */
  queryKeyPrefix?: string;
  /** Optional click handler for start image */
  onStartImageClick?: () => void;
  /** Optional click handler for end image */
  onEndImageClick?: () => void;
  /** Optional upload handler for start image */
  onStartImageUpload?: (file: File) => Promise<void>;
  /** Optional upload handler for end image */
  onEndImageUpload?: (file: File) => Promise<void>;
  /** Whether start image upload is in progress */
  isUploadingStartImage?: boolean;
  /** Whether end image upload is in progress */
  isUploadingEndImage?: boolean;
  /** Button label text */
  buttonLabel?: string;
  /** Whether to show a header (default: false) */
  showHeader?: boolean;
  /** Custom header title (default: "Regenerate Video") */
  headerTitle?: string;
  /** Predecessor video URL for smooth continuations (SVI) - only for segments after the first */
  predecessorVideoUrl?: string;
  /** Whether to show the smooth continuations toggle (only shown when predecessorVideoUrl is available) */
  showSmoothContinuation?: boolean;
  /** Callback when frame count changes - for updating timeline */
  onFrameCountChange?: (frameCount: number) => void;
  /** Callback when generate is initiated (for optimistic UI updates) */
  onGenerateStarted?: (pairShotGenerationId: string | null | undefined) => void;
}

export const SegmentRegenerateControls: React.FC<SegmentRegenerateControlsProps> = ({
  initialParams,
  projectId,
  generationId,
  shotId,
  childGenerationId,
  isRegeneration = false,
  segmentIndex = 0,
  startImageUrl,
  endImageUrl,
  startImageGenerationId,
  endImageGenerationId,
  pairShotGenerationId,
  projectResolution,
  queryKeyPrefix = 'segment-regenerate',
  onStartImageClick,
  onEndImageClick,
  onStartImageUpload,
  onEndImageUpload,
  isUploadingStartImage,
  isUploadingEndImage,
  buttonLabel = 'Regenerate Segment',
  showHeader = false,
  headerTitle = 'Regenerate Video',
  predecessorVideoUrl,
  showSmoothContinuation = false,
  onFrameCountChange,
  onGenerateStarted,
}) => {
  // Unique instance ID to track component recreation
  const instanceId = useMemo(() => Math.random().toString(36).substring(2, 6), []);

  // Log on mount to debug pairShotGenerationId flow
  useEffect(() => {
    console.log(`[PairMetadata] 🎬 MOUNT instance=${instanceId} pairShotGenerationId=${safeSubstr(pairShotGenerationId)}`);
    return () => {
      console.log(`[PairMetadata] 💀 UNMOUNT instance=${instanceId}`);
    };
  }, [instanceId, pairShotGenerationId]);

  // Fetch shot's structure video settings directly using shotId
  // This ensures we have the latest settings even if initialParams are stale
  // NOTE: Structure videos are stored under 'travel-structure-video' key (via useStructureVideo hook)
  const { data: shotStructureData, isLoading: isLoadingShotStructure } = useQuery({
    queryKey: ['shot-structure-settings', shotId],
    queryFn: async () => {
      if (!shotId) return null;
      console.log('[StructureVideoFix] 🔍 [SegmentRegenerateControls] Fetching shot structure settings for:', shotId?.substring(0, 8));
      const { data, error } = await supabase
        .from('shots')
        .select('settings')
        .eq('id', shotId)
        .single();
      if (error) {
        console.error('[StructureVideoFix] ❌ [SegmentRegenerateControls] Shot settings query FAILED:', error);
        return null;
      }
      // DEBUG: Log all keys in settings to see where data is stored
      const allSettings = data?.settings as Record<string, any>;
      const settingsKeys = allSettings ? Object.keys(allSettings) : [];
      console.log('[StructureVideoFix] 🗃️ [SegmentRegenerateControls] All settings keys:', settingsKeys);
      
      // Structure videos are stored under 'travel-structure-video' key (via useStructureVideo hook)
      const structureVideoSettings = allSettings?.['travel-structure-video'] ?? {};
      // Also check the old/wrong key for debugging
      const wrongKeySettings = allSettings?.['travel-between-images'] ?? {};
      
      console.log('[StructureVideoFix] 📦 [SegmentRegenerateControls] Shot structure settings loaded:', {
        shotId: shotId?.substring(0, 8),
        hasStructureVideos: !!(structureVideoSettings.structure_videos?.length > 0),
        structureVideosCount: structureVideoSettings.structure_videos?.length ?? 0,
        hasStructureGuidance: !!structureVideoSettings.structure_guidance,
        firstVideoPath: structureVideoSettings.structure_videos?.[0]?.path?.substring(0, 50) ?? '(none)',
        structureGuidanceTarget: structureVideoSettings.structure_guidance?.target ?? '(none)',
        // Debug: Check if data is under wrong key
        wrongKeyHasStructureVideos: !!(wrongKeySettings.structure_videos?.length > 0),
        wrongKeyStructureVideosCount: wrongKeySettings.structure_videos?.length ?? 0,
      });
      return {
        structure_videos: structureVideoSettings.structure_videos ?? null,
        structure_guidance: structureVideoSettings.structure_guidance ?? null,
      };
    },
    enabled: !!shotId,
    staleTime: 30000, // Cache for 30 seconds
    retry: 1,
    retryDelay: 1000,
  });

  // Log loading state changes
  React.useEffect(() => {
    if (shotId) {
      console.log('[StructureVideoFix] ⏳ [SegmentRegenerateControls] Shot structure loading state:', {
        shotId: shotId?.substring(0, 8),
        isLoading: isLoadingShotStructure,
        hasData: !!shotStructureData,
        structureVideosCount: shotStructureData?.structure_videos?.length ?? 0,
      });
    }
  }, [shotId, isLoadingShotStructure, shotStructureData]);

  // Fetch shot's batch generation settings to use as defaults
  // This ensures the modal uses batch settings, not the selected video's params
  const { data: shotBatchSettings } = useQuery({
    queryKey: ['shot-batch-settings', shotId],
    queryFn: async () => {
      if (!shotId) return null;
      const { data, error } = await supabase
        .from('shots')
        .select('settings')
        .eq('id', shotId)
        .single();
      if (error) {
        console.error('[BatchSettingsFix] Shot batch settings query failed:', error);
        return null;
      }
      const allSettings = data?.settings as Record<string, any>;
      const batchSettings = allSettings?.['travel-between-images'] ?? {};
      console.log('[BatchSettingsFix] Shot batch settings loaded:', {
        shotId: shotId?.substring(0, 8),
        amountOfMotion: batchSettings.amountOfMotion,
        motionMode: batchSettings.motionMode,
        hasLoras: !!(batchSettings.selectedLoras?.length > 0),
        hasPhaseConfig: !!batchSettings.phaseConfig,
      });
      return batchSettings;
    },
    enabled: !!shotId,
    staleTime: 30000,
  });

  // Fetch per-pair metadata from shot_generations (prompt overrides, etc.)
  // This is the source of truth for pair-specific settings, shared with SegmentSettingsModal
  const { data: pairMetadata, refetch: refetchPairMetadata, isLoading: isLoadingPairMetadata } = useQuery({
    queryKey: ['pair-metadata', pairShotGenerationId],
    queryFn: async () => {
      console.log('[PairMetadata] 🔍 Query running for:', safeSubstr(pairShotGenerationId));
      if (!pairShotGenerationId) return null;
      const { data, error } = await supabase
        .from('shot_generations')
        .select('metadata')
        .eq('id', pairShotGenerationId)
        .single();
      if (error) {
        console.error('[PairMetadata] ❌ Query error:', error);
        return null;
      }
      console.log('[PairMetadata] ✅ Query returned:', {
        hasMetadata: !!data?.metadata,
        enhancedPrompt: (data?.metadata as any)?.enhanced_prompt ?? '(none)',
        pairPrompt: (data?.metadata as any)?.pair_prompt ?? '(none)',
      });
      return (data?.metadata as Record<string, any>) || {};
    },
    enabled: !!pairShotGenerationId,
    staleTime: 10000, // Cache for 10 seconds
  });

  // Log when pairMetadata changes
  useEffect(() => {
    console.log('[PairMetadata] 📊 State:', {
      pairShotGenerationId: safeSubstr(pairShotGenerationId) ?? 'null',
      isLoading: isLoadingPairMetadata,
      hasPairMetadata: !!pairMetadata,
      enhancedPrompt: pairMetadata?.enhanced_prompt ?? '(none)',
      pairPrompt: pairMetadata?.pair_prompt ?? '(not loaded)',
    });
  }, [pairShotGenerationId, isLoadingPairMetadata, pairMetadata]);

  // Track whether batch settings have been applied (to avoid re-applying on every render)
  const batchSettingsAppliedRef = React.useRef(false);

  // Reset batch settings flag when shot/pair changes (so batch settings are re-applied)
  useEffect(() => {
    batchSettingsAppliedRef.current = false;
  }, [shotId, pairShotGenerationId]);

  const { toast } = useToast();

  // File input refs for image uploads
  const startImageInputRef = React.useRef<HTMLInputElement>(null);
  const endImageInputRef = React.useRef<HTMLInputElement>(null);

  // Handle file selection for start image
  const handleStartImageFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/') && onStartImageUpload) {
      await onStartImageUpload(file);
    }
    if (startImageInputRef.current) {
      startImageInputRef.current.value = '';
    }
  }, [onStartImageUpload]);

  // Handle file selection for end image
  const handleEndImageFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/') && onEndImageUpload) {
      await onEndImageUpload(file);
    }
    if (endImageInputRef.current) {
      endImageInputRef.current.value = '';
    }
  }, [onEndImageUpload]);

  // Track user overrides - these persist across variant switches
  const [userOverrides, setUserOverrides] = useState<Record<string, any>>(
    () => {
      const overrides = initialParams.user_overrides || {};
      const oKeys = Object.keys(overrides);
      console.log(`[PerPairData] 🎛️ CONTROLS INIT (SegmentRegenerate) | segment=${segmentIndex} | overrides=${oKeys.length > 0 ? oKeys.join(',') : 'none'}`);
      return overrides;
    }
  );

  // Use shared normalization utility, then apply user overrides on top
  // IMPORTANT: If pairShotGenerationId exists, we'll load prompt from pair metadata instead
  // so don't use the stale prompt from initialParams
  const [params, setParamsInternal] = useState<any>(() => {
    const normalized = getNormalizedParams(initialParams, { segmentIndex });
    const overrides = initialParams.user_overrides || {};
    const final = { ...normalized, ...overrides };

    // If we have pairShotGenerationId, clear the prompt - it will come from pair metadata
    if (pairShotGenerationId) {
      delete final.base_prompt;
      delete final.prompt;
    }

    console.log('[PairMetadata] 🏗️ useState INIT:', {
      hasPairShotGenId: !!pairShotGenerationId,
      promptCleared: !!pairShotGenerationId,
      initialPrompt: final.base_prompt ?? '(cleared)',
    });

    return final;
  });
  const [isDirty, setIsDirty] = useState(false);

  // Wrapper to log all setParams calls
  const setParams = useCallback((updater: any) => {
    setParamsInternal((prev: any) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      console.log('[PairMetadata] 📝 setParams called:', {
        prevPrompt: prev?.base_prompt?.substring(0, 30) ?? '(none)',
        nextPrompt: next?.base_prompt?.substring(0, 30) ?? '(none)',
        stack: new Error().stack?.split('\n')[2]?.trim(),
      });
      return next;
    });
  }, []);

  // When pairMetadata loads, apply it to params
  // This is the source of truth for prompts when pairShotGenerationId exists
  useEffect(() => {
    if (!pairMetadata || !pairShotGenerationId) return;

    // Prefer enhanced_prompt if it exists, otherwise fall back to pair_prompt
    const enhancedPrompt = pairMetadata.enhanced_prompt;
    const basePrompt = pairMetadata.pair_prompt;
    const pairPrompt = enhancedPrompt || basePrompt;
    const pairNegative = pairMetadata.pair_negative_prompt;
    const pairUserOverrides = pairMetadata.user_overrides || {};

    console.log('[PairMetadata] ✅ Loaded from DB, applying:', {
      pairShotGenerationId: safeSubstr(pairShotGenerationId),
      enhancedPrompt: enhancedPrompt ?? '(none)',
      basePrompt: basePrompt ?? '(none)',
      usingPrompt: pairPrompt ?? '(none)',
    });

    // Apply pair metadata to params
    setParams((prev: any) => ({
      ...prev,
      ...(pairPrompt !== undefined && { base_prompt: pairPrompt, prompt: pairPrompt }),
      ...(pairNegative !== undefined && { negative_prompt: pairNegative }),
      ...pairUserOverrides,
    }));

    // Track overrides from pair metadata
    if (Object.keys(pairUserOverrides).length > 0) {
      setUserOverrides((prev) => ({ ...prev, ...pairUserOverrides }));

      // Also restore motion/LoRA/phase state variables from user overrides
      // (These should override batch settings if user has previously customized them)
      if (pairUserOverrides.motion_mode !== undefined) {
        setMotionMode(pairUserOverrides.motion_mode);
      }
      if (pairUserOverrides.amount_of_motion !== undefined) {
        setAmountOfMotion(pairUserOverrides.amount_of_motion);
      }
      if (pairUserOverrides.phase_config !== undefined) {
        setPhaseConfig(pairUserOverrides.phase_config);
      }
      if (pairUserOverrides.selected_phase_preset_id !== undefined) {
        setSelectedPhasePresetId(pairUserOverrides.selected_phase_preset_id);
      }
      if (pairUserOverrides.additional_loras !== undefined) {
        const lorasObj = pairUserOverrides.additional_loras;
        const restored: ActiveLora[] = Object.entries(lorasObj).map(([url, strength]) => {
          const filename = url.split('/').pop()?.replace('.safetensors', '') || url;
          return {
            id: url,
            name: filename,
            path: url,
            strength: typeof strength === 'number' ? strength : 1.0,
          };
        });
        setSelectedLoras(restored);
      }
    }
  }, [pairMetadata, pairShotGenerationId, setParams]);

  // Debounce timer ref for saving overrides
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  // Track pending overrides so we can flush on unmount
  const pendingOverridesRef = React.useRef<Record<string, any> | null>(null);
  // Stable ref for pairShotGenerationId
  const pairShotGenerationIdRef = React.useRef(pairShotGenerationId);
  pairShotGenerationIdRef.current = pairShotGenerationId;

  // Save directly to shot_generations.metadata
  // This is the single source of truth for pair prompts and overrides
  const saveToPairMetadata = useCallback(async (overrides: Record<string, any> | null) => {
    const shotGenId = pairShotGenerationIdRef.current;
    if (!shotGenId) {
      console.warn('[PairMetadata] Cannot save - no pairShotGenerationId');
      return;
    }

    // Split overrides into prompts vs technical settings
    const promptFields = ['base_prompt', 'prompt', 'negative_prompt'];
    const technicalOverrides: Record<string, any> = {};
    let newPairPrompt: string | undefined;
    let newNegativePrompt: string | undefined;

    if (overrides) {
      for (const [key, value] of Object.entries(overrides)) {
        if (key === 'base_prompt' || key === 'prompt') {
          newPairPrompt = value as string;
        } else if (key === 'negative_prompt') {
          newNegativePrompt = value as string;
        } else if (!promptFields.includes(key)) {
          technicalOverrides[key] = value;
        }
      }
    }

    console.log('[PairMetadata] 💾 Saving to shot_generations.metadata:', {
      shotGenId: shotGenId.substring(0, 8),
      pairPromptFull: newPairPrompt ?? '(unchanged)',
      negativePrompt: newNegativePrompt?.substring(0, 20) ?? '(unchanged)',
      technicalOverrideKeys: Object.keys(technicalOverrides),
    });

    try {
      // Fetch current metadata
      const { data: current, error: fetchError } = await supabase
        .from('shot_generations')
        .select('metadata')
        .eq('id', shotGenId)
        .single();

      if (fetchError) {
        console.error('[PairMetadata] Error fetching current metadata:', fetchError);
        return;
      }

      const currentMetadata = (current?.metadata as Record<string, any>) || {};

      // Build new metadata
      const newMetadata: Record<string, any> = { ...currentMetadata };

      // Update prompts
      if (newPairPrompt !== undefined) {
        newMetadata.pair_prompt = newPairPrompt;
      }
      if (newNegativePrompt !== undefined) {
        newMetadata.pair_negative_prompt = newNegativePrompt;
      }

      // Update technical overrides
      if (Object.keys(technicalOverrides).length > 0) {
        newMetadata.user_overrides = {
          ...(currentMetadata.user_overrides || {}),
          ...technicalOverrides,
        };
      } else if (overrides === null) {
        delete newMetadata.user_overrides;
      }

      // Save
      const { error: updateError } = await supabase
        .from('shot_generations')
        .update({ metadata: newMetadata })
        .eq('id', shotGenId);

      if (updateError) {
        console.error('[PairMetadata] Error saving metadata:', updateError);
      } else {
        console.log('[PairMetadata] ✅ Saved to shot_generations.metadata');
        // Refetch to keep UI in sync
        refetchPairMetadata();
      }
    } catch (error) {
      console.error('[PairMetadata] Exception saving metadata:', error);
    }
  }, [refetchPairMetadata]);

  // Debounced save function - saves directly to shot_generations.metadata
  const debouncedSaveOverrides = useCallback((overrides: Record<string, any>) => {
    // Track pending overrides for flush-on-unmount
    pendingOverridesRef.current = overrides;

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    // Schedule save after 1 second of no changes
    saveTimeoutRef.current = setTimeout(() => {
      if (pairShotGenerationIdRef.current) {
        saveToPairMetadata(Object.keys(overrides).length > 0 ? overrides : null);
      } else {
        console.warn('[PairMetadata] ⚠️ Cannot save - no pairShotGenerationId');
      }
      pendingOverridesRef.current = null;
    }, 1000);
  }, [saveToPairMetadata]);

  // Flush pending save on unmount (don't lose user's changes)
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      // If there are pending changes, save them immediately on unmount
      if (pendingOverridesRef.current && pairShotGenerationIdRef.current) {
        saveToPairMetadata(Object.keys(pendingOverridesRef.current).length > 0 ? pendingOverridesRef.current : null);
        pendingOverridesRef.current = null;
      }
    };
  }, [saveToPairMetadata]);

  // Helper to update a field and track it as a user override
  const updateOverride = useCallback((field: string, value: any) => {
    setUserOverrides(prev => {
      const updated = { ...prev, [field]: value };
      debouncedSaveOverrides(updated);
      return updated;
    });
    setParams((prev: any) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  }, [debouncedSaveOverrides]);

  // Helper to clear an override (sets to empty, not back to default)
  const clearOverride = useCallback((field: string) => {
    const emptyValue = field === 'additional_loras' ? {} : '';
    updateOverride(field, emptyValue);
  }, [updateOverride]);

  // [ResolutionDebug] Log what resolution this component received on mount
  console.log('[SegmentRegenerateControls] [ResolutionDebug] Component received props:', {
    projectResolutionProp: projectResolution,
    initialParamsResolution: initialParams?.parsed_resolution_wh,
    initialOrchestratorResolution: initialParams?.orchestrator_details?.parsed_resolution_wh,
    generationId: safeSubstr(generationId),
    childGenerationId: childGenerationId?.substring(0, 8),
    segmentIndex,
    queryKeyPrefix,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateSuccess, setRegenerateSuccess] = useState(false);

  // Fetch available LoRAs
  const { data: availableLoras } = usePublicLoras();

  // Detect generation mode from model name (I2V vs VACE)
  const generationMode = useMemo(() => {
    const modelName = params.model_name || params.orchestrator_details?.model_name;
    return detectGenerationMode(modelName);
  }, [params.model_name, params.orchestrator_details?.model_name]);

  // Get the appropriate built-in preset based on generation mode
  const builtinPreset = useMemo(() => {
    return generationMode === 'vace' ? BUILTIN_VACE_PRESET : BUILTIN_I2V_PRESET;
  }, [generationMode]);

  // Motion control state - derived from params
  const [motionMode, setMotionMode] = useState<'basic' | 'advanced'>(() => {
    const orchestrator = params.orchestrator_details || {};
    if (orchestrator.advanced_mode || params.advanced_mode) return 'advanced';
    const savedMotionMode = orchestrator.motion_mode || params.motion_mode;
    if (savedMotionMode === 'advanced') return 'advanced';
    return 'basic';
  });

  const advancedMode = motionMode === 'advanced';

  const [amountOfMotion, setAmountOfMotion] = useState(() => {
    const orchestrator = params.orchestrator_details || {};
    const rawValue = params.amount_of_motion ?? orchestrator.amount_of_motion ?? 0.5;
    return Math.round(rawValue * 100);
  });

  const [phaseConfig, setPhaseConfig] = useState<PhaseConfig | undefined>(() => {
    const orchestrator = params.orchestrator_details || {};
    if (orchestrator.phase_config) return orchestrator.phase_config;
    if (params.phase_config) return params.phase_config;
    return undefined;
  });

  const [selectedPhasePresetId, setSelectedPhasePresetId] = useState<string | null>(() => {
    const orchestrator = params.orchestrator_details || {};
    return orchestrator.selected_phase_preset_id || params.selected_phase_preset_id || null;
  });

  const [randomSeed, setRandomSeed] = useState(() => {
    const orchestrator = params.orchestrator_details || {};
    const savedRandomSeed = orchestrator.random_seed ?? params.random_seed;
    return savedRandomSeed !== undefined ? savedRandomSeed : true;
  });

  // Make primary variant - whether the new regeneration should replace the current video
  // Persisted at project level via usePersistentToolState
  // Defaults to false - user must explicitly choose to replace the current video
  const [makePrimaryVariant, setMakePrimaryVariant] = useState(false);

  // Bind to project settings for persistence
  usePersistentToolState(
    'travel-between-images',
    { projectId: projectId || undefined },
    { makePrimaryVariant: [makePrimaryVariant, setMakePrimaryVariant] },
    { scope: 'project', enabled: !!projectId }
  );

  // Smooth continuations (SVI) - DISABLED for now
  // TODO: Re-enable when SVI is ready for production
  const [smoothContinuations, setSmoothContinuations] = useState(false);

  // SVI strength values - control how much the previous segment influences the current one
  const [sviStrength1, setSviStrength1] = useState(() => {
    const orchestrator = params.orchestrator_details || {};
    return params.svi_strength_1 ?? orchestrator.svi_strength_1 ?? 1.0;
  });
  const [sviStrength2, setSviStrength2] = useState(() => {
    const orchestrator = params.orchestrator_details || {};
    return params.svi_strength_2 ?? orchestrator.svi_strength_2 ?? 0.5;
  });

  // Max frames is 77 when smooth continuations is enabled, otherwise 81
  const maxFrames = (smoothContinuations && predecessorVideoUrl) ? 77 : 81;

  // Clamp num_frames when smooth continuations is enabled and current value exceeds max
  useEffect(() => {
    if (smoothContinuations && predecessorVideoUrl && params.num_frames > 77) {
      setParams((prev: any) => ({ ...prev, num_frames: 77 }));
    }
  }, [smoothContinuations, predecessorVideoUrl, params.num_frames]);

  // LoRA state - derived from params.additional_loras
  const [selectedLoras, setSelectedLoras] = useState<ActiveLora[]>(() => {
    const lorasObj = params.additional_loras || params.orchestrator_details?.additional_loras || {};
    return Object.entries(lorasObj).map(([url, strength]) => {
      const filename = url.split('/').pop()?.replace('.safetensors', '') || url;
      return {
        id: url,
        name: filename,
        path: url,
        strength: typeof strength === 'number' ? strength : 1.0,
      };
    });
  });

  // Apply batch settings as defaults when they load (instead of using parent video's params)
  // This ensures modal/lightbox always uses shot's batch settings, not the selected video's params
  // NOTE: Skip fields that already have user overrides from pair metadata
  useEffect(() => {
    if (!shotBatchSettings || batchSettingsAppliedRef.current) return;

    // Mark as applied so we don't re-apply on subsequent renders
    batchSettingsAppliedRef.current = true;

    // Check for existing user overrides from pair metadata (should take precedence)
    const existingOverrides = pairMetadata?.user_overrides || {};

    console.log('[BatchSettingsFix] Applying batch settings as defaults:', {
      amountOfMotion: shotBatchSettings.amountOfMotion,
      motionMode: shotBatchSettings.motionMode,
      hasLoras: !!(shotBatchSettings.selectedLoras?.length > 0),
      lorasCount: shotBatchSettings.selectedLoras?.length ?? 0,
      hasPhaseConfig: !!shotBatchSettings.phaseConfig,
      existingOverrideKeys: Object.keys(existingOverrides),
    });

    // Apply motion mode from batch settings (unless user has override)
    if (shotBatchSettings.motionMode !== undefined && !existingOverrides.motion_mode) {
      setMotionMode(shotBatchSettings.motionMode);
    }

    // Apply amount of motion from batch settings (batch stores as 0-100, state is also 0-100)
    if (shotBatchSettings.amountOfMotion !== undefined && !existingOverrides.amount_of_motion) {
      setAmountOfMotion(shotBatchSettings.amountOfMotion);
    }

    // Apply phase config from batch settings (unless user has override)
    if (shotBatchSettings.phaseConfig !== undefined && !existingOverrides.phase_config) {
      setPhaseConfig(shotBatchSettings.phaseConfig);
    }

    // Apply selected phase preset from batch settings (unless user has override)
    if (shotBatchSettings.selectedPhasePresetId !== undefined && !existingOverrides.selected_phase_preset_id) {
      setSelectedPhasePresetId(shotBatchSettings.selectedPhasePresetId);
    }

    // Apply LoRAs from batch settings (unless user has override)
    if (Array.isArray(shotBatchSettings.selectedLoras) && shotBatchSettings.selectedLoras.length > 0 && !existingOverrides.additional_loras) {
      const batchLoras: ActiveLora[] = shotBatchSettings.selectedLoras.map((lora: any) => {
        const filename = (lora.path || lora.id || '').split('/').pop()?.replace('.safetensors', '') || lora.name || 'Unknown';
        return {
          id: lora.id || lora.path,
          name: lora.name || filename,
          path: lora.path,
          strength: lora.strength ?? 1.0,
        };
      });
      setSelectedLoras(batchLoras);

      // Also update params.additional_loras for task submission
      const loraObj: Record<string, number> = {};
      batchLoras.forEach(l => {
        loraObj[l.path || l.id] = l.strength;
      });
      setParams((prev: any) => ({ ...prev, additional_loras: loraObj }));
    }
  }, [shotBatchSettings, pairMetadata]);

  // Handle field changes (legacy - use updateOverride for new code)
  const handleChange = useCallback((field: string, value: any) => {
    setParams((prev: any) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  }, []);

  // Motion control handlers - also save as overrides for persistence
  const handleMotionModeChange = useCallback((mode: 'basic' | 'advanced') => {
    setMotionMode(mode);
    updateOverride('motion_mode', mode);
    if (mode === 'advanced' && !phaseConfig) {
      const defaultConfig = builtinPreset.metadata.phaseConfig;
      setPhaseConfig(defaultConfig);
      updateOverride('phase_config', defaultConfig);
    }
  }, [phaseConfig, builtinPreset, updateOverride]);

  const handleAmountOfMotionChange = useCallback((value: number) => {
    setAmountOfMotion(value);
    updateOverride('amount_of_motion', value);
  }, [updateOverride]);

  const handlePhaseConfigChange = useCallback((config: PhaseConfig) => {
    setPhaseConfig(config);
    updateOverride('phase_config', config);
  }, [updateOverride]);

  const handlePhasePresetSelect = useCallback((presetId: string, config: PhaseConfig) => {
    setSelectedPhasePresetId(presetId);
    setPhaseConfig(config);
    // Save both as overrides
    setUserOverrides(prev => {
      const updated = { ...prev, selected_phase_preset_id: presetId, phase_config: config };
      debouncedSaveOverrides(updated);
      return updated;
    });
    setIsDirty(true);
  }, [debouncedSaveOverrides]);

  const handlePhasePresetRemove = useCallback(() => {
    setSelectedPhasePresetId(null);
    updateOverride('selected_phase_preset_id', null);
  }, [updateOverride]);

  const handleRandomSeedChange = useCallback((value: boolean) => {
    setRandomSeed(value);
    updateOverride('random_seed', value);
  }, [updateOverride]);

  // LoRA handlers - save as overrides for persistence
  const handleAddLoraClick = useCallback(() => {
    setIsLoraModalOpen(true);
  }, []);

  // Helper to convert selectedLoras to override format
  const lorasToOverrideFormat = useCallback((loras: ActiveLora[]) => {
    const loraObj: Record<string, number> = {};
    loras.forEach(l => {
      loraObj[l.path || l.id] = l.strength;
    });
    return loraObj;
  }, []);

  const handleRemoveLora = useCallback((loraId: string) => {
    setSelectedLoras(prev => {
      const updated = prev.filter(l => l.id !== loraId);
      updateOverride('additional_loras', lorasToOverrideFormat(updated));
      return updated;
    });
  }, [updateOverride, lorasToOverrideFormat]);

  const handleLoraStrengthChange = useCallback((loraId: string, strength: number) => {
    setSelectedLoras(prev => {
      const updated = prev.map(l => l.id === loraId ? { ...l, strength } : l);
      updateOverride('additional_loras', lorasToOverrideFormat(updated));
      return updated;
    });
  }, [updateOverride, lorasToOverrideFormat]);

  const handleLoraSelect = useCallback((lora: LoraModel) => {
    setSelectedLoras(prev => {
      if (prev.some(l => l.id === lora.id || l.path === lora.path)) {
        return prev;
      }
      const updated = [...prev, {
        id: lora.id || lora.path,
        name: lora.name,
        path: lora.path,
        strength: lora.default_strength || 1.0,
      }];
      updateOverride('additional_loras', lorasToOverrideFormat(updated));
      return updated;
    });
  }, [updateOverride, lorasToOverrideFormat]);

  // Reset to defaults - clears all user overrides and restores BATCH settings (not video params)
  const handleResetToDefaults = useCallback(() => {
    // Clear user overrides
    setUserOverrides({});
    setIsDirty(false);

    // Get normalized params for prompts/frames (keep video-specific values like num_frames, prompts)
    const paramsWithoutOverrides = { ...initialParams };
    delete paramsWithoutOverrides.user_overrides;
    const normalized = getNormalizedParams(paramsWithoutOverrides, { segmentIndex });
    setParams(normalized);

    // Reset motion/LoRA/phase to BATCH SETTINGS (not video params)
    if (shotBatchSettings) {
      console.log('[BatchSettingsFix] Resetting to batch settings:', {
        motionMode: shotBatchSettings.motionMode,
        amountOfMotion: shotBatchSettings.amountOfMotion,
        hasLoras: !!(shotBatchSettings.selectedLoras?.length > 0),
        hasPhaseConfig: !!shotBatchSettings.phaseConfig,
      });

      // Motion mode from batch
      setMotionMode(shotBatchSettings.motionMode ?? 'basic');

      // Amount of motion from batch (stored as 0-100)
      setAmountOfMotion(shotBatchSettings.amountOfMotion ?? 50);

      // Phase config from batch
      setPhaseConfig(shotBatchSettings.phaseConfig ?? undefined);
      setSelectedPhasePresetId(shotBatchSettings.selectedPhasePresetId ?? null);

      // Random seed - default to true
      setRandomSeed(shotBatchSettings.randomSeed ?? true);

      // LoRAs from batch settings
      if (Array.isArray(shotBatchSettings.selectedLoras) && shotBatchSettings.selectedLoras.length > 0) {
        const batchLoras: ActiveLora[] = shotBatchSettings.selectedLoras.map((lora: any) => {
          const filename = (lora.path || lora.id || '').split('/').pop()?.replace('.safetensors', '') || lora.name || 'Unknown';
          return {
            id: lora.id || lora.path,
            name: lora.name || filename,
            path: lora.path,
            strength: lora.strength ?? 1.0,
          };
        });
        setSelectedLoras(batchLoras);
      } else {
        setSelectedLoras([]);
      }
    } else {
      // Fallback if batch settings not loaded - use sensible defaults
      setMotionMode('basic');
      setAmountOfMotion(50);
      setPhaseConfig(undefined);
      setSelectedPhasePresetId(null);
      setRandomSeed(true);
      setSelectedLoras([]);
    }

    // Clear any pending save and save the reset to DB
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingOverridesRef.current = null;
    saveToPairMetadata(null);
  }, [initialParams, segmentIndex, shotBatchSettings, saveToPairMetadata]);

  // Handle segment regeneration
  const handleRegenerateSegment = useCallback(async () => {
    // Log state at start of regeneration
    // Check both old format (structure_videos separate) and new unified format (videos inside structure_guidance)
    const orchGuidance = initialParams?.orchestrator_details?.structure_guidance;
    const topGuidance = initialParams?.structure_guidance;
    console.log('[StructureVideoFix] 🚀 [SegmentRegenerateControls] Regenerate clicked:', {
      shotId: shotId?.substring(0, 8),
      isLoadingShotStructure,
      hasShotStructureData: !!shotStructureData,
      // Raw DB format (structure_videos may be separate or inside structure_guidance)
      shotStructureVideosCount: shotStructureData?.structure_videos?.length ?? 0,
      // NEW UNIFIED FORMAT: Check for videos inside structure_guidance
      orchGuidanceTarget: orchGuidance?.target ?? '(none)',
      orchGuidanceVideosCount: orchGuidance?.videos?.length ?? 0,
      topGuidanceTarget: topGuidance?.target ?? '(none)',
      topGuidanceVideosCount: topGuidance?.videos?.length ?? 0,
    });

    if (!projectId) {
      toast({
        title: "Error",
        description: "No project selected",
        variant: "destructive",
      });
      return;
    }

    if (!generationId && !shotId) {
      toast({
        title: "Error",
        description: "Missing generation or shot context for regeneration",
        variant: "destructive",
      });
      return;
    }

    if (!startImageUrl || !endImageUrl) {
      toast({
        title: "Error",
        description: "Missing input images for regeneration",
        variant: "destructive",
      });
      return;
    }

    setIsRegenerating(true);
    setRegenerateSuccess(false);

    // Notify parent immediately for optimistic UI update
    onGenerateStarted?.(pairShotGenerationId);

    try {
      // Convert selectedLoras to the format expected by the task
      const lorasForTask = selectedLoras.map(lora => ({
        path: lora.path || lora.id,
        strength: lora.strength,
      }));

      // IMPORTANT: Only use projectResolution prop (from shot/project), NOT stale params!
      // If projectResolution is undefined, let the task creation logic (resolveProjectResolution)
      // fetch the correct resolution from the project. This prevents race conditions where
      // stale params have a different resolution than the current project/shot.
      const staleResolution = params.parsed_resolution_wh ||
                              params.orchestrator_details?.parsed_resolution_wh;

      // [ResolutionDebug] Log resolution priority chain
      console.log('[SegmentRegenerateControls] [ResolutionDebug] Resolution computation:', {
        projectResolutionProp: projectResolution,
        paramsResolution: params.parsed_resolution_wh,
        orchestratorResolution: params.orchestrator_details?.parsed_resolution_wh,
        staleResolution,
        finalResolution: projectResolution || '(will be fetched by task creation)',
        source: projectResolution ? 'PROJECT_RESOLUTION_PROP' : 'TASK_CREATION_WILL_FETCH',
        generationId,
        segmentIndex,
      });

      // Only set resolution in params if we have a reliable source (shot/project)
      // Otherwise, leave it undefined so task creation fetches from project
      const paramsWithResolution = projectResolution
        ? {
            ...params,
            parsed_resolution_wh: projectResolution,
            orchestrator_details: {
              ...(params.orchestrator_details || {}),
              parsed_resolution_wh: projectResolution,
            },
          }
        : params;

      const uiBasePrompt = params.base_prompt || params.prompt || '';
      const uiNegativePrompt = params.negative_prompt || '';

      // If the user explicitly changed num_frames in this form, update the corresponding entry
      // in segment_frames_expanded so positioning math stays consistent.
      // Otherwise, keep the injected "current timeline" arrays as-is.
      const paramsForTask = (() => {
        const orch = paramsWithResolution.orchestrator_details;
        const segFrames = orch?.segment_frames_expanded;
        if (!Array.isArray(segFrames) || typeof segmentIndex !== 'number') return paramsWithResolution;

        // "Explicit in this form" means it exists in user_overrides (i.e., user touched the control),
        // not merely that params.num_frames has some value.
        const hasExplicitNumFramesOverride = Object.prototype.hasOwnProperty.call(userOverrides || {}, 'num_frames');
        const explicitNumFrames = hasExplicitNumFramesOverride && typeof params.num_frames === 'number'
          ? params.num_frames
          : undefined;
        if (explicitNumFrames === undefined) return paramsWithResolution;

        const prev = segFrames[segmentIndex];
        if (prev === explicitNumFrames) return paramsWithResolution;

        const nextSegFrames = [...segFrames];
        nextSegFrames[segmentIndex] = explicitNumFrames;

        console.log('[SegmentRegenerateControls] [TimelineGaps] Overriding segment_frames_expanded for this segment due to explicit form input:', {
          segmentIndex,
          prev,
          explicitNumFrames,
          totalSegments: nextSegFrames.length,
        });

        return {
          ...paramsWithResolution,
          orchestrator_details: {
            ...(orch || {}),
            segment_frames_expanded: nextSegFrames,
            // Keep num_new_segments_to_generate consistent if present / used downstream
            ...(typeof orch?.num_new_segments_to_generate === 'number'
              ? { num_new_segments_to_generate: nextSegFrames.length }
              : {}),
          },
        };
      })();

      // CRITICAL: Use the NEW UNIFIED FORMAT for structure guidance.
      // The unified format puts videos INSIDE structure_guidance:
      // { structure_guidance: { target, videos: [...], strength, ... } }
      //
      // Priority: initialParams (from MediaLightbox) > shotStructureData (fallback query)
      // MediaLightbox already builds the unified format, so prefer that.
      let unifiedStructureGuidance = 
        initialParams?.orchestrator_details?.structure_guidance || 
        initialParams?.structure_guidance;
      
      // If initialParams doesn't have it, check if we need to build from shotStructureData
      if (!unifiedStructureGuidance && shotStructureData?.structure_videos?.length > 0) {
        // Build unified format from the raw shot structure data (old format)
        const rawVideos = shotStructureData.structure_videos;
        const firstVideo = rawVideos[0];
        const isUni3cTarget = firstVideo.structure_type === 'uni3c';
        
        // Transform videos to clean format
        const cleanedVideos = rawVideos.map((v: Record<string, unknown>) => ({
          path: v.path,
          start_frame: v.start_frame ?? 0,
          end_frame: v.end_frame ?? null,
          treatment: v.treatment ?? 'adjust',
          ...(v.metadata ? { metadata: v.metadata } : {}),
          ...(v.resource_id ? { resource_id: v.resource_id } : {}),
        }));
        
        unifiedStructureGuidance = {
          target: isUni3cTarget ? 'uni3c' : 'vace',
          videos: cleanedVideos,
          strength: firstVideo.motion_strength ?? 1.0,
        } as Record<string, unknown>;
        
        if (isUni3cTarget) {
          unifiedStructureGuidance.step_window = [
            firstVideo.uni3c_start_percent ?? 0,
            firstVideo.uni3c_end_percent ?? 1.0,
          ];
          unifiedStructureGuidance.frame_policy = 'fit';
          unifiedStructureGuidance.zero_empty_frames = true;
        } else {
          const preprocessingMap: Record<string, string> = {
            'flow': 'flow', 'canny': 'canny', 'depth': 'depth', 'raw': 'none',
          };
          unifiedStructureGuidance.preprocessing = preprocessingMap[firstVideo.structure_type ?? 'flow'] ?? 'flow';
          if (firstVideo.canny_intensity != null) unifiedStructureGuidance.canny_intensity = firstVideo.canny_intensity;
          if (firstVideo.depth_contrast != null) unifiedStructureGuidance.depth_contrast = firstVideo.depth_contrast;
        }
        
        console.log('[StructureVideoFix] 🔧 [SegmentRegenerateControls] BUILT unified structure_guidance from shotStructureData:', {
          target: unifiedStructureGuidance.target,
          videosCount: cleanedVideos.length,
        });
      }
      
      // Log where structure data came from
      const structureDataSource = (initialParams?.orchestrator_details?.structure_guidance || initialParams?.structure_guidance) 
        ? 'initialParams' 
        : (unifiedStructureGuidance ? 'shotQuery-built' : 'none');
      console.log('[StructureVideoFix] 🔧 [SegmentRegenerateControls] Structure data source:', structureDataSource, { 
        hasUnifiedGuidance: !!unifiedStructureGuidance,
        target: (unifiedStructureGuidance as any)?.target ?? null,
        videosCount: (unifiedStructureGuidance as any)?.videos?.length ?? 0,
      });
      
      // Inject the unified structure_guidance (no more separate structure_videos)
      // Also clean legacy params from orchestrator_details
      const legacyStructureParams = [
        'structure_type', 'structure_videos', 'structure_video_path', 'structure_video_treatment',
        'structure_video_motion_strength', 'structure_video_type', 'structure_canny_intensity',
        'structure_depth_contrast', 'structure_guidance_video_url', 'structure_guidance_frame_offset',
        'use_uni3c', 'uni3c_guide_video', 'uni3c_strength', 'uni3c_start_percent', 
        'uni3c_end_percent', 'uni3c_guidance_frame_offset',
      ];
      
      const paramsForTaskWithFreshStructureVideos = unifiedStructureGuidance
        ? (() => {
            // Clean legacy params from orchestrator_details
            const cleanedOrchestratorDetails = { ...(paramsForTask.orchestrator_details || {}) };
            for (const param of legacyStructureParams) {
              delete cleanedOrchestratorDetails[param];
            }
            return {
              ...paramsForTask,
              // Include at top level for standalone segment tasks
              structure_guidance: unifiedStructureGuidance,
              orchestrator_details: {
                ...cleanedOrchestratorDetails,
                // Also include in orchestrator_details for orchestrator tasks
                structure_guidance: unifiedStructureGuidance,
              },
            };
          })()
        : paramsForTask;

      // [MultiStructureDebug] Log the orchestrator_details being passed
      const orchDetails = paramsForTaskWithFreshStructureVideos.orchestrator_details || {};
      console.log('[StructureVideoFix] [MultiStructureDebug] Orchestrator details being passed:', {
        hasOrchestratorDetails: !!paramsForTaskWithFreshStructureVideos.orchestrator_details,
        hasUnifiedStructureGuidance: !!orchDetails.structure_guidance,
        structureGuidanceTarget: orchDetails.structure_guidance?.target ?? '(not set)',
        structureGuidanceVideosCount: orchDetails.structure_guidance?.videos?.length ?? 0,
        topLevelStructureGuidance: !!paramsForTaskWithFreshStructureVideos.structure_guidance,
        hasSegmentFramesExpanded: !!orchDetails.segment_frames_expanded,
        segmentFramesExpandedLength: orchDetails.segment_frames_expanded?.length ?? 0,
        hasFrameOverlapExpanded: !!orchDetails.frame_overlap_expanded,
        frameOverlapExpandedLength: orchDetails.frame_overlap_expanded?.length ?? 0,
        fpsHelpers: orchDetails.fps_helpers ?? '(not set)',
        segmentIndex,
        generationId: safeSubstr(generationId),
        shotId: shotId?.substring(0, 8),
      });

      await createIndividualTravelSegmentTask({
        project_id: projectId,
        parent_generation_id: generationId, // Optional - if not provided, will be created from shot_id
        shot_id: shotId, // Used to create parent generation if none exists
        child_generation_id: childGenerationId,
        segment_index: segmentIndex,
        start_image_url: startImageUrl,
        end_image_url: endImageUrl,
        start_image_generation_id: startImageGenerationId,
        end_image_generation_id: endImageGenerationId,
        pair_shot_generation_id: pairShotGenerationId,
        originalParams: paramsForTaskWithFreshStructureVideos,
        // UI overrides
        base_prompt: uiBasePrompt,
        negative_prompt: uiNegativePrompt,
        num_frames: params.num_frames,
        seed: randomSeed ? undefined : (params.seed_to_use || params.seed),
        random_seed: randomSeed,
        amount_of_motion: amountOfMotion / 100,
        advanced_mode: advancedMode,
        phase_config: phaseConfig,
        motion_mode: motionMode,
        selected_phase_preset_id: selectedPhasePresetId,
        loras: lorasForTask,
        // When creating a new segment, always make it primary
        // When regenerating existing, use the user's preference
        make_primary_variant: isRegeneration ? makePrimaryVariant : true,
        // HARDCODED: SVI (smooth continuations) feature has been removed from UX
        // Always disable regardless of any persisted settings
        use_svi: false,
        svi_predecessor_video_url: undefined,
        svi_strength_1: undefined,
        svi_strength_2: undefined,
      });

      setRegenerateSuccess(true);
      setTimeout(() => setRegenerateSuccess(false), 3000);

    } catch (error: any) {
      console.error('[SegmentRegenerateControls] Error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to start regeneration",
        variant: "destructive",
      });
    } finally {
      setIsRegenerating(false);
    }
  }, [
    projectId,
    generationId,
    shotId,
    shotStructureData,
    childGenerationId,
    isRegeneration,
    segmentIndex,
    params,
    selectedLoras,
    startImageUrl,
    endImageUrl,
    startImageGenerationId,
    endImageGenerationId,
    pairShotGenerationId,
    amountOfMotion,
    advancedMode,
    phaseConfig,
    motionMode,
    selectedPhasePresetId,
    randomSeed,
    makePrimaryVariant,
    projectResolution,
    smoothContinuations,
    sviStrength1,
    sviStrength2,
    predecessorVideoUrl,
    toast,
    onGenerateStarted,
  ]);

  // Update local state when params prop changes, preserving user overrides
  // IMPORTANT: Skip prompt fields if we have pairShotGenerationId - those come from pair metadata
  useEffect(() => {
    const normalized = getNormalizedParams(initialParams, { segmentIndex });
    const overrides = initialParams.user_overrides || {};

    // If we have pairShotGenerationId, don't overwrite prompts from initialParams
    // The pair metadata effect handles those
    const finalParams = { ...normalized, ...overrides };
    if (pairShotGenerationId) {
      delete finalParams.base_prompt;
      delete finalParams.prompt;
      // Don't delete negative_prompt - that can come from pair metadata too
      delete finalParams.negative_prompt;
      console.log('[PairMetadata] 🛡️ initialParams effect skipping prompt fields (pairShotGenerationId exists)');
    }

    // Apply user overrides on top of normalized defaults
    setParams((prev: any) => ({
      ...finalParams,
      // Preserve existing prompt values if we have pairShotGenerationId
      ...(pairShotGenerationId && {
        base_prompt: prev.base_prompt,
        prompt: prev.prompt,
        negative_prompt: prev.negative_prompt,
      }),
    }));
    setUserOverrides(overrides);
    setIsDirty(false);

    // Also restore motion control state from overrides if present
    if (overrides.motion_mode !== undefined) {
      setMotionMode(overrides.motion_mode);
    }
    if (overrides.amount_of_motion !== undefined) {
      setAmountOfMotion(overrides.amount_of_motion);
    }
    if (overrides.phase_config !== undefined) {
      setPhaseConfig(overrides.phase_config);
    }
    if (overrides.selected_phase_preset_id !== undefined) {
      setSelectedPhasePresetId(overrides.selected_phase_preset_id);
    }
    if (overrides.random_seed !== undefined) {
      setRandomSeed(overrides.random_seed);
    }
    // Restore LoRAs from overrides if present
    if (overrides.additional_loras !== undefined) {
      const lorasObj = overrides.additional_loras;
      const restored: ActiveLora[] = Object.entries(lorasObj).map(([url, strength]) => {
        const filename = url.split('/').pop()?.replace('.safetensors', '') || url;
        return {
          id: url,
          name: filename,
          path: url,
          strength: typeof strength === 'number' ? strength : 1.0,
        };
      });
      setSelectedLoras(restored);
    }
  }, [initialParams, segmentIndex, pairShotGenerationId]);

  return (
    <div className="space-y-4">
      {/* Header */}
      {showHeader && (
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-primary" />
            {headerTitle}
          </h3>
        </div>
      )}

      {/* Hidden file inputs for image uploads */}
      <input
        ref={startImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleStartImageFileSelect}
      />
      <input
        ref={endImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleEndImageFileSelect}
      />

      {/* Input Images with Frames Slider in between */}
      {(startImageUrl || endImageUrl || onStartImageUpload || onEndImageUpload) && (
        <div className="@container">
          <div className="grid grid-cols-2 gap-2 @[280px]:grid-cols-3">
          {/* Start Image - 1/3 width on wide, 1/2 on narrow */}
          <div className="relative aspect-video">
            {startImageUrl ? (
              <button
                onClick={onStartImageClick}
                disabled={!onStartImageClick}
                className={`w-full h-full relative bg-muted/30 rounded-lg overflow-hidden border border-border/50 ${
                  onStartImageClick ? 'hover:border-primary/50 transition-colors cursor-pointer group' : ''
                }`}
                title={onStartImageClick ? "View start image" : undefined}
              >
                <img
                  src={startImageUrl}
                  alt="Start frame"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {onStartImageClick && (
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                )}
                <span className="absolute bottom-0.5 left-0.5 text-[10px] bg-black/60 text-white px-1 rounded">Start</span>
                {/* Upload button overlay - shows on hover */}
                {onStartImageUpload && (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isUploadingStartImage) startImageInputRef.current?.click();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        if (!isUploadingStartImage) startImageInputRef.current?.click();
                      }
                    }}
                    className={`absolute top-1 right-1 h-6 w-6 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-all opacity-0 group-hover:opacity-100 cursor-pointer ${isUploadingStartImage ? 'pointer-events-none' : ''}`}
                    title="Replace start image"
                  >
                    {isUploadingStartImage ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Upload className="h-3 w-3" />
                    )}
                  </div>
                )}
              </button>
            ) : onStartImageUpload ? (
              <button
                onClick={() => startImageInputRef.current?.click()}
                disabled={isUploadingStartImage}
                className="w-full h-full bg-muted/30 rounded-lg border-2 border-dashed border-border/50 hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-1 cursor-pointer"
                title="Upload start image"
              >
                {isUploadingStartImage ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Upload className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-[10px] text-muted-foreground">Start</span>
              </button>
            ) : null}
          </div>

          {/* Frames Slider - 1/3 width on wide, full width on narrow (spans 2 cols, shown last) */}
          <div className="order-last col-span-2 @[280px]:order-none @[280px]:col-span-1 flex items-center gap-2">
            {/* Smooth Continuations Toggle + Strength - DISABLED for now
            {showSmoothContinuation && predecessorVideoUrl && (
              <div className="flex flex-col items-center justify-center shrink-0 gap-0.5">
                <span className="text-[8px] text-muted-foreground leading-tight text-center">
                  continue from previous
                </span>
                <Switch
                  id="smooth-continuations-compact"
                  checked={smoothContinuations}
                  onCheckedChange={setSmoothContinuations}
                  className="scale-75"
                />
                {smoothContinuations && (
                  <div className="flex gap-1">
                    <input
                      type="number"
                      value={sviStrength1}
                      onChange={(e) => setSviStrength1(parseFloat(e.target.value) || 1.0)}
                      step={0.1}
                      min={0}
                      max={2}
                      className="w-10 h-5 text-[10px] text-center bg-background border border-border rounded px-0.5"
                      title="SVI strength 1"
                    />
                    <input
                      type="number"
                      value={sviStrength2}
                      onChange={(e) => setSviStrength2(parseFloat(e.target.value) || 0.5)}
                      step={0.1}
                      min={0}
                      max={2}
                      className="w-10 h-5 text-[10px] text-center bg-background border border-border rounded px-0.5"
                      title="SVI strength 2"
                    />
                  </div>
                )}
              </div>
            )}
            */}
            <div className="flex-1 flex flex-col justify-center space-y-1">
              <div className="flex flex-col items-center text-center">
                <Label className="text-xs font-medium">Frames</Label>
                <span className="text-xs text-muted-foreground">
                  {params.num_frames || 0} ({framesToSeconds(params.num_frames || 0)})
                </span>
              </div>
              <Slider
                value={[quantizeFrameCount(params.num_frames || 9, 9)]}
                onValueChange={([value]) => {
                  const quantized = quantizeFrameCount(value, 9);
                  console.log('[FrameCountDebug] Slider changed:', { value, quantized, hasCallback: !!onFrameCountChange });
                  updateOverride('num_frames', quantized);
                  onFrameCountChange?.(quantized);
                }}
                min={9}
                max={maxFrames}
                step={4}
                className="w-full"
              />
            </div>
          </div>

          {/* End Image - 1/3 width on wide, 1/2 on narrow */}
          <div className="relative aspect-video">
            {endImageUrl ? (
              <button
                onClick={onEndImageClick}
                disabled={!onEndImageClick}
                className={`w-full h-full relative bg-muted/30 rounded-lg overflow-hidden border border-border/50 ${
                  onEndImageClick ? 'hover:border-primary/50 transition-colors cursor-pointer group' : ''
                }`}
                title={onEndImageClick ? "View end image" : undefined}
              >
                <img
                  src={endImageUrl}
                  alt="End frame"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {onEndImageClick && (
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                )}
                <span className="absolute bottom-0.5 right-0.5 text-[10px] bg-black/60 text-white px-1 rounded">End</span>
                {/* Upload button overlay - shows on hover, positioned on left to avoid "End" label */}
                {onEndImageUpload && (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isUploadingEndImage) endImageInputRef.current?.click();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        if (!isUploadingEndImage) endImageInputRef.current?.click();
                      }
                    }}
                    className={`absolute top-1 left-1 h-6 w-6 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-all opacity-0 group-hover:opacity-100 cursor-pointer ${isUploadingEndImage ? 'pointer-events-none' : ''}`}
                    title="Replace end image"
                  >
                    {isUploadingEndImage ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Upload className="h-3 w-3" />
                    )}
                  </div>
                )}
              </button>
            ) : onEndImageUpload ? (
              <button
                onClick={() => endImageInputRef.current?.click()}
                disabled={isUploadingEndImage}
                className="w-full h-full bg-muted/30 rounded-lg border-2 border-dashed border-border/50 hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-1 cursor-pointer"
                title="Upload end image"
              >
                {isUploadingEndImage ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Upload className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-[10px] text-muted-foreground">End</span>
              </button>
            ) : null}
          </div>
          </div>
        </div>
      )}

      {/* Prompt */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">Prompt:</Label>
        <Textarea
          value={params.base_prompt || params.prompt || ''}
          onChange={(e) => {
            const newValue = e.target.value;
            // Update both base_prompt and prompt for compatibility
            updateOverride('base_prompt', newValue);
            setParams((prev: any) => ({ ...prev, prompt: newValue }));
          }}
          className="h-20 text-sm resize-none"
          placeholder="Describe this segment..."
          clearable
          onClear={() => {
            // Clear sets to empty (not back to default)
            clearOverride('base_prompt');
            setParams((prev: any) => ({ ...prev, prompt: '' }));
          }}
          voiceInput
          voiceContext="This is a prompt for a video segment. Describe the motion, action, or visual content you want in this part of the video."
          onVoiceResult={(result) => {
            const newValue = result.prompt || result.transcription;
            updateOverride('base_prompt', newValue);
            setParams((prev: any) => ({ ...prev, prompt: newValue }));
          }}
        />
      </div>

      {/* Advanced Settings */}
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`w-full justify-between h-9 text-xs font-medium ${
              showAdvanced
                ? 'bg-muted text-foreground hover:bg-muted rounded-b-none'
                : 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary'
            }`}
          >
            <span>Advanced Settings</span>
            <ChevronLeft className={`w-3 h-3 transition-transform ${showAdvanced ? '-rotate-90' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="-mx-4">
          <div className="space-y-3 p-3 bg-muted/30 border-y border-border/50">
            {/* Make Primary Variant Toggle - only show when regenerating existing video */}
            {isRegeneration && (
              <div className="flex items-center justify-between">
                <Label htmlFor="make-primary" className="text-sm cursor-pointer">
                  Make primary variant
                </Label>
                <Switch
                  id="make-primary"
                  checked={makePrimaryVariant}
                  onCheckedChange={setMakePrimaryVariant}
                />
              </div>
            )}

            {/* Negative Prompt */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Negative Prompt:</Label>
              <Textarea
                value={params.negative_prompt || ''}
                onChange={(e) => updateOverride('negative_prompt', e.target.value)}
                className="h-16 text-xs resize-none"
                placeholder="Things to avoid..."
                clearable
                onClear={() => clearOverride('negative_prompt')}
                voiceInput
                voiceContext="This is a negative prompt - things to AVOID in video generation. List unwanted qualities as a comma-separated list."
                onVoiceResult={(result) => {
                  updateOverride('negative_prompt', result.prompt || result.transcription);
                }}
              />
            </div>

            {/* Model & Resolution Info (read-only) */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex flex-col">
                <span className="text-muted-foreground">Model</span>
                <span className="font-medium truncate" title={params.model_name || 'Default'}>
                  {(params.model_name || 'wan_2_2_i2v').replace('wan_2_2_', '').replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground">Resolution</span>
                <span className="font-medium" title={`Source: ${projectResolution ? 'Project/Shot' : (params.parsed_resolution_wh || params.orchestrator_details?.parsed_resolution_wh) ? 'Task Params' : 'Auto'}`}>
                  {projectResolution || params.parsed_resolution_wh || params.orchestrator_details?.parsed_resolution_wh || 'Auto'}
                </span>
              </div>
            </div>

            {/* Seed Info */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Seed</span>
              <span className="font-mono font-medium">
                {params.seed_to_use || params.orchestrator_details?.seed_base || 'Random'}
              </span>
            </div>

            {/* Motion/LoRAs/Phase Config - only show when regenerating existing segment */}
            {/* For first-time generation, use project defaults; these are regen-only tweaks */}
            {isRegeneration && (
              <MotionPresetSelector
                builtinPreset={builtinPreset}
                featuredPresetIds={[]}
                generationTypeMode={generationMode}
                selectedPhasePresetId={selectedPhasePresetId}
                phaseConfig={phaseConfig ?? builtinPreset.metadata.phaseConfig}
                motionMode={motionMode}
                onPresetSelect={handlePhasePresetSelect}
                onPresetRemove={handlePhasePresetRemove}
                onModeChange={handleMotionModeChange}
                onPhaseConfigChange={handlePhaseConfigChange}
                availableLoras={availableLoras}
                randomSeed={randomSeed}
                onRandomSeedChange={handleRandomSeedChange}
                queryKeyPrefix={queryKeyPrefix}
                renderBasicModeContent={() => (
                  <div className="space-y-3">
                    <ActiveLoRAsDisplay
                      selectedLoras={selectedLoras}
                      onRemoveLora={handleRemoveLora}
                      onLoraStrengthChange={handleLoraStrengthChange}
                      availableLoras={availableLoras}
                    />
                    <button
                      onClick={handleAddLoraClick}
                      className="w-full text-sm text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/30 hover:border-muted-foreground/50 rounded-lg py-2 transition-colors"
                    >
                      Add or manage LoRAs
                    </button>
                  </div>
                )}
              />
            )}
          </div>

          {/* LoRA Selector Modal - only needed for regeneration */}
          {isRegeneration && (
            <LoraSelectorModal
              isOpen={isLoraModalOpen}
              onClose={() => setIsLoraModalOpen(false)}
              loras={availableLoras}
              onAddLora={handleLoraSelect}
              onRemoveLora={handleRemoveLora}
              onUpdateLoraStrength={handleLoraStrengthChange}
              selectedLoras={selectedLoras.map(lora => {
                const fullLora = availableLoras.find(l => l.id === lora.id || l.path === lora.path);
                return {
                  ...fullLora,
                  "Model ID": lora.id,
                  Name: lora.name,
                  strength: lora.strength,
                } as LoraModel & { strength: number };
              })}
              lora_type="Wan I2V"
            />
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Regenerate Button */}
      <Button
        size="sm"
        onClick={handleRegenerateSegment}
        disabled={isRegenerating || !startImageUrl || !endImageUrl || (!generationId && !shotId) || (shotId && isLoadingShotStructure)}
        className="w-full gap-2"
        variant={regenerateSuccess ? "outline" : "default"}
      >
        {(shotId && isLoadingShotStructure) ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading settings...
          </>
        ) : isRegenerating ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            Starting...
          </>
        ) : regenerateSuccess ? (
          <>
            <Check className="w-3 h-3 text-green-500" />
            Task Created
          </>
        ) : (
          <>
            <RotateCcw className="w-3 h-3" />
            {buttonLabel}
          </>
        )}
      </Button>

      {/* Reset to batch defaults */}
      <button
        type="button"
        onClick={handleResetToDefaults}
        className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Reset to batch defaults
      </button>

      {/* Warning if missing images */}
      {(!startImageUrl || !endImageUrl) && (
        <p className="text-xs text-muted-foreground text-center">
          Unable to regenerate: This video doesn't have input image information available.
        </p>
      )}
    </div>
  );
};

export default SegmentRegenerateControls;
