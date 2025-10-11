import React from "react";
import { TIMELINE_HORIZONTAL_PADDING } from "./constants";
import { framesToSeconds } from "./utils/time-utils";

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
  // Calculate appropriate marker interval based on range and zoom
  // Goal: Keep markers at least ~60px apart (enough space for 4-digit numbers)
  const calculateMarkerInterval = () => {
    const effectiveWidth = containerWidth - TIMELINE_HORIZONTAL_PADDING * 2;
    const effectiveZoomedWidth = effectiveWidth * zoomLevel;
    
    // Minimum pixels between markers (adjust for comfortable spacing)
    const minPixelSpacing = 60;
    
    // How many markers can we fit?
    const maxMarkers = effectiveZoomedWidth / minPixelSpacing;
    
    // What interval do we need?
    const rawInterval = fullRange / maxMarkers;
    
    // Round to nice intervals: 10, 20, 30, 50, 100, 150, 200, 300, 500, 1000, etc.
    const niceIntervals = [10, 20, 30, 50, 100, 150, 200, 300, 500, 1000, 1500, 2000, 3000, 5000, 10000];
    
    // Find the smallest nice interval that's larger than our raw interval
    const interval = niceIntervals.find(i => i >= rawInterval) || Math.ceil(rawInterval / 100) * 100;
    
    return interval;
  };
  
  const interval = calculateMarkerInterval();
  
  // Precompute shared geometry based on TimelineItem's positioning
  const imageHalfWidth = 48;
  const paddingOffset = TIMELINE_HORIZONTAL_PADDING + imageHalfWidth;
  const itemEffectiveWidth = containerWidth - (paddingOffset * 2);
  const rulerWidth = containerWidth - (TIMELINE_HORIZONTAL_PADDING * 2);

  // Generate evenly spaced markers, including both endpoints without duplicates
  const markers: number[] = [];
  if (fullRange > 0) {
    const epsilon = 1e-6;
    // Always include start
    markers.push(fullMin);
    // Interior markers spaced by interval
    const firstStep = Math.ceil((fullMin + epsilon) / interval) * interval;
    for (let frame = firstStep; frame <= fullMax - epsilon; frame += interval) {
      // Avoid pushing endpoints again
      if (frame > fullMin + epsilon && frame < fullMax - epsilon) {
        markers.push(frame);
      }
    }
    // Always include end
    if (fullMax - fullMin > epsilon) {
      markers.push(fullMax);
    }
  }

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
        {markers.map((frame) => {
          // Project frame → pixel at item center, then into ruler space
          const itemPixelPosition = paddingOffset + ((frame - fullMin) / fullRange) * itemEffectiveWidth;
          const rulerPixelPosition = itemPixelPosition - TIMELINE_HORIZONTAL_PADDING;
          const leftPercent = (rulerPixelPosition / rulerWidth) * 100;

          return (
            <div
              key={frame}
              className="absolute flex flex-col items-center"
              style={{ left: `${leftPercent}%`, transform: 'translateX(-50%)' }}
            >
              <div className="w-px h-4 bg-border"></div>
              <span className="text-xs text-muted-foreground mt-1 whitespace-nowrap">{framesToSeconds(frame)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TimelineRuler; 