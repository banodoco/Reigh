/**
 * SegmentRegenerateForm Component
 *
 * A form for regenerating a video segment from within the MediaLightbox.
 * Mirrors the regeneration form at the bottom of each segment in ChildGenerationsView.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';
import { Label } from '@/shared/components/ui/label';
import { Slider } from '@/shared/components/ui/slider';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { ChevronDown, ChevronUp, Loader2, Check, RotateCcw } from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { createIndividualTravelSegmentTask } from '@/shared/lib/tasks/individualTravelSegment';
import { useListPublicResources } from '@/shared/hooks/useResources';
import { MotionPresetSelector, type BuiltinPreset } from '@/shared/components/MotionPresetSelector';
import { ActiveLoRAsDisplay } from '@/shared/components/ActiveLoRAsDisplay';
import { LoraSelectorModal } from '@/shared/components/LoraSelectorModal';
import { PhaseConfig, DEFAULT_PHASE_CONFIG, DEFAULT_VACE_PHASE_CONFIG } from '@/tools/travel-between-images/settings';
import { quantizeFrameCount, framesToSeconds } from '@/tools/travel-between-images/components/Timeline/utils/time-utils';
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

export interface SegmentRegenerateFormProps {
  /** Generation params from the current video */
  params: Record<string, any>;
  /** Project ID for task creation */
  projectId: string | null;
  /** Generation ID to use as parent for the variant */
  generationId: string;
  /** Optional segment index (defaults to 0 for single-segment videos) */
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
}

export const SegmentRegenerateForm: React.FC<SegmentRegenerateFormProps> = ({
  params: initialParams,
  projectId,
  generationId,
  segmentIndex = 0,
  startImageUrl,
  endImageUrl,
  startImageGenerationId,
  endImageGenerationId,
  projectResolution,
}) => {
  // Log props on render for debugging
  console.log('[SegmentRegenerateForm] [ResolutionDebug] Render with props:', {
    projectId: projectId?.substring(0, 8),
    generationId: generationId?.substring(0, 8),
    segmentIndex,
    projectResolution,
    hasStartImage: !!startImageUrl,
    hasEndImage: !!endImageUrl,
  });

  const { toast } = useToast();
  const [params, setParams] = useState<any>(initialParams || {});
  const [isDirty, setIsDirty] = useState(false);
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

      // Use current project resolution, fallback to stale resolution
      const staleResolution = params.parsed_resolution_wh ||
                              params.orchestrator_details?.parsed_resolution_wh;
      const finalResolution = projectResolution || staleResolution;

      console.log('[SegmentRegenerateForm] [ResolutionDebug] Resolution computation:', {
        projectResolutionProp: projectResolution,
        paramsResolution: params.parsed_resolution_wh,
        orchestratorResolution: params.orchestrator_details?.parsed_resolution_wh,
        staleResolution,
        finalResolution,
        source: projectResolution ? 'FROM_PROP (shot/project)' : 'STALE_PARAMS',
      });

      const paramsWithResolution = finalResolution
        ? {
            ...params,
            parsed_resolution_wh: finalResolution,
            orchestrator_details: {
              ...(params.orchestrator_details || {}),
              parsed_resolution_wh: finalResolution,
            },
          }
        : params;

      const uiBasePrompt = params.base_prompt || params.prompt || '';
      const uiNegativePrompt = params.negative_prompt || '';

      console.log('[SegmentRegenerateForm] [ResolutionDebug] Creating individual_travel_segment task:', {
        projectId,
        generationId,
        segmentIndex,
        startImageUrl: startImageUrl?.substring(0, 50),
        endImageUrl: endImageUrl?.substring(0, 50),
        numFrames: params.num_frames,
        finalResolution,
        paramsWithResolutionParsed: paramsWithResolution.parsed_resolution_wh,
      });

      await createIndividualTravelSegmentTask({
        project_id: projectId,
        parent_generation_id: generationId,
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
      });

      setRegenerateSuccess(true);
      toast({
        title: "Regeneration started",
        description: `Segment is being regenerated. Check the Tasks pane for progress.`,
      });

      setTimeout(() => setRegenerateSuccess(false), 3000);

    } catch (error: any) {
      console.error('[SegmentRegenerateForm] Error:', error);
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
    projectResolution,
    toast
  ]);

  // Update local state when params prop changes
  useEffect(() => {
    setParams(initialParams || {});
    setIsDirty(false);
  }, [initialParams]);

  return (
    <div className="p-4 space-y-4">
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

      {/* Frames */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">Frames:</Label>
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
                <span className="font-medium">
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
            queryKeyPrefix="lightbox-segment-presets"
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
            Regenerate Video
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

export default SegmentRegenerateForm;
