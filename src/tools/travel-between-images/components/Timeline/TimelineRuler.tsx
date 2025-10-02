import React from "react";
import { TIMELINE_HORIZONTAL_PADDING } from "./constants";

interface TimelineRulerProps {
  fullMin: number;
  fullMax: number;
  fullRange: number;
  zoomLevel: number;
  containerWidth: number;
}

const TimelineRuler: React.FC<TimelineRulerProps> = ({
  fullMin,
  fullMax,
  fullRange,
  zoomLevel,
  containerWidth,
}) => {
  return (
    <div
      className="absolute h-8 border-t"
      style={{
        bottom: "4.5rem",
        left: `${TIMELINE_HORIZONTAL_PADDING}px`,
        width: zoomLevel > 1 ? `calc(${zoomLevel * 100}% - ${TIMELINE_HORIZONTAL_PADDING * 2}px)` : `calc(100% - ${TIMELINE_HORIZONTAL_PADDING * 2}px)`,
        minWidth: `calc(100% - ${TIMELINE_HORIZONTAL_PADDING * 2}px)`,
      }}
    >
      <div className="relative h-full">
        {Array.from({ length: Math.floor(fullMax / 30) + 1 }, (_, i) => {
          const frame = i * 30;
          const effectiveWidth = containerWidth - TIMELINE_HORIZONTAL_PADDING * 2;
          const pixelPosition = ((frame - fullMin) / fullRange) * effectiveWidth;
          const leftPercent = (pixelPosition / effectiveWidth) * 100;
          return (
            <div
              key={frame}
              className="absolute flex flex-col items-center"
              style={{ left: `${leftPercent}%` }}
            >
              <div className="w-px h-4 bg-border"></div>
              <span className="text-xs text-muted-foreground mt-1">{frame}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TimelineRuler; 