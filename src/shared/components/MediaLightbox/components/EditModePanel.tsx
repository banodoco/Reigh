import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { CheckCircle, Loader2, Paintbrush, Pencil, Sparkles, Type, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { SourceGenerationDisplay } from './SourceGenerationDisplay';
import { DerivedGenerationsGrid } from './DerivedGenerationsGrid';
import { GenerationRow } from '@/types/shots';
import type { LoraMode } from '../hooks/useInSceneBoost';

export interface EditModePanelProps {
  // Source generation
  sourceGenerationData: GenerationRow | null;
  onOpenExternalGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
  
  // Edit mode state
  editMode: 'text' | 'inpaint' | 'annotate';
  setEditMode: (mode: 'text' | 'inpaint' | 'annotate') => void;
  setIsInpaintMode: (value: boolean) => void;
  
  // Prompt state
  inpaintPrompt: string;
  setInpaintPrompt: (value: string) => void;
  
  // Generations state
  inpaintNumGenerations: number;
  setInpaintNumGenerations: (value: number) => void;
  
  // Lora Mode
  loraMode: LoraMode;
  setLoraMode: (mode: LoraMode) => void;
  customLoraUrl: string;
  setCustomLoraUrl: (url: string) => void;
  
  // Generation status
  isGeneratingInpaint: boolean;
  inpaintGenerateSuccess: boolean;
  isCreatingMagicEditTasks: boolean;
  
  // Close lightbox
  onClose: () => void;
  magicEditTasksCreated: boolean;
  
  // Brush strokes
  brushStrokes: any[];
  
  // Handlers
  handleExitMagicEditMode: () => void;
  handleUnifiedGenerate: () => void;
  handleGenerateAnnotatedEdit: () => void;
  
  // Derived generations
  derivedGenerations: GenerationRow[] | null;
  paginatedDerived: GenerationRow[];
  derivedPage: number;
  derivedTotalPages: number;
  setDerivedPage: (page: number | ((prev: number) => number)) => void;
  currentMediaId: string;
  
  // Variant
  variant: 'desktop' | 'mobile';
}

/**
 * EditModePanel Component
 * The panel shown when in edit mode (inpaint/magic-edit/annotate)
 * Consolidates desktop and mobile variants
 */
export const EditModePanel: React.FC<EditModePanelProps> = ({
  sourceGenerationData,
  onOpenExternalGeneration,
  editMode,
  setEditMode,
  setIsInpaintMode,
  inpaintPrompt,
  setInpaintPrompt,
  inpaintNumGenerations,
  setInpaintNumGenerations,
  loraMode,
  setLoraMode,
  customLoraUrl,
  setCustomLoraUrl,
  isGeneratingInpaint,
  inpaintGenerateSuccess,
  isCreatingMagicEditTasks,
  magicEditTasksCreated,
  brushStrokes,
  handleExitMagicEditMode,
  handleUnifiedGenerate,
  handleGenerateAnnotatedEdit,
  derivedGenerations,
  paginatedDerived,
  derivedPage,
  derivedTotalPages,
  setDerivedPage,
  currentMediaId,
  onClose,
  variant,
}) => {
  const isMobile = variant === 'mobile';
  
  // Responsive styles
  const padding = isMobile ? 'p-4' : 'p-6';
  const spacing = isMobile ? 'space-y-3' : 'space-y-4';
  const headerSize = isMobile ? 'text-lg' : 'text-2xl';
  const labelSize = isMobile ? 'text-xs' : 'text-sm';
  const textareaMinHeight = isMobile ? 'min-h-[60px]' : 'min-h-[100px]';
  const textareaRows = isMobile ? 3 : 4;
  const textareaPadding = isMobile ? 'px-2 py-1.5' : 'px-3 py-2';
  const textareaTextSize = isMobile ? 'text-base' : 'text-sm';
  const buttonSize = isMobile ? 'sm' : 'default';
  const iconSize = isMobile ? 'h-3 w-3' : 'h-4 w-4';
  const togglePadding = isMobile ? 'px-2 py-1.5' : 'px-3 py-1.5';
  const toggleTextSize = isMobile ? 'text-xs' : 'text-sm';
  const toggleIconSize = isMobile ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const closeButtonSize = isMobile ? 'text-xs px-2 py-1' : 'text-sm px-3 py-1';
  const generationsSpacing = isMobile ? 'space-y-1' : 'space-y-2';
  const sliderTextSize = isMobile ? 'text-xs' : 'text-sm';

  return (
    <div className="w-full">
      {/* Top bar with Based On (left) and Close Edit Mode (right) */}
      <div className="flex items-center justify-between border-b border-border p-4">
        {/* Based On display - Show source image this was derived from */}
        {sourceGenerationData && onOpenExternalGeneration ? (
          <SourceGenerationDisplay
            sourceGeneration={sourceGenerationData}
            onNavigate={onOpenExternalGeneration}
            variant="compact"
          />
        ) : (
          <div></div>
        )}
        
        {/* Info | Edit Toggle and Close Lightbox Button */}
        <div className="flex items-center gap-3">
          {/* Two-way toggle: Info | Edit */}
          <div className="flex items-center gap-1 bg-muted rounded-md p-1">
            <button
              onClick={handleExitMagicEditMode}
              className="px-3 py-1.5 text-sm rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-background/50"
            >
              Info
            </button>
            <button
              className="px-3 py-1.5 text-sm rounded transition-colors bg-background text-foreground shadow-sm"
              disabled
            >
              Edit
            </button>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="h-8 w-8 p-0 hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <div className={`${padding} ${spacing}`}>
      <div className={`${isMobile ? 'mb-2' : 'mb-4'} flex items-center gap-3`}>
        <h2 className={`${headerSize} font-light`}>Edit Image</h2>
        
        {/* Three-way toggle: Text | Inpaint | Annotate - Segmented control style */}
        <div className="inline-flex items-center border border-border rounded-lg overflow-hidden bg-muted/30">
            <button
              onClick={() => {
                setIsInpaintMode(true);
                setEditMode('text');
              }}
              className={cn(
                `flex ${isMobile ? 'flex-1 justify-center' : ''} items-center gap-1.5 ${togglePadding} ${toggleTextSize} transition-all border-r border-border`,
                editMode === 'text'
                  ? "bg-background text-foreground font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Type className={toggleIconSize} />
              Text
            </button>
            <button
              onClick={() => {
                setIsInpaintMode(true);
                setEditMode('inpaint');
              }}
              className={cn(
                `flex ${isMobile ? 'flex-1 justify-center' : ''} items-center gap-1.5 ${togglePadding} ${toggleTextSize} transition-all border-r border-border`,
                editMode === 'inpaint'
                  ? "bg-background text-foreground font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Paintbrush className={toggleIconSize} />
              Inpaint
            </button>
            <button
              onClick={() => {
                setIsInpaintMode(true);
                setEditMode('annotate');
              }}
              className={cn(
                `flex ${isMobile ? 'flex-1 justify-center' : ''} items-center gap-1.5 ${togglePadding} ${toggleTextSize} transition-all`,
                editMode === 'annotate'
                  ? "bg-background text-foreground font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Pencil className={toggleIconSize} />
              Annotate
            </button>
          </div>
        </div>
        
        {/* Prompt Field */}
        <div className={generationsSpacing}>
          <label className={`${labelSize} font-medium`}>Prompt</label>
          <textarea
            value={inpaintPrompt}
            onChange={(e) => setInpaintPrompt(e.target.value)}
            placeholder={
              editMode === 'text' 
                ? (isMobile ? "Describe the text edit..." : "Describe the text-based edit to make...")
                : editMode === 'annotate'
                  ? (isMobile ? "Describe what to generate..." : "Describe what to generate in the annotated regions...")
                  : (isMobile ? "Describe what to generate..." : "Describe what to generate in the masked area...")
            }
            className={`w-full ${textareaMinHeight} bg-background border border-input rounded-md ${textareaPadding} ${textareaTextSize} resize-none focus:outline-none focus:ring-2 focus:ring-ring`}
            rows={textareaRows}
          />
        </div>
        
        {/* Lora Mode & Number of Generations */}
        <div className={`flex ${isMobile ? 'flex-col gap-3' : 'gap-4'}`}>
          {/* Lora Mode Selector */}
          <div className={cn(isMobile ? "" : "flex-1")}>
            <div className="flex items-center gap-3">
              <label className={`${labelSize} font-medium whitespace-nowrap`}>Lora Mode</label>
              <Select value={loraMode} onValueChange={setLoraMode}>
                <SelectTrigger className={cn("flex-1", isMobile ? "h-9 text-sm" : "h-10")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[100001]">
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="in-scene">InScene</SelectItem>
                  <SelectItem value="next-scene">Next Scene</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Custom URL Input - Show when Custom is selected */}
            {loraMode === 'custom' && (
              <input
                type="text"
                value={customLoraUrl}
                onChange={(e) => setCustomLoraUrl(e.target.value)}
                placeholder="https://huggingface.co/.../lora.safetensors"
                className={cn(
                  "w-full mt-2 bg-background border border-input rounded-md px-3 py-2 text-sm",
                  "focus:outline-none focus:ring-2 focus:ring-ring"
                )}
              />
            )}
          </div>

          {/* Number of Generations Slider */}
          <div className={cn(isMobile ? "" : "flex-1")}>
            <div className="flex items-center justify-between">
              <label className={`${labelSize} font-medium`}>{isMobile ? 'Generations' : 'Number of Generations'}</label>
              <span className={`${sliderTextSize} text-muted-foreground`}>{inpaintNumGenerations}</span>
            </div>
            <input
              type="range"
              min={1}
              max={16}
              value={inpaintNumGenerations}
              onChange={(e) => setInpaintNumGenerations(parseInt(e.target.value))}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
            />
          </div>
        </div>
        
        {/* Generate Button - Unified */}
        <Button
          variant="default"
          size={buttonSize}
          onClick={editMode === 'annotate' ? handleGenerateAnnotatedEdit : handleUnifiedGenerate}
          disabled={
            (editMode === 'annotate' && (brushStrokes.length === 0 || !inpaintPrompt.trim())) ||
            (editMode !== 'annotate' && !inpaintPrompt.trim()) || 
            (editMode === 'inpaint' && brushStrokes.length === 0) ||
            isGeneratingInpaint || 
            inpaintGenerateSuccess || 
            isCreatingMagicEditTasks || 
            magicEditTasksCreated
          }
          className={cn(
            "w-full",
            (inpaintGenerateSuccess || magicEditTasksCreated) && "bg-green-600 hover:bg-green-600"
          )}
        >
          {(isGeneratingInpaint || isCreatingMagicEditTasks) ? (
            <>
              <Loader2 className={`${iconSize} mr-2 animate-spin`} />
              Generating...
            </>
          ) : (inpaintGenerateSuccess || magicEditTasksCreated) ? (
            <>
              <CheckCircle className={`${iconSize} mr-2`} />
              {editMode === 'inpaint' ? 'Success!' : 'Submitted, results will appear below'}
            </>
          ) : editMode === 'inpaint' ? (
            <>
              <Paintbrush className={`${iconSize} mr-2`} />
              Generate inpainted image
            </>
          ) : editMode === 'annotate' ? (
            <>
              <Pencil className={`${iconSize} mr-2`} />
              Generate based on annotations
            </>
          ) : (
            <>
              <Sparkles className={`${iconSize} mr-2`} />
              Generate text edit
            </>
          )}
        </Button>
      
      {/* Derived Generations Section */}
      {derivedGenerations && derivedGenerations.length > 0 && onOpenExternalGeneration && (
        <DerivedGenerationsGrid
          derivedGenerations={derivedGenerations}
          paginatedDerived={paginatedDerived}
          derivedPage={derivedPage}
          derivedTotalPages={derivedTotalPages}
          onSetDerivedPage={setDerivedPage}
          onNavigate={onOpenExternalGeneration}
          currentMediaId={currentMediaId}
          variant={variant}
          title={`Edits of this image (${derivedGenerations.length})`}
          showTopBorder={true}
        />
      )}
      </div>
    </div>
  );
};

