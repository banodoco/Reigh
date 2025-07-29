import React from "react";

interface DropIndicatorProps {
  frame: number;
  fullMin: number;
  fullRange: number;
  timelineWidth: number;
  color?: 'blue' | 'green';
}

const DropIndicator: React.FC<DropIndicatorProps> = ({ 
  frame, 
  fullMin, 
  fullRange, 
  timelineWidth,
  color = 'blue'
}) => {
  const position = ((frame - fullMin) / fullRange) * timelineWidth;
  const leftPercent = (position / timelineWidth) * 100;
  
  const colorClasses = color === 'green' 
    ? 'border-green-500 bg-green-500' 
    : 'border-sky-500 bg-sky-500';

  return (
    <div
      className={`absolute top-0 bottom-0 w-0.5 ${colorClasses} border-dashed border-2 z-30 pointer-events-none`}
      style={{ left: `${leftPercent}%` }}
    >
      <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 ${colorClasses} rounded-full`} />
      <div className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 ${colorClasses} rounded-full`} />
    </div>
  );
};

export default DropIndicator; 