/**
 * MediaOverlayControls Component
 *
 * Renders the floating button groups that appear over the media content:
 * - TopLeftControls (Edit button)
 * - TopRightControls (Download, Delete, Close)
 * - BottomLeftControls (Edit & Upscale)
 * - BottomRightControls (Star & Add to References)
 * - WorkflowControlsBar (Shot selector, workflow actions)
 * - NavigationArrows (Previous/Next)
 * - FloatingToolControls (Edit mode tools, conditional)
 *
 * Used by desktop and mobile layouts to reduce duplication.
 */

import React from 'react';
import {
  TopLeftControls,
  TopRightControls,
  BottomLeftControls,
  BottomRightControls,
} from './ButtonGroups';
import { WorkflowControlsBar } from './WorkflowControlsBar';
import { NavigationArrows } from './NavigationArrows';
import { FloatingToolControls } from './FloatingToolControls';
import type { Shot } from '@/types/shots';

export interface MediaOverlayControlsProps {
  /** Layout variant determines positioning and which controls to show */
  variant: 'desktop' | 'mobile-stacked' | 'mobile-fullscreen';

  // Common props for all button groups
  isVideo: boolean;
  readOnly: boolean;
  isSpecialEditMode: boolean;
  selectedProjectId: string | undefined;
  isCloudMode: boolean;

  // TopLeftControls
  handleEnterMagicEditMode: () => void;

  // TopRightControls
  showDownload: boolean;
  handleDownload: () => void;
  onDelete?: (mediaId: string) => void;
  handleDelete: () => void;
  isDeleting: boolean;
  mediaId: string;
  onClose: () => void;

  // BottomLeftControls
  isUpscaling: boolean;
  isPendingUpscale: boolean;
  hasUpscaledVersion: boolean;
  showingUpscaled: boolean;
  handleUpscale: () => void;
  handleToggleUpscaled: () => void;

  // BottomRightControls
  localStarred: boolean;
  handleToggleStar: () => void;
  toggleStarPending: boolean;
  isAddingToReferences: boolean;
  addToReferencesSuccess: boolean;
  handleAddToReferences: () => void;
  handleAddToJoin: () => void;
  isAddingToJoin: boolean;
  addToJoinSuccess: boolean;
  onGoToJoin: () => void;

  // WorkflowControlsBar
  onAddToShot?: (shotId: string) => void;
  onApplySettings?: () => void;
  actualGenerationId: string;
  imageUrl: string;
  thumbUrl: string;
  allShots: Shot[];
  selectedShotId: string | undefined;
  onShotChange: (shotId: string) => void;
  onCreateShot?: () => void;
  isAlreadyPositionedInSelectedShot: boolean;
  isAlreadyAssociatedWithoutPosition: boolean;
  showTickForImageId: string | null;
  showTickForSecondaryImageId: string | null;
  onAddToShotWithoutPosition?: (shotId: string) => void;
  onShowTick: (imageId: string | null) => void;
  onShowSecondaryTick: (imageId: string | null) => void;
  onOptimisticPositioned: (shotId: string, imageId: string) => void;
  onOptimisticUnpositioned: (shotId: string, imageId: string) => void;
  contentRef: React.RefObject<HTMLDivElement>;
  handleApplySettings: () => void;
  onNavigateToShot: (shotId: string) => void;

  // NavigationArrows
  showNavigation: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious: boolean;
  hasNext: boolean;

  // FloatingToolControls (only for special edit mode)
  editMode: 'inpaint' | 'annotate' | 'reposition';
  onSetEditMode: (mode: 'inpaint' | 'annotate' | 'reposition') => void;
  brushSize: number;
  isEraseMode: boolean;
  onSetBrushSize: (size: number) => void;
  onSetIsEraseMode: (erase: boolean) => void;
  annotationMode: 'rectangle' | 'polygon';
  onSetAnnotationMode: (mode: 'rectangle' | 'polygon') => void;
  repositionTransform: {
    translateX: number;
    translateY: number;
    scale: number;
    rotation: number;
    flipH: boolean;
    flipV: boolean;
  };
  onRepositionTranslateXChange: (x: number) => void;
  onRepositionTranslateYChange: (y: number) => void;
  onRepositionScaleChange: (scale: number) => void;
  onRepositionRotationChange: (rotation: number) => void;
  onRepositionFlipH: () => void;
  onRepositionFlipV: () => void;
  onRepositionReset: () => void;
  imageDimensions: { width: number; height: number } | null;
  brushStrokes: any[];
  onUndo: () => void;
  onClearMask: () => void;
  panelPosition: 'left' | 'right';
  onSetPanelPosition: (pos: 'left' | 'right') => void;

  // Desktop-only: show side panel determines FloatingToolControls visibility
  shouldShowSidePanel?: boolean;
}

export const MediaOverlayControls: React.FC<MediaOverlayControlsProps> = ({
  variant,
  // Common props
  isVideo,
  readOnly,
  isSpecialEditMode,
  selectedProjectId,
  isCloudMode,
  // TopLeftControls
  handleEnterMagicEditMode,
  // TopRightControls
  showDownload,
  handleDownload,
  onDelete,
  handleDelete,
  isDeleting,
  mediaId,
  onClose,
  // BottomLeftControls
  isUpscaling,
  isPendingUpscale,
  hasUpscaledVersion,
  showingUpscaled,
  handleUpscale,
  handleToggleUpscaled,
  // BottomRightControls
  localStarred,
  handleToggleStar,
  toggleStarPending,
  isAddingToReferences,
  addToReferencesSuccess,
  handleAddToReferences,
  handleAddToJoin,
  isAddingToJoin,
  addToJoinSuccess,
  onGoToJoin,
  // WorkflowControlsBar
  onAddToShot,
  onApplySettings,
  actualGenerationId,
  imageUrl,
  thumbUrl,
  allShots,
  selectedShotId,
  onShotChange,
  onCreateShot,
  isAlreadyPositionedInSelectedShot,
  isAlreadyAssociatedWithoutPosition,
  showTickForImageId,
  showTickForSecondaryImageId,
  onAddToShotWithoutPosition,
  onShowTick,
  onShowSecondaryTick,
  onOptimisticPositioned,
  onOptimisticUnpositioned,
  contentRef,
  handleApplySettings,
  onNavigateToShot,
  // NavigationArrows
  showNavigation,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  // FloatingToolControls
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
  shouldShowSidePanel,
}) => {
  const isDesktop = variant === 'desktop';
  const isMobileStacked = variant === 'mobile-stacked';
  const isMobileFullscreen = variant === 'mobile-fullscreen';

  // Determine FloatingToolControls variant
  const floatingToolsVariant = isDesktop ? 'tablet' : 'mobile';

  // FloatingToolControls visibility:
  // - Desktop: only when isSpecialEditMode AND shouldShowSidePanel
  // - Mobile: only when isSpecialEditMode
  const showFloatingTools = isSpecialEditMode && (isDesktop ? shouldShowSidePanel : true);

  return (
    <>
      {/* Navigation Arrows - Desktop shows at start, Mobile at end */}
      {isDesktop && (
        <NavigationArrows
          showNavigation={showNavigation}
          readOnly={readOnly}
          onPrevious={onPrevious}
          onNext={onNext}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          variant="desktop"
        />
      )}

      {/* Floating Tool Controls */}
      {showFloatingTools && (
        <FloatingToolControls
          variant={floatingToolsVariant}
          editMode={editMode}
          onSetEditMode={onSetEditMode}
          brushSize={brushSize}
          isEraseMode={isEraseMode}
          onSetBrushSize={onSetBrushSize}
          onSetIsEraseMode={onSetIsEraseMode}
          annotationMode={annotationMode}
          onSetAnnotationMode={onSetAnnotationMode}
          repositionTransform={repositionTransform}
          onRepositionTranslateXChange={onRepositionTranslateXChange}
          onRepositionTranslateYChange={onRepositionTranslateYChange}
          onRepositionScaleChange={onRepositionScaleChange}
          onRepositionRotationChange={onRepositionRotationChange}
          onRepositionFlipH={onRepositionFlipH}
          onRepositionFlipV={onRepositionFlipV}
          onRepositionReset={onRepositionReset}
          imageDimensions={imageDimensions}
          brushStrokes={brushStrokes}
          onUndo={onUndo}
          onClearMask={onClearMask}
          panelPosition={panelPosition}
          onSetPanelPosition={onSetPanelPosition}
        />
      )}

      {/* Top Left Controls - Edit button */}
      <TopLeftControls
        isVideo={isVideo}
        readOnly={readOnly}
        isSpecialEditMode={isSpecialEditMode}
        selectedProjectId={selectedProjectId}
        isCloudMode={isCloudMode}
        handleEnterMagicEditMode={handleEnterMagicEditMode}
      />

      {/* Top Right Controls - Download, Delete & Close */}
      <TopRightControls
        isVideo={isVideo}
        readOnly={readOnly}
        isSpecialEditMode={isSpecialEditMode}
        selectedProjectId={selectedProjectId}
        isCloudMode={isCloudMode}
        showDownload={showDownload}
        handleDownload={handleDownload}
        onDelete={onDelete}
        handleDelete={handleDelete}
        isDeleting={isDeleting}
        mediaId={mediaId}
        onClose={onClose}
      />

      {/* Bottom Left Controls - Edit & Upscale */}
      <BottomLeftControls
        isVideo={isVideo}
        readOnly={readOnly}
        isSpecialEditMode={isSpecialEditMode}
        selectedProjectId={selectedProjectId}
        isCloudMode={isCloudMode}
        handleEnterMagicEditMode={handleEnterMagicEditMode}
        isUpscaling={isUpscaling}
        isPendingUpscale={isPendingUpscale}
        hasUpscaledVersion={hasUpscaledVersion}
        showingUpscaled={showingUpscaled}
        handleUpscale={handleUpscale}
        handleToggleUpscaled={handleToggleUpscaled}
      />

      {/* Bottom Right Controls - Star & Add to References */}
      <BottomRightControls
        isVideo={isVideo}
        readOnly={readOnly}
        isSpecialEditMode={isSpecialEditMode}
        selectedProjectId={selectedProjectId}
        isCloudMode={isCloudMode}
        localStarred={localStarred}
        handleToggleStar={handleToggleStar}
        toggleStarPending={toggleStarPending}
        isAddingToReferences={isAddingToReferences}
        addToReferencesSuccess={addToReferencesSuccess}
        handleAddToReferences={handleAddToReferences}
        handleAddToJoin={handleAddToJoin}
        isAddingToJoin={isAddingToJoin}
        addToJoinSuccess={addToJoinSuccess}
        onGoToJoin={onGoToJoin}
      />

      {/* Bottom Workflow Controls (hidden in special edit modes) */}
      <WorkflowControlsBar
        onAddToShot={onAddToShot}
        onDelete={onDelete}
        onApplySettings={onApplySettings}
        isSpecialEditMode={isSpecialEditMode}
        isVideo={isVideo}
        mediaId={actualGenerationId}
        imageUrl={imageUrl}
        thumbUrl={thumbUrl}
        allShots={allShots}
        selectedShotId={selectedShotId}
        onShotChange={onShotChange}
        onCreateShot={onCreateShot}
        isAlreadyPositionedInSelectedShot={isAlreadyPositionedInSelectedShot}
        isAlreadyAssociatedWithoutPosition={isAlreadyAssociatedWithoutPosition}
        showTickForImageId={showTickForImageId}
        showTickForSecondaryImageId={showTickForSecondaryImageId}
        onAddToShotWithoutPosition={onAddToShotWithoutPosition}
        onShowTick={onShowTick}
        onShowSecondaryTick={onShowSecondaryTick}
        onOptimisticPositioned={onOptimisticPositioned}
        onOptimisticUnpositioned={onOptimisticUnpositioned}
        contentRef={contentRef}
        handleApplySettings={handleApplySettings}
        onNavigateToShot={onNavigateToShot}
        onClose={onClose}
      />

      {/* Navigation Arrows - Mobile shows at end */}
      {!isDesktop && (
        <NavigationArrows
          showNavigation={showNavigation}
          readOnly={readOnly}
          onPrevious={onPrevious}
          onNext={onNext}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          variant="mobile"
        />
      )}
    </>
  );
};

export default MediaOverlayControls;
