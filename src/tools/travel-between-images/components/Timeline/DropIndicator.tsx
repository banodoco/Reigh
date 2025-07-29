import React from "react";

interface DropIndicatorProps {
  isVisible: boolean;
  dropTargetFrame: number | null;
  fullMin: number;
  fullRange: number;
}

const DropIndicator: React.FC<DropIndicatorProps> = ({
  isVisible,
  dropTargetFrame,
  fullMin,
  fullRange,
}) => {
  if (!isVisible || dropTargetFrame === null) {
    return null;
  }

  return (
    <div
      className="absolute top-0 bottom-0 w-1 bg-primary z-40 pointer-events-none"
      style={{
        left: `${((dropTargetFrame - fullMin) / fullRange) * 100}%`,
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