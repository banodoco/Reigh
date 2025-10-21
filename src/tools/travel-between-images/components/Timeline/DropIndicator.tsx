import React from "react";
import { TIMELINE_PADDING_OFFSET } from "./constants";
import type { DragType } from "./hooks/useUnifiedDrop";

interface DropIndicatorProps {
  isVisible: boolean;
  dropTargetFrame: number | null;
  fullMin: number;
  fullRange: number;
  containerWidth: number;
  dragType?: DragType;
}

const DropIndicator: React.FC<DropIndicatorProps> = ({
  isVisible,
  dropTargetFrame,
  fullMin,
  fullRange,
  containerWidth,
  dragType = 'none',
}) => {
  if (!isVisible || dropTargetFrame === null) {
    return null;
  }

  // Use same positioning calculation as TimelineItem (with image centering)
  const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
  const pixelPosition = TIMELINE_PADDING_OFFSET + ((dropTargetFrame - fullMin) / fullRange) * effectiveWidth;
  const leftPercent = (pixelPosition / containerWidth) * 100;

  // Visual indicator based on drag type
  const dragIcon = dragType === 'file' ? '📁' : dragType === 'generation' ? '🖼️' : '';

  return (
    <div
      className="absolute top-0 bottom-0 w-1 bg-primary z-40 pointer-events-none"
      style={{
        left: `${leftPercent}%`,
        transform: 'translateX(-50%)',
      }}
    >
      <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded whitespace-nowrap">
        {dragIcon && <span className="mr-1">{dragIcon}</span>}
        Frame {dropTargetFrame}
      </div>
    </div>
  );
};

export default DropIndicator; 