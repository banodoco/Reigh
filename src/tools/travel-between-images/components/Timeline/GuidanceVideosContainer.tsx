import React from 'react';
import { GuidanceVideoStrip } from './GuidanceVideoStrip';
import { TIMELINE_HORIZONTAL_PADDING, TIMELINE_PADDING_OFFSET } from './constants';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';

export interface GuidanceVideosContainerProps {
  /** Array of structure video configurations */
  structureVideos: StructureVideoConfigWithMetadata[];
  /** Update a structure video at index */
  onUpdateVideo: (index: number, updates: Partial<StructureVideoConfigWithMetadata>) => void;
  /** Remove a structure video at index */
  onRemoveVideo: (index: number) => void;
  
  // Timeline coordinate system (for positioning strips)
  fullMin: number;
  fullMax: number;
  fullRange: number;
  containerWidth: number;
  zoomLevel: number;
  
  // Timeline info
  timelineFrameCount: number;
  
  // Controls
  readOnly?: boolean;
}

/**
 * Container component that manages multiple structure video strips.
 * All videos render on the same row, positioned at their output frame ranges.
 * Upload functionality is handled in TimelineContainer's header.
 */
export const GuidanceVideosContainer: React.FC<GuidanceVideosContainerProps> = ({
  structureVideos,
  onUpdateVideo,
  onRemoveVideo,
  fullMin,
  fullMax,
  fullRange,
  containerWidth,
  zoomLevel,
  timelineFrameCount,
  readOnly = false,
}) => {
  // Don't render anything if no videos
  if (structureVideos.length === 0) {
    return null;
  }

  return (
    <div 
      className="relative h-20 -mt-1 mb-3"
      style={{
        // Standard width matching other timeline rows
        width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%',
        minWidth: '100%',
        // Clip videos that extend beyond the timeline boundaries
        overflow: 'hidden',
      }}
    >
      {/* Visual background - positioned to align with video frame strips */}
      {/* Videos use left: (TIMELINE_PADDING_OFFSET / containerWidth) * 100% which equals ~6.8% at typical widths */}
      {/* So background uses same percentage positioning to stay aligned */}
      <div 
        className="absolute top-5 bottom-1 bg-muted/30 dark:bg-muted/20 rounded-sm border border-dashed border-muted-foreground/30 pointer-events-none"
        style={{
          // Use same percentage calculation as video strips for alignment
          left: `${(TIMELINE_PADDING_OFFSET / containerWidth) * 100}%`,
          right: `${(TIMELINE_PADDING_OFFSET / containerWidth) * 100}%`,
        }}
      />
      {/* All video strips on the same row */}
      {structureVideos.map((video, index) => {
        // Get sibling video ranges for collision detection
        const siblingRanges = structureVideos
          .filter((_, i) => i !== index)
          .map(v => ({ start: v.start_frame, end: v.end_frame }));
        
        return (
          <GuidanceVideoStrip
            key={`${video.path}-${video.start_frame}-${index}`}
            videoUrl={video.path}
            videoMetadata={video.metadata ?? null}
            treatment={video.treatment ?? 'adjust'}
            motionStrength={video.motion_strength ?? 1.0}
            onTreatmentChange={(treatment) => {
              onUpdateVideo(index, { treatment });
            }}
            onMotionStrengthChange={(strength) => {
              onUpdateVideo(index, { motion_strength: strength });
            }}
            onRemove={() => {
              onRemoveVideo(index);
            }}
            onMetadataExtracted={(metadata) => {
              onUpdateVideo(index, { metadata });
            }}
            fullMin={fullMin}
            fullMax={fullMax}
            fullRange={fullRange}
            containerWidth={containerWidth}
            zoomLevel={zoomLevel}
            timelineFrameCount={timelineFrameCount}
            frameSpacing={50}
            readOnly={readOnly}
            // Pass output range for positioning
            outputStartFrame={video.start_frame}
            outputEndFrame={video.end_frame}
            // Pass source range for frame extraction
            sourceStartFrame={video.source_start_frame}
            sourceEndFrame={video.source_end_frame}
            // Callback to update frame ranges
            onRangeChange={(start_frame, end_frame) => {
              onUpdateVideo(index, { start_frame, end_frame });
            }}
            onSourceRangeChange={(source_start_frame, source_end_frame) => {
              onUpdateVideo(index, { source_start_frame, source_end_frame });
            }}
            // Use absolute positioning within parent
            useAbsolutePosition
            // Pass sibling ranges for collision detection
            siblingRanges={siblingRanges}
          />
        );
      })}
    </div>
  );
};

export default GuidanceVideosContainer;
