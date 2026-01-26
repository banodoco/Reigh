import React, { useEffect, useRef, Suspense } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Textarea } from '@/shared/components/ui/textarea';
import { Switch } from '@/shared/components/ui/switch';
import { Label } from '@/shared/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { CheckCircle, Loader2, Move, Paintbrush, Pencil, Save, Sparkles, Type, XCircle, Layers, Wand2, Plus } from 'lucide-react';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { cn } from '@/shared/lib/utils';
import { SourceGenerationDisplay } from './SourceGenerationDisplay';
import { GenerationRow } from '@/types/shots';
import type { LoraMode, QwenEditModel } from '../hooks';
import type { SourceVariantData } from '../hooks/useSourceGeneration';
import type { GenerationVariant } from '@/shared/hooks/useVariants';
import { ActiveLoRAsDisplay, ActiveLora } from '@/shared/components/ActiveLoRAsDisplay';
import { LoraSelectorModal, LoraModel } from '@/shared/components/LoraSelectorModal';
import type { UseLoraManagerReturn } from '@/shared/hooks/useLoraManager';
import { EditAdvancedSettings } from './EditAdvancedSettings';
import type { EditAdvancedSettings as EditAdvancedSettingsType } from '../hooks/useGenerationEditSettings';
import { EditPanelLayout } from './EditPanelLayout';
import { ModeSelector } from './ModeSelector';

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
  // Variant promotion
  onPromoteToGeneration?: (variantId: string) => Promise<void>;
  isPromoting?: boolean;
  // Variant deletion
  onDeleteVariant?: (variantId: string) => Promise<void>;

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
  // LoRA manager for other edit modes (text, inpaint, annotate, reposition)
  editLoraManager?: UseLoraManagerReturn;
  // Advanced settings for two-pass generation
  advancedSettings?: EditAdvancedSettingsType;
  setAdvancedSettings?: (updates: Partial<EditAdvancedSettingsType>) => void;
  // Whether running in local generation mode (shows steps slider)
  isLocalGeneration?: boolean;
  // Model selection for cloud mode
  qwenEditModel?: QwenEditModel;
  setQwenEditModel?: (model: QwenEditModel) => void;
}

/**
 * EditModePanel Component
 * The panel shown when in edit mode (inpaint/magic-edit/annotate)
 * Uses shared EditPanelLayout for consistent header and variants handling.
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
  onPromoteToGeneration,
  isPromoting,
  onDeleteVariant,
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
  enablePromptExpansion = false, // Hidden UI, always false
  setEnablePromptExpansion,
  isGeneratingImg2Img = false,
  img2imgGenerateSuccess = false,
  handleGenerateImg2Img,
  img2imgLoraManager,
  availableLoras = [],
  editLoraManager,
  advancedSettings,
  setAdvancedSettings,
  isLocalGeneration = false,
  qwenEditModel = 'qwen-edit',
  setQwenEditModel,
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
  const padding = isMobile ? 'p-3' : 'p-6';
  const spacing = isMobile ? 'space-y-2' : 'space-y-4';
  const labelSize = isMobile ? 'text-[10px] uppercase tracking-wide text-muted-foreground' : 'text-sm';
  const textareaMinHeight = isMobile ? 'min-h-[50px]' : 'min-h-[100px]';
  const textareaRows = isMobile ? 2 : 4;
  const textareaPadding = isMobile ? 'px-2 py-1.5' : 'px-3 py-2';
  const textareaTextSize = isMobile ? 'text-base' : 'text-sm'; // 16px on mobile prevents iOS zoom
  const buttonSize = isMobile ? 'sm' : 'default';
  const iconSize = isMobile ? 'h-3 w-3' : 'h-4 w-4';
  const togglePadding = isMobile ? 'px-1.5 py-1' : 'px-3 py-1.5';
  const toggleTextSize = isMobile ? 'text-[10px]' : 'text-sm';
  const toggleIconSize = isMobile ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const generationsSpacing = isMobile ? 'space-y-0.5' : 'space-y-2';
  const sliderTextSize = isMobile ? 'text-xs' : 'text-sm';

  // Section label component for mobile
  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    isMobile ? (
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
        {children}
      </div>
    ) : null
  );

  // Mode selector items for image editing
  const modeSelectorItems = [
    {
      id: 'text',
      label: 'Text',
      icon: <Type />,
      onClick: () => { setIsInpaintMode(true); setEditMode('text'); },
    },
    {
      id: 'inpaint',
      label: 'Paint',
      icon: <Paintbrush />,
      onClick: () => { setIsInpaintMode(true); setEditMode('inpaint'); },
    },
    {
      id: 'annotate',
      label: 'Annotate',
      icon: <Pencil />,
      onClick: () => { setIsInpaintMode(true); setEditMode('annotate'); },
    },
    {
      id: 'reposition',
      label: 'Move',
      icon: <Move />,
      onClick: () => { setIsInpaintMode(true); setEditMode('reposition'); },
    },
    {
      id: 'img2img',
      label: 'Img2Img',
      icon: <Wand2 />,
      onClick: () => { setIsInpaintMode(true); setEditMode('img2img'); },
    },
  ];

  const modeSelector = (
    <ModeSelector
      items={modeSelectorItems}
      activeId={editMode}
    />
  );

  return (
    <>
      <EditPanelLayout
        variant={variant}
        onClose={onClose}
        onExitEditMode={handleExitMagicEditMode}
        hideInfoEditToggle={hideInfoEditToggle}
        modeSelector={modeSelector}
        variants={variants}
        activeVariantId={activeVariantId}
        onVariantSelect={onVariantSelect}
        onMakePrimary={onMakePrimary}
        isLoadingVariants={isLoadingVariants}
        onPromoteToGeneration={onPromoteToGeneration}
        isPromoting={isPromoting}
        onDeleteVariant={onDeleteVariant}
      >
          {/* Prompt Field - Hidden for img2img mode (has its own prompt field) */}
          {editMode !== 'img2img' && (
          <div className={generationsSpacing}>
            <SectionLabel>Prompt</SectionLabel>
            {!isMobile && <label className={`${labelSize} font-medium`}>Prompt:</label>}
            <Textarea
              value={inpaintPrompt}
              onChange={(e) => setInpaintPrompt(e.target.value)}
              placeholder={
                editMode === 'text'
                  ? (isMobile ? "Describe changes..." : "Describe the text-based edit to make...")
                  : editMode === 'annotate'
                    ? (isMobile ? "What to generate..." : "Describe what to generate in the annotated regions...")
                    : editMode === 'reposition'
                      ? (isMobile ? "How to fill edges (optional)..." : "Optional: describe how to fill the exposed edges (default: match existing content)")
                      : (isMobile ? "What to generate..." : "Describe what to generate in the masked area...")
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
              {/* Prompt (optional for img2img) */}
              <div className={generationsSpacing}>
                <SectionLabel>Prompt</SectionLabel>
                {!isMobile && <label className={`${labelSize} font-medium`}>Prompt (optional):</label>}
                <Textarea
                  value={img2imgPrompt}
                  onChange={(e) => setImg2imgPrompt(e.target.value)}
                  placeholder={isMobile ? "Describe image..." : "Optional: describe what the transformed image should look like..."}
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
                <SectionLabel>Strength</SectionLabel>
                <div className="flex items-center gap-2">
                  {!isMobile && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <label className={`${labelSize} font-medium cursor-help`}>Strength:</label>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[200px]">
                        <p className="text-xs">
                          Lower = closer to original, Higher = more transformed
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <div className={cn("flex items-center gap-2", isMobile ? "w-full" : "w-[70%]")}>
                    <span className={cn(sliderTextSize, "text-muted-foreground", isMobile && "text-[10px]")}>Keep</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={img2imgStrength}
                      onChange={(e) => setImg2imgStrength(parseFloat(e.target.value))}
                      className="flex-1 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <span className={cn(sliderTextSize, "text-muted-foreground", isMobile && "text-[10px]")}>Change</span>
                    <span className={cn(sliderTextSize, "text-foreground font-medium w-8 text-right", isMobile && "text-xs")}>{Math.round(img2imgStrength * 100)}%</span>
                  </div>
                </div>
              </div>

              {/* LoRA Selector */}
              {img2imgLoraManager && (
                <div className={generationsSpacing}>
                  <SectionLabel>Style LoRAs</SectionLabel>
                  <div className={cn("flex items-center gap-2", isMobile ? "mb-1" : "mb-2")}>
                    {!isMobile && <label className={`${labelSize} font-medium`}>LoRAs:</label>}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => img2imgLoraManager.setIsLoraModalOpen(true)}
                      className={cn("h-10 px-2 text-xs flex flex-col items-center justify-center leading-tight", isMobile && "h-6 text-[10px]")}
                    >
                      <Plus className={cn(isMobile ? "h-2.5 w-2.5" : "h-3 w-3")} />
                      <span className="text-[10px]">LoRA</span>
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
                      className={isMobile ? "mt-1" : "mt-2"}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Model Selector + LoRA Selector - Shown for non-img2img edit modes */}
          {editMode !== 'img2img' && editLoraManager && (
            <div className={generationsSpacing}>
              <SectionLabel>Model & LoRAs</SectionLabel>
              <div className={cn("flex items-center gap-2", isMobile ? "mb-1" : "mb-2")}>
                {/* Model Selector - Only shown in cloud mode (40% width) */}
                {!isLocalGeneration && setQwenEditModel && (
                  <Select value={qwenEditModel} onValueChange={setQwenEditModel}>
                    <SelectTrigger variant="retro" className={cn("w-[40%]", isMobile ? "h-7 text-xs" : "h-10")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent variant="retro" className="z-[100001]">
                      <SelectItem variant="retro" value="qwen-edit">Qwen-Edit</SelectItem>
                      <SelectItem variant="retro" value="qwen-edit-2509">Qwen-Edit-2509</SelectItem>
                      <SelectItem variant="retro" value="qwen-edit-2511">Qwen-Edit-2511</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {/* LoRA button (40% width) */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => editLoraManager.setIsLoraModalOpen(true)}
                  className={cn("w-[40%] h-10 px-2 text-xs flex items-center justify-center gap-1", isMobile && "h-6 text-[10px]")}
                >
                  <Plus className={cn(isMobile ? "h-2.5 w-2.5" : "h-3 w-3")} />
                  <span>LoRA</span>
                </Button>
                {/* 20% empty space is implicit from the remaining width */}
              </div>

              {/* Display selected LoRAs */}
              {editLoraManager.selectedLoras.length > 0 && (
                <ActiveLoRAsDisplay
                  selectedLoras={editLoraManager.selectedLoras}
                  onRemoveLora={editLoraManager.handleRemoveLora}
                  onLoraStrengthChange={editLoraManager.handleLoraStrengthChange}
                  isGenerating={isGeneratingInpaint || isCreatingMagicEditTasks}
                  availableLoras={availableLoras}
                  className={isMobile ? "mt-1" : "mt-2"}
                />
              )}
            </div>
          )}

          {/* Legacy LoRA Selector - Fallback for when editLoraManager is not provided */}
          {editMode !== 'img2img' && !editLoraManager && (
          <div>
            <SectionLabel>Style LoRA</SectionLabel>
            <div className="flex items-center gap-2">
              {!isMobile && <label className={`text-sm font-medium whitespace-nowrap`}>LoRA:</label>}
              <div className="flex items-center gap-1 flex-1">
                <Select value={loraMode} onValueChange={setLoraMode}>
                  <SelectTrigger variant="retro" className={cn("flex-1", isMobile ? "h-7 text-xs" : "h-10")}>
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
                      isMobile && "h-7 w-7"
                    )}
                    title="Clear LoRA selection"
                  >
                    <XCircle className={cn("h-4 w-4 text-muted-foreground", isMobile && "h-3 w-3")} />
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
                  "w-full mt-1.5 bg-background border border-input rounded-md preserve-case",
                  "focus:outline-none focus:ring-2 focus:ring-ring",
                  isMobile ? "px-2 py-1.5 text-base" : "px-3 py-2 text-sm"
                )}
              />
            )}
          </div>
          )}

          {/* Advanced Settings - shown for edit modes that support hires fix (not img2img) */}
          {advancedSettings && setAdvancedSettings && editMode !== 'img2img' && !isMobile && (
            <EditAdvancedSettings
              settings={advancedSettings}
              onSettingsChange={setAdvancedSettings}
              isLocalGeneration={isLocalGeneration}
            />
          )}

          {/* Number of Generations + Create as Variant - shown for all image edit modes */}
          {onCreateAsGenerationChange && (
            <div className={cn(
              "py-1.5 px-1 rounded-md flex items-center gap-2 overflow-hidden w-[80%]",
              isMobile && "bg-muted/30"
            )}>
              <SectionLabel>Options</SectionLabel>
              {/* Number of Generations */}
              <div className={cn("flex items-center gap-2 min-w-0", isMobile ? "flex-1" : "flex-shrink")}>
                <label className={cn(
                  "font-medium whitespace-nowrap flex-shrink-0",
                  isMobile ? "text-[10px] text-muted-foreground" : "text-sm"
                )}>
                  {isMobile ? '#' : 'Generations:'}
                </label>
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <input
                    type="range"
                    min={1}
                    max={16}
                    value={inpaintNumGenerations}
                    onChange={(e) => setInpaintNumGenerations(parseInt(e.target.value))}
                    className={cn(
                      "bg-muted rounded-lg appearance-none cursor-pointer accent-primary min-w-[60px] w-full",
                      isMobile ? "h-1.5 flex-1" : "h-2 max-w-[120px]"
                    )}
                  />
                  <span className={cn(
                    "text-foreground font-medium text-center flex-shrink-0",
                    isMobile ? "text-xs w-4" : "text-sm w-5"
                  )}>{inpaintNumGenerations}</span>
                </div>
              </div>

              {/* Create as Variant toggle */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 cursor-help">
                      <Layers className={cn(isMobile ? "h-3 w-3" : "h-4 w-4", "text-muted-foreground")} />
                      <Label htmlFor="create-as-variant" className={cn(
                        "font-medium cursor-pointer whitespace-nowrap",
                        isMobile ? "text-[10px] text-muted-foreground" : "text-sm"
                      )}>
                        {isMobile ? 'Variant' : 'Variant'}
                      </Label>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[250px]">
                    <p className="text-xs">
                      <strong>On:</strong> Result appears as a variant of this image.
                      <br />
                      <strong>Off:</strong> Result appears as its own image in the gallery.
                    </p>
                  </TooltipContent>
                </Tooltip>
                <Switch
                  id="create-as-variant"
                  checked={!createAsGeneration}
                  onCheckedChange={(checked) => onCreateAsGenerationChange(!checked)}
                  className={cn(isMobile && "scale-90")}
                />
              </div>
            </div>
          )}

          {/* Reposition Mode Buttons - Two options: Save or Generate with AI */}
          {editMode === 'reposition' ? (
            <div className={cn("flex gap-2", isMobile && "flex-row")}>
              {/* Save as Variant Button */}
              <Button
                variant="secondary"
                size={buttonSize}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSaveAsVariant();
                }}
                disabled={
                  !hasTransformChanges ||
                  isSavingAsVariant ||
                  saveAsVariantSuccess ||
                  isGeneratingReposition ||
                  repositionGenerateSuccess
                }
                className={cn(
                  "flex-1",
                  isMobile && "h-9 text-xs",
                  saveAsVariantSuccess && "bg-green-600 hover:bg-green-600 text-white"
                )}
              >
                {isSavingAsVariant ? (
                  <>
                    <Loader2 className={`${iconSize} mr-1 animate-spin`} />
                    {isMobile ? '...' : 'Saving...'}
                  </>
                ) : saveAsVariantSuccess ? (
                  <>
                    <CheckCircle className={`${iconSize} mr-1`} />
                    {isMobile ? '✓' : 'Saved!'}
                  </>
                ) : (
                  <>
                    <Save className={`${iconSize} mr-1`} />
                    Save
                  </>
                )}
              </Button>

              {/* Fill Edges with AI Button */}
              <Button
                variant="default"
                size={buttonSize}
                onClick={(e) => {
                  e.stopPropagation();
                  handleGenerateReposition();
                }}
                disabled={
                  !hasTransformChanges ||
                  isGeneratingReposition ||
                  repositionGenerateSuccess ||
                  isSavingAsVariant ||
                  saveAsVariantSuccess
                }
                className={cn(
                  "flex-1",
                  isMobile && "h-9 text-xs",
                  repositionGenerateSuccess && "bg-green-600 hover:bg-green-600"
                )}
              >
                {isGeneratingReposition ? (
                  <>
                    <Loader2 className={`${iconSize} mr-1 animate-spin`} />
                    {isMobile ? '...' : 'Generating...'}
                  </>
                ) : repositionGenerateSuccess ? (
                  <>
                    <CheckCircle className={`${iconSize} mr-1`} />
                    {isMobile ? '✓' : 'Success!'}
                  </>
                ) : (
                  <>
                    <Move className={`${iconSize} mr-1`} />
                    {isMobile ? 'Fill AI' : 'Fill edges with AI'}
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
                isMobile && "h-9 text-xs",
                img2imgGenerateSuccess && "bg-green-600 hover:bg-green-600"
              )}
            >
              {isGeneratingImg2Img ? (
                <>
                  <Loader2 className={`${iconSize} mr-1.5 animate-spin`} />
                  {isMobile ? 'Creating...' : 'Generating...'}
                </>
              ) : img2imgGenerateSuccess ? (
                <>
                  <CheckCircle className={`${iconSize} mr-1.5`} />
                  {isMobile ? 'Submitted ✓' : 'Submitted, results will appear below'}
                </>
              ) : (
                <>
                  <Wand2 className={`${iconSize} mr-1.5`} />
                  {isMobile ? 'Transform' : 'Transform Image'}
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
                isMobile && "h-9 text-xs",
                (inpaintGenerateSuccess || magicEditTasksCreated) && "bg-green-600 hover:bg-green-600"
              )}
            >
              {(isGeneratingInpaint || isCreatingMagicEditTasks) ? (
                <>
                  <Loader2 className={`${iconSize} mr-1.5 animate-spin`} />
                  {isMobile ? 'Creating...' : 'Generating...'}
                </>
              ) : (inpaintGenerateSuccess || magicEditTasksCreated) ? (
                <>
                  <CheckCircle className={`${iconSize} mr-1.5`} />
                  {isMobile ? 'Submitted ✓' : (editMode === 'inpaint' ? 'Success!' : 'Submitted, results will appear below')}
                </>
              ) : editMode === 'inpaint' ? (
                <>
                  <Paintbrush className={`${iconSize} mr-1.5`} />
                  {isMobile ? 'Generate' : 'Generate inpainted image'}
                </>
              ) : editMode === 'annotate' ? (
                <>
                  <Pencil className={`${iconSize} mr-1.5`} />
                  {isMobile ? 'Generate' : 'Generate based on annotations'}
                </>
              ) : (
                <>
                  <Sparkles className={`${iconSize} mr-1.5`} />
                  {isMobile ? 'Generate' : 'Generate text edit'}
                </>
              )}
            </Button>
          )}
      </EditPanelLayout>

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

      {/* Edit Mode LoRA Selector Modal (for text, inpaint, annotate, reposition modes) */}
      {editLoraManager && (
        <Suspense fallback={null}>
          <LoraSelectorModal
            isOpen={editLoraManager.isLoraModalOpen}
            onClose={() => editLoraManager.setIsLoraModalOpen(false)}
            loras={availableLoras}
            onAddLora={editLoraManager.handleAddLora}
            onRemoveLora={editLoraManager.handleRemoveLora}
            onUpdateLoraStrength={editLoraManager.handleLoraStrengthChange}
            selectedLoras={editLoraManager.selectedLoras.map(lora => {
              const fullLora = availableLoras.find(l => l['Model ID'] === lora.id);
              return {
                ...fullLora,
                "Model ID": lora.id,
                Name: lora.name,
                strength: lora.strength,
              } as LoraModel & { strength: number };
            })}
            lora_type="Qwen Edit"
          />
        </Suspense>
      )}
    </>
  );
};
