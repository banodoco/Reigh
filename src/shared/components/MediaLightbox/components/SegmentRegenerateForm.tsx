/**
 * SegmentRegenerateForm Component
 *
 * A form for regenerating a video segment from within the MediaLightbox.
 * Uses the shared SegmentRegenerateControls component.
 */

import React from 'react';
import { SegmentRegenerateControls } from '@/shared/components/SegmentRegenerateControls';

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
}) => {
  // Debug log to verify shotId and structure guidance are being passed (UNIFIED FORMAT)
  // In the unified format, videos are INSIDE structure_guidance.videos, not a separate array
  const orchGuidance = initialParams?.orchestrator_details?.structure_guidance;
  const topLevelGuidance = initialParams?.structure_guidance;
  console.log('[StructureVideoFix] 📋 [SegmentRegenerateForm] Props received:', {
    projectId: projectId?.substring(0, 8),
    generationId: generationId?.substring(0, 8),
    shotId: shotId?.substring(0, 8) ?? 'null',
    segmentIndex,
    // NEW UNIFIED FORMAT: Check structure_guidance with videos inside
    hasOrchStructureGuidance: !!orchGuidance,
    orchStructureGuidanceTarget: orchGuidance?.target ?? '(none)',
    orchStructureGuidanceVideosCount: orchGuidance?.videos?.length ?? 0,
    // Top-level check (for individual segment tasks)
    hasTopLevelStructureGuidance: !!topLevelGuidance,
    topLevelStructureGuidanceTarget: topLevelGuidance?.target ?? '(none)',
    topLevelStructureGuidanceVideosCount: topLevelGuidance?.videos?.length ?? 0,
  });

  return (
    <div className="p-4">
      <SegmentRegenerateControls
        initialParams={initialParams}
        projectId={projectId}
        generationId={generationId}
        shotId={shotId}
        childGenerationId={childGenerationId}
        isRegeneration={true}
        segmentIndex={segmentIndex}
        startImageUrl={startImageUrl}
        endImageUrl={endImageUrl}
        startImageGenerationId={startImageGenerationId}
        endImageGenerationId={endImageGenerationId}
        pairShotGenerationId={pairShotGenerationId}
        projectResolution={projectResolution}
        queryKeyPrefix="lightbox-segment-presets"
        buttonLabel="Regenerate Video"
        showHeader={false}
      />
    </div>
  );
};

export default SegmentRegenerateForm;
