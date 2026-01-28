/**
 * useLightboxLayoutProps - Builds all layout props for MediaLightbox
 *
 * Centralizes the building of props objects for layout components
 * (DesktopSidePanelLayout, MobileStackedLayout, CenteredLayout).
 * This reduces duplication and keeps the main component cleaner.
 */

import { useMemo, RefObject } from 'react';
import type { GenerationRow } from '@/types/shots';

// Input types - all the values needed to build layout props
export interface UseLightboxLayoutPropsInput {
  // Core
  onClose: () => void;
  readOnly: boolean;
  selectedProjectId: string | null;
  isMobile: boolean;
  actualGenerationId: string;

  // Media
  media: GenerationRow;
  isVideo: boolean;
  effectiveMediaUrl: string;
  effectiveVideoUrl: string;
  imageDimensions: { width: number; height: number } | null;
  setImageDimensions: (dims: { width: number; height: number }) => void;
  effectiveImageDimensions: { width: number; height: number } | null;

  // Variants
  variants: any[] | undefined;
  activeVariant: any;
  primaryVariant: any;
  isLoadingVariants: boolean;
  setActiveVariantId: (id: string) => void;
  setPrimaryVariant: (id: string) => void;
  deleteVariant: (id: string) => void;
  promoteSuccess: boolean;
  isPromoting: boolean;
  handlePromoteToGeneration: (variantId: string) => Promise<void>;
  isMakingMainVariant: boolean;
  canMakeMainVariant: boolean;
  handleMakeMainVariant: () => Promise<void>;
  variantParamsToLoad: any;
  setVariantParamsToLoad: (params: any) => void;
  variantsSectionRef: RefObject<HTMLDivElement>;

  // Video edit
  isVideoTrimModeActive: boolean;
  isVideoEditModeActive: boolean;
  isInVideoEditMode: boolean;
  videoEditSubMode: 'trim' | 'replace' | 'regenerate' | null;
  trimVideoRef: RefObject<HTMLVideoElement>;
  trimState: any;
  setStartTrim: (value: number) => void;
  setEndTrim: (value: number) => void;
  resetTrim: () => void;
  trimmedDuration: number;
  hasTrimChanges: boolean;
  saveTrimmedVideo: () => Promise<void>;
  isSavingTrim: boolean;
  trimSaveProgress: number;
  trimSaveError: string | null;
  trimSaveSuccess: boolean;
  setVideoDuration: (duration: number) => void;
  setTrimCurrentTime: (time: number) => void;
  trimCurrentTime: number;
  videoEditing: any;
  handleEnterVideoTrimMode: () => void;
  handleEnterVideoReplaceMode: () => void;
  handleEnterVideoRegenerateMode: () => void;
  handleExitVideoEditMode: () => void;
  handleEnterVideoEditMode: () => void;
  regenerateFormProps: any;

  // Edit mode
  isInpaintMode: boolean;
  isAnnotateMode: boolean;
  isSpecialEditMode: boolean;
  editMode: string;
  setEditMode: (mode: string) => void;
  setIsInpaintMode: (value: boolean) => void;
  brushStrokes: any[];
  currentStroke: any;
  isDrawing: boolean;
  isEraseMode: boolean;
  setIsEraseMode: (value: boolean) => void;
  brushSize: number;
  setBrushSize: (value: number) => void;
  annotationMode: string | null;
  setAnnotationMode: (mode: string | null) => void;
  selectedShapeId: string | null;
  handleKonvaPointerDown: (e: any) => void;
  handleKonvaPointerMove: (e: any) => void;
  handleKonvaPointerUp: (e: any) => void;
  handleShapeClick: (e: any) => void;
  strokeOverlayRef: RefObject<any>;
  handleUndo: () => void;
  handleClearMask: () => void;
  getDeleteButtonPosition: () => { x: number; y: number } | null;
  handleToggleFreeForm: () => void;
  handleDeleteSelected: () => void;
  isRepositionDragging: boolean;
  repositionDragHandlers: any;
  getTransformStyle: () => string;
  repositionTransform: any;
  setTranslateX: (value: number) => void;
  setTranslateY: (value: number) => void;
  setScale: (value: number) => void;
  setRotation: (value: number) => void;
  toggleFlipH: () => void;
  toggleFlipV: () => void;
  resetTransform: () => void;
  imageContainerRef: RefObject<HTMLDivElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
  maskCanvasRef: RefObject<HTMLCanvasElement>;
  isFlippedHorizontally: boolean;
  isSaving: boolean;
  handleExitInpaintMode: () => void;
  inpaintPanelPosition: string;
  setInpaintPanelPosition: (position: string) => void;

  // Edit form props
  inpaintPrompt: string;
  setInpaintPrompt: (value: string) => void;
  inpaintNumGenerations: number;
  setInpaintNumGenerations: (value: number) => void;
  loraMode: string;
  setLoraMode: (mode: string) => void;
  customLoraUrl: string;
  setCustomLoraUrl: (url: string) => void;
  isGeneratingInpaint: boolean;
  inpaintGenerateSuccess: boolean;
  isCreatingMagicEditTasks: boolean;
  magicEditTasksCreated: boolean;
  handleExitMagicEditMode: () => void;
  handleUnifiedGenerate: () => Promise<void>;
  handleGenerateAnnotatedEdit: () => Promise<void>;
  handleGenerateReposition: () => Promise<void>;
  isGeneratingReposition: boolean;
  repositionGenerateSuccess: boolean;
  hasTransformChanges: boolean;
  handleSaveAsVariant: () => Promise<void>;
  isSavingAsVariant: boolean;
  saveAsVariantSuccess: boolean;
  createAsGeneration: boolean;
  setCreateAsGeneration: (value: boolean) => void;

  // Img2Img props
  img2imgPrompt: string;
  setImg2imgPrompt: (value: string) => void;
  img2imgStrength: number;
  setImg2imgStrength: (value: number) => void;
  enablePromptExpansion: boolean;
  setEnablePromptExpansion: (value: boolean) => void;
  isGeneratingImg2Img: boolean;
  img2imgGenerateSuccess: boolean;
  handleGenerateImg2Img: () => Promise<void>;
  img2imgLoraManager: any;
  availableLoras: any[];
  editLoraManager: any;
  advancedSettings: any;
  setAdvancedSettings: (settings: any) => void;
  isLocalGeneration: boolean;
  qwenEditModel: string;
  setQwenEditModel: (model: string) => void;

  // Info panel props
  showImageEditTools: boolean;
  adjustedTaskDetailsData: any;
  generationName: string;
  handleGenerationNameChange: (name: string) => void;
  isEditingGenerationName: boolean;
  setIsEditingGenerationName: (value: boolean) => void;
  derivedItems: any[];
  derivedGenerations: any[];
  paginatedDerived: any[];
  derivedPage: number;
  derivedTotalPages: number;
  setDerivedPage: (page: number) => void;
  replaceImages: boolean;
  setReplaceImages: (value: boolean) => void;
  sourceGenerationData: any;
  sourcePrimaryVariant: any;
  onOpenExternalGeneration?: (id: string, derivedContext?: string[]) => Promise<void>;

  // Navigation
  showNavigation: boolean;
  hasNext: boolean;
  hasPrevious: boolean;
  handleSlotNavNext: () => void;
  handleSlotNavPrev: () => void;
  swipeNavigation: any;

  // Panel
  effectiveTasksPaneOpen: boolean;
  effectiveTasksPaneWidth: number;

  // Button group props (pre-built)
  buttonGroupProps: any;

  // Workflow props
  allShots: any[];
  selectedShotId?: string;
  shotId?: string;
  onAddToShot?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onDelete?: (id: string) => void;
  onApplySettings?: (metadata: any) => void;
  onShotChange?: (shotId: string) => void;
  onCreateShot?: (shotName: string, files: File[]) => Promise<{ shotId?: string; shotName?: string } | void>;
  showTickForImageId?: string | null;
  showTickForSecondaryImageId?: string | null;
  onShowTick?: (imageId: string) => void;
  onShowSecondaryTick?: (imageId: string) => void;
  onOptimisticPositioned?: (mediaId: string, shotId: string) => void;
  onOptimisticUnpositioned?: (mediaId: string, shotId: string) => void;
  isAlreadyPositionedInSelectedShot: boolean;
  isAlreadyAssociatedWithoutPosition: boolean;
  contentRef: RefObject<HTMLDivElement>;
  handleApplySettings: () => void;
  handleNavigateToShotFromSelector: (shot: any) => void;
  handleAddVariantAsNewGenerationToShot: (shotId: string, variantId: string, currentTimelineFrame?: number) => Promise<boolean>;
  handleReplaceInShot: () => Promise<void>;
  isDeleting?: string | null;
  handleDelete: () => void;

  // Adjacent segment navigation
  adjacentSegments?: any;

  // Segment slot mode (for constituent image navigation)
  segmentSlotMode?: any;

  // Pending tasks count (for showing in InfoPanel)
  pendingTaskCount?: number;
}

export interface UseLightboxLayoutPropsReturn {
  controlsPanelProps: any;
  workflowBarProps: any;
  floatingToolProps: any;
  sidePanelLayoutProps: any;
  centeredLayoutProps: any;
}

export function useLightboxLayoutProps(
  input: UseLightboxLayoutPropsInput
): UseLightboxLayoutPropsReturn {
  // Build ControlsPanel props (used by DesktopSidePanelLayout and MobileStackedLayout)
  const controlsPanelProps = useMemo(() => ({
    isInVideoEditMode: input.isInVideoEditMode,
    isSpecialEditMode: input.isSpecialEditMode,
    // VideoEditPanel props
    videoEditSubMode: input.videoEditSubMode,
    onEnterTrimMode: input.handleEnterVideoTrimMode,
    onEnterReplaceMode: input.handleEnterVideoReplaceMode,
    onEnterRegenerateMode: input.handleEnterVideoRegenerateMode,
    onExitVideoEditMode: input.handleExitVideoEditMode,
    trimState: input.trimState,
    onStartTrimChange: input.setStartTrim,
    onEndTrimChange: input.setEndTrim,
    onResetTrim: input.resetTrim,
    trimmedDuration: input.trimmedDuration,
    hasTrimChanges: input.hasTrimChanges,
    onSaveTrim: input.saveTrimmedVideo,
    isSavingTrim: input.isSavingTrim,
    trimSaveProgress: input.trimSaveProgress,
    trimSaveError: input.trimSaveError,
    trimSaveSuccess: input.trimSaveSuccess,
    videoUrl: input.effectiveVideoUrl,
    trimCurrentTime: input.trimCurrentTime,
    trimVideoRef: input.trimVideoRef,
    videoEditing: input.videoEditing,
    projectId: input.selectedProjectId,
    regenerateFormProps: input.regenerateFormProps,
    // EditModePanel props
    sourceGenerationData: input.sourceGenerationData,
    onOpenExternalGeneration: input.onOpenExternalGeneration,
    allShots: input.allShots,
    isCurrentMediaPositioned: input.isAlreadyPositionedInSelectedShot,
    onReplaceInShot: input.handleReplaceInShot,
    sourcePrimaryVariant: input.sourcePrimaryVariant,
    onMakeMainVariant: input.handleMakeMainVariant,
    canMakeMainVariant: input.canMakeMainVariant,
    editMode: input.editMode,
    setEditMode: input.setEditMode,
    setIsInpaintMode: input.setIsInpaintMode,
    inpaintPrompt: input.inpaintPrompt,
    setInpaintPrompt: input.setInpaintPrompt,
    inpaintNumGenerations: input.inpaintNumGenerations,
    setInpaintNumGenerations: input.setInpaintNumGenerations,
    loraMode: input.loraMode,
    setLoraMode: input.setLoraMode,
    customLoraUrl: input.customLoraUrl,
    setCustomLoraUrl: input.setCustomLoraUrl,
    isGeneratingInpaint: input.isGeneratingInpaint,
    inpaintGenerateSuccess: input.inpaintGenerateSuccess,
    isCreatingMagicEditTasks: input.isCreatingMagicEditTasks,
    magicEditTasksCreated: input.magicEditTasksCreated,
    brushStrokes: input.brushStrokes,
    handleExitMagicEditMode: input.handleExitMagicEditMode,
    handleUnifiedGenerate: input.handleUnifiedGenerate,
    handleGenerateAnnotatedEdit: input.handleGenerateAnnotatedEdit,
    handleGenerateReposition: input.handleGenerateReposition,
    isGeneratingReposition: input.isGeneratingReposition,
    repositionGenerateSuccess: input.repositionGenerateSuccess,
    hasTransformChanges: input.hasTransformChanges,
    handleSaveAsVariant: input.handleSaveAsVariant,
    isSavingAsVariant: input.isSavingAsVariant,
    saveAsVariantSuccess: input.saveAsVariantSuccess,
    createAsGeneration: input.createAsGeneration,
    onCreateAsGenerationChange: input.setCreateAsGeneration,
    // Img2Img props
    img2imgPrompt: input.img2imgPrompt,
    setImg2imgPrompt: input.setImg2imgPrompt,
    img2imgStrength: input.img2imgStrength,
    setImg2imgStrength: input.setImg2imgStrength,
    enablePromptExpansion: input.enablePromptExpansion,
    setEnablePromptExpansion: input.setEnablePromptExpansion,
    isGeneratingImg2Img: input.isGeneratingImg2Img,
    img2imgGenerateSuccess: input.img2imgGenerateSuccess,
    handleGenerateImg2Img: input.handleGenerateImg2Img,
    img2imgLoraManager: input.img2imgLoraManager,
    availableLoras: input.availableLoras,
    editLoraManager: input.editLoraManager,
    // Advanced settings for two-pass generation
    advancedSettings: input.advancedSettings,
    setAdvancedSettings: input.setAdvancedSettings,
    isLocalGeneration: input.isLocalGeneration,
    // Model selection for cloud mode
    qwenEditModel: input.qwenEditModel,
    setQwenEditModel: input.setQwenEditModel,
    // InfoPanel props
    isVideo: input.isVideo,
    showImageEditTools: input.showImageEditTools,
    readOnly: input.readOnly,
    isInpaintMode: input.isInpaintMode,
    onExitInpaintMode: input.handleExitInpaintMode,
    onEnterInpaintMode: () => {
      input.setIsInpaintMode(true);
      input.setEditMode('inpaint');
    },
    onEnterVideoEditMode: input.handleEnterVideoEditMode,
    onClose: input.onClose,
    taskDetailsData: input.adjustedTaskDetailsData,
    taskId: input.adjustedTaskDetailsData?.taskId || (input.media as any)?.source_task_id || null,
    generationName: input.generationName,
    onGenerationNameChange: input.handleGenerationNameChange,
    isEditingGenerationName: input.isEditingGenerationName,
    onEditingGenerationNameChange: input.setIsEditingGenerationName,
    derivedItems: input.derivedItems,
    replaceImages: input.replaceImages,
    onReplaceImagesChange: input.setReplaceImages,
    onSwitchToPrimary: input.primaryVariant ? () => input.setActiveVariantId(input.primaryVariant.id) : undefined,
    variantsSectionRef: input.variantsSectionRef,
    // Shared props
    currentMediaId: input.media.id,
    currentShotId: input.selectedShotId || input.shotId,
    derivedGenerations: input.derivedGenerations,
    paginatedDerived: input.paginatedDerived,
    derivedPage: input.derivedPage,
    derivedTotalPages: input.derivedTotalPages,
    onSetDerivedPage: input.setDerivedPage,
    variants: input.variants,
    activeVariant: input.activeVariant,
    primaryVariant: input.primaryVariant,
    onVariantSelect: input.setActiveVariantId,
    onMakePrimary: input.setPrimaryVariant,
    isLoadingVariants: input.isLoadingVariants,
    onPromoteToGeneration: input.isVideo ? undefined : input.handlePromoteToGeneration,
    isPromoting: input.isPromoting,
    onDeleteVariant: input.deleteVariant,
    onLoadVariantSettings: input.setVariantParamsToLoad,
    pendingTaskCount: input.pendingTaskCount,
  }), [
    input.isInVideoEditMode, input.isSpecialEditMode, input.videoEditSubMode,
    input.handleEnterVideoTrimMode, input.handleEnterVideoReplaceMode,
    input.handleEnterVideoRegenerateMode, input.handleExitVideoEditMode,
    input.trimState, input.setStartTrim, input.setEndTrim, input.resetTrim,
    input.trimmedDuration, input.hasTrimChanges, input.saveTrimmedVideo,
    input.isSavingTrim, input.trimSaveProgress, input.trimSaveError,
    input.trimSaveSuccess, input.effectiveVideoUrl, input.trimCurrentTime,
    input.trimVideoRef, input.videoEditing, input.selectedProjectId,
    input.regenerateFormProps, input.sourceGenerationData, input.onOpenExternalGeneration,
    input.allShots, input.isAlreadyPositionedInSelectedShot, input.handleReplaceInShot,
    input.sourcePrimaryVariant, input.handleMakeMainVariant, input.canMakeMainVariant,
    input.editMode, input.setEditMode, input.setIsInpaintMode, input.inpaintPrompt,
    input.setInpaintPrompt, input.inpaintNumGenerations, input.setInpaintNumGenerations,
    input.loraMode, input.setLoraMode, input.customLoraUrl, input.setCustomLoraUrl,
    input.isGeneratingInpaint, input.inpaintGenerateSuccess, input.isCreatingMagicEditTasks,
    input.magicEditTasksCreated, input.brushStrokes, input.handleExitMagicEditMode,
    input.handleUnifiedGenerate, input.handleGenerateAnnotatedEdit, input.handleGenerateReposition,
    input.isGeneratingReposition, input.repositionGenerateSuccess, input.hasTransformChanges,
    input.handleSaveAsVariant, input.isSavingAsVariant, input.saveAsVariantSuccess,
    input.createAsGeneration, input.setCreateAsGeneration, input.img2imgPrompt,
    input.setImg2imgPrompt, input.img2imgStrength, input.setImg2imgStrength,
    input.enablePromptExpansion, input.setEnablePromptExpansion, input.isGeneratingImg2Img,
    input.img2imgGenerateSuccess, input.handleGenerateImg2Img, input.img2imgLoraManager,
    input.availableLoras, input.editLoraManager, input.advancedSettings, input.setAdvancedSettings,
    input.isLocalGeneration, input.qwenEditModel, input.setQwenEditModel, input.isVideo,
    input.showImageEditTools, input.readOnly, input.isInpaintMode, input.handleExitInpaintMode,
    input.handleEnterVideoEditMode, input.onClose, input.adjustedTaskDetailsData,
    input.generationName, input.handleGenerationNameChange, input.isEditingGenerationName,
    input.setIsEditingGenerationName, input.derivedItems, input.replaceImages, input.setReplaceImages,
    input.primaryVariant, input.setActiveVariantId, input.variantsSectionRef, input.media.id,
    input.selectedShotId, input.shotId, input.derivedGenerations, input.paginatedDerived,
    input.derivedPage, input.derivedTotalPages, input.setDerivedPage, input.variants,
    input.activeVariant, input.isLoadingVariants, input.handlePromoteToGeneration,
    input.isPromoting, input.deleteVariant, input.setVariantParamsToLoad,
    input.pendingTaskCount,
  ]);

  // Build workflow bar props (shared across all layouts)
  const workflowBarProps = useMemo(() => ({
    onAddToShot: input.onAddToShot,
    onDelete: input.onDelete,
    onApplySettings: input.onApplySettings,
    allShots: input.allShots,
    selectedShotId: input.selectedShotId,
    onShotChange: input.onShotChange,
    onCreateShot: input.onCreateShot,
    isAlreadyPositionedInSelectedShot: input.isAlreadyPositionedInSelectedShot,
    isAlreadyAssociatedWithoutPosition: input.isAlreadyAssociatedWithoutPosition,
    showTickForImageId: input.showTickForImageId,
    showTickForSecondaryImageId: input.showTickForSecondaryImageId,
    onAddToShotWithoutPosition: input.onAddToShotWithoutPosition,
    onShowTick: input.onShowTick,
    onShowSecondaryTick: input.onShowSecondaryTick,
    onOptimisticPositioned: input.onOptimisticPositioned,
    onOptimisticUnpositioned: input.onOptimisticUnpositioned,
    contentRef: input.contentRef,
    handleApplySettings: input.handleApplySettings,
    handleNavigateToShotFromSelector: input.handleNavigateToShotFromSelector,
    handleAddVariantAsNewGenerationToShot: input.handleAddVariantAsNewGenerationToShot,
  }), [
    input.onAddToShot, input.onDelete, input.onApplySettings, input.allShots,
    input.selectedShotId, input.onShotChange, input.onCreateShot,
    input.isAlreadyPositionedInSelectedShot, input.isAlreadyAssociatedWithoutPosition,
    input.showTickForImageId, input.showTickForSecondaryImageId,
    input.onAddToShotWithoutPosition, input.onShowTick, input.onShowSecondaryTick,
    input.onOptimisticPositioned, input.onOptimisticUnpositioned, input.contentRef,
    input.handleApplySettings, input.handleNavigateToShotFromSelector,
    input.handleAddVariantAsNewGenerationToShot,
  ]);

  // Build floating tool props (for edit mode controls)
  const floatingToolProps = useMemo(() => ({
    editMode: input.editMode,
    setEditMode: input.setEditMode,
    brushSize: input.brushSize,
    isEraseMode: input.isEraseMode,
    setBrushSize: input.setBrushSize,
    setIsEraseMode: input.setIsEraseMode,
    annotationMode: input.annotationMode,
    setAnnotationMode: input.setAnnotationMode,
    repositionTransform: input.repositionTransform,
    setTranslateX: input.setTranslateX,
    setTranslateY: input.setTranslateY,
    setScale: input.setScale,
    setRotation: input.setRotation,
    toggleFlipH: input.toggleFlipH,
    toggleFlipV: input.toggleFlipV,
    resetTransform: input.resetTransform,
    effectiveImageDimensions: input.effectiveImageDimensions,
    brushStrokes: input.brushStrokes,
    handleUndo: input.handleUndo,
    handleClearMask: input.handleClearMask,
    inpaintPanelPosition: input.inpaintPanelPosition,
    setInpaintPanelPosition: input.setInpaintPanelPosition,
  }), [
    input.editMode, input.setEditMode, input.brushSize, input.isEraseMode,
    input.setBrushSize, input.setIsEraseMode, input.annotationMode, input.setAnnotationMode,
    input.repositionTransform, input.setTranslateX, input.setTranslateY, input.setScale,
    input.setRotation, input.toggleFlipH, input.toggleFlipV, input.resetTransform,
    input.effectiveImageDimensions, input.brushStrokes, input.handleUndo, input.handleClearMask,
    input.inpaintPanelPosition, input.setInpaintPanelPosition,
  ]);

  // Build side panel layout props (for Desktop and Mobile stacked layouts)
  const sidePanelLayoutProps = useMemo(() => ({
    // Core
    onClose: input.onClose,
    readOnly: input.readOnly,
    selectedProjectId: input.selectedProjectId,
    isMobile: input.isMobile,
    actualGenerationId: input.actualGenerationId,
    // Media
    media: input.media,
    isVideo: input.isVideo,
    effectiveMediaUrl: input.effectiveMediaUrl,
    effectiveVideoUrl: input.effectiveVideoUrl,
    imageDimensions: input.imageDimensions,
    setImageDimensions: input.setImageDimensions,
    effectiveImageDimensions: input.effectiveImageDimensions,
    // Variants
    variants: input.variants,
    activeVariant: input.activeVariant,
    primaryVariant: input.primaryVariant,
    isLoadingVariants: input.isLoadingVariants,
    setActiveVariantId: input.setActiveVariantId,
    setPrimaryVariant: input.setPrimaryVariant,
    deleteVariant: input.deleteVariant,
    promoteSuccess: input.promoteSuccess,
    isPromoting: input.isPromoting,
    handlePromoteToGeneration: input.handlePromoteToGeneration,
    isMakingMainVariant: input.isMakingMainVariant,
    canMakeMainVariant: input.canMakeMainVariant,
    handleMakeMainVariant: input.handleMakeMainVariant,
    variantParamsToLoad: input.variantParamsToLoad,
    setVariantParamsToLoad: input.setVariantParamsToLoad,
    variantsSectionRef: input.variantsSectionRef,
    // Video edit
    isVideoTrimModeActive: input.isVideoTrimModeActive,
    isVideoEditModeActive: input.isVideoEditModeActive,
    videoEditSubMode: input.videoEditSubMode,
    trimVideoRef: input.trimVideoRef,
    trimState: input.trimState,
    setVideoDuration: input.setVideoDuration,
    setTrimCurrentTime: input.setTrimCurrentTime,
    videoEditing: input.videoEditing,
    // Edit mode
    isInpaintMode: input.isInpaintMode,
    isAnnotateMode: input.isAnnotateMode,
    isSpecialEditMode: input.isSpecialEditMode,
    editMode: input.editMode,
    brushStrokes: input.brushStrokes,
    currentStroke: input.currentStroke,
    isDrawing: input.isDrawing,
    isEraseMode: input.isEraseMode,
    setIsEraseMode: input.setIsEraseMode,
    brushSize: input.brushSize,
    setBrushSize: input.setBrushSize,
    annotationMode: input.annotationMode,
    setAnnotationMode: input.setAnnotationMode,
    selectedShapeId: input.selectedShapeId,
    handleKonvaPointerDown: input.handleKonvaPointerDown,
    handleKonvaPointerMove: input.handleKonvaPointerMove,
    handleKonvaPointerUp: input.handleKonvaPointerUp,
    handleShapeClick: input.handleShapeClick,
    strokeOverlayRef: input.strokeOverlayRef,
    handleUndo: input.handleUndo,
    handleClearMask: input.handleClearMask,
    getDeleteButtonPosition: input.getDeleteButtonPosition,
    handleToggleFreeForm: input.handleToggleFreeForm,
    handleDeleteSelected: input.handleDeleteSelected,
    isRepositionDragging: input.isRepositionDragging,
    repositionDragHandlers: input.repositionDragHandlers,
    getTransformStyle: input.getTransformStyle,
    imageContainerRef: input.imageContainerRef,
    canvasRef: input.canvasRef,
    maskCanvasRef: input.maskCanvasRef,
    isFlippedHorizontally: input.isFlippedHorizontally,
    isSaving: input.isSaving,
    // Navigation
    showNavigation: input.showNavigation,
    hasNext: input.hasNext,
    hasPrevious: input.hasPrevious,
    handleSlotNavNext: input.handleSlotNavNext,
    handleSlotNavPrev: input.handleSlotNavPrev,
    swipeNavigation: input.swipeNavigation,
    // Panel
    effectiveTasksPaneOpen: input.effectiveTasksPaneOpen,
    effectiveTasksPaneWidth: input.effectiveTasksPaneWidth,
    // Composed props
    buttonGroupProps: input.buttonGroupProps,
    workflowBarProps,
    floatingToolProps,
    controlsPanelProps,
    // Adjacent segment navigation
    adjacentSegments: input.adjacentSegments,
    // Segment slot mode (for constituent image navigation)
    segmentSlotMode: input.segmentSlotMode,
  }), [
    input.onClose, input.readOnly, input.selectedProjectId, input.isMobile,
    input.actualGenerationId, input.media, input.isVideo, input.effectiveMediaUrl,
    input.effectiveVideoUrl, input.imageDimensions, input.setImageDimensions,
    input.effectiveImageDimensions, input.variants, input.activeVariant, input.primaryVariant,
    input.isLoadingVariants, input.setActiveVariantId, input.setPrimaryVariant,
    input.deleteVariant, input.promoteSuccess, input.isPromoting, input.handlePromoteToGeneration,
    input.isMakingMainVariant, input.canMakeMainVariant, input.handleMakeMainVariant,
    input.variantParamsToLoad, input.setVariantParamsToLoad, input.variantsSectionRef,
    input.isVideoTrimModeActive, input.isVideoEditModeActive, input.videoEditSubMode,
    input.trimVideoRef, input.trimState, input.setVideoDuration, input.setTrimCurrentTime,
    input.videoEditing, input.isInpaintMode, input.isAnnotateMode, input.isSpecialEditMode,
    input.editMode, input.brushStrokes, input.currentStroke, input.isDrawing, input.isEraseMode,
    input.setIsEraseMode, input.brushSize, input.setBrushSize, input.annotationMode,
    input.setAnnotationMode, input.selectedShapeId, input.handleKonvaPointerDown,
    input.handleKonvaPointerMove, input.handleKonvaPointerUp, input.handleShapeClick,
    input.strokeOverlayRef, input.handleUndo, input.handleClearMask, input.getDeleteButtonPosition,
    input.handleToggleFreeForm, input.handleDeleteSelected, input.isRepositionDragging,
    input.repositionDragHandlers, input.getTransformStyle, input.imageContainerRef,
    input.canvasRef, input.maskCanvasRef, input.isFlippedHorizontally, input.isSaving,
    input.showNavigation, input.hasNext, input.hasPrevious, input.handleSlotNavNext,
    input.handleSlotNavPrev, input.swipeNavigation, input.effectiveTasksPaneOpen,
    input.effectiveTasksPaneWidth, input.buttonGroupProps, workflowBarProps,
    floatingToolProps, controlsPanelProps, input.adjacentSegments, input.segmentSlotMode,
  ]);

  // Build centered layout props (simpler, no controls panel)
  const centeredLayoutProps = useMemo(() => ({
    // Core
    onClose: input.onClose,
    readOnly: input.readOnly,
    selectedProjectId: input.selectedProjectId,
    isMobile: input.isMobile,
    actualGenerationId: input.actualGenerationId,
    // Media
    media: input.media,
    isVideo: input.isVideo,
    effectiveMediaUrl: input.effectiveMediaUrl,
    effectiveVideoUrl: input.effectiveVideoUrl,
    imageDimensions: input.imageDimensions,
    setImageDimensions: input.setImageDimensions,
    effectiveImageDimensions: input.effectiveImageDimensions,
    // Variants
    variants: input.variants,
    activeVariant: input.activeVariant,
    primaryVariant: input.primaryVariant,
    isLoadingVariants: input.isLoadingVariants,
    setActiveVariantId: input.setActiveVariantId,
    setPrimaryVariant: input.setPrimaryVariant,
    deleteVariant: input.deleteVariant,
    promoteSuccess: input.promoteSuccess,
    isPromoting: input.isPromoting,
    handlePromoteToGeneration: input.handlePromoteToGeneration,
    isMakingMainVariant: input.isMakingMainVariant,
    canMakeMainVariant: input.canMakeMainVariant,
    handleMakeMainVariant: input.handleMakeMainVariant,
    variantParamsToLoad: input.variantParamsToLoad,
    setVariantParamsToLoad: input.setVariantParamsToLoad,
    variantsSectionRef: input.variantsSectionRef,
    // Video edit (minimal for centered)
    isVideoTrimModeActive: input.isVideoTrimModeActive,
    isVideoEditModeActive: input.isVideoEditModeActive,
    videoEditSubMode: input.videoEditSubMode,
    trimVideoRef: input.trimVideoRef,
    trimState: input.trimState,
    setVideoDuration: input.setVideoDuration,
    setTrimCurrentTime: input.setTrimCurrentTime,
    videoEditing: input.videoEditing,
    // Edit mode
    isInpaintMode: input.isInpaintMode,
    isAnnotateMode: input.isAnnotateMode,
    isSpecialEditMode: input.isSpecialEditMode,
    editMode: input.editMode,
    brushStrokes: input.brushStrokes,
    currentStroke: input.currentStroke,
    isDrawing: input.isDrawing,
    isEraseMode: input.isEraseMode,
    setIsEraseMode: input.setIsEraseMode,
    brushSize: input.brushSize,
    setBrushSize: input.setBrushSize,
    annotationMode: input.annotationMode,
    setAnnotationMode: input.setAnnotationMode,
    selectedShapeId: input.selectedShapeId,
    handleKonvaPointerDown: input.handleKonvaPointerDown,
    handleKonvaPointerMove: input.handleKonvaPointerMove,
    handleKonvaPointerUp: input.handleKonvaPointerUp,
    handleShapeClick: input.handleShapeClick,
    strokeOverlayRef: input.strokeOverlayRef,
    handleUndo: input.handleUndo,
    handleClearMask: input.handleClearMask,
    getDeleteButtonPosition: input.getDeleteButtonPosition,
    handleToggleFreeForm: input.handleToggleFreeForm,
    handleDeleteSelected: input.handleDeleteSelected,
    isRepositionDragging: input.isRepositionDragging,
    repositionDragHandlers: input.repositionDragHandlers,
    getTransformStyle: input.getTransformStyle,
    imageContainerRef: input.imageContainerRef,
    canvasRef: input.canvasRef,
    maskCanvasRef: input.maskCanvasRef,
    isFlippedHorizontally: input.isFlippedHorizontally,
    isSaving: input.isSaving,
    // Navigation
    showNavigation: input.showNavigation,
    hasNext: input.hasNext,
    hasPrevious: input.hasPrevious,
    handleSlotNavNext: input.handleSlotNavNext,
    handleSlotNavPrev: input.handleSlotNavPrev,
    swipeNavigation: input.swipeNavigation,
    // Composed props
    buttonGroupProps: input.buttonGroupProps,
    workflowBarProps,
    // Workflow controls (below media)
    workflowControlsProps: {
      ...workflowBarProps,
      isDeleting: input.isDeleting,
      handleDelete: input.handleDelete,
    },
    // Adjacent segment navigation
    adjacentSegments: input.adjacentSegments,
    // Segment slot mode (for constituent image navigation)
    segmentSlotMode: input.segmentSlotMode,
  }), [
    input.onClose, input.readOnly, input.selectedProjectId, input.isMobile,
    input.actualGenerationId, input.media, input.isVideo, input.effectiveMediaUrl,
    input.effectiveVideoUrl, input.imageDimensions, input.setImageDimensions,
    input.effectiveImageDimensions, input.variants, input.activeVariant, input.primaryVariant,
    input.isLoadingVariants, input.setActiveVariantId, input.setPrimaryVariant,
    input.deleteVariant, input.promoteSuccess, input.isPromoting, input.handlePromoteToGeneration,
    input.isMakingMainVariant, input.canMakeMainVariant, input.handleMakeMainVariant,
    input.variantParamsToLoad, input.setVariantParamsToLoad, input.variantsSectionRef,
    input.isVideoTrimModeActive, input.isVideoEditModeActive, input.videoEditSubMode,
    input.trimVideoRef, input.trimState, input.setVideoDuration, input.setTrimCurrentTime,
    input.videoEditing, input.isInpaintMode, input.isAnnotateMode, input.isSpecialEditMode,
    input.editMode, input.brushStrokes, input.currentStroke, input.isDrawing, input.isEraseMode,
    input.setIsEraseMode, input.brushSize, input.setBrushSize, input.annotationMode,
    input.setAnnotationMode, input.selectedShapeId, input.handleKonvaPointerDown,
    input.handleKonvaPointerMove, input.handleKonvaPointerUp, input.handleShapeClick,
    input.strokeOverlayRef, input.handleUndo, input.handleClearMask, input.getDeleteButtonPosition,
    input.handleToggleFreeForm, input.handleDeleteSelected, input.isRepositionDragging,
    input.repositionDragHandlers, input.getTransformStyle, input.imageContainerRef,
    input.canvasRef, input.maskCanvasRef, input.isFlippedHorizontally, input.isSaving,
    input.showNavigation, input.hasNext, input.hasPrevious, input.handleSlotNavNext,
    input.handleSlotNavPrev, input.swipeNavigation, input.buttonGroupProps,
    workflowBarProps, input.isDeleting, input.handleDelete, input.adjacentSegments, input.segmentSlotMode,
  ]);

  return {
    controlsPanelProps,
    workflowBarProps,
    floatingToolProps,
    sidePanelLayoutProps,
    centeredLayoutProps,
  };
}
