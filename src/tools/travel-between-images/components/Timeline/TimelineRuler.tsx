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
  const startFrame = Math.floor(fullMin / interval) * interval;
  const numMarkers = Math.floor((fullMax - startFrame) / interval) + 1;
  
  return (
    <div
      className="absolute h-8 border-t"
      style={{
        bottom: "4.5rem",
        left: `${TIMELINE_HORIZONTAL_PADDING}px`,
        width: zoomLevel > 1 ? `calc(${zoomLevel * 100}% - ${TIMELINE_HORIZONTAL_PADDING * 1.5}px)` : `calc(100% - ${TIMELINE_HORIZONTAL_PADDING * 1.5}px)`,
        minWidth: `calc(100% - ${TIMELINE_HORIZONTAL_PADDING * 2}px)`,
      }}
    >
      <div className="relative h-full">
        {Array.from({ length: numMarkers }, (_, i) => {
          const frame = startFrame + (i * interval);
          if (frame < fullMin || frame > fullMax) return null;
          
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