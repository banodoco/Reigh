/**
 * Shared types for MediaLightbox layout components
 */

import React from 'react';
import { GenerationRow, Shot } from '@/types/shots';
import type { Variant } from '@/shared/hooks/useVariants';
import type { BrushStroke, AnnotationMode } from '../../hooks/useInpainting';
import type { EditMode, QwenEditModel } from '../../hooks/useGenerationEditSettings';
import type { LoraModel } from '@/shared/components/LoraSelectorModal';
import type { SegmentSlotModeProps } from '../../types';

/**
 * Media-related props
 */
export interface MediaProps {
  media: GenerationRow;
  isVideo: boolean;
  effectiveMediaUrl: string;
  effectiveVideoUrl: string;
  thumbUrl?: string;
  imageDimensions: { width: number; height: number } | null;
  setImageDimensions: (dims: { width: number; height: number }) => void;
}

/**
 * Variant-related props
 */
export interface VariantProps {
  variants: Variant[] | undefined;
  activeVariant: Variant | undefined;
  primaryVariant: Variant | undefined;
  isLoadingVariants: boolean;
  setActiveVariantId: (id: string) => void;
  setPrimaryVariant: (id: string) => Promise<void>;
  deleteVariant: (id: string) => Promise<void>;
  refetchVariants: () => void;
  isViewingNonPrimaryVariant: boolean;
  // Promotion
  promoteSuccess: boolean;
  isPromoting: boolean;
  handlePromoteToGeneration: (variantId: string) => void;
  // Make main variant
  isMakingMainVariant: boolean;
  canMakeMainVariant: boolean;
  handleMakeMainVariant: () => void;
  // Variant params for regenerate form
  variantParamsToLoad: Record<string, any> | null;
  setVariantParamsToLoad: (params: Record<string, any> | null) => void;
  variantsSectionRef: React.RefObject<HTMLDivElement>;
}

/**
 * Video edit mode props
 */
export interface VideoEditProps {
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
  // Video editing hook (for regenerate mode)
  videoEditing: {
    videoRef: React.RefObject<HTMLVideoElement>;
    selections: any[];
    activeSelectionId: string | null;
    handleUpdateSelection: (id: string, updates: any) => void;
    setActiveSelectionId: (id: string | null) => void;
    handleRemoveSelection: (id: string) => void;
    handleAddSelection: () => void;
    // ... other video editing methods
  } | null;
}

/**
 * Edit mode (inpaint/annotate/reposition) props
 */
export interface EditModeProps {
  isInpaintMode: boolean;
  isAnnotateMode: boolean;
  isSpecialEditMode: boolean;
  editMode: EditMode | null;
  setEditMode: (mode: EditMode | null) => void;
  // Inpainting/annotation
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
  // Reposition
  isRepositionDragging: boolean;
  repositionDragHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  } | null;
  getTransformStyle: () => React.CSSProperties;
  // Canvas/image refs
  imageContainerRef: React.RefObject<HTMLDivElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  maskCanvasRef: React.RefObject<HTMLCanvasElement>;
  isFlippedHorizontally: boolean;
  isSaving: boolean;
}

/**
 * Navigation props
 */
export interface NavigationProps {
  showNavigation: boolean;
  hasNext: boolean;
  hasPrevious: boolean;
  handleSlotNavNext: () => void;
  handleSlotNavPrev: () => void;
  // Swipe navigation (mobile)
  swipeNavigation: {
    isSwiping: boolean;
    swipeOffset: number;
    swipeHandlers: {
      onTouchStart: (e: React.TouchEvent) => void;
      onTouchMove: (e: React.TouchEvent) => void;
      onTouchEnd: (e: React.TouchEvent) => void;
    };
  };
}

/**
 * Button group props (from useButtonGroupProps)
 */
export interface ButtonGroupProps {
  topLeft: any;
  topRight: any;
  bottomLeft: any;
  bottomRight: any;
}

/**
 * Workflow/shot-related props
 */
export interface WorkflowProps {
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
  // Position/tick state
  isAlreadyPositionedInSelectedShot: boolean;
  isAlreadyAssociatedWithoutPosition: boolean;
  showTickForImageId: string | null;
  showTickForSecondaryImageId: string | null;
  onShowTick?: (imageId: string | null) => void;
  onShowSecondaryTick?: (imageId: string | null) => void;
  onOptimisticPositioned?: () => void;
  onOptimisticUnpositioned?: () => void;
  contentRef: React.RefObject<HTMLDivElement>;
}

/**
 * Panel/UI state props
 */
export interface PanelProps {
  showTaskDetails: boolean;
  setShowTaskDetails: (show: boolean) => void;
  effectiveTasksPaneOpen: boolean;
  effectiveTasksPaneWidth: number;
  isTasksPaneLocked: boolean;
  setIsTasksPaneLocked: (locked: boolean) => void;
  cancellableTaskCount: number;
}

/**
 * Edit panel props (for EditModePanel)
 */
export interface EditPanelProps {
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
  // Source generation
  sourceGeneration: any;
  isLoadingSourceGeneration: boolean;
}

/**
 * Segment slot mode props
 */
export interface SegmentModeProps {
  isSegmentSlotMode: boolean;
  hasSegmentVideo: boolean;
  isFormOnlyMode: boolean;
  segmentSlotMode?: SegmentSlotModeProps;
}

/**
 * Core props needed by all layouts
 */
export interface LightboxLayoutCoreProps {
  // Core
  onClose: () => void;
  readOnly: boolean;
  selectedProjectId: string | null;
  actualGenerationId: string;
  isMobile: boolean;
  isPortraitMode?: boolean;
  isTabletOrLarger?: boolean;

  // Task details
  taskDetailsData: any;
  adjustedTaskDetailsData: any;
}

/**
 * Complete layout props - combines all prop groups
 */
export interface LightboxLayoutProps extends
  LightboxLayoutCoreProps,
  MediaProps,
  VariantProps,
  VideoEditProps,
  EditModeProps,
  NavigationProps,
  PanelProps,
  SegmentModeProps {
  buttonGroupProps: ButtonGroupProps;
  workflowProps: WorkflowProps;
  editPanelProps: EditPanelProps;
}
