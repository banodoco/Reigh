import React from "react";
import type { DragType } from "@/tools/travel-between-images/components/Timeline/hooks/useUnifiedDrop";

interface DropSlotIndicatorProps {
  isVisible: boolean;
  targetIndex: number | null;
  columns: number;
  dragType?: DragType;
}

/**
 * Visual indicator for where an item will be dropped in a grid layout
 * Shows a highlighted slot at the target position
 */
const DropSlotIndicator: React.FC<DropSlotIndicatorProps> = ({
  isVisible,
  targetIndex,
  columns,
  dragType = 'none',
}) => {
  if (!isVisible || targetIndex === null) {
    return null;
  }

  // Calculate grid position
  const row = Math.floor(targetIndex / columns);
  const column = targetIndex % columns;

  // Visual indicator based on drag type
  const dragIcon = dragType === 'file' ? '📁' : dragType === 'generation' ? '🖼️' : '';
  const label = dragIcon ? `${dragIcon} Drop here` : 'Drop here';

  return (
    <div
      className="absolute pointer-events-none z-50 transition-all duration-200"
      style={{
        // Position based on grid calculation
        // This will be positioned by the parent grid using CSS Grid
        gridColumn: column + 1,
        gridRow: row + 1,
      }}
    >
      {/* Drop indicator box */}
      <div className="w-full h-full border-2 border-dashed border-primary bg-primary/10 rounded-lg flex items-center justify-center backdrop-blur-sm">
        <div className="bg-primary text-primary-foreground text-xs px-2 py-1 rounded whitespace-nowrap font-medium shadow-lg">
          {label}
        </div>
      </div>
    </div>
  );
};

export default DropSlotIndicator;

