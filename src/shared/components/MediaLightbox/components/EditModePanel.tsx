import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { CheckCircle, Loader2, Paintbrush, Pencil, Sparkles, Type } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { SourceGenerationDisplay } from './SourceGenerationDisplay';
import { DerivedGenerationsGrid } from './DerivedGenerationsGrid';
import { GenerationRow } from '@/types/shots';

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
  
  // Generation status
  isGeneratingInpaint: boolean;
  inpaintGenerateSuccess: boolean;
  isCreatingMagicEditTasks: boolean;
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
    <div className={`${padding} ${spacing} w-full`}>
      {/* Based On display - Show source image this was derived from */}
      {sourceGenerationData && onOpenExternalGeneration && (
        isMobile ? (
          // Mobile: Compact button-like display
          <button
            onClick={async () => {
              console.log('[BasedOn:Mobile] 🖼️ Navigating to source generation', {
                sourceId: sourceGenerationData.id.substring(0, 8),
                clearingDerivedContext: true
              });
              await onOpenExternalGeneration(sourceGenerationData.id);
            }}
            className="mb-2 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group"
          >
            <span>Based on:</span>
            <div className="relative w-8 h-8 rounded border border-border overflow-hidden group-hover:border-primary transition-colors">
              <img
                src={(sourceGenerationData as any).thumbUrl || sourceGenerationData.location}
                alt="Source generation"
                className="w-full h-full object-cover"
              />
            </div>
            <span className="group-hover:underline">Click to view</span>
          </button>
        ) : (
          // Desktop: Full display
          <SourceGenerationDisplay
            sourceGeneration={sourceGenerationData}
            onNavigate={onOpenExternalGeneration}
            variant="full"
            className="mb-3"
          />
        )
      )}
      
      <div className={`${isMobile ? 'mb-2' : 'mb-4'} flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <h2 className={`${headerSize} font-light`}>Edit Image</h2>
          
          {/* Three-way toggle: Text | Inpaint | Annotate */}
          <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
            <button
              onClick={() => {
                setIsInpaintMode(true);
                setEditMode('text');
              }}
              className={cn(
                `flex ${isMobile ? 'flex-1 justify-center' : ''} items-center gap-1.5 ${togglePadding} rounded ${toggleTextSize} transition-all`,
                editMode === 'text'
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
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
                `flex ${isMobile ? 'flex-1 justify-center' : ''} items-center gap-1.5 ${togglePadding} rounded ${toggleTextSize} transition-all`,
                editMode === 'inpaint'
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
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
                `flex ${isMobile ? 'flex-1 justify-center' : ''} items-center gap-1.5 ${togglePadding} rounded ${toggleTextSize} transition-all`,
                editMode === 'annotate'
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Pencil className={toggleIconSize} />
              Annotate
            </button>
          </div>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExitMagicEditMode}
          className={`${closeButtonSize} md:flex md:flex-col md:items-center md:leading-tight hover:bg-transparent active:bg-transparent`}
        >
          <span className="md:hidden">Close edit mode</span>
          <span className="hidden md:block">Close</span>
          <span className="hidden md:block">Edit Mode</span>
        </Button>
      </div>
      
      <div className={spacing}>
        {/* Prompt Field */}
        <div className={generationsSpacing}>
          <label className={`${labelSize} font-medium`}>Prompt</label>
          <textarea
            value={inpaintPrompt}
            onChange={(e) => setInpaintPrompt(e.target.value)}
            placeholder={isMobile ? "Describe what to generate..." : "Describe what to generate in the masked area..."}
            className={`w-full ${textareaMinHeight} bg-background border border-input rounded-md ${textareaPadding} ${textareaTextSize} resize-none focus:outline-none focus:ring-2 focus:ring-ring`}
            rows={textareaRows}
          />
        </div>
        
        {/* Number of Generations Slider */}
        <div className={generationsSpacing}>
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
          <p className="text-xs text-muted-foreground">{isMobile ? '1-16 variations' : 'Generate 1-16 variations'}</p>
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
      </div>
      
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
        />
      )}
    </div>
  );
};

