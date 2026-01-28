/**
 * SegmentRegenerateForm Component
 *
 * A form for regenerating a video segment from within the MediaLightbox.
 * Uses the controlled SegmentSettingsForm pattern.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/shared/hooks/use-toast';
import { useSegmentSettingsForm } from '@/shared/hooks/useSegmentSettingsForm';
import { SegmentSettingsForm } from '@/shared/components/SegmentSettingsForm';
import { buildTaskParams, extractSettingsFromParams } from '@/shared/components/segmentSettingsUtils';
import { createIndividualTravelSegmentTask } from '@/shared/lib/tasks/individualTravelSegment';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
import { useTaskStatusCounts } from '@/shared/hooks/useTasks';
import { supabase } from '@/integrations/supabase/client';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';

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
  /** Callback to update structure video defaults when "Set as Shot Defaults" is clicked */
  onUpdateStructureVideoDefaults?: (updates: {
    motionStrength?: number;
    treatment?: 'adjust' | 'clip';
    uni3cEndPercent?: number;
  }) => Promise<void>;

  /** Whether the segment currently has a primary variant.
   * When false (orphaned), new generations will default to becoming the primary variant. */
  hasPrimaryVariant?: boolean;

  // Per-segment structure video management (Timeline Mode only)
  /** Whether in timeline mode (shows structure video upload) vs batch mode (preview only) */
  isTimelineMode?: boolean;
  /** Callback to add a structure video for this segment */
  onAddSegmentStructureVideo?: (video: StructureVideoConfigWithMetadata) => void;
  /** Callback to update this segment's structure video */
  onUpdateSegmentStructureVideo?: (updates: Partial<StructureVideoConfigWithMetadata>) => void;
  /** Callback to remove this segment's structure video */
  onRemoveSegmentStructureVideo?: () => void;
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
  onUpdateStructureVideoDefaults,
  // Whether segment has a primary variant (for defaulting makePrimaryVariant)
  hasPrimaryVariant = true,
  // Per-segment structure video management
  isTimelineMode,
  onAddSegmentStructureVideo,
  onUpdateSegmentStructureVideo,
  onRemoveSegmentStructureVideo,
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
      // When segment has no primary variant (orphaned), default to making new generation primary
      makePrimaryVariant: !hasPrimaryVariant,
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
    onUpdateStructureVideoDefaults,
    // Per-segment structure video management
    isTimelineMode,
    onAddSegmentStructureVideo,
    onUpdateSegmentStructureVideo,
    onRemoveSegmentStructureVideo,
  });

  // Extract enhanced prompt from form props
  const { enhancedPrompt } = formProps;

  // Enhance prompt toggle state
  // We track both the user's explicit choice AND whether they've "seen" the current state
  // This prevents the default from flipping unexpectedly after user has viewed the form
  const [enhancePromptEnabled, setEnhancePromptEnabled] = useState<boolean | null>(null);

  // Track previous pair to detect actual pair changes (not just re-renders)
  const prevPairRef = useRef<string | undefined>(undefined);
  const hasUserSeenCurrentPair = useRef(false);

  // Default: false if enhanced prompt exists, true if not
  // But ONLY use this default before user has "seen" the form for this pair
  const defaultEnhanceEnabled = useMemo(() => !enhancedPrompt?.trim(), [enhancedPrompt]);

  // Once user has seen the form, lock in the current effective state
  // This prevents the toggle from flipping if enhancedPrompt changes later
  useEffect(() => {
    if (!hasUserSeenCurrentPair.current && pairShotGenerationId) {
      hasUserSeenCurrentPair.current = true;
      // Lock in the initial state based on current default
      // This ensures what user SEES is what they GET
      if (enhancePromptEnabled === null) {
        setEnhancePromptEnabled(defaultEnhanceEnabled);
      }
    }
  }, [pairShotGenerationId, defaultEnhanceEnabled, enhancePromptEnabled]);

  // Compute effective enhance state (user's explicit choice, or locked-in default)
  const effectiveEnhanceEnabled = enhancePromptEnabled ?? defaultEnhanceEnabled;

  // Use ref to ensure submit handler always reads current state (avoids race condition)
  const effectiveEnhanceEnabledRef = useRef(effectiveEnhanceEnabled);
  effectiveEnhanceEnabledRef.current = effectiveEnhanceEnabled;

  // Reset enhance state ONLY when pair actually changes to a different value
  useEffect(() => {
    if (prevPairRef.current !== undefined && prevPairRef.current !== pairShotGenerationId) {
      // Pair actually changed - reset state for new pair
      setEnhancePromptEnabled(null);
      hasUserSeenCurrentPair.current = false;
    }
    prevPairRef.current = pairShotGenerationId;
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
    // Prioritize existing enhanced prompt if available, otherwise use base prompt
    const promptToEnhance = enhancedPrompt?.trim() || effectiveSettings.prompt?.trim() || '';

    // Read current enhance state from ref (avoids stale closure issue)
    const shouldEnhance = effectiveEnhanceEnabledRef.current;

    // Log the enhance decision (detailed for debugging)
    console.log('[EnhancedPromptSave] 🔍 Submit handler called:', {
      shouldEnhance, // actual value used (from ref, always current)
      effectiveEnhanceEnabled, // closure value (may be stale if race condition)
      enhancePromptEnabled, // user's explicit choice (null = not set, false = explicitly off, true = explicitly on)
      defaultEnhanceEnabled, // default based on whether enhanced prompt exists
      hasPromptToEnhance: !!promptToEnhance,
      promptToEnhancePreview: promptToEnhance?.substring(0, 50) || '(empty)',
      pairShotGenerationId: pairShotGenerationId?.substring(0, 8) || '(none)',
      existingEnhancedPrompt: enhancedPrompt?.substring(0, 50) || '(none)',
    });

    // If enhance is enabled, use background submission pattern
    if (shouldEnhance && promptToEnhance) {
      console.log('[EnhancedPromptSave] 🚀 Starting background submission with prompt enhancement');

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

          // 2. Apply before/after text to both original and enhanced prompts
          const beforeText = effectiveSettings.textBeforePrompts?.trim() || '';
          const afterText = effectiveSettings.textAfterPrompts?.trim() || '';
          // Original prompt with before/after (what user would have gotten without enhancement)
          const originalPromptWithPrefixes = [beforeText, effectiveSettings.prompt?.trim() || '', afterText].filter(Boolean).join(' ');
          // Enhanced prompt with before/after (the AI-enhanced version)
          const enhancedPromptWithPrefixes = [beforeText, enhancedPromptResult, afterText].filter(Boolean).join(' ');
          console.log('[SegmentRegenerateForm] 📝 Original prompt with before/after:', originalPromptWithPrefixes.substring(0, 100) + '...');
          console.log('[SegmentRegenerateForm] 📝 Enhanced prompt with before/after:', enhancedPromptWithPrefixes.substring(0, 100) + '...');

          // 3. Store enhanced prompt in metadata
          if (pairShotGenerationId && enhancedPromptResult !== promptToEnhance) {
            console.log('[EnhancedPromptSave] 📥 Fetching current metadata for pairShotGenerationId:', pairShotGenerationId.substring(0, 8));
            const { data: current, error: fetchError } = await supabase
              .from('shot_generations')
              .select('metadata')
              .eq('id', pairShotGenerationId)
              .single();

            if (fetchError) {
              console.error('[EnhancedPromptSave] ❌ Error fetching current metadata:', fetchError);
            }

            const currentMetadata = (current?.metadata as Record<string, any>) || {};
            console.log('[EnhancedPromptSave] 📝 Saving enhanced_prompt to metadata:', {
              pairShotGenerationId: pairShotGenerationId.substring(0, 8),
              enhancedPromptPreview: enhancedPromptResult.substring(0, 50) + '...',
              basePromptPreview: (effectiveSettings.prompt?.trim() || '').substring(0, 50) + '...',
            });

            const { error: updateError } = await supabase
              .from('shot_generations')
              .update({
                metadata: {
                  ...currentMetadata,
                  enhanced_prompt: enhancedPromptResult,
                  // Store the base prompt so we can reveal it when clearing enhanced
                  base_prompt_for_enhancement: effectiveSettings.prompt?.trim() || '',
                },
              })
              .eq('id', pairShotGenerationId);

            if (updateError) {
              console.error('[EnhancedPromptSave] ❌ Error saving enhanced_prompt to metadata:', updateError);
            } else {
              console.log('[EnhancedPromptSave] ✅ Enhanced prompt saved to metadata successfully');
            }

            queryClient.invalidateQueries({ queryKey: ['pair-metadata', pairShotGenerationId] });
          } else {
            console.log('[EnhancedPromptSave] ⏭️ Skipping save:', {
              hasPairShotGenerationId: !!pairShotGenerationId,
              enhancedPromptMatchesInput: enhancedPromptResult === promptToEnhance,
            });
          }

          // 4. Build task params with original prompt as base_prompt, enhanced as separate field
          // The worker should prefer enhanced_prompt over base_prompt when present
          const taskParams = buildTaskParams(
            { ...effectiveSettings, prompt: originalPromptWithPrefixes },
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
              enhancedPrompt: enhancedPromptWithPrefixes,
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
    // Note: effectiveEnhanceEnabled kept in deps for logging, but actual behavior uses ref
    effectiveEnhanceEnabled,
    enhancePromptEnabled,
    defaultEnhanceEnabled,
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
