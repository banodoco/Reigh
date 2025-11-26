import React from 'react';
import { Video } from 'lucide-react';
import { TIMELINE_HORIZONTAL_PADDING } from './constants';

interface GuidanceVideoUploaderProps {
  shotId: string;
  projectId: string;
  onVideoUploaded: (videoUrl: string | null, metadata: import('@/shared/lib/videoUploader').VideoMetadata | null) => void;
  currentVideoUrl: string | null;
  compact?: boolean;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomToStart: () => void;
  hasNoImages?: boolean;
}

export const GuidanceVideoUploader: React.FC<GuidanceVideoUploaderProps> = ({
  zoomLevel,
}) => {
  // Note: Upload handling is now done in TimelineContainer's top controls

  return (
    <>
      {/* Placeholder strip - this zooms with content */}
      {/* Note: Controls are now rendered in TimelineContainer for proper positioning */}
      <div 
        className="relative h-20 mb-0"
        style={{
          width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%',
          minWidth: '100%',
          paddingLeft: `${TIMELINE_HORIZONTAL_PADDING}px`,
          paddingRight: `${TIMELINE_HORIZONTAL_PADDING}px`,
          overflow: 'visible',
        }}
      >
        {/* Center message - fixed position, doesn't zoom */}
        <div 
          className="flex flex-col items-center justify-center gap-2 pointer-events-none"
          style={{
            position: 'sticky',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'fit-content',
          }}
        >
          <Video className="h-8 w-8 text-muted-foreground/30" />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Add guidance video to control motion
          </span>
        </div>
      </div>
    </>
  );
};
