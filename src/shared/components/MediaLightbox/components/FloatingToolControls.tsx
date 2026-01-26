import React from 'react';
import { cn } from '@/shared/lib/utils';
import { BrushStroke } from '../types';
import { Type, Paintbrush, Pencil, Move, Wand2 } from 'lucide-react';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import {
  BrushSizeSlider,
  PaintEraseToggle,
  AnnotationModeToggle,
  UndoClearButtons,
  PositionToggleButton,
  RepositionControls,
} from './controls';
import type { ImageTransform } from '../hooks/useRepositionMode';

export interface FloatingToolControlsProps {
  variant: 'tablet' | 'mobile';
  editMode: 'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img';
  onSetEditMode: (mode: 'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img') => void;
  
  // Inpaint props
  brushSize: number;
  isEraseMode: boolean;
  onSetBrushSize: (size: number) => void;
  onSetIsEraseMode: (isErasing: boolean) => void;
  
  // Annotate props
  annotationMode: 'rectangle' | null;
  onSetAnnotationMode: (mode: 'rectangle' | null) => void;
  
  // Reposition props
  repositionTransform?: ImageTransform;
  onRepositionTranslateXChange?: (value: number) => void;
  onRepositionTranslateYChange?: (value: number) => void;
  onRepositionScaleChange?: (value: number) => void;
  onRepositionRotationChange?: (value: number) => void;
  onRepositionFlipH?: () => void;
  onRepositionFlipV?: () => void;
  onRepositionReset?: () => void;
  imageDimensions?: { width: number; height: number } | null;
  
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
 * Displays mode selection toggle and mode-specific canvas controls.
 * Includes mode toggle (Text/Inpaint/Annotate/Reposition/Img2Img) at the top.
 * Used on both tablet (landscape, with sidebar) and mobile (portrait, no sidebar).
 */
export const FloatingToolControls: React.FC<FloatingToolControlsProps> = ({
  variant,
  editMode,
  onSetEditMode,
  brushSize,
  isEraseMode,
  onSetBrushSize,
  onSetIsEraseMode,
  annotationMode,
  onSetAnnotationMode,
  repositionTransform,
  onRepositionTranslateXChange,
  onRepositionTranslateYChange,
  onRepositionScaleChange,
  onRepositionRotationChange,
  onRepositionFlipH,
  onRepositionFlipV,
  onRepositionReset,
  imageDimensions,
  brushStrokes,
  onUndo,
  onClearMask,
  panelPosition,
  onSetPanelPosition,
}) => {
  const isTablet = variant === 'tablet';
  const isMobile = useIsMobile();
  
  // Variant-specific styling - widened for 5 mode buttons
  const containerWidth = isTablet ? 'w-48' : 'w-40';
  const leftPosition = isTablet ? 'left-4' : 'left-2';
  const topBottomPosition = isTablet
    ? (panelPosition === 'top' ? 'top-16' : 'bottom-4')
    : (panelPosition === 'top' ? 'top-14' : 'bottom-2');
  
  const iconSize = isTablet ? 'h-4 w-4' : 'h-3.5 w-3.5';
  
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
        {/* Mode Toggle - Text | Inpaint | Annotate | Reposition | Img2Img */}
        {/* Mobile: 3+2 grid, Tablet: 5 in a row */}
        <div className={cn(
          "bg-muted rounded-md p-1",
          isMobile ? "grid grid-cols-3 gap-0.5" : "flex items-center gap-0.5"
        )}>
          <button
            onClick={() => onSetEditMode('text')}
            className={cn(
              "flex-1 flex items-center justify-center p-2 rounded transition-all",
              editMode === 'text'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="Text mode"
          >
            <Type className={iconSize} />
          </button>
          <button
            onClick={() => onSetEditMode('inpaint')}
            className={cn(
              "flex-1 flex items-center justify-center p-2 rounded transition-all",
              editMode === 'inpaint'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="Inpaint mode"
          >
            <Paintbrush className={iconSize} />
          </button>
          <button
            onClick={() => onSetEditMode('annotate')}
            className={cn(
              "flex-1 flex items-center justify-center p-2 rounded transition-all",
              editMode === 'annotate'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="Annotate mode"
          >
            <Pencil className={iconSize} />
          </button>
          <button
            onClick={() => onSetEditMode('reposition')}
            className={cn(
              "flex-1 flex items-center justify-center p-2 rounded transition-all",
              editMode === 'reposition'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="Reposition mode - move, scale, rotate to fill edges with AI"
          >
            <Move className={iconSize} />
          </button>
          <button
            onClick={() => onSetEditMode('img2img')}
            className={cn(
              "flex-1 flex items-center justify-center p-2 rounded transition-all",
              editMode === 'img2img'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="Img2Img mode - transform entire image with prompt"
          >
            <Wand2 className={iconSize} />
          </button>
        </div>
        
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
        
        {/* Reposition Mode Controls */}
        {editMode === 'reposition' && repositionTransform && onRepositionTranslateXChange && onRepositionTranslateYChange && onRepositionScaleChange && onRepositionRotationChange && onRepositionFlipH && onRepositionFlipV && onRepositionReset && (
          <RepositionControls
            transform={repositionTransform}
            onTranslateXChange={onRepositionTranslateXChange}
            onTranslateYChange={onRepositionTranslateYChange}
            onScaleChange={onRepositionScaleChange}
            onRotationChange={onRepositionRotationChange}
            onFlipH={onRepositionFlipH}
            onFlipV={onRepositionFlipV}
            onReset={onRepositionReset}
            variant={variant}
            imageDimensions={imageDimensions}
          />
        )}
        
        {/* Common Controls - Undo & Clear (only for inpaint and annotate modes) */}
        {(editMode === 'inpaint' || editMode === 'annotate') && (
          <UndoClearButtons 
            onUndo={onUndo} 
            onClear={onClearMask} 
            disabled={brushStrokes.length === 0}
            variant={variant}
          />
        )}
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

