/**
 * MobileStackedLayout - Mobile layout with stacked media and controls
 *
 * Used on mobile when viewing with task details, edit mode, or video trim mode.
 * Features a 50/50 vertical split with media on top and controls/panels on bottom.
 */

import React from 'react';
import { cn } from '@/shared/lib/utils';
import { Trash2, Square, Diamond } from 'lucide-react';
import StyledVideoPlayer from '@/shared/components/StyledVideoPlayer';
import type { SidePanelLayoutProps } from './types';

// Sub-components
import { VariantOverlayBadge } from './VariantOverlayBadge';
import { NewImageOverlayButton } from './NewImageOverlayButton';

// Existing components
import { NavigationArrows } from '../NavigationArrows';
import { FloatingToolControls } from '../FloatingToolControls';
import {
  TopRightControls,
  BottomLeftControls,
  BottomRightControls,
} from '../ButtonGroups';
import { ControlsPanel } from '../ControlsPanel';
import { MediaDisplayWithCanvas } from '../MediaDisplayWithCanvas';
import VideoEditModeDisplay from '../VideoEditModeDisplay';
import VideoTrimModeDisplay from '../VideoTrimModeDisplay';
import { WorkflowControlsBar } from '../WorkflowControlsBar';

export const MobileStackedLayout: React.FC<SidePanelLayoutProps> = (props) => {
  const {
    // Core
    onClose,
    readOnly,
    selectedProjectId,
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
    brushSize,
    annotationMode,
    selectedShapeId,
    handleKonvaPointerDown,
    handleKonvaPointerMove,
    handleKonvaPointerUp,
    handleShapeClick,
    strokeOverlayRef,
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

    // Floating tool controls
    floatingToolProps,

    // Controls panel
    controlsPanelProps,
  } = props;

  return (
    <div className="w-full h-full flex flex-col bg-black/90">
      {/* Media section - Top (50% height) with swipe navigation */}
      <div
        className="flex-none flex items-center justify-center relative touch-pan-y z-10"
        style={{
          height: '50%',
          transform: swipeNavigation.isSwiping ? `translateX(${swipeNavigation.swipeOffset}px)` : undefined,
          transition: swipeNavigation.isSwiping ? 'none' : 'transform 0.2s ease-out',
        }}
        onClick={(e) => {
          e.stopPropagation();
          // Close if clicking directly on the background (not on children)
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
        {...swipeNavigation.swipeHandlers}
      >
        {/* Media Content */}
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
              className="max-w-full max-h-full shadow-wes border border-border/20"
              videoDimensions={effectiveImageDimensions}
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
            variant="mobile-stacked"
            containerClassName="w-full h-full"
            debugContext="Mobile Stacked"
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

        {/* Floating Tool Controls - Mobile (portrait, no sidebar) */}
        {isSpecialEditMode && (
          <FloatingToolControls
            variant="mobile"
            editMode={floatingToolProps.editMode}
            onSetEditMode={floatingToolProps.setEditMode}
            brushSize={floatingToolProps.brushSize}
            isEraseMode={floatingToolProps.isEraseMode}
            onSetBrushSize={floatingToolProps.setBrushSize}
            onSetIsEraseMode={floatingToolProps.setIsEraseMode}
            annotationMode={floatingToolProps.editMode === 'annotate' ? floatingToolProps.annotationMode : null}
            onSetAnnotationMode={floatingToolProps.setAnnotationMode}
            repositionTransform={floatingToolProps.repositionTransform}
            onRepositionTranslateXChange={floatingToolProps.setTranslateX}
            onRepositionTranslateYChange={floatingToolProps.setTranslateY}
            onRepositionScaleChange={floatingToolProps.setScale}
            onRepositionRotationChange={floatingToolProps.setRotation}
            onRepositionFlipH={floatingToolProps.toggleFlipH}
            onRepositionFlipV={floatingToolProps.toggleFlipV}
            onRepositionReset={floatingToolProps.resetTransform}
            imageDimensions={floatingToolProps.effectiveImageDimensions}
            brushStrokes={floatingToolProps.brushStrokes}
            onUndo={floatingToolProps.handleUndo}
            onClearMask={floatingToolProps.handleClearMask}
            panelPosition={floatingToolProps.inpaintPanelPosition}
            onSetPanelPosition={floatingToolProps.setInpaintPanelPosition}
          />
        )}

        {/* Mobile Stacked Layout - All button groups */}
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
      </div>

      {/* Task Details / Inpaint / Magic Edit Panel - Bottom (50% height) */}
      <div
        data-task-details-panel
        className={cn(
          "bg-background border-t border-border overflow-y-auto relative z-[60]"
          // Removed flex centering to prevent top clipping with long content
        )}
        style={{ height: '50%' }}
      >
        <ControlsPanel
          variant="mobile"
          {...controlsPanelProps}
        />
      </div>
    </div>
  );
};

export default MobileStackedLayout;
