import React from 'react';
import { parseRatio } from '@/shared/lib/aspectRatios';

interface AspectRatioVisualizerProps {
  aspectRatio: string;
  className?: string;
}

export const AspectRatioVisualizer: React.FC<AspectRatioVisualizerProps> = ({ 
  aspectRatio, 
  className = '' 
}) => {
  // Parse the aspect ratio to get numerical value
  const ratio = parseRatio(aspectRatio);
  
  // If ratio is invalid, show a square as fallback
  if (isNaN(ratio)) {
    return (
      <div className={`w-16 h-16 border-2 border-border rounded bg-muted ${className}`} />
    );
  }

  // Calculate dimensions for a fixed container size
  const containerSize = 64; // 64px base size
  let width: number;
  let height: number;

  if (ratio >= 1) {
    // Landscape or square - width is full, height is scaled
    width = containerSize;
    height = containerSize / ratio;
  } else {
    // Portrait - height is full, width is scaled
    height = containerSize;
    width = containerSize * ratio;
  }

  return (
    <div className={`flex items-center justify-center w-16 h-16 ${className}`}>
      <div 
        className="border-2 border-border bg-muted rounded shadow-sm"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          minWidth: '12px', // Ensure minimum visibility
          minHeight: '12px'
        }}
      />
    </div>
  );
};
