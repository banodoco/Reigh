/**
 * useLightboxLayoutProps - Bundles all props needed by layout components
 *
 * This hook takes all the scattered state and handlers from MediaLightbox
 * and organizes them into the LightboxLayoutProps structure expected by
 * the layout components (DesktopSidePanelLayout, MobileStackedLayout, CenteredLayout).
 */

import { useMemo } from 'react';
import type { LightboxLayoutProps, WorkflowProps, EditPanelProps } from '../components/layouts/types';
import type { GenerationRow, Shot } from '@/types/shots';
import type { Variant } from '@/shared/hooks/useVariants';
import type { BrushStroke, AnnotationMode } from './useInpainting';
import type { EditMode, QwenEditModel } from './useGenerationEditSettings';
import type { LoraModel } from '@/shared/components/LoraSelectorModal';
import type { SegmentSlotModeProps } from '../types';

interface UseLightboxLayoutPropsParams {
  // Core
  onClose: () => void;
  readOnly: boolean;
  selectedProjectId: string | null;
  actualGenerationId: string;
  isMobile: boolean;
  isPortraitMode?: boolean;
  isTabletOrLarger?: boolean;

  // Media
  media: GenerationRow;
  isVideo: boolean;
  effectiveMediaUrl: string;
  effectiveVideoUrl: string;
  imageDimensions: { width: number; height: number } | null;
  setImageDimensions: (dims: { width: number; height: number }) => void;

  // Variants
  variants: Variant[] | undefined;
  activeVariant: Variant | undefined;
  primaryVariant: Variant | undefined;
  isLoadingVariants: boolean;
  setActiveVariantId: (id: string) => void;
  setPrimaryVariant: (id: string) => Promise<void>;
  deleteVariant: (id: string) => Promise<void>;
  refetchVariants: () => void;
  isViewingNonPrimaryVariant: boolean;
  promoteSuccess: boolean;
  isPromoting: boolean;
  handlePromoteToGeneration: (variantId: string) => void;
  isMakingMainVariant: boolean;
  canMakeMainVariant: boolean;
  handleMakeMainVariant: () => void;
  variantParamsToLoad: Record<string, any> | null;
  setVariantParamsToLoad: (params: Record<string, any> | null) => void;
  variantsSectionRef: React.RefObject<HTMLDivElement>;

  // Video edit
  isVideoTrimModeActive: boolean;
  isVideoEditModeActive: boolean;
  videoEditSubMode: 'trim' | 'replace' | 'regenerate' | null;
  setVideoEditSubMode: (mode: 'trim' | 'replace' | 'regenerate' | null) => void;
  trimVideoRef: React.RefObject<HTMLVideoElement>;
  trimCurrentTime: number;
  setTrimCurrentTime: (time: number) => void;
  trimState: {
    videoDuration: number;
    startTime: number;
    endTime: number;
    setStartTime: (time: number) => void;
    setEndTime: (time: number) => void;
  };
  setVideoDuration: (duration: number) => void;
  createAsGeneration: boolean;
  setCreateAsGeneration: (value: boolean) => void;
  videoEditing: any | null;

  // Edit mode
  isInpaintMode: boolean;
  isAnnotateMode: boolean;
  isSpecialEditMode: boolean;
  editMode: EditMode | null;
  setEditMode: (mode: EditMode | null) => void;
  brushStrokes: BrushStroke[];
  currentStroke: BrushStroke | null;
  isDrawing: boolean;
  isEraseMode: boolean;
  setIsEraseMode: (value: boolean) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
  annotationMode: AnnotationMode | null;
  setAnnotationMode: (mode: AnnotationMode | null) => void;
  selectedShapeId: string | null;
  handleKonvaPointerDown: (e: any) => void;
  handleKonvaPointerMove: (e: any) => void;
  handleKonvaPointerUp: (e: any) => void;
  handleShapeClick: (id: string) => void;
  strokeOverlayRef: React.RefObject<any>;
  handleUndo: () => void;
  handleClearMask: () => void;
  getDeleteButtonPosition: () => { x: number; y: number } | null;
  handleToggleFreeForm: () => void;
  handleDeleteSelected: () => void;
  isRepositionDragging: boolean;
  repositionDragHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  } | null;
  getTransformStyle: () => React.CSSProperties;
  imageContainerRef: React.RefObject<HTMLDivElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  maskCanvasRef: React.RefObject<HTMLCanvasElement>;
  isFlippedHorizontally: boolean;
  isSaving: boolean;

  // Navigation
  showNavigation: boolean;
  hasNext: boolean;
  hasPrevious: boolean;
  handleSlotNavNext: () => void;
  handleSlotNavPrev: () => void;
  swipeNavigation: {
    isSwiping: boolean;
    swipeOffset: number;
    swipeHandlers: {
      onTouchStart: (e: React.TouchEvent) => void;
      onTouchMove: (e: React.TouchEvent) => void;
      onTouchEnd: (e: React.TouchEvent) => void;
    };
  };

  // Panel
  showTaskDetails: boolean;
  setShowTaskDetails: (show: boolean) => void;
  effectiveTasksPaneOpen: boolean;
  effectiveTasksPaneWidth: number;
  isTasksPaneLocked: boolean;
  setIsTasksPaneLocked: (locked: boolean) => void;
  cancellableTaskCount: number;

  // Button groups
  buttonGroupProps: {
    topLeft: any;
    topRight: any;
    bottomLeft: any;
    bottomRight: any;
  };

  // Workflow
  allShots: Shot[];
  selectedShotId: string | null;
  shotId?: string;
  onShotChange: (shotId: string | null) => void;
  onCreateShot: () => Promise<string | null>;
  onAddToShot?: (generationId: string, shotId: string) => void;
  onAddToShotWithoutPosition?: (generationId: string, shotId: string) => void;
  onApplySettings?: (generationId: string) => void;
  handleApplySettings: () => void;
  onDelete?: (generationId: string) => void;
  handleDelete: () => void;
  isDeleting: boolean;
  onNavigateToShot?: (shotId: string) => void;
  handleNavigateToShotFromSelector: (shotId: string) => void;
  handleAddVariantAsNewGenerationToShot: (
    shotId: string,
    variantId: string,
    currentTimelineFrame?: number
  ) => Promise<boolean>;
  isAlreadyPositionedInSelectedShot: boolean;
  isAlreadyAssociatedWithoutPosition: boolean;
  showTickForImageId: string | null;
  showTickForSecondaryImageId: string | null;
  onShowTick?: (imageId: string | null) => void;
  onShowSecondaryTick?: (imageId: string | null) => void;
  onOptimisticPositioned?: () => void;
  onOptimisticUnpositioned?: () => void;
  contentRef: React.RefObject<HTMLDivElement>;

  // Edit panel
  editModeLoRAs: LoraModel[];
  setEditModeLoRAs: (loras: LoraModel[]) => void;
  prompt: string;
  setPrompt: (prompt: string) => void;
  negativePrompt: string;
  setNegativePrompt: (prompt: string) => void;
  numGenerations: number;
  setNumGenerations: (num: number) => void;
  loraMode: string;
  setLoraMode: (mode: string) => void;
  qwenEditModel: QwenEditModel;
  setQwenEditModel: (model: QwenEditModel) => void;
  handleInpaint: () => void;
  isInpainting: boolean;
  handleEnterMagicEditMode: () => void;
  handleExitMagicEditMode: () => void;
  isMagicEditModeActive: boolean;
  sourceGeneration: any;
  isLoadingSourceGeneration: boolean;

  // Segment mode
  isSegmentSlotMode: boolean;
  hasSegmentVideo: boolean;
  isFormOnlyMode: boolean;
  segmentSlotMode?: SegmentSlotModeProps;

  // Task details
  taskDetailsData: any;
  adjustedTaskDetailsData: any;
}

export function useLightboxLayoutProps(params: UseLightboxLayoutPropsParams): LightboxLayoutProps {
  const workflowProps: WorkflowProps = useMemo(() => ({
    allShots: params.allShots,
    selectedShotId: params.selectedShotId,
    shotId: params.shotId,
    onShotChange: params.onShotChange,
    onCreateShot: params.onCreateShot,
    onAddToShot: params.onAddToShot,
    onAddToShotWithoutPosition: params.onAddToShotWithoutPosition,
    onApplySettings: params.onApplySettings,
    handleApplySettings: params.handleApplySettings,
    onDelete: params.onDelete,
    handleDelete: params.handleDelete,
    isDeleting: params.isDeleting,
    onNavigateToShot: params.onNavigateToShot,
    handleNavigateToShotFromSelector: params.handleNavigateToShotFromSelector,
    handleAddVariantAsNewGenerationToShot: params.handleAddVariantAsNewGenerationToShot,
    isAlreadyPositionedInSelectedShot: params.isAlreadyPositionedInSelectedShot,
    isAlreadyAssociatedWithoutPosition: params.isAlreadyAssociatedWithoutPosition,
    showTickForImageId: params.showTickForImageId,
    showTickForSecondaryImageId: params.showTickForSecondaryImageId,
    onShowTick: params.onShowTick,
    onShowSecondaryTick: params.onShowSecondaryTick,
    onOptimisticPositioned: params.onOptimisticPositioned,
    onOptimisticUnpositioned: params.onOptimisticUnpositioned,
    contentRef: params.contentRef,
  }), [
    params.allShots,
    params.selectedShotId,
    params.shotId,
    params.onShotChange,
    params.onCreateShot,
    params.onAddToShot,
    params.onAddToShotWithoutPosition,
    params.onApplySettings,
    params.handleApplySettings,
    params.onDelete,
    params.handleDelete,
    params.isDeleting,
    params.onNavigateToShot,
    params.handleNavigateToShotFromSelector,
    params.handleAddVariantAsNewGenerationToShot,
    params.isAlreadyPositionedInSelectedShot,
    params.isAlreadyAssociatedWithoutPosition,
    params.showTickForImageId,
    params.showTickForSecondaryImageId,
    params.onShowTick,
    params.onShowSecondaryTick,
    params.onOptimisticPositioned,
    params.onOptimisticUnpositioned,
    params.contentRef,
  ]);

  const editPanelProps: EditPanelProps = useMemo(() => ({
    editModeLoRAs: params.editModeLoRAs,
    setEditModeLoRAs: params.setEditModeLoRAs,
    prompt: params.prompt,
    setPrompt: params.setPrompt,
    negativePrompt: params.negativePrompt,
    setNegativePrompt: params.setNegativePrompt,
    numGenerations: params.numGenerations,
    setNumGenerations: params.setNumGenerations,
    loraMode: params.loraMode,
    setLoraMode: params.setLoraMode,
    qwenEditModel: params.qwenEditModel,
    setQwenEditModel: params.setQwenEditModel,
    handleInpaint: params.handleInpaint,
    isInpainting: params.isInpainting,
    handleEnterMagicEditMode: params.handleEnterMagicEditMode,
    handleExitMagicEditMode: params.handleExitMagicEditMode,
    isMagicEditModeActive: params.isMagicEditModeActive,
    sourceGeneration: params.sourceGeneration,
    isLoadingSourceGeneration: params.isLoadingSourceGeneration,
  }), [
    params.editModeLoRAs,
    params.setEditModeLoRAs,
    params.prompt,
    params.setPrompt,
    params.negativePrompt,
    params.setNegativePrompt,
    params.numGenerations,
    params.setNumGenerations,
    params.loraMode,
    params.setLoraMode,
    params.qwenEditModel,
    params.setQwenEditModel,
    params.handleInpaint,
    params.isInpainting,
    params.handleEnterMagicEditMode,
    params.handleExitMagicEditMode,
    params.isMagicEditModeActive,
    params.sourceGeneration,
    params.isLoadingSourceGeneration,
  ]);

  // Bundle everything into LightboxLayoutProps
  const layoutProps: LightboxLayoutProps = useMemo(() => ({
    // Core
    onClose: params.onClose,
    readOnly: params.readOnly,
    selectedProjectId: params.selectedProjectId,
    actualGenerationId: params.actualGenerationId,
    isMobile: params.isMobile,
    isPortraitMode: params.isPortraitMode,
    isTabletOrLarger: params.isTabletOrLarger,

    // Media
    media: params.media,
    isVideo: params.isVideo,
    effectiveMediaUrl: params.effectiveMediaUrl,
    effectiveVideoUrl: params.effectiveVideoUrl,
    thumbUrl: params.activeVariant?.thumbnail_url || params.media.thumbUrl,
    imageDimensions: params.imageDimensions,
    setImageDimensions: params.setImageDimensions,

    // Variants
    variants: params.variants,
    activeVariant: params.activeVariant,
    primaryVariant: params.primaryVariant,
    isLoadingVariants: params.isLoadingVariants,
    setActiveVariantId: params.setActiveVariantId,
    setPrimaryVariant: params.setPrimaryVariant,
    deleteVariant: params.deleteVariant,
    refetchVariants: params.refetchVariants,
    isViewingNonPrimaryVariant: params.isViewingNonPrimaryVariant,
    promoteSuccess: params.promoteSuccess,
    isPromoting: params.isPromoting,
    handlePromoteToGeneration: params.handlePromoteToGeneration,
    isMakingMainVariant: params.isMakingMainVariant,
    canMakeMainVariant: params.canMakeMainVariant,
    handleMakeMainVariant: params.handleMakeMainVariant,
    variantParamsToLoad: params.variantParamsToLoad,
    setVariantParamsToLoad: params.setVariantParamsToLoad,
    variantsSectionRef: params.variantsSectionRef,

    // Video edit
    isVideoTrimModeActive: params.isVideoTrimModeActive,
    isVideoEditModeActive: params.isVideoEditModeActive,
    videoEditSubMode: params.videoEditSubMode,
    setVideoEditSubMode: params.setVideoEditSubMode,
    trimVideoRef: params.trimVideoRef,
    trimCurrentTime: params.trimCurrentTime,
    setTrimCurrentTime: params.setTrimCurrentTime,
    trimState: params.trimState,
    setVideoDuration: params.setVideoDuration,
    createAsGeneration: params.createAsGeneration,
    setCreateAsGeneration: params.setCreateAsGeneration,
    videoEditing: params.videoEditing,

    // Edit mode
    isInpaintMode: params.isInpaintMode,
    isAnnotateMode: params.isAnnotateMode,
    isSpecialEditMode: params.isSpecialEditMode,
    editMode: params.editMode,
    setEditMode: params.setEditMode,
    brushStrokes: params.brushStrokes,
    currentStroke: params.currentStroke,
    isDrawing: params.isDrawing,
    isEraseMode: params.isEraseMode,
    setIsEraseMode: params.setIsEraseMode,
    brushSize: params.brushSize,
    setBrushSize: params.setBrushSize,
    annotationMode: params.annotationMode,
    setAnnotationMode: params.setAnnotationMode,
    selectedShapeId: params.selectedShapeId,
    handleKonvaPointerDown: params.handleKonvaPointerDown,
    handleKonvaPointerMove: params.handleKonvaPointerMove,
    handleKonvaPointerUp: params.handleKonvaPointerUp,
    handleShapeClick: params.handleShapeClick,
    strokeOverlayRef: params.strokeOverlayRef,
    handleUndo: params.handleUndo,
    handleClearMask: params.handleClearMask,
    getDeleteButtonPosition: params.getDeleteButtonPosition,
    handleToggleFreeForm: params.handleToggleFreeForm,
    handleDeleteSelected: params.handleDeleteSelected,
    isRepositionDragging: params.isRepositionDragging,
    repositionDragHandlers: params.repositionDragHandlers,
    getTransformStyle: params.getTransformStyle,
    imageContainerRef: params.imageContainerRef,
    canvasRef: params.canvasRef,
    maskCanvasRef: params.maskCanvasRef,
    isFlippedHorizontally: params.isFlippedHorizontally,
    isSaving: params.isSaving,

    // Navigation
    showNavigation: params.showNavigation,
    hasNext: params.hasNext,
    hasPrevious: params.hasPrevious,
    handleSlotNavNext: params.handleSlotNavNext,
    handleSlotNavPrev: params.handleSlotNavPrev,
    swipeNavigation: params.swipeNavigation,

    // Panel
    showTaskDetails: params.showTaskDetails,
    setShowTaskDetails: params.setShowTaskDetails,
    effectiveTasksPaneOpen: params.effectiveTasksPaneOpen,
    effectiveTasksPaneWidth: params.effectiveTasksPaneWidth,
    isTasksPaneLocked: params.isTasksPaneLocked,
    setIsTasksPaneLocked: params.setIsTasksPaneLocked,
    cancellableTaskCount: params.cancellableTaskCount,

    // Segment mode
    isSegmentSlotMode: params.isSegmentSlotMode,
    hasSegmentVideo: params.hasSegmentVideo,
    isFormOnlyMode: params.isFormOnlyMode,
    segmentSlotMode: params.segmentSlotMode,

    // Task details
    taskDetailsData: params.taskDetailsData,
    adjustedTaskDetailsData: params.adjustedTaskDetailsData,

    // Composed props
    buttonGroupProps: params.buttonGroupProps,
    workflowProps,
    editPanelProps,
  }), [
    params,
    workflowProps,
    editPanelProps,
  ]);

  return layoutProps;
}
