import React, { useEffect, useRef, Suspense } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Textarea } from '@/shared/components/ui/textarea';
import { Switch } from '@/shared/components/ui/switch';
import { Label } from '@/shared/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { SegmentedControl, SegmentedControlItem } from '@/shared/components/ui/segmented-control';
import { CheckCircle, Loader2, Move, Paintbrush, Pencil, Save, Sparkles, Type, X, XCircle, Layers, Wand2, Plus } from 'lucide-react';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { cn } from '@/shared/lib/utils';
import { SourceGenerationDisplay } from './SourceGenerationDisplay';
import { GenerationRow } from '@/types/shots';
import type { LoraMode } from '../hooks';
import type { SourceVariantData } from '../hooks/useSourceGeneration';
import { VariantSelector } from '@/tools/travel-between-images/components/VideoGallery/components/VideoTrimEditor/components/VariantSelector';
import type { GenerationVariant } from '@/shared/hooks/useVariants';
import { ActiveLoRAsDisplay, ActiveLora } from '@/shared/components/ActiveLoRAsDisplay';
import { LoraSelectorModal, LoraModel } from '@/shared/components/LoraSelectorModal';
import type { UseLoraManagerReturn } from '@/shared/hooks/useLoraManager';

export interface EditModePanelProps {
  // Source generation
  sourceGenerationData: GenerationRow | null;
  onOpenExternalGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
  currentShotId?: string; // Optional: to check if parent is in same shot
  allShots?: Array<{ id: string; name: string }>; // Optional: for shot names
  isCurrentMediaPositioned?: boolean;
  onReplaceInShot?: (parentGenerationId: string, currentMediaId: string, parentTimelineFrame: number, currentShotId: string) => Promise<void>;
  sourcePrimaryVariant?: SourceVariantData | null;
  onMakeMainVariant?: () => Promise<void>;
  canMakeMainVariant?: boolean;
  
  // Edit mode state
  editMode: 'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img';
  setEditMode: (mode: 'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img') => void;
  setIsInpaintMode: (value: boolean) => void;
  
  // Prompt state
  inpaintPrompt: string;
  setInpaintPrompt: (value: string) => void;
  
  // Generations state
  inpaintNumGenerations: number;
  setInpaintNumGenerations: (value: number) => void;
  
  // LoRA Mode
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
  handleGenerateReposition?: () => void;
  
  // Reposition state
  isGeneratingReposition?: boolean;
  repositionGenerateSuccess?: boolean;
  hasTransformChanges?: boolean;
  handleSaveAsVariant?: () => void;
  isSavingAsVariant?: boolean;
  saveAsVariantSuccess?: boolean;
  
  // Derived generations (legacy - kept for compatibility)
  derivedGenerations?: GenerationRow[] | null;
  paginatedDerived?: GenerationRow[];
  derivedPage?: number;
  derivedTotalPages?: number;
  setDerivedPage?: (page: number | ((prev: number) => number)) => void;
  currentMediaId: string;
  
  // Variants - for VariantSelector
  variants?: GenerationVariant[];
  activeVariantId?: string | null;
  onVariantSelect?: (variantId: string) => void;
  onMakePrimary?: (variantId: string) => Promise<void>;
  isLoadingVariants?: boolean;
  
  // Variant
  variant: 'desktop' | 'mobile';
  hideInfoEditToggle?: boolean;
  
  // Create as generation toggle
  createAsGeneration?: boolean;
  onCreateAsGenerationChange?: (value: boolean) => void;
  
  // Img2Img mode props
  img2imgPrompt?: string;
  setImg2imgPrompt?: (prompt: string) => void;
  img2imgStrength?: number;
  setImg2imgStrength?: (strength: number) => void;
  enablePromptExpansion?: boolean;
  setEnablePromptExpansion?: (enabled: boolean) => void;
  isGeneratingImg2Img?: boolean;
  img2imgGenerateSuccess?: boolean;
  handleGenerateImg2Img?: () => void;
  // LoRA manager for img2img (uses shared LoRA selector)
  img2imgLoraManager?: UseLoraManagerReturn;
  availableLoras?: LoraModel[];
}

/**
 * EditModePanel Component
 * The panel shown when in edit mode (inpaint/magic-edit/annotate)
 * Consolidates desktop and mobile variants
 */
export const EditModePanel: React.FC<EditModePanelProps> = ({
  sourceGenerationData,
  onOpenExternalGeneration,
  currentShotId,
  allShots,
  isCurrentMediaPositioned,
  onReplaceInShot,
  sourcePrimaryVariant,
  onMakeMainVariant,
  canMakeMainVariant,
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
  handleGenerateReposition,
  isGeneratingReposition = false,
  repositionGenerateSuccess = false,
  hasTransformChanges = false,
  handleSaveAsVariant,
  isSavingAsVariant = false,
  saveAsVariantSuccess = false,
  derivedGenerations,
  paginatedDerived,
  derivedPage,
  derivedTotalPages,
  setDerivedPage,
  currentMediaId,
  variants,
  activeVariantId,
  onVariantSelect,
  onMakePrimary,
  isLoadingVariants,
  onClose,
  variant,
  hideInfoEditToggle = false,
  createAsGeneration = false,
  onCreateAsGenerationChange,
  // Img2Img props
  img2imgPrompt = '',
  setImg2imgPrompt,
  img2imgStrength = 0.6,
  setImg2imgStrength,
  enablePromptExpansion = false,
  setEnablePromptExpansion,
  isGeneratingImg2Img = false,
  img2imgGenerateSuccess = false,
  handleGenerateImg2Img,
  img2imgLoraManager,
  availableLoras = [],
}) => {
  const isMobile = variant === 'mobile';
  
  // Track previous edit mode to detect changes
  const prevEditModeRef = useRef<'text' | 'inpaint' | 'annotate'>(editMode);
  
  // Auto-reset LoRA mode to "none" when switching to inpaint or annotate
  useEffect(() => {
    const prevMode = prevEditModeRef.current;
    
    // If switching TO inpaint or annotate mode (from any other mode), reset LoRA to none
    if (prevMode !== editMode && (editMode === 'inpaint' || editMode === 'annotate')) {
      console.log('[LoraReset] Switching to', editMode, 'mode - resetting LoRA to none');
      setLoraMode('none');
    }
    
    prevEditModeRef.current = editMode;
  }, [editMode, setLoraMode]);
  
  // Handle clearing LoRA mode
  const handleClearLora = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoraMode('none');
  };
  
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
      {/* Top bar with Edit Image title (left) and Info/Edit Toggle + Close (right) - Sticky */}
      <div className="flex items-center justify-between border-b border-border p-4 sticky top-0 z-[80] bg-background">
        {/* Left side - Edit Image title */}
        <div className="flex items-center gap-2">
          <h2 className={cn("font-light", isMobile ? "text-base" : "text-lg")}>Edit Image</h2>
        </div>
        
        {/* Info | Edit Toggle and Close Button */}
        <div className="flex items-center gap-3">
          {!hideInfoEditToggle && (
          <SegmentedControl
            value="edit"
            onValueChange={(value) => {
              if (value === 'info') {
                handleExitMagicEditMode();
              }
            }}
          >
            <SegmentedControlItem value="info">Info</SegmentedControlItem>
            <SegmentedControlItem value="edit">Edit</SegmentedControlItem>
          </SegmentedControl>
          )}
          
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
      <div className={isMobile ? 'mb-2' : 'mb-4'}>
        {/* Five-way toggle: Text | Inpaint | Annotate | Reposition | Img2Img - single row */}
        <div className="flex gap-1 border border-border rounded-lg overflow-hidden bg-muted/30 p-1">
          <button
            onClick={() => {
              setIsInpaintMode(true);
              setEditMode('text');
            }}
            className={cn(
              `flex-1 flex items-center justify-center gap-1 ${togglePadding} ${toggleTextSize} transition-all rounded`,
              editMode === 'text'
                ? "bg-background text-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Type className={toggleIconSize} />
            {!isMobile && "Text"}
          </button>
          <button
            onClick={() => {
              setIsInpaintMode(true);
              setEditMode('inpaint');
            }}
            className={cn(
              `flex-1 flex items-center justify-center gap-1 ${togglePadding} ${toggleTextSize} transition-all rounded`,
              editMode === 'inpaint'
                ? "bg-background text-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Paintbrush className={toggleIconSize} />
            {!isMobile && "Inpaint"}
          </button>
          <button
            onClick={() => {
              setIsInpaintMode(true);
              setEditMode('annotate');
            }}
            className={cn(
              `flex-1 flex items-center justify-center gap-1 ${togglePadding} ${toggleTextSize} transition-all rounded`,
              editMode === 'annotate'
                ? "bg-background text-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Pencil className={toggleIconSize} />
            {!isMobile && "Annotate"}
          </button>
          <button
            onClick={() => {
              setIsInpaintMode(true);
              setEditMode('reposition');
            }}
            className={cn(
              `flex-1 flex items-center justify-center gap-1 ${togglePadding} ${toggleTextSize} transition-all rounded`,
              editMode === 'reposition'
                ? "bg-background text-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
            title="Move, scale, or rotate the image to fill edges with AI"
          >
            <Move className={toggleIconSize} />
            {!isMobile && "Reposition"}
          </button>
          <button
            onClick={() => {
              setIsInpaintMode(true);
              setEditMode('img2img');
            }}
            className={cn(
              `flex-1 flex items-center justify-center gap-1 ${togglePadding} ${toggleTextSize} transition-all rounded`,
              editMode === 'img2img'
                ? "bg-background text-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
            title="Transform the entire image with a prompt and strength control"
          >
            <Wand2 className={toggleIconSize} />
            {!isMobile && "Img2Img"}
          </button>
        </div>
        </div>
        
        {/* Prompt Field - Hidden for img2img mode (has its own prompt field) */}
        {editMode !== 'img2img' && (
        <div className={generationsSpacing}>
          <label className={`${labelSize} font-medium`}>Prompt:</label>
          <Textarea
            value={inpaintPrompt}
            onChange={(e) => setInpaintPrompt(e.target.value)}
            placeholder={
              editMode === 'text' 
                ? (isMobile ? "Describe the text edit..." : "Describe the text-based edit to make...")
                : editMode === 'annotate'
                  ? (isMobile ? "Describe what to generate..." : "Describe what to generate in the annotated regions...")
                  : editMode === 'reposition'
                    ? (isMobile ? "Optional: describe how to fill edges..." : "Optional: describe how to fill the exposed edges (default: match existing content)")
                    : (isMobile ? "Describe what to generate..." : "Describe what to generate in the masked area...")
            }
            className={`w-full ${textareaMinHeight} ${textareaPadding} ${textareaTextSize} resize-none`}
            rows={textareaRows}
            clearable
            onClear={() => setInpaintPrompt('')}
            voiceInput
            voiceContext="This is an image editing prompt. Describe what changes to make to the image - what to add, remove, or modify in the selected/masked area. Be specific about the visual result you want."
            onVoiceResult={(result) => {
              setInpaintPrompt(result.prompt || result.transcription);
            }}
          />
        </div>
        )}
        
        {/* Img2Img Mode Controls */}
        {editMode === 'img2img' && setImg2imgPrompt && setImg2imgStrength && setEnablePromptExpansion && (
          <div className={spacing}>
            {/* Prompt (optional for img2img) with Enable Prompt Expansion on the right */}
            <div className={generationsSpacing}>
              <div className="flex items-center justify-between mb-1">
                <label className={`${labelSize} font-medium`}>Prompt (optional):</label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 cursor-pointer">
                      <Checkbox
                        id="enable-prompt-expansion"
                        checked={enablePromptExpansion}
                        onCheckedChange={(checked) => setEnablePromptExpansion(!!checked)}
                        className="h-3.5 w-3.5"
                      />
                      <Label htmlFor="enable-prompt-expansion" className={cn("text-xs text-muted-foreground cursor-pointer")}>
                        Expand
                      </Label>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[250px]">
                    <p className="text-xs">
                      AI will automatically expand and enhance your prompt for better results.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Textarea
                value={img2imgPrompt}
                onChange={(e) => setImg2imgPrompt(e.target.value)}
                placeholder={isMobile ? "Describe the desired output..." : "Optional: describe what the transformed image should look like..."}
                className={`w-full ${textareaMinHeight} ${textareaPadding} ${textareaTextSize} resize-none`}
                rows={textareaRows}
                clearable
                onClear={() => setImg2imgPrompt('')}
                voiceInput
                voiceContext="This is an image-to-image prompt. Describe the desired style or transformation for the image. Be specific about the visual result you want."
                onVoiceResult={(result) => {
                  setImg2imgPrompt(result.prompt || result.transcription);
                }}
              />
            </div>
            
            {/* Strength Slider */}
            <div>
              <div className="flex items-center justify-between">
                <label className={`${labelSize} font-medium`}>Strength:</label>
                <span className={`${sliderTextSize} text-muted-foreground`}>{img2imgStrength.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={img2imgStrength}
                onChange={(e) => setImg2imgStrength(parseFloat(e.target.value))}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <p className={`${sliderTextSize} text-muted-foreground mt-1`}>
                Lower = closer to original, Higher = more transformed
              </p>
            </div>
            
            {/* LoRA Selector */}
            {img2imgLoraManager && (
              <div className={generationsSpacing}>
                <div className="flex items-center justify-between mb-2">
                  <label className={`${labelSize} font-medium`}>LoRAs (optional):</label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => img2imgLoraManager.setIsLoraModalOpen(true)}
                    className="h-7 px-2 text-xs"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add LoRA
                  </Button>
                </div>
                
                {/* Display selected LoRAs */}
                {img2imgLoraManager.selectedLoras.length > 0 && (
                  <ActiveLoRAsDisplay
                    selectedLoras={img2imgLoraManager.selectedLoras}
                    onRemoveLora={img2imgLoraManager.handleRemoveLora}
                    onLoraStrengthChange={img2imgLoraManager.handleLoraStrengthChange}
                    isGenerating={isGeneratingImg2Img}
                    availableLoras={availableLoras}
                    className="mt-2"
                  />
                )}
              </div>
            )}
          </div>
        )}
        
        {/* LoRA & Number of Generations - Hidden for img2img mode */}
        {editMode !== 'img2img' && (
        <div className={`flex ${isMobile ? 'flex-col gap-3' : 'gap-4'}`}>
          {/* LoRA Selector */}
          <div className={cn(isMobile ? "" : "flex-1")}>
            <div className="flex items-center gap-3">
              <label className={`${labelSize} font-medium whitespace-nowrap`}>LoRA:</label>
              <div className="flex items-center gap-1 flex-1">
                <Select value={loraMode} onValueChange={setLoraMode}>
                  <SelectTrigger variant="retro" className={cn("flex-1", isMobile ? "h-9 text-sm" : "h-10")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent variant="retro" className="z-[100001]">
                    <SelectItem variant="retro" value="none">None</SelectItem>
                    <SelectItem variant="retro" value="in-scene">InScene</SelectItem>
                    <SelectItem variant="retro" value="next-scene">Next Scene</SelectItem>
                    <SelectItem variant="retro" value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
                {loraMode !== 'none' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearLora}
                    className={cn(
                      "h-9 w-9 p-0 hover:bg-muted shrink-0",
                      isMobile && "h-8 w-8"
                    )}
                    title="Clear LoRA selection"
                  >
                    <XCircle className={cn("h-4 w-4 text-muted-foreground", isMobile && "h-3.5 w-3.5")} />
                  </Button>
                )}
              </div>
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
              <label className={`${labelSize} font-medium`}>{isMobile ? 'Generations:' : 'Number of Generations:'}</label>
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
        )}
        
        {/* Create as Variant toggle */}
        {onCreateAsGenerationChange && (
          <div className="flex items-center justify-between py-2 px-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 cursor-help">
                  <Layers className={cn(iconSize, "text-muted-foreground")} />
                  <Label htmlFor="create-as-variant" className={cn(labelSize, "font-medium cursor-pointer")}>
                    Create as variant
                  </Label>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[250px]">
                <p className="text-xs">
                  <strong>On:</strong> Result appears as a variant of this image in the variant selector.
                  <br />
                  <strong>Off:</strong> Result appears as its own image in the gallery.
                </p>
              </TooltipContent>
            </Tooltip>
            <Switch
              id="create-as-variant"
              checked={!createAsGeneration}
              onCheckedChange={(checked) => onCreateAsGenerationChange(!checked)}
            />
          </div>
        )}
        
        {/* Reposition Mode Buttons - Two options: Save or Generate with AI */}
        {editMode === 'reposition' ? (
          <div className={`flex gap-2 ${isMobile ? 'flex-col' : ''}`}>
            {/* Save as Variant Button */}
            <Button
              variant="secondary"
              size={buttonSize}
              onClick={handleSaveAsVariant}
              disabled={
                !hasTransformChanges ||
                isSavingAsVariant ||
                saveAsVariantSuccess ||
                isGeneratingReposition ||
                repositionGenerateSuccess
              }
              className={cn(
                isMobile ? "w-full" : "flex-1",
                saveAsVariantSuccess && "bg-green-600 hover:bg-green-600 text-white"
              )}
            >
              {isSavingAsVariant ? (
                <>
                  <Loader2 className={`${iconSize} mr-2 animate-spin`} />
                  Saving...
                </>
              ) : saveAsVariantSuccess ? (
                <>
                  <CheckCircle className={`${iconSize} mr-2`} />
                  Saved!
                </>
              ) : (
                <>
                  <Save className={`${iconSize} mr-2`} />
                  {isMobile ? 'Save' : 'Save as Variant'}
                </>
              )}
            </Button>
            
            {/* Fill Edges with AI Button */}
            <Button
              variant="default"
              size={buttonSize}
              onClick={handleGenerateReposition}
              disabled={
                !hasTransformChanges ||
                isGeneratingReposition ||
                repositionGenerateSuccess ||
                isSavingAsVariant ||
                saveAsVariantSuccess
              }
              className={cn(
                isMobile ? "w-full" : "flex-1",
                repositionGenerateSuccess && "bg-green-600 hover:bg-green-600"
              )}
            >
              {isGeneratingReposition ? (
                <>
                  <Loader2 className={`${iconSize} mr-2 animate-spin`} />
                  Generating...
                </>
              ) : repositionGenerateSuccess ? (
                <>
                  <CheckCircle className={`${iconSize} mr-2`} />
                  Success!
                </>
              ) : (
                <>
                  <Move className={`${iconSize} mr-2`} />
                  {isMobile ? 'Fill with AI' : 'Fill edges with AI'}
                </>
              )}
            </Button>
          </div>
        ) : editMode === 'img2img' && handleGenerateImg2Img ? (
          /* Img2Img Generate Button */
          <Button
            variant="default"
            size={buttonSize}
            onClick={handleGenerateImg2Img}
            disabled={isGeneratingImg2Img || img2imgGenerateSuccess}
            className={cn(
              "w-full",
              img2imgGenerateSuccess && "bg-green-600 hover:bg-green-600"
            )}
          >
            {isGeneratingImg2Img ? (
              <>
                <Loader2 className={`${iconSize} mr-2 animate-spin`} />
                Generating...
              </>
            ) : img2imgGenerateSuccess ? (
              <>
                <CheckCircle className={`${iconSize} mr-2`} />
                Submitted, results will appear below
              </>
            ) : (
              <>
                <Wand2 className={`${iconSize} mr-2`} />
                Transform Image
              </>
            )}
          </Button>
        ) : (
          /* Generate Button - For other modes */
          <Button
            variant="default"
            size={buttonSize}
            onClick={
              editMode === 'annotate' 
                ? handleGenerateAnnotatedEdit 
                : handleUnifiedGenerate
            }
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
        )}
      
      {/* Variants Section */}
      {variants && variants.length >= 1 && onVariantSelect && (
        <div className="border-t border-border pt-4 mt-4">
          <VariantSelector
            variants={variants}
            activeVariantId={activeVariantId || null}
            onVariantSelect={onVariantSelect}
            onMakePrimary={onMakePrimary}
            isLoading={isLoadingVariants}
          />
        </div>
      )}
      </div>

      {/* Img2Img LoRA Selector Modal */}
      {img2imgLoraManager && (
        <Suspense fallback={null}>
          <LoraSelectorModal
            isOpen={img2imgLoraManager.isLoraModalOpen}
            onClose={() => img2imgLoraManager.setIsLoraModalOpen(false)}
            loras={availableLoras}
            onAddLora={img2imgLoraManager.handleAddLora}
            onRemoveLora={img2imgLoraManager.handleRemoveLora}
            onUpdateLoraStrength={img2imgLoraManager.handleLoraStrengthChange}
            selectedLoras={img2imgLoraManager.selectedLoras.map(lora => {
              const fullLora = availableLoras.find(l => l['Model ID'] === lora.id);
              return {
                ...fullLora,
                "Model ID": lora.id,
                Name: lora.name,
                strength: lora.strength,
              } as LoraModel & { strength: number };
            })}
            lora_type="z-image"
          />
        </Suspense>
      )}
    </div>
  );
};

