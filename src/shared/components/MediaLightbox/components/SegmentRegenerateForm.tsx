/**
 * SegmentRegenerateForm Component
 *
 * A form for regenerating a video segment from within the MediaLightbox.
 * Uses the controlled SegmentSettingsForm pattern.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/shared/hooks/use-toast';
import { useSegmentSettings } from '@/shared/hooks/useSegmentSettings';
import { SegmentSettingsForm } from '@/shared/components/SegmentSettingsForm';
import { buildTaskParams, extractSettingsFromParams } from '@/shared/components/segmentSettingsUtils';
import { createIndividualTravelSegmentTask } from '@/shared/lib/tasks/individualTravelSegment';

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
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Use the segment settings hook for data management
  // Settings are merged from: pair metadata > shot batch settings > defaults
  // numFrames: prefer currentFrameCount (from timeline positions - source of truth),
  // fall back to initialParams (from video) if not provided
  const { settings, updateSettings, saveSettings, resetSettings, saveAsShotDefaults, hasOverride, shotDefaults } = useSegmentSettings({
    pairShotGenerationId,
    shotId,
    defaults: {
      prompt: '',
      negativePrompt: '',
      numFrames: currentFrameCount ?? initialParams?.num_frames ?? 25,
    },
    structureVideoDefaults: structureVideoDefaults ?? null,
  });

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

    setIsSubmitting(true);

    try {
      // Save settings first
      if (pairShotGenerationId) {
        await saveSettings();
      }

      // Build task params
      const taskParams = buildTaskParams(settings, {
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

      if (result.task_id) {
        // Success - task was created
      } else {
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
    settings,
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
  ]);

  return (
    <div className="p-4">
      <SegmentSettingsForm
        settings={settings}
        onChange={updateSettings}
        onSubmit={handleSubmit}
        segmentIndex={segmentIndex}
        startImageUrl={startImageUrl}
        endImageUrl={endImageUrl}
        modelName={initialParams?.model_name || initialParams?.orchestrator_details?.model_name}
        resolution={projectResolution || initialParams?.parsed_resolution_wh}
        isRegeneration={true}
        isSubmitting={isSubmitting}
        buttonLabel="Regenerate Video"
        showHeader={false}
        queryKeyPrefix="lightbox-segment-presets"
        onFrameCountChange={handleFrameCountChange}
        onRestoreDefaults={resetSettings}
        onSaveAsShotDefaults={saveAsShotDefaults}
        hasOverride={hasOverride}
        shotDefaults={shotDefaults}
        structureVideoType={structureVideoType}
        structureVideoDefaults={structureVideoDefaults}
        structureVideoUrl={structureVideoUrl}
        structureVideoFrameRange={structureVideoFrameRange}
      />
    </div>
  );
};

export default SegmentRegenerateForm;
