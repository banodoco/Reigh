import React from "react";

interface TimelineRulerProps {
  fullMin: number;
  fullMax: number;
  fullRange: number;
  zoomLevel: number;
}

const TimelineRuler: React.FC<TimelineRulerProps> = ({
  fullMin,
  fullMax,
  fullRange,
  zoomLevel,
}) => {
  return (
    <div
      className="absolute left-0 h-8 border-t"
      style={{
        bottom: "2rem",
        width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%',
        minWidth: '100%',
      }}
    >
      <div className="relative h-full">
        {Array.from({ length: Math.floor(fullMax / 30) + 1 }, (_, i) => {
          const frame = i * 30;
          const position = ((frame - fullMin) / fullRange) * 100;
          return (
            <div key={frame} className="absolute flex flex-col items-center" style={{ left: `${position}%` }}>
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