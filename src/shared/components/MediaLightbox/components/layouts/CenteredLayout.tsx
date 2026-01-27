/**
 * CenteredLayout - Default centered layout for simple media viewing
 *
 * Used on mobile/tablet when not in edit mode and not showing task details.
 * Simple centered media with overlay controls and WorkflowControls below.
 */

import React from 'react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Eraser, Square, Undo2, X, Diamond, Trash2 } from 'lucide-react';
import StyledVideoPlayer from '@/shared/components/StyledVideoPlayer';
import type { CenteredLayoutProps } from './types';

// Sub-components
import { VariantOverlayBadge } from './VariantOverlayBadge';
import { NewImageOverlayButton } from './NewImageOverlayButton';

// Existing components
import { FlexContainer } from './FlexContainer';
import { MediaWrapper } from './MediaWrapper';
import { NavigationArrows } from '../NavigationArrows';
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

export const CenteredLayout: React.FC<CenteredLayoutProps> = (props) => {
  const {
    // Core
    onClose,
    readOnly,
    selectedProjectId,
    isMobile,
    actualGenerationId,

    // Media
    media,
    isVideo,
    effectiveMediaUrl,
    effectiveVideoUrl,
    setImageDimensions,
    effectiveImageDimensions,

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
    setIsEraseMode,
    brushSize,
    setBrushSize,
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

    // Workflow bar
    workflowBarProps,

    // Workflow controls (below media)
    workflowControlsProps,
  } = props;

  return (
    <FlexContainer
      onClick={(e) => {
        e.stopPropagation();
        // Don't close in edit modes to prevent accidental data loss
        if (isInpaintMode) {
          return;
        }
        // Close if clicking directly on the container background (not children)
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Media Container with Controls - includes swipe navigation */}
      <MediaWrapper
        onClick={(e) => {
          e.stopPropagation();
          // Don't close in edit modes
          if (isInpaintMode) return;
          // Close if clicking directly on the wrapper background (not the video/image)
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
        className={cn(
          isMobile && isInpaintMode && "pointer-events-auto",
          "touch-pan-y" // Allow vertical scrolling, capture horizontal
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
            // Normal video display with StyledVideoPlayer
            <StyledVideoPlayer
              src={effectiveVideoUrl}
              poster={activeVariant?.thumbnail_url || media.thumbUrl}
              loop
              muted
              autoPlay
              playsInline
              preload="auto"
              className="max-w-full max-h-full object-contain shadow-wes border border-border/20 rounded"
              videoDimensions={effectiveImageDimensions ?? undefined}
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
            repositionDragHandlers={editMode === 'reposition' ? repositionDragHandlers : undefined}
            isRepositionDragging={isRepositionDragging}
            imageContainerRef={imageContainerRef}
            canvasRef={canvasRef}
            maskCanvasRef={maskCanvasRef}
            onImageLoad={setImageDimensions}
            onContainerClick={onClose}
            variant="regular-centered"
            containerClassName="w-full h-full"
            debugContext="Regular Centered"
            // Konva-based stroke overlay props
            imageDimensions={effectiveImageDimensions}
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

        {/* Delete button and mode toggle for selected annotation */}
        {selectedShapeId && isAnnotateMode && (() => {
          const buttonPos = getDeleteButtonPosition();
          if (!buttonPos) return null;

          // Get selected shape info
          const selectedShape = brushStrokes.find(s => s.id === selectedShapeId);
          const isFreeForm = selectedShape?.isFreeForm || false;

          return (
            <div className="fixed z-[100] flex gap-2" style={{
              left: `${buttonPos.x}px`,
              top: `${buttonPos.y}px`,
              transform: 'translate(-50%, -50%)'
            }}>
              {/* Mode toggle button */}
              <button
                onClick={handleToggleFreeForm}
                className={cn(
                  "rounded-full p-2 shadow-lg transition-colors",
                  isFreeForm
                    ? "bg-purple-600 hover:bg-purple-700 text-white"
                    : "bg-gray-700 hover:bg-gray-600 text-white"
                )}
                title={isFreeForm
                  ? "Switch to rectangle mode (edges move linearly)"
                  : "Switch to free-form mode (rhombus/non-orthogonal angles)"}
              >
                {isFreeForm ? <Diamond className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              </button>

              {/* Delete button */}
              <button
                onClick={handleDeleteSelected}
                className="bg-red-600 hover:bg-red-700 text-white rounded-full p-2 shadow-lg transition-colors"
                title="Delete annotation (or press DELETE key)"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })()}

        {/* Top Center - Main Variant Badge/Button */}
        <VariantOverlayBadge
          activeVariant={activeVariant}
          variants={variants}
          readOnly={readOnly}
          isMakingMainVariant={isMakingMainVariant}
          canMakeMainVariant={canMakeMainVariant}
          onMakeMainVariant={handleMakeMainVariant}
        />

        {/* Top Left - New image button */}
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

        {/* Top Left Controls - Edit tools (below New Image button) */}
        {!readOnly && (
          <div
            className="absolute top-20 left-4 z-[70] select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Compact Edit Controls - for special edit mode */}
            {isSpecialEditMode && editMode !== 'text' && (
              <div className="mb-2 bg-background backdrop-blur-md rounded-lg p-2 space-y-1.5 w-40 border border-border shadow-xl">
                {/* Brush Size Slider - Only in Inpaint mode */}
                {editMode === 'inpaint' && (
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-foreground">Size:</label>
                      <span className="text-xs text-muted-foreground">{brushSize}px</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={100}
                      value={brushSize}
                      onChange={(e) => setBrushSize(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                )}

                {/* Paint/Erase or Circle/Arrow Toggle */}
                {editMode === 'inpaint' && (
                  // Inpaint mode: Paint/Erase
                  <Button
                    variant={isEraseMode ? "default" : "secondary"}
                    size="sm"
                    onClick={() => setIsEraseMode(!isEraseMode)}
                    className={cn(
                      "w-full text-xs h-7",
                      isEraseMode && "bg-purple-600 hover:bg-purple-700"
                    )}
                  >
                    <Eraser className="h-3 w-3 mr-1" />
                    {isEraseMode ? 'Erase' : 'Paint'}
                  </Button>
                )}

                {editMode === 'annotate' && (
                  // Annotate mode: Rectangle tool (always active)
                  <div className="flex gap-1">
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1 text-xs h-7"
                      disabled
                    >
                      <Square className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                {/* Undo | Clear */}
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleUndo}
                        disabled={brushStrokes.length === 0}
                        className="flex-1 text-xs h-7"
                      >
                        <Undo2 className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="z-[100001]">Undo</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClearMask}
                        disabled={brushStrokes.length === 0}
                        className="flex-1 text-xs h-7"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="z-[100001]">Clear all</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Regular Mobile Layout - All button groups (matching desktop) */}
        {/* Top Right Controls - Download, Delete & Close */}
        <TopRightControls {...buttonGroupProps.topRight} />

        {/* Bottom Left Controls - Edit & Upscale */}
        <BottomLeftControls {...buttonGroupProps.bottomLeft} />

        {/* Bottom Right Controls - Star & Add to References */}
        <BottomRightControls {...buttonGroupProps.bottomRight} />

        {/* Bottom Workflow Controls */}
        <WorkflowControlsBar
          onAddToShot={workflowBarProps.onAddToShot}
          onDelete={workflowBarProps.onDelete}
          onApplySettings={workflowBarProps.onApplySettings}
          isSpecialEditMode={isSpecialEditMode}
          isVideo={isVideo}
          mediaId={actualGenerationId}
          imageUrl={effectiveMediaUrl}
          thumbUrl={media.thumbUrl}
          allShots={workflowBarProps.allShots}
          selectedShotId={workflowBarProps.selectedShotId}
          onShotChange={workflowBarProps.onShotChange}
          onCreateShot={workflowBarProps.onCreateShot}
          isAlreadyPositionedInSelectedShot={workflowBarProps.isAlreadyPositionedInSelectedShot}
          isAlreadyAssociatedWithoutPosition={workflowBarProps.isAlreadyAssociatedWithoutPosition}
          showTickForImageId={workflowBarProps.showTickForImageId}
          showTickForSecondaryImageId={workflowBarProps.showTickForSecondaryImageId}
          onAddToShotWithoutPosition={workflowBarProps.onAddToShotWithoutPosition}
          onShowTick={workflowBarProps.onShowTick}
          onShowSecondaryTick={workflowBarProps.onShowSecondaryTick}
          onOptimisticPositioned={workflowBarProps.onOptimisticPositioned}
          onOptimisticUnpositioned={workflowBarProps.onOptimisticUnpositioned}
          contentRef={workflowBarProps.contentRef}
          handleApplySettings={workflowBarProps.handleApplySettings}
          onNavigateToShot={workflowBarProps.handleNavigateToShotFromSelector}
          onClose={onClose}
          onAddVariantAsNewGeneration={workflowBarProps.handleAddVariantAsNewGenerationToShot}
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
            allShots={workflowControlsProps.allShots}
            selectedShotId={workflowControlsProps.selectedShotId}
            onShotChange={workflowControlsProps.onShotChange}
            onCreateShot={workflowControlsProps.onCreateShot}
            contentRef={workflowControlsProps.contentRef}
            isAlreadyPositionedInSelectedShot={workflowControlsProps.isAlreadyPositionedInSelectedShot}
            isAlreadyAssociatedWithoutPosition={workflowControlsProps.isAlreadyAssociatedWithoutPosition}
            showTickForImageId={workflowControlsProps.showTickForImageId}
            showTickForSecondaryImageId={workflowControlsProps.showTickForSecondaryImageId}
            onAddToShot={workflowControlsProps.onAddToShot}
            onAddToShotWithoutPosition={workflowControlsProps.onAddToShotWithoutPosition}
            onShowTick={workflowControlsProps.onShowTick}
            onApplySettings={workflowControlsProps.onApplySettings}
            handleApplySettings={workflowControlsProps.handleApplySettings}
            onDelete={workflowControlsProps.onDelete}
            handleDelete={workflowControlsProps.handleDelete}
            isDeleting={workflowControlsProps.isDeleting}
            onNavigateToShot={workflowControlsProps.handleNavigateToShotFromSelector}
            onClose={onClose}
          />
        </div>
      )}
    </FlexContainer>
  );
};

export default CenteredLayout;
