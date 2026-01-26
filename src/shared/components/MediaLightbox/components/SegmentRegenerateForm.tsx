/**
 * SegmentRegenerateForm Component
 *
 * A form for regenerating a video segment from within the MediaLightbox.
 * Uses the controlled SegmentSettingsForm pattern.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/shared/hooks/use-toast';
import { useSegmentSettingsForm } from '@/shared/hooks/useSegmentSettingsForm';
import { SegmentSettingsForm } from '@/shared/components/SegmentSettingsForm';
import { buildTaskParams, extractSettingsFromParams } from '@/shared/components/segmentSettingsUtils';
import { createIndividualTravelSegmentTask } from '@/shared/lib/tasks/individualTravelSegment';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
import { useTaskStatusCounts } from '@/shared/hooks/useTasks';
import { supabase } from '@/integrations/supabase/client';

export interface SegmentRegenerateFormProps {
  /** Generation params from the current video */
  params: Record<string, any>;
  /** Project ID for task creation */
  projectId: string | null;
  /** Generation ID to use as parent for the variant */
  generationId: string;
  /** Shot ID for fetching structure video settings */
  shotId?: string;
  /** Optional existing child generation ID (for Replace mode - creates variant instead of new child) */
  childGenerationId?: string;
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
  /** Shot generation ID for the start image (for video-to-timeline tethering) */
  pairShotGenerationId?: string;
  /** Project resolution for output */
  projectResolution?: string;
  /** Callback when frame count changes - for instant timeline updates */
  onFrameCountChange?: (pairShotGenerationId: string, frameCount: number) => void;
  /** Current frame count from timeline positions (source of truth) */
  currentFrameCount?: number;
  /** Variant params to load into the form (set externally, e.g., from VariantSelector hover) */
  variantParamsToLoad?: Record<string, any> | null;
  /** Callback when variant params have been loaded (to clear the trigger) */
  onVariantParamsLoaded?: () => void;
  /** Structure video type for this segment (null = no structure video coverage) */
  structureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth' | null;
  /** Shot-level structure video defaults */
  structureVideoDefaults?: {
    motionStrength: number;
    treatment: 'adjust' | 'clip';
    uni3cEndPercent: number;
  };
  /** Structure video URL for preview */
  structureVideoUrl?: string;
  /** Frame range info for this segment's structure video usage */
  structureVideoFrameRange?: {
    segmentStart: number;
    segmentEnd: number;
    videoTotalFrames: number;
    videoFps: number;
  };
}

export const SegmentRegenerateForm: React.FC<SegmentRegenerateFormProps> = ({
  params: initialParams,
  projectId,
  generationId,
  shotId,
  childGenerationId,
  segmentIndex = 0,
  startImageUrl,
  endImageUrl,
  startImageGenerationId,
  endImageGenerationId,
  pairShotGenerationId,
  projectResolution,
  onFrameCountChange,
  currentFrameCount,
  variantParamsToLoad,
  onVariantParamsLoaded,
  structureVideoType,
  structureVideoDefaults,
  structureVideoUrl,
  structureVideoFrameRange,
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // For background task submission with placeholder
  const { addIncomingTask, removeIncomingTask } = useIncomingTasks();
  const { data: taskStatusCounts } = useTaskStatusCounts(projectId ?? undefined);

  // Use the combined hook for form props
  const { formProps, getSettingsForTaskCreation, saveSettings, updateSettings, settings } = useSegmentSettingsForm({
    pairShotGenerationId,
    shotId,
    defaults: {
      prompt: '',
      negativePrompt: '',
      numFrames: currentFrameCount ?? initialParams?.num_frames ?? 25,
    },
    // Form display options
    segmentIndex,
    startImageUrl,
    endImageUrl,
    modelName: initialParams?.model_name || initialParams?.orchestrator_details?.model_name,
    resolution: projectResolution || initialParams?.parsed_resolution_wh,
    isRegeneration: true,
    buttonLabel: "Regenerate Video",
    showHeader: false,
    queryKeyPrefix: "lightbox-segment-presets",
    // Structure video
    structureVideoDefaults: structureVideoDefaults ?? null,
    structureVideoType,
    structureVideoUrl,
    structureVideoFrameRange,
  });

  // Extract enhanced prompt from form props
  const { enhancedPrompt } = formProps;

  // Enhance prompt toggle state
  // Default: false if enhanced prompt exists, true if not
  const defaultEnhanceEnabled = useMemo(() => !enhancedPrompt?.trim(), [enhancedPrompt]);
  const [enhancePromptEnabled, setEnhancePromptEnabled] = useState<boolean | null>(null);

  // Compute effective enhance state (user choice > default)
  const effectiveEnhanceEnabled = enhancePromptEnabled ?? defaultEnhanceEnabled;

  // Reset enhance state when pair changes
  useEffect(() => {
    setEnhancePromptEnabled(null);
  }, [pairShotGenerationId]);

  // Handle frame count change - wrap to include pairShotGenerationId
  const handleFrameCountChange = useCallback((frameCount: number) => {
    if (pairShotGenerationId && onFrameCountChange) {
      onFrameCountChange(pairShotGenerationId, frameCount);
    }
  }, [pairShotGenerationId, onFrameCountChange]);

  // Effect to load variant settings when triggered from outside (e.g., VariantSelector hover button)
  useEffect(() => {
    if (!variantParamsToLoad) return;

    console.log('[LoadVariantSettings] Loading from external trigger:', variantParamsToLoad);

    const variantSettings = extractSettingsFromParams(variantParamsToLoad, {
      numFrames: currentFrameCount ?? settings.numFrames,
      makePrimaryVariant: settings.makePrimaryVariant,
    });

    console.log('[LoadVariantSettings] Extracted settings from external params:', variantSettings);

    // Update all settings from the variant
    updateSettings({
      prompt: variantSettings.prompt,
      negativePrompt: variantSettings.negativePrompt,
      motionMode: variantSettings.motionMode,
      amountOfMotion: variantSettings.amountOfMotion,
      phaseConfig: variantSettings.phaseConfig,
      selectedPhasePresetId: variantSettings.selectedPhasePresetId,
      loras: variantSettings.loras,
      randomSeed: variantSettings.randomSeed,
      seed: variantSettings.seed,
      numFrames: variantSettings.numFrames,
    });

    // Trigger frame count change callback if provided
    if (onFrameCountChange && pairShotGenerationId && variantSettings.numFrames) {
      onFrameCountChange(pairShotGenerationId, variantSettings.numFrames);
    }

    // Notify parent that we've loaded the params (so it can clear the trigger)
    onVariantParamsLoaded?.();
  }, [variantParamsToLoad]); // Only re-run when variantParamsToLoad changes

  // Handle form submission
  const handleSubmit = useCallback(async () => {
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
        description: "Missing input images",
        variant: "destructive",
      });
      return;
    }

    // Get effective settings
    const effectiveSettings = getSettingsForTaskCreation();
    const promptToEnhance = effectiveSettings.prompt?.trim() || '';

    // If enhance is enabled, use background submission pattern
    if (effectiveEnhanceEnabled && promptToEnhance) {
      console.log('[SegmentRegenerateForm] 🚀 Starting background submission with prompt enhancement');

      // Add placeholder for immediate feedback
      const taskLabel = `Segment ${segmentIndex + 1}`;
      const currentBaseline = taskStatusCounts?.processing ?? 0;
      const incomingTaskId = addIncomingTask({
        taskType: 'individual_travel_segment',
        label: taskLabel,
        baselineCount: currentBaseline,
      });

      // Fire and forget - run in background
      (async () => {
        try {
          // Save settings first
          if (pairShotGenerationId) {
            await saveSettings();
          }

          // 1. Call edge function to enhance prompt
          console.log('[SegmentRegenerateForm] 📝 Calling ai-prompt edge function to enhance prompt...');
          const { data: enhanceResult, error: enhanceError } = await supabase.functions.invoke('ai-prompt', {
            body: {
              task: 'enhance_segment_prompt',
              prompt: promptToEnhance,
              temperature: 0.7,
              numFrames: effectiveSettings.numFrames || currentFrameCount || 25,
            },
          });

          if (enhanceError) {
            console.error('[SegmentRegenerateForm] Error enhancing prompt:', enhanceError);
          }

          const enhancedPromptResult = enhanceResult?.enhanced_prompt?.trim() || promptToEnhance;
          console.log('[SegmentRegenerateForm] ✅ Enhanced prompt:', enhancedPromptResult.substring(0, 80) + '...');

          // 2. Apply before/after text to the enhanced prompt
          const beforeText = effectiveSettings.textBeforePrompts?.trim() || '';
          const afterText = effectiveSettings.textAfterPrompts?.trim() || '';
          const finalPrompt = [beforeText, enhancedPromptResult, afterText].filter(Boolean).join(' ');
          console.log('[SegmentRegenerateForm] 📝 Final prompt with before/after:', finalPrompt.substring(0, 100) + '...');

          // 3. Store enhanced prompt in metadata
          if (pairShotGenerationId && enhancedPromptResult !== promptToEnhance) {
            const { data: current } = await supabase
              .from('shot_generations')
              .select('metadata')
              .eq('id', pairShotGenerationId)
              .single();

            const currentMetadata = (current?.metadata as Record<string, any>) || {};
            await supabase
              .from('shot_generations')
              .update({
                metadata: {
                  ...currentMetadata,
                  enhanced_prompt: enhancedPromptResult,
                },
              })
              .eq('id', pairShotGenerationId);

            queryClient.invalidateQueries({ queryKey: ['pair-metadata', pairShotGenerationId] });
          }

          // 4. Build task params with final prompt (enhanced + before/after)
          const taskParams = buildTaskParams(
            { ...effectiveSettings, prompt: finalPrompt },
            {
              projectId,
              shotId,
              generationId,
              childGenerationId,
              segmentIndex,
              startImageUrl,
              endImageUrl,
              startImageGenerationId,
              endImageGenerationId,
              pairShotGenerationId,
              projectResolution,
            }
          );

          // 5. Create task
          const result = await createIndividualTravelSegmentTask(taskParams);

          if (!result.task_id) {
            throw new Error(result.error || 'Failed to create task');
          }

          console.log('[SegmentRegenerateForm] ✅ Task created successfully:', result.task_id);
        } catch (error) {
          console.error('[SegmentRegenerateForm] Error in background submission:', error);
          toast({
            title: "Error",
            description: (error as Error).message || "Failed to create task",
            variant: "destructive",
          });
        } finally {
          await queryClient.refetchQueries({ queryKey: ['tasks', 'paginated'] });
          await queryClient.refetchQueries({ queryKey: ['task-status-counts'] });
          removeIncomingTask(incomingTaskId);
        }
      })();

      return;
    }

    // Standard submission (no enhancement)
    setIsSubmitting(true);

    try {
      // Save settings first
      if (pairShotGenerationId) {
        await saveSettings();
      }

      // Apply before/after text to the prompt
      const beforeText = effectiveSettings.textBeforePrompts?.trim() || '';
      const afterText = effectiveSettings.textAfterPrompts?.trim() || '';
      const basePrompt = effectiveSettings.prompt?.trim() || '';
      const finalPrompt = [beforeText, basePrompt, afterText].filter(Boolean).join(' ');

      // Build task params using effective settings with final prompt
      const taskParams = buildTaskParams({ ...effectiveSettings, prompt: finalPrompt }, {
        projectId,
        shotId,
        generationId,
        childGenerationId,
        segmentIndex,
        startImageUrl,
        endImageUrl,
        startImageGenerationId,
        endImageGenerationId,
        pairShotGenerationId,
        projectResolution,
      });

      // Create task
      const result = await createIndividualTravelSegmentTask(taskParams);

      if (!result.task_id) {
        throw new Error(result.error || 'Failed to create task');
      }
    } catch (error) {
      console.error('[SegmentRegenerateForm] Error creating task:', error);
      toast({
        title: "Error",
        description: (error as Error).message || "Failed to create task",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    projectId,
    getSettingsForTaskCreation,
    saveSettings,
    shotId,
    generationId,
    childGenerationId,
    segmentIndex,
    startImageUrl,
    endImageUrl,
    startImageGenerationId,
    endImageGenerationId,
    pairShotGenerationId,
    projectResolution,
    toast,
    effectiveEnhanceEnabled,
    addIncomingTask,
    removeIncomingTask,
    taskStatusCounts,
    queryClient,
  ]);

  return (
    <SegmentSettingsForm
      {...formProps}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      onFrameCountChange={handleFrameCountChange}
      enhancePromptEnabled={effectiveEnhanceEnabled}
      onEnhancePromptChange={setEnhancePromptEnabled}
      edgeExtendAmount={6}
    />
  );
};

export default SegmentRegenerateForm;
