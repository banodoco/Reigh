/**
 * SegmentRegenerateForm Component
 *
 * A form for regenerating a video segment from within the MediaLightbox.
 * Uses the controlled SegmentSettingsForm pattern.
 */

import React, { useState, useCallback } from 'react';
import { useToast } from '@/shared/hooks/use-toast';
import { useSegmentSettings } from '@/shared/hooks/useSegmentSettings';
import { SegmentSettingsForm } from '@/shared/components/SegmentSettingsForm';
import { buildTaskParams } from '@/shared/components/segmentSettingsUtils';
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
}) => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Use the segment settings hook for data management
  // Settings are merged from: pair metadata > shot batch settings > defaults
  // numFrames: prefer currentFrameCount (from timeline positions - source of truth),
  // fall back to initialParams (from video) if not provided
  const { settings, updateSettings, saveSettings } = useSegmentSettings({
    pairShotGenerationId,
    shotId,
    defaults: {
      prompt: '',
      negativePrompt: '',
      numFrames: currentFrameCount ?? initialParams?.num_frames ?? 25,
    },
  });

  // Handle frame count change - wrap to include pairShotGenerationId
  const handleFrameCountChange = useCallback((frameCount: number) => {
    if (pairShotGenerationId && onFrameCountChange) {
      onFrameCountChange(pairShotGenerationId, frameCount);
    }
  }, [pairShotGenerationId, onFrameCountChange]);

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

      if (result.success) {
        toast({
          title: "Task Created",
          description: "Video regeneration started",
        });
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
      />
    </div>
  );
};

export default SegmentRegenerateForm;
