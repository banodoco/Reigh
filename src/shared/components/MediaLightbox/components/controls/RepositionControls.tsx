import React from 'react';
import { cn } from '@/shared/lib/utils';
import { 
  RotateCcw, 
  MoveHorizontal, 
  MoveVertical, 
  Maximize2, 
  RotateCw,
  FlipHorizontal,
  FlipVertical
} from 'lucide-react';
import { ImageTransform } from '../../hooks/useRepositionMode';

interface RepositionControlsProps {
  transform: ImageTransform;
  onTranslateXChange: (value: number) => void;
  onTranslateYChange: (value: number) => void;
  onScaleChange: (value: number) => void;
  onRotationChange: (value: number) => void;
  onFlipH: () => void;
  onFlipV: () => void;
  onReset: () => void;
  variant: 'tablet' | 'mobile';
  imageDimensions?: { width: number; height: number } | null; // For dynamic max translate
}

/**
 * RepositionControls Component
 * 
 * Provides sliders for image repositioning:
 * - Horizontal position (translateX)
 * - Vertical position (translateY)  
 * - Scale (0.5x to 1.5x)
 * - Rotation (-180° to 180°)
 * - Flip Horizontal / Vertical
 * - Reset button to restore defaults
 */
export const RepositionControls: React.FC<RepositionControlsProps> = ({
  transform,
  onTranslateXChange,
  onTranslateYChange,
  onScaleChange,
  onRotationChange,
  onFlipH,
  onFlipV,
  onReset,
  variant,
  imageDimensions,
}) => {
  const textSize = variant === 'tablet' ? 'text-xs' : 'text-[10px]';
  const buttonPadding = variant === 'tablet' ? 'p-1.5' : 'p-1';
  const iconSize = variant === 'tablet' ? 'h-3 w-3' : 'h-2.5 w-2.5';
  const sliderIconSize = variant === 'tablet' ? 'h-3.5 w-3.5' : 'h-3 w-3';
  
  // Max translate as percentage - limited to ±40% to keep image mostly on screen
  // At 40%, image center moves 40% of its width, keeping 60%+ visible
  // Slightly scales with scale factor but capped to prevent image from going off-screen
  const maxTranslatePercent = Math.round(40 * Math.min(transform.scale, 1.25));
  
  // Check if any transform has been applied
  const hasChanges = 
    transform.translateX !== 0 || 
    transform.translateY !== 0 || 
    transform.scale !== 1 || 
    transform.rotation !== 0 ||
    transform.flipH ||
    transform.flipV;
  
  return (
    <div className="space-y-2">
      {/* Flip Buttons */}
      <div className="flex gap-1">
        <button
          onClick={onFlipH}
          className={cn(
            "flex-1 flex items-center justify-center gap-1 rounded transition-all",
            buttonPadding,
            textSize,
            transform.flipH 
              ? "bg-blue-600 text-white"
              : "bg-muted hover:bg-muted/80 text-foreground"
          )}
          title="Flip Horizontal"
        >
          <FlipHorizontal className={iconSize} />
          <span className="hidden sm:inline">H</span>
        </button>
        <button
          onClick={onFlipV}
          className={cn(
            "flex-1 flex items-center justify-center gap-1 rounded transition-all",
            buttonPadding,
            textSize,
            transform.flipV 
              ? "bg-blue-600 text-white"
              : "bg-muted hover:bg-muted/80 text-foreground"
          )}
          title="Flip Vertical"
        >
          <FlipVertical className={iconSize} />
          <span className="hidden sm:inline">V</span>
        </button>
      </div>
      
      {/* Horizontal Position */}
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5">
          <MoveHorizontal className={cn("text-muted-foreground shrink-0", sliderIconSize)} />
          <div className="flex-1 flex items-center justify-between">
            <label className={cn("font-medium text-foreground", textSize)}>X</label>
            <span className={cn("text-muted-foreground tabular-nums", textSize)}>{transform.translateX.toFixed(0)}%</span>
          </div>
        </div>
        <input
          type="range"
          min={-maxTranslatePercent}
          max={maxTranslatePercent}
          value={transform.translateX}
          onChange={(e) => onTranslateXChange(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
      </div>
      
      {/* Vertical Position */}
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5">
          <MoveVertical className={cn("text-muted-foreground shrink-0", sliderIconSize)} />
          <div className="flex-1 flex items-center justify-between">
            <label className={cn("font-medium text-foreground", textSize)}>Y</label>
            <span className={cn("text-muted-foreground tabular-nums", textSize)}>{transform.translateY.toFixed(0)}%</span>
          </div>
        </div>
        <input
          type="range"
          min={-maxTranslatePercent}
          max={maxTranslatePercent}
          value={transform.translateY}
          onChange={(e) => onTranslateYChange(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
      </div>
      
      {/* Scale */}
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5">
          <Maximize2 className={cn("text-muted-foreground shrink-0", sliderIconSize)} />
          <div className="flex-1 flex items-center justify-between">
            <label className={cn("font-medium text-foreground", textSize)}>Scale</label>
            <span className={cn("text-muted-foreground tabular-nums", textSize)}>{(transform.scale * 100).toFixed(0)}%</span>
          </div>
        </div>
        <input
          type="range"
          min={50}
          max={150}
          value={transform.scale * 100}
          onChange={(e) => onScaleChange(parseInt(e.target.value) / 100)}
          className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
      </div>
      
      {/* Rotation */}
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5">
          <RotateCw className={cn("text-muted-foreground shrink-0", sliderIconSize)} />
          <div className="flex-1 flex items-center justify-between">
            <label className={cn("font-medium text-foreground", textSize)}>Rotate</label>
            <span className={cn("text-muted-foreground tabular-nums", textSize)}>{transform.rotation}°</span>
          </div>
        </div>
        <input
          type="range"
          min={-180}
          max={180}
          value={transform.rotation}
          onChange={(e) => onRotationChange(parseInt(e.target.value))}
          className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
      </div>
      
      {/* Reset Button */}
      <button
        onClick={onReset}
        disabled={!hasChanges}
        className={cn(
          "w-full flex items-center justify-center gap-1.5 rounded transition-all",
          buttonPadding,
          textSize,
          hasChanges 
            ? "bg-muted hover:bg-muted/80 text-foreground"
            : "bg-muted/50 text-muted-foreground cursor-not-allowed"
        )}
        title="Reset to original position"
      >
        <RotateCcw className={iconSize} />
        Reset
      </button>
    </div>
  );
};
