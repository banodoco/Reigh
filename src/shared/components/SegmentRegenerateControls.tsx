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
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';
import { Label } from '@/shared/components/ui/label';
import { Slider } from '@/shared/components/ui/slider';
import { Switch } from '@/shared/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { ChevronDown, ChevronUp, Loader2, Check, RotateCcw, Upload } from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { usePersistentToolState } from '@/shared/hooks/usePersistentToolState';
import { createIndividualTravelSegmentTask } from '@/shared/lib/tasks/individualTravelSegment';
import { useListPublicResources } from '@/shared/hooks/useResources';
import { MotionPresetSelector, type BuiltinPreset } from '@/shared/components/MotionPresetSelector';
import { ActiveLoRAsDisplay } from '@/shared/components/ActiveLoRAsDisplay';
import { LoraSelectorModal } from '@/shared/components/LoraSelectorModal';
import { PhaseConfig, DEFAULT_PHASE_CONFIG, DEFAULT_VACE_PHASE_CONFIG } from '@/tools/travel-between-images/settings';
import { quantizeFrameCount, framesToSeconds } from '@/tools/travel-between-images/components/Timeline/utils/time-utils';
import { getNormalizedParams } from '@/shared/lib/normalizeSegmentParams';
import type { LoraModel, ActiveLora } from '@/shared/hooks/useLoraManager';

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
  /** Generation ID to use as parent for the new child generation */
  generationId: string;
  /** Optional existing child generation ID (for Replace mode) */
  childGenerationId?: string;
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
}

export const SegmentRegenerateControls: React.FC<SegmentRegenerateControlsProps> = ({
  initialParams,
  projectId,
  generationId,
  childGenerationId,
  segmentIndex = 0,
  startImageUrl,
  endImageUrl,
  startImageGenerationId,
  endImageGenerationId,
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
}) => {
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

  // Use shared normalization utility
  const [params, setParams] = useState<any>(() => getNormalizedParams(initialParams, { segmentIndex }));
  const [isDirty, setIsDirty] = useState(false);

  // [ResolutionDebug] Log what resolution this component received on mount
  console.log('[SegmentRegenerateControls] [ResolutionDebug] Component received props:', {
    projectResolutionProp: projectResolution,
    initialParamsResolution: initialParams?.parsed_resolution_wh,
    initialOrchestratorResolution: initialParams?.orchestrator_details?.parsed_resolution_wh,
    generationId: generationId?.substring(0, 8),
    childGenerationId: childGenerationId?.substring(0, 8),
    segmentIndex,
    queryKeyPrefix,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateSuccess, setRegenerateSuccess] = useState(false);

  // Fetch available LoRAs
  const { data: publicResources } = useListPublicResources();
  const availableLoras: LoraModel[] = useMemo(() => {
    if (!publicResources) return [];
    return publicResources
      .filter((r: any) => r.type === 'lora')
      .map((r: any) => ({
        id: r.id,
        name: r.name,
        path: r.url || r.location,
        category: r.category,
        tags: r.tags || [],
        default_strength: r.default_strength || 1.0,
      }));
  }, [publicResources]);

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
  const [makePrimaryVariant, setMakePrimaryVariant] = useState(true);

  // Bind to project settings for persistence
  usePersistentToolState(
    'travel-between-images',
    { projectId: projectId || undefined },
    { makePrimaryVariant: [makePrimaryVariant, setMakePrimaryVariant] },
    { scope: 'project', enabled: !!projectId }
  );

  // Smooth continuations (SVI) - for smoother transitions between segments
  // Only available when predecessorVideoUrl is provided (segments after the first)
  // Defaults to true when a predecessor video is available
  const [smoothContinuations, setSmoothContinuations] = useState(true);

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

  // Handle field changes
  const handleChange = useCallback((field: string, value: any) => {
    setParams((prev: any) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  }, []);

  // Motion control handlers
  const handleMotionModeChange = useCallback((mode: 'basic' | 'advanced') => {
    setMotionMode(mode);
    setIsDirty(true);
    if (mode === 'advanced' && !phaseConfig) {
      setPhaseConfig(builtinPreset.metadata.phaseConfig);
    }
  }, [phaseConfig, builtinPreset]);

  const handleAmountOfMotionChange = useCallback((value: number) => {
    setAmountOfMotion(value);
    setIsDirty(true);
  }, []);

  const handlePhaseConfigChange = useCallback((config: PhaseConfig) => {
    setPhaseConfig(config);
    setIsDirty(true);
  }, []);

  const handlePhasePresetSelect = useCallback((presetId: string, config: PhaseConfig) => {
    setSelectedPhasePresetId(presetId);
    setPhaseConfig(config);
    setIsDirty(true);
  }, []);

  const handlePhasePresetRemove = useCallback(() => {
    setSelectedPhasePresetId(null);
    setIsDirty(true);
  }, []);

  const handleRandomSeedChange = useCallback((value: boolean) => {
    setRandomSeed(value);
    setIsDirty(true);
  }, []);

  // LoRA handlers
  const handleAddLoraClick = useCallback(() => {
    setIsLoraModalOpen(true);
  }, []);

  const handleRemoveLora = useCallback((loraId: string) => {
    setSelectedLoras(prev => prev.filter(l => l.id !== loraId));
    setIsDirty(true);
  }, []);

  const handleLoraStrengthChange = useCallback((loraId: string, strength: number) => {
    setSelectedLoras(prev => prev.map(l => l.id === loraId ? { ...l, strength } : l));
    setIsDirty(true);
  }, []);

  const handleLoraSelect = useCallback((lora: LoraModel) => {
    setSelectedLoras(prev => {
      if (prev.some(l => l.id === lora.id || l.path === lora.path)) {
        return prev;
      }
      return [...prev, {
        id: lora.id || lora.path,
        name: lora.name,
        path: lora.path,
        strength: lora.default_strength || 1.0,
      }];
    });
    setIsDirty(true);
  }, []);

  // Handle segment regeneration
  const handleRegenerateSegment = useCallback(async () => {
    if (!projectId) {
      toast({
        title: "Error",
        description: "No project selected",
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

      await createIndividualTravelSegmentTask({
        project_id: projectId,
        parent_generation_id: generationId,
        child_generation_id: childGenerationId,
        segment_index: segmentIndex,
        start_image_url: startImageUrl,
        end_image_url: endImageUrl,
        start_image_generation_id: startImageGenerationId,
        end_image_generation_id: endImageGenerationId,
        originalParams: paramsWithResolution,
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
        make_primary_variant: makePrimaryVariant,
        // Smooth continuations (SVI) params
        use_svi: smoothContinuations && !!predecessorVideoUrl,
        svi_predecessor_video_url: smoothContinuations ? predecessorVideoUrl : undefined,
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
    childGenerationId,
    segmentIndex,
    params,
    selectedLoras,
    startImageUrl,
    endImageUrl,
    startImageGenerationId,
    endImageGenerationId,
    amountOfMotion,
    advancedMode,
    phaseConfig,
    motionMode,
    selectedPhasePresetId,
    randomSeed,
    makePrimaryVariant,
    projectResolution,
    smoothContinuations,
    predecessorVideoUrl,
    toast
  ]);

  // Update local state when params prop changes
  useEffect(() => {
    setParams(getNormalizedParams(initialParams, { segmentIndex }));
    setIsDirty(false);
  }, [initialParams, segmentIndex]);

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
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startImageInputRef.current?.click();
                    }}
                    disabled={isUploadingStartImage}
                    className="absolute top-1 right-1 h-6 w-6 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-all opacity-0 group-hover:opacity-100"
                    title="Replace start image"
                  >
                    {isUploadingStartImage ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Upload className="h-3 w-3" />
                    )}
                  </button>
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
          <div className="order-last col-span-2 @[280px]:order-none @[280px]:col-span-1 flex flex-col justify-center space-y-1">
            <div className="flex flex-col items-center text-center">
              <Label className="text-xs font-medium">Frames</Label>
              <span className="text-xs text-muted-foreground">
                {params.num_frames || 0} ({framesToSeconds(params.num_frames || 0)})
              </span>
            </div>
            <Slider
              value={[quantizeFrameCount(params.num_frames || 9, 9)]}
              onValueChange={([value]) => handleChange('num_frames', quantizeFrameCount(value, 9))}
              min={9}
              max={81}
              step={4}
              className="w-full"
            />
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
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      endImageInputRef.current?.click();
                    }}
                    disabled={isUploadingEndImage}
                    className="absolute top-1 left-1 h-6 w-6 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-all opacity-0 group-hover:opacity-100"
                    title="Replace end image"
                  >
                    {isUploadingEndImage ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Upload className="h-3 w-3" />
                    )}
                  </button>
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
            setParams((prev: any) => ({
              ...prev,
              base_prompt: e.target.value,
              prompt: e.target.value
            }));
            setIsDirty(true);
          }}
          className="h-20 text-sm resize-none"
          placeholder="Describe this segment..."
          clearable
          onClear={() => {
            setParams((prev: any) => ({ ...prev, base_prompt: '', prompt: '' }));
            setIsDirty(true);
          }}
          voiceInput
          voiceContext="This is a prompt for a video segment. Describe the motion, action, or visual content you want in this part of the video."
          onVoiceResult={(result) => {
            setParams((prev: any) => ({
              ...prev,
              base_prompt: result.prompt || result.transcription,
              prompt: result.prompt || result.transcription
            }));
            setIsDirty(true);
          }}
        />
      </div>

      {/* Advanced Settings */}
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between h-9 text-xs font-medium"
          >
            <span>Advanced Settings</span>
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-3">
          {/* Generation Settings Section */}
          <div className="space-y-3 p-3 bg-muted/30 rounded-lg border border-border/50">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Generation Settings:</Label>

            {/* Negative Prompt */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Negative Prompt:</Label>
              <Textarea
                value={params.negative_prompt || ''}
                onChange={(e) => handleChange('negative_prompt', e.target.value)}
                className="h-16 text-xs resize-none"
                placeholder="Things to avoid..."
                clearable
                onClear={() => handleChange('negative_prompt', '')}
                voiceInput
                voiceContext="This is a negative prompt - things to AVOID in video generation. List unwanted qualities as a comma-separated list."
                onVoiceResult={(result) => {
                  handleChange('negative_prompt', result.prompt || result.transcription);
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
          </div>

          {/* Motion Settings */}
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

          {/* LoRA Selector Modal */}
          <LoraSelectorModal
            isOpen={isLoraModalOpen}
            onClose={() => setIsLoraModalOpen(false)}
            onSelect={handleLoraSelect}
            availableLoras={availableLoras}
            selectedLoras={selectedLoras.map(l => l.id)}
          />
        </CollapsibleContent>
      </Collapsible>

      {/* Smooth Continuations Toggle - only shown for segments after the first */}
      {showSmoothContinuation && predecessorVideoUrl && (
        <div className="flex items-center space-x-2 p-3 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
          <Switch
            id="smooth-continuations"
            checked={smoothContinuations}
            onCheckedChange={setSmoothContinuations}
          />
          <div className="flex-1">
            <Label htmlFor="smooth-continuations" className="font-medium cursor-pointer">
              Smooth Continuations
            </Label>
            <p className="text-xs text-muted-foreground">
              Use previous segment for smoother transition
            </p>
          </div>
        </div>
      )}

      {/* Make Primary Variant Toggle */}
      <div className="flex items-center justify-between py-2">
        <Label htmlFor="make-primary" className="text-sm cursor-pointer">
          Make primary variant
        </Label>
        <Switch
          id="make-primary"
          checked={makePrimaryVariant}
          onCheckedChange={setMakePrimaryVariant}
        />
      </div>

      {/* Regenerate Button */}
      <Button
        size="sm"
        onClick={handleRegenerateSegment}
        disabled={isRegenerating || !startImageUrl || !endImageUrl}
        className="w-full gap-2"
        variant={regenerateSuccess ? "outline" : "default"}
      >
        {isRegenerating ? (
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
