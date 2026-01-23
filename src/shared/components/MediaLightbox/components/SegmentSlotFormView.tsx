/**
 * SegmentSlotFormView Component
 *
 * Renders the form-only view for a segment slot when no video exists yet.
 * Used within MediaLightbox when in segment slot mode without a video.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/shared/components/ui/button';
import { X } from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { useSegmentSettings } from '@/shared/hooks/useSegmentSettings';
import { SegmentSettingsForm } from '@/shared/components/SegmentSettingsForm';
import { buildTaskParams } from '@/shared/components/segmentSettingsUtils';
import { createIndividualTravelSegmentTask } from '@/shared/lib/tasks/individualTravelSegment';
import type { SegmentSlotModeData } from '../types';
import { NavigationArrows } from './NavigationArrows';

export interface SegmentSlotFormViewProps {
  segmentSlotMode: SegmentSlotModeData;
  onClose: () => void;
  onNavPrev: () => void;
  onNavNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
}

export const SegmentSlotFormView: React.FC<SegmentSlotFormViewProps> = ({
  segmentSlotMode,
  onClose,
  onNavPrev,
  onNavNext,
  hasPrevious,
  hasNext,
}) => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pairShotGenerationId = segmentSlotMode.pairData.startImage?.id;

  // Use the segment settings hook for data management
  const {
    settings,
    updateSettings,
    saveSettings,
    resetSettings,
    hasOverride,
    shotDefaults
  } = useSegmentSettings({
    pairShotGenerationId,
    shotId: segmentSlotMode.shotId,
    defaults: {
      prompt: segmentSlotMode.pairPrompt ?? segmentSlotMode.defaultPrompt ?? '',
      negativePrompt: segmentSlotMode.pairNegativePrompt ?? segmentSlotMode.defaultNegativePrompt ?? '',
      numFrames: segmentSlotMode.pairData.frames ?? 25,
    },
    structureVideoDefaults: segmentSlotMode.structureVideoDefaults ?? null,
  });

  // Handle frame count change
  const handleFrameCountChange = useCallback((frameCount: number) => {
    if (pairShotGenerationId && segmentSlotMode.onFrameCountChange) {
      segmentSlotMode.onFrameCountChange(pairShotGenerationId, frameCount);
    }
  }, [pairShotGenerationId, segmentSlotMode.onFrameCountChange]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in a textarea
      if (document.activeElement?.tagName === 'TEXTAREA') return;

      if (e.key === 'Tab' && !e.shiftKey && hasNext) {
        e.preventDefault();
        onNavNext();
      } else if (e.key === 'Tab' && e.shiftKey && hasPrevious) {
        e.preventDefault();
        onNavPrev();
      } else if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault();
        onNavNext();
      } else if (e.key === 'ArrowLeft' && hasPrevious) {
        e.preventDefault();
        onNavPrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasNext, hasPrevious, onNavNext, onNavPrev]);

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    if (!segmentSlotMode.projectId) {
      toast({
        title: "Error",
        description: "No project selected",
        variant: "destructive",
      });
      return;
    }

    const startImageUrl = segmentSlotMode.pairData.startImage?.url ?? segmentSlotMode.pairData.startImage?.thumbUrl;
    const endImageUrl = segmentSlotMode.pairData.endImage?.url ?? segmentSlotMode.pairData.endImage?.thumbUrl;

    if (!startImageUrl || !endImageUrl) {
      toast({
        title: "Error",
        description: "Missing start or end image",
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

      // Notify parent for optimistic UI
      segmentSlotMode.onGenerateStarted?.(pairShotGenerationId);

      // Build task params
      const taskParams = buildTaskParams(settings, {
        projectId: segmentSlotMode.projectId,
        shotId: segmentSlotMode.shotId,
        generationId: segmentSlotMode.parentGenerationId,
        childGenerationId: segmentSlotMode.activeChildGenerationId,
        segmentIndex: segmentSlotMode.currentIndex,
        startImageUrl,
        endImageUrl,
        startImageGenerationId: segmentSlotMode.pairData.startImage?.generationId,
        endImageGenerationId: segmentSlotMode.pairData.endImage?.generationId,
        pairShotGenerationId,
        projectResolution: segmentSlotMode.projectResolution,
      });

      // Create task
      const result = await createIndividualTravelSegmentTask(taskParams);

      if (!result.task_id) {
        throw new Error(result.error || 'Failed to create task');
      }
    } catch (error) {
      console.error('[SegmentSlotFormView] Error creating task:', error);
      toast({
        title: "Error",
        description: (error as Error).message || "Failed to create task",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    segmentSlotMode,
    pairShotGenerationId,
    settings,
    saveSettings,
    toast,
  ]);

  const startImageUrl = segmentSlotMode.pairData.startImage?.url ?? segmentSlotMode.pairData.startImage?.thumbUrl;
  const endImageUrl = segmentSlotMode.pairData.endImage?.url ?? segmentSlotMode.pairData.endImage?.thumbUrl;

  return (
    <div
      className="w-full h-full flex items-center justify-center bg-black/90 p-4"
      onClick={(e) => {
        // Close if clicking directly on the background (not on children)
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Wrapper to position navigation arrows closer to the form */}
      <div className="relative max-w-2xl w-full flex items-center justify-center">
        {/* Floating Navigation Arrows - positioned relative to this wrapper */}
        <NavigationArrows
          showNavigation={true}
          readOnly={false}
          onPrevious={onNavPrev}
          onNext={onNavNext}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          variant="desktop"
        />

        <div className="bg-background rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto relative">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b px-4 py-3 flex items-center justify-center z-10">
          <div className="text-center">
            <h2 className="text-lg font-medium">
              Segment {segmentSlotMode.currentIndex + 1}
            </h2>
            <p className="text-sm text-muted-foreground">
              {segmentSlotMode.pairData.frames} frames
            </p>
          </div>
        </div>

        {/* Close button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="absolute top-2 right-2 h-8 w-8 p-0 z-20"
          title="Close (Escape)"
        >
          <X className="h-4 w-4" />
        </Button>

        {/* Segment Settings Form */}
        <div className="p-4">
          <SegmentSettingsForm
            settings={settings}
            onChange={updateSettings}
            onSubmit={handleSubmit}
            segmentIndex={segmentSlotMode.currentIndex}
            startImageUrl={startImageUrl}
            endImageUrl={endImageUrl}
            resolution={segmentSlotMode.projectResolution}
            isRegeneration={false}
            isSubmitting={isSubmitting}
            buttonLabel="Generate Segment"
            showHeader={false}
            queryKeyPrefix={`segment-slot-${segmentSlotMode.currentIndex}`}
            onFrameCountChange={handleFrameCountChange}
            onRestoreDefaults={resetSettings}
            hasOverride={hasOverride}
            shotDefaults={shotDefaults}
            structureVideoType={segmentSlotMode.structureVideoType}
            structureVideoDefaults={segmentSlotMode.structureVideoDefaults}
            structureVideoUrl={segmentSlotMode.structureVideoUrl}
            structureVideoFrameRange={segmentSlotMode.structureVideoFrameRange}
          />

          {/* Show warning if missing context */}
          {!segmentSlotMode.parentGenerationId && !segmentSlotMode.shotId && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              Cannot generate: Missing shot context. Please save your shot first.
            </p>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default SegmentSlotFormView;
