import React from "react";
import { TIMELINE_HORIZONTAL_PADDING } from "./constants";

interface DropIndicatorProps {
  isVisible: boolean;
  dropTargetFrame: number | null;
  fullMin: number;
  fullRange: number;
  containerWidth: number;
}

const DropIndicator: React.FC<DropIndicatorProps> = ({
  isVisible,
  dropTargetFrame,
  fullMin,
  fullRange,
  containerWidth,
}) => {
  if (!isVisible || dropTargetFrame === null) {
    return null;
  }

  // Use same positioning calculation as TimelineItem
  const effectiveWidth = containerWidth - (TIMELINE_HORIZONTAL_PADDING * 2);
  const pixelPosition = TIMELINE_HORIZONTAL_PADDING + ((dropTargetFrame - fullMin) / fullRange) * effectiveWidth;
  const leftPercent = (pixelPosition / containerWidth) * 100;

  return (
    <div
      className="absolute top-0 bottom-0 w-1 bg-primary z-40 pointer-events-none"
      style={{
        left: `${leftPercent}%`,
        transform: 'translateX(-50%)',
      }}
    >
      <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded whitespace-nowrap">
        Frame {dropTargetFrame}
      </div>
    </div>
  );
};

export default DropIndicator; 