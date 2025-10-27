import React from 'react';
import { X, Eraser, Undo2, Paintbrush, Loader2, CheckCircle, Square } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { cn } from '@/shared/lib/utils';
import { BrushStroke } from '../types';

export interface InpaintControlsPanelProps {
  variant: 'desktop' | 'mobile' | 'floating';
  isEraseMode: boolean;
  brushStrokes: BrushStroke[];
  inpaintPrompt: string;
  inpaintNumGenerations: number;
  brushSize: number;
  isGeneratingInpaint: boolean;
  inpaintGenerateSuccess?: boolean;
  onSetIsEraseMode: (isErasing: boolean) => void;
  onUndo: () => void;
  onClearMask: () => void;
  onSetInpaintPrompt: (prompt: string) => void;
  onSetInpaintNumGenerations: (num: number) => void;
  onSetBrushSize: (size: number) => void;
  onGenerateInpaint: () => void;
  onExitInpaintMode: () => void;
  isAnnotateMode: boolean;
  annotationMode: 'rectangle' | null;
  onSetIsAnnotateMode: (isAnnotate: boolean) => void;
  onSetAnnotationMode: (mode: 'rectangle' | null) => void;
}

/**
 * Inpaint controls panel
 * Consolidates 3 duplicate implementations (desktop, mobile, floating)
 */
export const InpaintControlsPanel: React.FC<InpaintControlsPanelProps> = ({
  variant,
  isEraseMode,
  brushStrokes,
  inpaintPrompt,
  inpaintNumGenerations,
  brushSize,
  isGeneratingInpaint,
  inpaintGenerateSuccess,
  onSetIsEraseMode,
  onUndo,
  onClearMask,
  onSetInpaintPrompt,
  onSetInpaintNumGenerations,
  onSetBrushSize,
  onGenerateInpaint,
  onExitInpaintMode,
  isAnnotateMode,
  annotationMode,
  onSetIsAnnotateMode,
  onSetAnnotationMode,
}) => {
  const isDesktop = variant === 'desktop';
  const isMobile = variant === 'mobile';
  const isFloating = variant === 'floating';

  const containerClass = isFloating
    ? "absolute right-4 top-20 bg-background border border-border rounded-lg p-4 z-[60] w-80 shadow-lg max-h-[calc(100vh-180px)] overflow-y-auto"
    : isMobile
    ? "p-4 space-y-3 bg-white dark:bg-background rounded-lg"
    : "p-6 space-y-4";

  const headingClass = isMobile ? "text-lg font-light" : "text-2xl font-light";
  const headingMargin = isMobile ? "mb-3" : "mb-4";
  const spacingClass = isMobile ? "space-y-3" : "space-y-4";
  const borderTopClass = isMobile ? "border-t border-border pt-3 space-y-3" : "border-t border-border pt-4 space-y-4";

  return (
    <div className={containerClass}>
      <div className={`flex items-center justify-between ${headingMargin}`}>
        <h2 className={headingClass}>Inpaint Settings</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={onExitInpaintMode}
          className="hover:bg-accent"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Inpaint vs Annotate Toggle */}
      <div className="flex gap-2 mb-4">
        <Button
          variant={!isAnnotateMode ? "default" : "secondary"}
          size="sm"
          onClick={() => onSetIsAnnotateMode(false)}
          className="flex-1"
        >
          <Paintbrush className="h-3.5 w-3.5 mr-1.5" />
          Inpaint
        </Button>
        <Button
          variant={isAnnotateMode ? "default" : "secondary"}
          size="sm"
          onClick={() => {
            onSetIsAnnotateMode(true);
            onSetAnnotationMode('rectangle');
          }}
          className="flex-1"
        >
          <Square className="h-3.5 w-3.5 mr-1.5" />
          Annotate
        </Button>
      </div>
      
      {/* Paint/Erase or Circle/Arrow Toggle, Clear, and Undo */}
      {isMobile ? (
        // Mobile: All 3 buttons on one line
        <div className="flex items-center gap-2">
          {!isAnnotateMode ? (
            // Inpaint mode: Paint/Erase
            <>
              <Button
                variant={isEraseMode ? "default" : "secondary"}
                size="sm"
                onClick={() => onSetIsEraseMode(!isEraseMode)}
                className={cn(
                  "flex-1",
                  isEraseMode ? "bg-purple-600 hover:bg-purple-700" : ""
                )}
              >
                <Eraser className="h-3 w-3 mr-1" />
                {isEraseMode ? 'Erase' : 'Paint'}
              </Button>
            </>
          ) : (
            // Annotate mode: Rectangle tool (always active)
            <>
              <Button
                variant="default"
                size="sm"
                className="flex-1"
                disabled
              >
                <Square className="h-3 w-3 mr-1" />
                Rectangle
              </Button>
            </>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={onClearMask}
            disabled={brushStrokes.length === 0}
            className="flex-1"
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
          
          <Button
            variant="secondary"
            size="sm"
            onClick={onUndo}
            disabled={brushStrokes.length === 0}
          >
            <Undo2 className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        // Desktop/Floating: Original layout
        <>
          <div className="flex items-center gap-2">
            {!isAnnotateMode ? (
              // Inpaint mode: Paint/Erase toggle
              <>
                {isFloating || isDesktop ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={isEraseMode ? "default" : "secondary"}
                        size="sm"
                        onClick={() => onSetIsEraseMode(!isEraseMode)}
                        className={cn(
                          "flex-1",
                          isEraseMode ? "bg-purple-600 hover:bg-purple-700" : ""
                        )}
                      >
                        <Eraser className="h-4 w-4 mr-2" />
                        {isEraseMode ? 'Erasing' : 'Erase'}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="z-[100001]">
                      {isEraseMode ? 'Switch to paint mode' : 'Switch to erase mode'}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </>
            ) : (
              // Annotate mode: Rectangle tool (always active)
              <>
                {isFloating || isDesktop ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="default"
                        size="sm"
                        className="flex-1"
                        disabled
                      >
                        <Square className="h-4 w-4 mr-2" />
                        Rectangle
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="z-[100001]">Draw rectangles to annotate</TooltipContent>
                  </Tooltip>
                ) : null}
              </>
            )}
            
            {isFloating || isDesktop ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onUndo}
                    disabled={brushStrokes.length === 0}
                  >
                    <Undo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="z-[100001]">Undo last stroke</TooltipContent>
              </Tooltip>
            ) : null}
          </div>

          {/* Clear Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onClearMask}
            disabled={brushStrokes.length === 0}
            className="w-full"
          >
            <X className="h-4 w-4 mr-2" />
            Clear All Strokes
          </Button>
          
          {/* Stroke Count - Desktop only */}
          <div className="text-sm text-muted-foreground">
            {brushStrokes.length === 0 ? 'No strokes yet' : `${brushStrokes.length} stroke${brushStrokes.length === 1 ? '' : 's'}`}
          </div>
        </>
      )}
      
      <div className={borderTopClass}>
        {/* Only show these controls in Inpaint mode */}
        {!isAnnotateMode && (
          <>
            {/* Brush Size Slider */}
            <div className={isMobile ? "space-y-1" : "space-y-2"}>
              <div className="flex items-center justify-between">
                <label className={isMobile ? "text-xs font-medium" : "text-sm font-medium"}>Brush Size</label>
                <span className={isMobile ? "text-xs text-muted-foreground" : "text-sm text-muted-foreground"}>{brushSize}px</span>
              </div>
              <input
                type="range"
                min={5}
                max={100}
                value={brushSize}
                onChange={(e) => onSetBrushSize(parseInt(e.target.value))}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          </>
        )}
      
        {/* Prompt Field - Only in Inpaint mode */}
        {!isAnnotateMode && (
          <div className={isMobile ? "space-y-1" : "space-y-2"}>
            <label className={isMobile ? "text-xs font-medium" : "text-sm font-medium"}>Inpaint Prompt</label>
            <textarea
              value={inpaintPrompt}
              onChange={(e) => onSetInpaintPrompt(e.target.value)}
              placeholder={isMobile ? "Describe what to generate..." : "Describe what to generate in the masked area..."}
              className={cn(
                "w-full bg-background border border-input rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring",
                isMobile ? "min-h-[60px] px-2 py-1.5" : "min-h-[100px] px-3 py-2"
              )}
              rows={isMobile ? 3 : 4}
            />
          </div>
        )}
        
        {/* Number of Generations - Only in Inpaint mode */}
        {!isAnnotateMode && (
          <div className={isMobile ? "space-y-1" : "space-y-2"}>
            <label className={isMobile ? "text-xs font-medium" : "text-sm font-medium"}>
              {isMobile ? 'Generations (1-4)' : 'Number of Generations'}
            </label>
            <input
              type="number"
              min={1}
              max={4}
              value={inpaintNumGenerations}
              onChange={(e) => onSetInpaintNumGenerations(Math.max(1, Math.min(4, parseInt(e.target.value) || 1)))}
              className={cn(
                "w-full bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring",
                isMobile ? "px-2 py-1.5" : "px-3 py-2"
              )}
            />
            {!isMobile && <p className="text-xs text-muted-foreground">Generate 1-4 variations</p>}
          </div>
        )}
        
        {/* Generate Button - Only in Inpaint mode */}
        {!isAnnotateMode && (
          <Button
            variant="default"
            size={isMobile ? "sm" : "default"}
            onClick={onGenerateInpaint}
            disabled={brushStrokes.length === 0 || !inpaintPrompt.trim() || isGeneratingInpaint || inpaintGenerateSuccess}
            className={cn(
              "w-full",
              inpaintGenerateSuccess && "bg-green-600 hover:bg-green-600"
            )}
          >
            {isGeneratingInpaint ? (
              <>
                <Loader2 className={isMobile ? "h-3 w-3 mr-2 animate-spin" : "h-4 w-4 mr-2 animate-spin"} />
                Generating...
              </>
            ) : inpaintGenerateSuccess ? (
              <>
                <CheckCircle className={isMobile ? "h-3 w-3 mr-2" : "h-4 w-4 mr-2"} />
                Success!
              </>
            ) : (
              <>
                <Paintbrush className={isMobile ? "h-3 w-3 mr-2" : "h-4 w-4 mr-2"} />
                {isMobile ? 'Generate' : 'Generate Inpaint'}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

