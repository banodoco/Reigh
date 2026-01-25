import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { useExtraLargeModal } from '@/shared/hooks/useModal';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Shot } from '@/types/shots';
import { ExternalLink } from 'lucide-react';
import { getDisplayUrl } from '@/shared/lib/utils';
import { useShotNavigation } from '@/shared/hooks/useShotNavigation';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { useShotSettings } from '@/tools/travel-between-images/hooks/useShotSettings';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { DEFAULT_STEERABLE_MOTION_SETTINGS } from '@/tools/travel-between-images/components/ShotEditor/state/types';
import BatchSettingsForm from '@/tools/travel-between-images/components/BatchSettingsForm';
import { MotionControl } from '@/tools/travel-between-images/components/MotionControl';
import { SectionHeader } from '@/tools/image-generation/components/ImageGenerationForm/components/SectionHeader';
import {
  generateVideo,
  buildBasicModePhaseConfig,
  type StructureVideoConfig,
  DEFAULT_STRUCTURE_VIDEO_CONFIG,
} from '@/tools/travel-between-images/components/ShotEditor/services/generateVideoService';
import { usePublicLoras } from '@/shared/hooks/useResources';
import { LoraModel, LoraSelectorModal } from '@/shared/components/LoraSelectorModal';
import { useAllShotGenerations } from '@/shared/hooks/useShotGenerations';
import { isPositioned, isVideoGeneration } from '@/shared/lib/typeGuards';
import { findClosestAspectRatio } from '@/shared/lib/aspectRatios';
import { DEFAULT_PHASE_CONFIG } from '@/tools/travel-between-images/settings';
import { useInvalidateGenerations } from '@/shared/hooks/useGenerationInvalidation';
import { BUILTIN_DEFAULT_I2V_ID, BUILTIN_DEFAULT_VACE_ID, FEATURED_PRESET_IDS } from '@/tools/travel-between-images/components/MotionControl';

interface VideoGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  shot: Shot;
}

/**
 * Video Generation Modal - Opens a simplified video generation form for a shot
 * Always operates in Batch mode (not timeline mode)
 * Changes update the actual shot settings
 */
export const VideoGenerationModal: React.FC<VideoGenerationModalProps> = ({
  isOpen,
  onClose,
  shot,
}) => {
  const modal = useExtraLargeModal();
  const { selectedProjectId, projects } = useProject();
  const queryClient = useQueryClient();
  const invalidateGenerations = useInvalidateGenerations();
  const { navigateToShot } = useShotNavigation();

  const [isGenerating, setIsGenerating] = useState(false);
  const [justQueued, setJustQueued] = useState(false);
  const justQueuedTimeoutRef = useRef<number | null>(null);
  const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);
  
  // UI settings (accelerated mode, random seed) - same pattern as ShotEditor
  const { settings: shotUISettings, update: updateShotUISettings } = useToolSettings<{
    acceleratedMode?: boolean;
    randomSeed?: boolean;
  }>('travel-ui-state', {
    shotId: isOpen ? shot.id : null,
    enabled: isOpen && !!shot.id
  });
  
  const accelerated = shotUISettings?.acceleratedMode ?? false;
  const randomSeed = shotUISettings?.randomSeed ?? false;
  
  const setAccelerated = useCallback((value: boolean) => {
    updateShotUISettings('shot', { acceleratedMode: value });
  }, [updateShotUISettings]);
  
  const setRandomSeed = useCallback((value: boolean) => {
    updateShotUISettings('shot', { randomSeed: value });
  }, [updateShotUISettings]);
  
  // Use useShotSettings for all state management
  const {
    settings,
    status,
    updateField,
    updateFields,
  } = useShotSettings(isOpen ? shot.id : null, selectedProjectId);
  
  // Available LoRAs
  const { data: availableLoras } = usePublicLoras();
  
  // Shot generations for positioned images
  const { data: shotGenerations, isLoading: generationsLoading } = useAllShotGenerations(
    isOpen ? shot.id : null,
    { disableRefetch: false }
  );
  
  const positionedImages = useMemo(() => {
    if (!shotGenerations) return [];
    return shotGenerations
      .filter(g => !isVideoGeneration(g) && isPositioned(g))
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
  }, [shotGenerations]);
  
  // Project aspect ratio
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio || '16:9';
  
  const effectiveAspectRatio = useMemo(() => {
    if (positionedImages.length > 0) {
      const firstImage = positionedImages[0];
      const metadata = (firstImage as any).metadata || {};
      if (metadata.width && metadata.height) {
        const ratio = metadata.width / metadata.height;
        return findClosestAspectRatio(ratio);
      }
    }
    return projectAspectRatio;
  }, [positionedImages, projectAspectRatio]);
  
  // Selected LoRAs as ActiveLora[]
  const selectedLoras = useMemo(() => {
    return (settings.loras || []).map(lora => ({
      id: lora.id,
      name: lora.name,
      path: lora.path,
      strength: lora.strength,
      previewImageUrl: lora.previewImageUrl,
      trigger_word: lora.trigger_word,
    }));
  }, [settings.loras]);
  
  // Validate preset ID - only pass known preset IDs to prevent "not found" errors
  // Known presets are: builtin defaults + featured presets from the constant
  const validPresetId = useMemo(() => {
    const presetId = settings.selectedPhasePresetId;
    if (!presetId) return undefined;
    
    // Known preset IDs that won't cause "not found" errors
    const knownIds = [
      BUILTIN_DEFAULT_I2V_ID,
      BUILTIN_DEFAULT_VACE_ID,
      ...FEATURED_PRESET_IDS,
    ];
    
    if (knownIds.includes(presetId)) {
      return presetId;
    }
    
    // Unknown preset ID - clear it to show chip selector instead of "not found"
    return undefined;
  }, [settings.selectedPhasePresetId]);
  
  // LoRA handlers
  const handleAddLora = useCallback((lora: LoraModel) => {
    const newLora = {
      id: (lora['Model ID'] || '') as string,
      name: (lora.Name || '') as string,
      path: (lora.link || '') as string,
      strength: 1.0,
      previewImageUrl: lora['Preview Image URL'] as string | undefined,
      trigger_word: lora['Trigger Word'] as string | undefined,
    };
    const currentLoras = settings.loras || [];
    if (!currentLoras.some(l => l.id === newLora.id)) {
      updateField('loras', [...currentLoras, newLora]);
    }
    setIsLoraModalOpen(false);
  }, [settings.loras, updateField]);

  const handleRemoveLora = useCallback((loraId: string) => {
    updateField('loras', (settings.loras || []).filter(l => l.id !== loraId));
  }, [settings.loras, updateField]);

  const handleLoraStrengthChange = useCallback((loraId: string, strength: number) => {
    updateField('loras', (settings.loras || []).map(l =>
      l.id === loraId ? { ...l, strength } : l
    ));
  }, [settings.loras, updateField]);
  
  const handleAddTriggerWord = useCallback((loraId: string, word: string) => {
    const currentPrompt = settings.prompt || '';
    if (!currentPrompt.includes(word)) {
      const newPrompt = currentPrompt ? `${currentPrompt}, ${word}` : word;
      updateField('prompt', newPrompt);
    }
  }, [settings.prompt, updateField]);
  
  // Model name helper
  // Model selection depends on structure video TYPE:
  // - Uni3C (structureType === 'uni3c'): use I2V model
  // - VACE types (flow, canny, depth): use VACE model
  // - No structure video: use I2V model (default)
  const getModelName = useCallback(() => {
    const hasStructureVideo = !!settings.structureVideo?.path;
    const structureType = settings.structureVideo?.structureType;
    const isUni3c = structureType === 'uni3c' && hasStructureVideo;
    const useVaceModel = hasStructureVideo && !isUni3c;
    
    const motionMode = settings.motionMode || 'basic';
    if (motionMode === 'basic') {
      return useVaceModel
        ? 'wan_2_2_vace_lightning_baseline_2_2_2'
        : 'wan_2_2_i2v_lightning_baseline_2_2_2';
    }
    // Advanced mode: use phase count to pick 2-phase vs 3-phase variant
    const phaseConfig = settings.phaseConfig || DEFAULT_PHASE_CONFIG;
    const is2Phase = phaseConfig.num_phases === 2;
    if (useVaceModel) {
      return is2Phase
        ? 'wan_2_2_vace_lightning_baseline_3_3'
        : 'wan_2_2_vace_lightning_baseline_2_2_2';
    }
    return is2Phase
      ? 'wan_2_2_i2v_lightning_baseline_3_3'
      : 'wan_2_2_i2v_lightning_baseline_2_2_2';
  }, [settings.motionMode, settings.phaseConfig, settings.structureVideo?.path, settings.structureVideo?.structureType]);
  
  // Handle generate
  const handleGenerate = useCallback(async () => {
    if (!selectedProjectId || !shot.id) {
      toast.error("No project or shot selected.");
      return;
    }
    if (positionedImages.length < 1) {
      toast.error("At least 1 positioned image is required.");
      return;
    }
    
    setIsGenerating(true);
    try {
      // Save generationMode as 'batch' when actually generating
      updateField('generationMode', 'batch');
      
      const userLoras = selectedLoras.map(l => ({ path: l.path, strength: l.strength }));
      const hasStructureVideo = !!settings.structureVideo?.path;
      const { phaseConfig: basicPhaseConfig } = buildBasicModePhaseConfig(
        hasStructureVideo, settings.amountOfMotion || 50, userLoras
      );
      
      const motionMode = settings.motionMode || 'basic';
      const advancedMode = motionMode === 'advanced';
      const finalPhaseConfig = advancedMode ? (settings.phaseConfig || DEFAULT_PHASE_CONFIG) : basicPhaseConfig;
      
      // Build merged steerable motion settings for extracting defaults
      const mergedSteerableSettings = { ...DEFAULT_STEERABLE_MOTION_SETTINGS, ...(settings.steerableMotionSettings || {}) };

      const result = await generateVideo({
        projectId: selectedProjectId,
        selectedShotId: shot.id,
        selectedShot: shot,
        queryClient,
        effectiveAspectRatio,
        generationMode: 'batch',
        // Grouped configs (snake_case matching API)
        promptConfig: {
          base_prompt: settings.prompt || '',
          enhance_prompt: settings.enhancePrompt || false,
          text_before_prompts: settings.textBeforePrompts,
          text_after_prompts: settings.textAfterPrompts,
          default_negative_prompt: mergedSteerableSettings.negative_prompt,
        },
        motionConfig: {
          amount_of_motion: settings.amountOfMotion || 50,
          motion_mode: motionMode,
          advanced_mode: advancedMode,
          phase_config: finalPhaseConfig,
          selected_phase_preset_id: settings.selectedPhasePresetId,
        },
        modelConfig: {
          seed: mergedSteerableSettings.seed,
          random_seed: randomSeed,
          turbo_mode: settings.turboMode || false,
          debug: mergedSteerableSettings.debug || false,
          generation_type_mode: settings.generationTypeMode || 'i2v',
        },
        structureVideoConfig: {
          ...DEFAULT_STRUCTURE_VIDEO_CONFIG,
          structure_video_path: settings.structureVideo?.path || null,
          structure_video_type: settings.structureVideo?.structureType || DEFAULT_STRUCTURE_VIDEO_CONFIG.structure_video_type,
          structure_video_treatment: settings.structureVideo?.treatment || DEFAULT_STRUCTURE_VIDEO_CONFIG.structure_video_treatment,
          structure_video_motion_strength: settings.structureVideo?.motionStrength || DEFAULT_STRUCTURE_VIDEO_CONFIG.structure_video_motion_strength,
        },
        batchVideoFrames: settings.batchVideoFrames || 61,
        selectedLoras: selectedLoras.map(l => ({ id: l.id, path: l.path, strength: l.strength, name: l.name })),
        variantNameParam: '',
        clearAllEnhancedPrompts: async () => {},
      });
      
      if (result.success) {
        setJustQueued(true);
        if (justQueuedTimeoutRef.current) clearTimeout(justQueuedTimeoutRef.current);
        justQueuedTimeoutRef.current = window.setTimeout(() => {
          setJustQueued(false);
          justQueuedTimeoutRef.current = null;
          onClose();
        }, 1000);
        invalidateGenerations(shot.id, {
          reason: 'video-generation-modal-success',
          scope: 'all',
          includeProjectUnified: true,
          projectId: selectedProjectId ?? undefined
        });
      } else {
        toast.error(result.error || 'Failed to generate video');
      }
    } catch (error) {
      console.error('[VideoGenerationModal] Error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate video');
    } finally {
      setIsGenerating(false);
    }
  }, [selectedProjectId, shot, positionedImages, selectedLoras, settings, queryClient, effectiveAspectRatio, randomSeed, updateField, onClose]);
  
  const handleNavigateToShot = useCallback(() => {
    onClose();
    navigateToShot(shot);
  }, [onClose, navigateToShot, shot]);
  
  useEffect(() => {
    return () => {
      if (justQueuedTimeoutRef.current) clearTimeout(justQueuedTimeoutRef.current);
    };
  }, []);
  
  const isLoading = (status !== 'ready' && status !== 'saving' && status !== 'error') || generationsLoading;
  const isDisabled = isGenerating || isLoading || positionedImages.length < 1;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className={modal.className}
          style={{ ...modal.style, maxWidth: '1000px' }}
          onPointerDownOutside={() => !isLoraModalOpen && onClose()}
          onInteractOutside={() => !isLoraModalOpen && onClose()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          {...modal.props}
        >
          <DialogHeader className={modal.headerClass}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-xl font-light">
                  Generate Video - <span className="preserve-case">{shot.name || 'Unnamed Shot'}</span>
                </DialogTitle>
                <Tooltip delayDuration={500}>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleNavigateToShot} className="h-7 w-7">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Open Shot Editor</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Input images preview */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {positionedImages.slice(0, 6).map((img, idx) => (
                  <img
                    key={img.id || idx}
                    src={getDisplayUrl(img.thumbUrl || img.imageUrl || img.location)}
                    alt={`Image ${idx + 1}`}
                    className="w-7 h-7 object-cover rounded border border-zinc-600"
                  />
                ))}
                {positionedImages.length > 6 && (
                  <div className="w-7 h-7 rounded border border-zinc-600 bg-zinc-700 flex items-center justify-center text-[10px] text-zinc-400">
                    +{positionedImages.length - 6}
                  </div>
                )}
                {positionedImages.length < 1 && (
                  <span className="text-xs text-amber-500">(need 1+ images)</span>
                )}
              </div>
            </div>
          </DialogHeader>
          
          <div className={`${modal.scrollClass} -mx-6 px-6 flex-1 min-h-0`}>
            {isLoading ? (
              <div className="space-y-4 pb-4">
                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Left column - Settings (matches BatchSettingsForm) */}
                  <div className="lg:w-1/2">
                    <div className="mb-4"><Skeleton className="h-6 w-20" /></div>
                    <div className="space-y-4">
                      {/* Prompt + Negative prompt grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Skeleton className="h-4 w-16" />
                          <Skeleton className="h-[70px] w-full rounded-md" />
                        </div>
                        <div className="space-y-1.5">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-[70px] w-full rounded-md" />
                        </div>
                      </div>
                      {/* Enhance prompt toggle */}
                      <Skeleton className="h-12 w-full rounded-lg" />
                      {/* Before/After prompts grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-9 w-full rounded-md" />
                        </div>
                        <div className="space-y-1.5">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-9 w-full rounded-md" />
                        </div>
                      </div>
                      {/* Duration slider */}
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-5 w-full rounded-full" />
                      </div>
                    </div>
                  </div>
                  
                  {/* Right column - Motion (matches MotionControl) */}
                  <div className="lg:w-1/2">
                    <div className="mb-4"><Skeleton className="h-6 w-16" /></div>
                    <div className="space-y-4">
                      {/* LoRAs section */}
                      <Skeleton className="h-10 w-full rounded-md" />
                      {/* Preset chips */}
                      <div className="flex gap-2">
                        <Skeleton className="h-8 w-16 rounded-full" />
                        <Skeleton className="h-8 w-20 rounded-full" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6 pb-4">
                <div className="flex flex-col lg:flex-row gap-6">
                  <div className="lg:w-1/2">
                    <div className="mb-4"><SectionHeader title="Settings" theme="orange" /></div>
                    <BatchSettingsForm
                      batchVideoPrompt={settings.prompt || ''}
                      onBatchVideoPromptChange={(v) => updateField('prompt', v)}
                      batchVideoFrames={settings.batchVideoFrames || 61}
                      onBatchVideoFramesChange={(v) => updateField('batchVideoFrames', v)}
                      batchVideoSteps={settings.batchVideoSteps || 6}
                      onBatchVideoStepsChange={(v) => updateField('batchVideoSteps', v)}
                      dimensionSource={settings.dimensionSource || 'firstImage'}
                      onDimensionSourceChange={(v) => updateField('dimensionSource', v)}
                      customWidth={settings.customWidth}
                      onCustomWidthChange={(v) => updateField('customWidth', v)}
                      customHeight={settings.customHeight}
                      onCustomHeightChange={(v) => updateField('customHeight', v)}
                      negativePrompt={settings.negativePrompt || ''}
                      onNegativePromptChange={(v) => updateField('negativePrompt', v)}
                      projects={projects}
                      selectedProjectId={selectedProjectId}
                      selectedLoras={selectedLoras}
                      availableLoras={availableLoras}
                      isTimelineMode={false}
                      accelerated={accelerated}
                      onAcceleratedChange={setAccelerated}
                      randomSeed={randomSeed}
                      onRandomSeedChange={setRandomSeed}
                      turboMode={settings.turboMode || false}
                      onTurboModeChange={(v) => updateField('turboMode', v)}
                      amountOfMotion={settings.amountOfMotion || 50}
                      onAmountOfMotionChange={(v) => updateField('amountOfMotion', v)}
                      imageCount={positionedImages.length}
                      enhancePrompt={settings.enhancePrompt || false}
                      onEnhancePromptChange={(v) => updateField('enhancePrompt', v)}
                      advancedMode={(settings.motionMode || 'basic') === 'advanced'}
                      phaseConfig={settings.phaseConfig || DEFAULT_PHASE_CONFIG}
                      onPhaseConfigChange={(v) => updateField('phaseConfig', v)}
                      selectedPhasePresetId={validPresetId}
                      onPhasePresetSelect={(id, config) => { updateField('selectedPhasePresetId', id); updateField('phaseConfig', config); }}
                      onPhasePresetRemove={() => updateField('selectedPhasePresetId', undefined)}
                      videoControlMode="batch"
                      textBeforePrompts={settings.textBeforePrompts || ''}
                      onTextBeforePromptsChange={(v) => updateField('textBeforePrompts', v)}
                      textAfterPrompts={settings.textAfterPrompts || ''}
                      onTextAfterPromptsChange={(v) => updateField('textAfterPrompts', v)}
                    />
                  </div>
                  
                  <div className="lg:w-1/2">
                    <div className="mb-4"><SectionHeader title="Motion" theme="purple" /></div>
                    <MotionControl
                      motionMode={(settings.motionMode || 'basic') as 'basic' | 'advanced'}
                      onMotionModeChange={(v) => { updateField('motionMode', v); updateField('advancedMode', v === 'advanced'); }}
                      generationTypeMode={settings.generationTypeMode || 'i2v'}
                      onGenerationTypeModeChange={(v) => updateField('generationTypeMode', v)}
                      hasStructureVideo={!!settings.structureVideo?.path}
                      selectedLoras={selectedLoras}
                      availableLoras={availableLoras}
                      onAddLoraClick={() => setIsLoraModalOpen(true)}
                      onRemoveLora={handleRemoveLora}
                      onLoraStrengthChange={handleLoraStrengthChange}
                      onAddTriggerWord={(word) => handleAddTriggerWord('', word)}
                      selectedPhasePresetId={validPresetId}
                      onPhasePresetSelect={(id, config) => { updateField('selectedPhasePresetId', id); updateField('phaseConfig', config); }}
                      onPhasePresetRemove={() => updateField('selectedPhasePresetId', undefined)}
                      currentSettings={{}}
                      phaseConfig={settings.phaseConfig || DEFAULT_PHASE_CONFIG}
                      onPhaseConfigChange={(v) => updateField('phaseConfig', v)}
                      randomSeed={randomSeed}
                      onRandomSeedChange={setRandomSeed}
                      turboMode={settings.turboMode || false}
                      settingsLoading={status !== 'ready' && status !== 'saving'}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Sticky footer with Generate button - always show, skeleton when loading */}
          <div className="flex-shrink-0 border-t border-zinc-700 bg-background px-6 py-4 -mx-6 -mb-6 flex justify-center">
            {isLoading ? (
              <Skeleton className="h-11 w-full max-w-md rounded-md" />
            ) : (
              <Button 
                size="retro-default" 
                className="w-full max-w-md" 
                variant={justQueued ? "success" : "retro"}
                onClick={handleGenerate}
                disabled={isDisabled}
              >
                {justQueued
                  ? "Submitted, closing modal..."
                  : isGenerating 
                    ? 'Creating Tasks...' 
                    : 'Generate Video'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      <LoraSelectorModal
        isOpen={isLoraModalOpen}
        onClose={() => setIsLoraModalOpen(false)}
        loras={availableLoras}
        onAddLora={handleAddLora}
        onRemoveLora={handleRemoveLora}
        onUpdateLoraStrength={handleLoraStrengthChange}
        selectedLoras={selectedLoras.map(lora => {
          const fullLora = availableLoras.find(l => l['Model ID'] === lora.id);
          return { ...fullLora, "Model ID": lora.id, Name: lora.name, strength: lora.strength } as any;
        })}
        lora_type="Wan 2.1 14b"
      />
    </>
  );
};

export default VideoGenerationModal;
