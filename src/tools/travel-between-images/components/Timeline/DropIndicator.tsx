import React from "react";
import { ImagePlus, FileUp } from "lucide-react";
import { TIMELINE_PADDING_OFFSET } from "./constants";
import type { DragType } from "@/shared/lib/dragDrop";

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
  const DragIcon = dragType === 'file' ? FileUp : dragType === 'generation' ? ImagePlus : null;

  return (
    <div
      className="absolute top-0 bottom-0 w-0.5 bg-primary z-40 pointer-events-none"
      style={{
        left: `${leftPercent}%`,
        transform: 'translateX(-50%)',
      }}
    >
      {/* Label with icon badge - centered on the line */}
      <div 
        className="absolute flex items-center gap-1.5 bg-background border-2 border-primary text-foreground text-xs px-2 py-1 rounded-md shadow-[-2px_2px_0_0_rgba(0,0,0,0.1)] whitespace-nowrap"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
      >
        {DragIcon && (
          <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
            <DragIcon className="h-3 w-3 text-primary-foreground" />
          </div>
        )}
        <span className="font-medium">Frame {dropTargetFrame}</span>
      </div>
    </div>
  );
};

export default DropIndicator; 