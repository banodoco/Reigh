/**
 * Shared types for MediaLightbox layout components
 *
 * These types define the props needed by each layout component.
 * Rather than trying to abstract everything, we import the actual prop types
 * from the components that need them.
 */

import React from 'react';
import { GenerationRow } from '@/types/shots';
import type { Variant } from '@/shared/hooks/useVariants';
import type { BrushStroke, AnnotationMode } from '../../hooks/useInpainting';
import type { EditMode } from '../../hooks/useGenerationEditSettings';
import type { ControlsPanelProps } from '../ControlsPanel';
import type { ImageTransform } from '../../hooks/useRepositionMode';
import type { AdjacentSegmentsData } from '../../types';

/**
 * Core props needed by all layouts
 */
export interface LayoutCoreProps {
  onClose: () => void;
  readOnly: boolean;
  selectedProjectId: string | null;
  isMobile: boolean;
}

/**
 * Media display props
 */
export interface LayoutMediaProps {
  media: GenerationRow;
  isVideo: boolean;
  effectiveMediaUrl: string;
  effectiveVideoUrl: string;
  imageDimensions: { width: number; height: number } | null;
  setImageDimensions: (dims: { width: number; height: number }) => void;
}

/**
 * Variant management props
 */
export interface LayoutVariantProps {
  variants: Variant[] | undefined;
  activeVariant: Variant | undefined;
  primaryVariant: Variant | undefined;
  isLoadingVariants: boolean;
  setActiveVariantId: (id: string) => void;
  setPrimaryVariant: (id: string) => Promise<void>;
  deleteVariant: (id: string) => Promise<void>;
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
export interface LayoutVideoEditProps {
  isVideoTrimModeActive: boolean;
  isVideoEditModeActive: boolean;
  videoEditSubMode: 'trim' | 'replace' | 'regenerate' | null;
  trimVideoRef: React.RefObject<HTMLVideoElement>;
  trimState: {
    videoDuration: number;
    startTime: number;
    endTime: number;
    setStartTime: (time: number) => void;
    setEndTime: (time: number) => void;
  };
  setVideoDuration: (duration: number) => void;
  setTrimCurrentTime: (time: number) => void;
  // Video editing hook (for regenerate mode)
  videoEditing: {
    videoRef: React.RefObject<HTMLVideoElement>;
    selections: any[];
    activeSelectionId: string | null;
    handleUpdateSelection: (id: string, updates: any) => void;
    setActiveSelectionId: (id: string | null) => void;
    handleRemoveSelection: (id: string) => void;
    handleAddSelection: () => void;
  } | null;
}

/**
 * Edit mode (inpaint/annotate/reposition) props
 */
export interface LayoutEditModeProps {
  isInpaintMode: boolean;
  isAnnotateMode: boolean;
  isSpecialEditMode: boolean;
  editMode: EditMode | null;
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
export interface LayoutNavigationProps {
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
export interface LayoutButtonGroupProps {
  topLeft: any;
  topRight: any;
  bottomLeft: any;
  bottomRight: any;
}

/**
 * Workflow controls bar props
 */
export interface LayoutWorkflowBarProps {
  onAddToShot?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onDelete?: (id: string) => void;
  onApplySettings?: (metadata: any) => void;
  allShots: Array<{ id: string; name: string }>;
  selectedShotId: string | undefined;
  onShotChange?: (shotId: string) => void;
  onCreateShot?: (shotName: string, files: File[]) => Promise<{ shotId?: string; shotName?: string } | void>;
  isAlreadyPositionedInSelectedShot: boolean;
  isAlreadyAssociatedWithoutPosition: boolean;
  showTickForImageId?: string | null;
  showTickForSecondaryImageId?: string | null;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onShowTick?: (imageId: string) => void;
  onOptimisticPositioned?: (imageId: string, shotId: string) => void;
  onShowSecondaryTick?: (imageId: string) => void;
  onOptimisticUnpositioned?: (imageId: string, shotId: string) => void;
  contentRef: React.RefObject<HTMLDivElement>;
  handleApplySettings: () => void;
  handleNavigateToShotFromSelector?: (shot: any) => void;
  handleAddVariantAsNewGenerationToShot?: (shotId: string, variantId: string, currentTimelineFrame?: number) => Promise<boolean>;
}

/**
 * Floating tool controls props (for edit modes)
 */
export interface LayoutFloatingToolProps {
  editMode: EditMode | null;
  setEditMode: (mode: EditMode | null) => void;
  brushSize: number;
  isEraseMode: boolean;
  setBrushSize: (size: number) => void;
  setIsEraseMode: (value: boolean) => void;
  annotationMode: AnnotationMode | null;
  setAnnotationMode: (mode: AnnotationMode | null) => void;
  repositionTransform: ImageTransform;
  setTranslateX: (x: number) => void;
  setTranslateY: (y: number) => void;
  setScale: (scale: number) => void;
  setRotation: (rotation: number) => void;
  toggleFlipH: () => void;
  toggleFlipV: () => void;
  resetTransform: () => void;
  effectiveImageDimensions: { width: number; height: number } | null;
  brushStrokes: BrushStroke[];
  handleUndo: () => void;
  handleClearMask: () => void;
  inpaintPanelPosition: 'left' | 'right';
  setInpaintPanelPosition: (position: 'left' | 'right') => void;
}

/**
 * Panel-related props (task pane state)
 */
export interface LayoutPanelProps {
  effectiveTasksPaneOpen: boolean;
  effectiveTasksPaneWidth: number;
}

/**
 * Props for layouts that use ControlsPanel (Desktop and Mobile stacked)
 * Includes all props needed for ControlsPanel plus layout-specific props
 */
export interface SidePanelLayoutProps extends
  LayoutCoreProps,
  LayoutMediaProps,
  LayoutVariantProps,
  LayoutVideoEditProps,
  LayoutEditModeProps,
  LayoutNavigationProps,
  LayoutPanelProps {
  // Actual generation ID (may differ from media.id for variants)
  actualGenerationId: string;

  // Effective image dimensions (resolved from media or variants)
  effectiveImageDimensions: { width: number; height: number } | null;

  // Button groups
  buttonGroupProps: LayoutButtonGroupProps;

  // Workflow controls bar
  workflowBarProps: LayoutWorkflowBarProps;

  // Floating tool controls (for edit modes in tablet/desktop)
  floatingToolProps: LayoutFloatingToolProps;

  // Controls panel props - the full set for ControlsPanel component
  controlsPanelProps: Omit<ControlsPanelProps, 'variant'>;

  // Adjacent segment navigation (for jumping to video segments from image lightbox)
  adjacentSegments?: AdjacentSegmentsData;
}

/**
 * Props for the centered layout (no side panel)
 * Uses WorkflowControls below media instead of ControlsPanel
 */
export interface CenteredLayoutProps extends
  LayoutCoreProps,
  LayoutMediaProps,
  LayoutVariantProps,
  LayoutVideoEditProps,
  LayoutEditModeProps,
  LayoutNavigationProps {
  // Actual generation ID
  actualGenerationId: string;

  // Effective image dimensions
  effectiveImageDimensions: { width: number; height: number } | null;

  // Button groups
  buttonGroupProps: LayoutButtonGroupProps;

  // Workflow controls bar (floating)
  workflowBarProps: LayoutWorkflowBarProps;

  // Workflow controls (below media) - different from workflowBarProps
  workflowControlsProps: {
    isDeleting?: string | null;
    handleDelete: () => void;
  } & LayoutWorkflowBarProps;

  // Adjacent segment navigation (for jumping to video segments from image lightbox)
  adjacentSegments?: AdjacentSegmentsData;
}

// Re-export ControlsPanelProps for convenience
export type { ControlsPanelProps } from '../ControlsPanel';
