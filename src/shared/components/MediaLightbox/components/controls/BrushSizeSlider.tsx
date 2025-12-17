import React from 'react';
import { cn } from '@/shared/lib/utils';

interface BrushSizeSliderProps {
  value: number;
  onChange: (size: number) => void;
  variant: 'tablet' | 'mobile';
}

export const BrushSizeSlider: React.FC<BrushSizeSliderProps> = ({
  value,
  onChange,
  variant,
}) => {
  const textSize = variant === 'tablet' ? 'text-xs' : 'text-[10px]';
  
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <label className={cn("font-medium text-foreground", textSize)}>Size:</label>
        <span className={cn("text-muted-foreground", textSize)}>{value}px</span>
      </div>
      <input
        type="range"
        min={5}
        max={100}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-500"
      />
    </div>
  );
};

