/**
 * CenteredLayout - Default centered layout for simple media viewing
 *
 * Used on mobile/tablet when not in edit mode and not showing task details.
 * Simple centered media with overlay controls.
 */

import React from 'react';
import { cn } from '@/shared/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Button } from '@/shared/components/ui/button';
import { Undo2, X } from 'lucide-react';
import StyledVideoPlayer from '@/shared/components/StyledVideoPlayer';
import type { LightboxLayoutProps } from './types';

// Sub-components
import { VariantOverlayBadge } from './VariantOverlayBadge';
import { NewImageOverlayButton } from './NewImageOverlayButton';
import { AnnotationOverlayControls } from './AnnotationOverlayControls';

// Existing components
import { FlexContainer } from './FlexContainer';
import { MediaWrapper } from './MediaWrapper';
import { NavigationArrows } from '../NavigationArrows';
import { FloatingToolControls } from '../FloatingToolControls';
import {
  TopRightControls,
  BottomLeftControls,
  BottomRightControls,
} from '../ButtonGroups';
import { WorkflowControls } from '../WorkflowControls';
import { WorkflowControlsBar } from '../WorkflowControlsBar';
import { MediaDisplayWithCanvas } from '../MediaDisplayWithCanvas';
import VideoEditModeDisplay from '../VideoEditModeDisplay';
import VideoTrimModeDisplay from '../VideoTrimModeDisplay';

interface CenteredLayoutProps extends LightboxLayoutProps {}

export const CenteredLayout: React.FC<CenteredLayoutProps> = (props) => {
  const {
    // Core
    onClose,
    readOnly,
    selectedProjectId,
    actualGenerationId,
    isMobile,

    // Media
    media,
    isVideo,
    effectiveMediaUrl,
    effectiveVideoUrl,
    imageDimensions,
    setImageDimensions,

    // Variants
    variants,
    activeVariant,
    primaryVariant,
    promoteSuccess,
    isPromoting,
    handlePromoteToGeneration,
    isMakingMainVariant,
    canMakeMainVariant,
    handleMakeMainVariant,

    // Video edit
    isVideoTrimModeActive,
    isVideoEditModeActive,
    trimVideoRef,
    trimState,
    setVideoDuration,
    setTrimCurrentTime,
    videoEditing,

    // Edit mode
    isInpaintMode,
    isAnnotateMode,
    isSpecialEditMode,
    editMode,
    brushStrokes,
    currentStroke,
    isDrawing,
    isEraseMode,
    brushSize,
    annotationMode,
    selectedShapeId,
    handleKonvaPointerDown,
    handleKonvaPointerMove,
    handleKonvaPointerUp,
    handleShapeClick,
    strokeOverlayRef,
    handleUndo,
    handleClearMask,
    getDeleteButtonPosition,
    handleToggleFreeForm,
    handleDeleteSelected,
    isRepositionDragging,
    repositionDragHandlers,
    getTransformStyle,
    imageContainerRef,
    canvasRef,
    maskCanvasRef,
    isFlippedHorizontally,
    isSaving,

    // Navigation
    showNavigation,
    hasNext,
    hasPrevious,
    handleSlotNavNext,
    handleSlotNavPrev,
    swipeNavigation,

    // Button groups
    buttonGroupProps,

    // Workflow
    workflowProps,
  } = props;

  return (
    <FlexContainer
      onClick={(e) => {
        e.stopPropagation();
        if (isInpaintMode) return;
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Media Container with Controls - includes swipe navigation */}
      <MediaWrapper
        onClick={(e) => {
          e.stopPropagation();
          if (isInpaintMode) return;
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
        className={cn(
          isMobile && isInpaintMode && "pointer-events-auto",
          "touch-pan-y"
        )}
        {...swipeNavigation.swipeHandlers}
        style={{
          transform: swipeNavigation.isSwiping ? `translateX(${swipeNavigation.swipeOffset}px)` : undefined,
          transition: swipeNavigation.isSwiping ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {/* Media Display */}
        {isVideo ? (
          isVideoEditModeActive && videoEditing ? (
            <VideoEditModeDisplay
              videoRef={videoEditing.videoRef}
              videoUrl={effectiveVideoUrl}
              posterUrl={activeVariant?.thumbnail_url || media.thumbUrl}
              videoDuration={trimState.videoDuration}
              onLoadedMetadata={setVideoDuration}
              selections={videoEditing.selections}
              activeSelectionId={videoEditing.activeSelectionId}
              onSelectionChange={videoEditing.handleUpdateSelection}
              onSelectionClick={videoEditing.setActiveSelectionId}
              onRemoveSelection={videoEditing.handleRemoveSelection}
              onAddSelection={videoEditing.handleAddSelection}
            />
          ) : isVideoTrimModeActive ? (
            <VideoTrimModeDisplay
              videoRef={trimVideoRef}
              videoUrl={effectiveVideoUrl}
              posterUrl={activeVariant?.thumbnail_url || media.thumbUrl}
              trimState={trimState}
              onLoadedMetadata={setVideoDuration}
              onTimeUpdate={setTrimCurrentTime}
            />
          ) : (
            <StyledVideoPlayer
              src={effectiveVideoUrl}
              poster={activeVariant?.thumbnail_url || media.thumbUrl}
              loop
              muted
              autoPlay
              playsInline
              preload="auto"
              className="max-w-full max-h-full object-contain shadow-wes border border-border/20 rounded"
              onLoadedMetadata={(e) => {
                const video = e.currentTarget;
                if (Number.isFinite(video.duration) && video.duration > 0) {
                  setVideoDuration(video.duration);
                }
              }}
            />
          )
        ) : (
          <MediaDisplayWithCanvas
            effectiveImageUrl={effectiveMediaUrl}
            thumbUrl={activeVariant?.thumbnail_url || media.thumbUrl}
            isVideo={false}
            isFlippedHorizontally={isFlippedHorizontally}
            isSaving={isSaving}
            isInpaintMode={isInpaintMode}
            editMode={editMode}
            repositionTransformStyle={editMode === 'reposition' ? getTransformStyle() : undefined}
            repositionDragHandlers={editMode === 'reposition' ? repositionDragHandlers || undefined : undefined}
            isRepositionDragging={isRepositionDragging}
            imageContainerRef={imageContainerRef}
            canvasRef={canvasRef}
            maskCanvasRef={maskCanvasRef}
            onImageLoad={setImageDimensions}
            onContainerClick={onClose}
            variant="regular-centered"
            containerClassName="w-full h-full"
            debugContext="Regular Centered"
            imageDimensions={imageDimensions}
            brushStrokes={brushStrokes}
            currentStroke={currentStroke}
            isDrawing={isDrawing}
            isEraseMode={isEraseMode}
            brushSize={brushSize}
            annotationMode={editMode === 'annotate' ? annotationMode : null}
            selectedShapeId={selectedShapeId}
            onStrokePointerDown={handleKonvaPointerDown}
            onStrokePointerMove={handleKonvaPointerMove}
            onStrokePointerUp={handleKonvaPointerUp}
            onShapeClick={handleShapeClick}
            strokeOverlayRef={strokeOverlayRef}
          />
        )}

        {/* Variant badge */}
        <VariantOverlayBadge
          activeVariant={activeVariant}
          variants={variants}
          readOnly={readOnly}
          isMakingMainVariant={isMakingMainVariant}
          canMakeMainVariant={canMakeMainVariant}
          onMakeMainVariant={handleMakeMainVariant}
        />

        {/* New image button */}
        <NewImageOverlayButton
          isVideo={isVideo}
          readOnly={readOnly}
          activeVariantId={activeVariant?.id}
          primaryVariantId={primaryVariant?.id}
          selectedProjectId={selectedProjectId}
          isPromoting={isPromoting}
          promoteSuccess={promoteSuccess}
          onPromote={handlePromoteToGeneration}
        />

        {/* Annotation overlay controls */}
        <AnnotationOverlayControls
          selectedShapeId={selectedShapeId}
          isAnnotateMode={isAnnotateMode}
          brushStrokes={brushStrokes}
          getDeleteButtonPosition={getDeleteButtonPosition}
          onToggleFreeForm={handleToggleFreeForm}
          onDeleteSelected={handleDeleteSelected}
        />

        {/* Floating tool controls - for inpaint/annotate mode */}
        {(isInpaintMode || isAnnotateMode) && (
          <div className="absolute top-4 left-4 z-[60] select-none" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 bg-background backdrop-blur-md rounded-lg p-2 space-y-1.5 w-40 border border-border shadow-xl">
              {/* Brush/Eraser toggle, brush size, undo, clear */}
              <FloatingToolControls
                {...buttonGroupProps.topLeft}
                variant="mobile"
              />
            </div>
          </div>
        )}

        {/* Button groups */}
        <TopRightControls {...buttonGroupProps.topRight} />
        <BottomLeftControls {...buttonGroupProps.bottomLeft} />
        <BottomRightControls {...buttonGroupProps.bottomRight} />

        {/* Workflow Controls Bar */}
        <WorkflowControlsBar
          onAddToShot={workflowProps.onAddToShot}
          onDelete={workflowProps.onDelete}
          onApplySettings={workflowProps.onApplySettings}
          isSpecialEditMode={isSpecialEditMode}
          isVideo={isVideo}
          mediaId={actualGenerationId}
          imageUrl={effectiveMediaUrl}
          thumbUrl={media.thumbUrl}
          allShots={workflowProps.allShots}
          selectedShotId={workflowProps.selectedShotId}
          onShotChange={workflowProps.onShotChange}
          onCreateShot={workflowProps.onCreateShot}
          isAlreadyPositionedInSelectedShot={workflowProps.isAlreadyPositionedInSelectedShot}
          isAlreadyAssociatedWithoutPosition={workflowProps.isAlreadyAssociatedWithoutPosition}
          showTickForImageId={workflowProps.showTickForImageId}
          showTickForSecondaryImageId={workflowProps.showTickForSecondaryImageId}
          onAddToShotWithoutPosition={workflowProps.onAddToShotWithoutPosition}
          onShowTick={workflowProps.onShowTick}
          onShowSecondaryTick={workflowProps.onShowSecondaryTick}
          onOptimisticPositioned={workflowProps.onOptimisticPositioned}
          onOptimisticUnpositioned={workflowProps.onOptimisticUnpositioned}
          contentRef={workflowProps.contentRef}
          handleApplySettings={workflowProps.handleApplySettings}
          onNavigateToShot={workflowProps.handleNavigateToShotFromSelector}
          onClose={onClose}
          onAddVariantAsNewGeneration={workflowProps.handleAddVariantAsNewGenerationToShot}
          activeVariantId={activeVariant?.id || primaryVariant?.id}
          currentTimelineFrame={media.timeline_frame}
        />

        {/* Navigation Arrows */}
        <NavigationArrows
          showNavigation={showNavigation}
          readOnly={readOnly}
          onPrevious={handleSlotNavPrev}
          onNext={handleSlotNavNext}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          variant="mobile"
        />
      </MediaWrapper>

      {/* Workflow Controls - Below Media (hidden in special edit modes) */}
      {!readOnly && !isSpecialEditMode && (
        <div className="w-full" onClick={(e) => e.stopPropagation()}>
          <WorkflowControls
            mediaId={actualGenerationId}
            imageUrl={effectiveMediaUrl}
            thumbUrl={media.thumbUrl}
            isVideo={isVideo}
            isInpaintMode={isInpaintMode}
            allShots={workflowProps.allShots}
            selectedShotId={workflowProps.selectedShotId}
            onShotChange={workflowProps.onShotChange}
            onCreateShot={workflowProps.onCreateShot}
            contentRef={workflowProps.contentRef}
            isAlreadyPositionedInSelectedShot={workflowProps.isAlreadyPositionedInSelectedShot}
            isAlreadyAssociatedWithoutPosition={workflowProps.isAlreadyAssociatedWithoutPosition}
            showTickForImageId={workflowProps.showTickForImageId}
            showTickForSecondaryImageId={workflowProps.showTickForSecondaryImageId}
            onAddToShot={workflowProps.onAddToShot}
            onAddToShotWithoutPosition={workflowProps.onAddToShotWithoutPosition}
            onShowTick={workflowProps.onShowTick}
            onApplySettings={workflowProps.onApplySettings}
            handleApplySettings={workflowProps.handleApplySettings}
            onDelete={workflowProps.onDelete}
            handleDelete={workflowProps.handleDelete}
            isDeleting={workflowProps.isDeleting}
            onNavigateToShot={workflowProps.handleNavigateToShotFromSelector}
            onClose={onClose}
          />
        </div>
      )}
    </FlexContainer>
  );
};

export default CenteredLayout;
