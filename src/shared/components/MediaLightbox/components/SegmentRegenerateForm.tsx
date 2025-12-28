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
  /** Project resolution for output */
  projectResolution?: string;
}

export const SegmentRegenerateForm: React.FC<SegmentRegenerateFormProps> = ({
  params: initialParams,
  projectId,
  generationId,
  childGenerationId,
  segmentIndex = 0,
  startImageUrl,
  endImageUrl,
  startImageGenerationId,
  endImageGenerationId,
  projectResolution,
}) => {
  return (
    <div className="p-4">
      <SegmentRegenerateControls
        initialParams={initialParams}
        projectId={projectId}
        generationId={generationId}
        childGenerationId={childGenerationId}
        segmentIndex={segmentIndex}
        startImageUrl={startImageUrl}
        endImageUrl={endImageUrl}
        startImageGenerationId={startImageGenerationId}
        endImageGenerationId={endImageGenerationId}
        projectResolution={projectResolution}
        queryKeyPrefix="lightbox-segment-presets"
        buttonLabel="Regenerate Video"
        showHeader={true}
      />
    </div>
  );
};

export default SegmentRegenerateForm;
