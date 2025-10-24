import React from 'react';
import { cn } from '@/shared/lib/utils';
import { BrushStroke } from '../types';
import {
  BrushSizeSlider,
  PaintEraseToggle,
  AnnotationModeToggle,
  UndoClearButtons,
  PositionToggleButton,
} from './controls';

export interface FloatingToolControlsProps {
  variant: 'tablet' | 'mobile';
  editMode: 'text' | 'inpaint' | 'annotate';
  
  // Inpaint props
  brushSize: number;
  isEraseMode: boolean;
  onSetBrushSize: (size: number) => void;
  onSetIsEraseMode: (isErasing: boolean) => void;
  
  // Annotate props
  annotationMode: 'circle' | 'arrow' | null;
  onSetAnnotationMode: (mode: 'circle' | 'arrow' | null) => void;
  
  // Common props
  brushStrokes: BrushStroke[];
  onUndo: () => void;
  onClearMask: () => void;
  
  // Position control
  panelPosition: 'top' | 'bottom';
  onSetPanelPosition: (position: 'top' | 'bottom') => void;
}

/**
 * Floating Tool Controls Component
 * 
 * Displays mode-specific canvas controls for inpaint and annotate modes.
 * Used on both tablet (landscape, with sidebar) and mobile (portrait, no sidebar).
 * 
 * Does NOT include mode selection (Text/Inpaint/Annotate) - that lives in the sidebar.
 */
export const FloatingToolControls: React.FC<FloatingToolControlsProps> = ({
  variant,
  editMode,
  brushSize,
  isEraseMode,
  onSetBrushSize,
  onSetIsEraseMode,
  annotationMode,
  onSetAnnotationMode,
  brushStrokes,
  onUndo,
  onClearMask,
  panelPosition,
  onSetPanelPosition,
}) => {
  const isTablet = variant === 'tablet';
  const isMobile = variant === 'mobile';
  
  // Variant-specific styling
  const containerWidth = isTablet ? 'w-40' : 'w-32';
  const leftPosition = isTablet ? 'left-4' : 'left-2';
  const topBottomPosition = isTablet 
    ? (panelPosition === 'top' ? 'top-4' : 'bottom-4')
    : (panelPosition === 'top' ? 'top-2' : 'bottom-2');
  
  return (
    <div className={cn("absolute z-[70]", leftPosition, topBottomPosition)}>
      {/* Position Toggle Button - at top when panel is at bottom */}
      {panelPosition === 'bottom' && (
        <PositionToggleButton 
          direction="up" 
          onClick={() => onSetPanelPosition('top')} 
        />
      )}
      
      <div className={cn(
        "bg-background backdrop-blur-md rounded-lg p-2 space-y-1.5 border border-border shadow-xl",
        containerWidth
      )}>
        {/* Inpaint Mode Controls */}
        {editMode === 'inpaint' && (
          <>
            <BrushSizeSlider 
              value={brushSize} 
              onChange={onSetBrushSize} 
              variant={variant} 
            />
            <PaintEraseToggle 
              isEraseMode={isEraseMode} 
              onToggle={onSetIsEraseMode} 
              variant={variant} 
            />
          </>
        )}
        
        {/* Annotate Mode Controls */}
        {editMode === 'annotate' && (
          <AnnotationModeToggle 
            mode={annotationMode} 
            onChange={onSetAnnotationMode} 
            variant={variant} 
          />
        )}
        
        {/* Common Controls - Undo & Clear */}
        <UndoClearButtons 
          onUndo={onUndo} 
          onClear={onClearMask} 
          disabled={brushStrokes.length === 0}
          variant={variant}
        />
      </div>
      
      {/* Position Toggle Button - at bottom when panel is at top */}
      {panelPosition === 'top' && (
        <PositionToggleButton 
          direction="down" 
          onClick={() => onSetPanelPosition('bottom')} 
        />
      )}
    </div>
  );
};

