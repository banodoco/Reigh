/**
 * DesktopSidePanelLayout - Desktop/tablet layout with side panel
 *
 * Used when viewing with task details, edit mode, or video trim mode on larger screens.
 * Features a 60/40 split with media on left and controls/panels on right.
 */

import React from 'react';
import { cn } from '@/shared/lib/utils';
import { Trash2, Square, Diamond } from 'lucide-react';
import StyledVideoPlayer from '@/shared/components/StyledVideoPlayer';
import type { SidePanelLayoutProps } from './types';

// Sub-components
import { VariantOverlayBadge } from './VariantOverlayBadge';
import { NewImageOverlayButton } from './NewImageOverlayButton';
import { AdjacentSegmentNavigation } from './AdjacentSegmentNavigation';
import { ConstituentImageNavigation } from './ConstituentImageNavigation';

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

export const DesktopSidePanelLayout: React.FC<SidePanelLayoutProps> = (props) => {
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
    imageDimensions,
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

    // Panel
    effectiveTasksPaneOpen,
    effectiveTasksPaneWidth,

    // Button groups
    buttonGroupProps,

    // Workflow bar
    workflowBarProps,

    // Floating tool controls
    floatingToolProps,

    // Controls panel
    controlsPanelProps,

    // Adjacent segment navigation
    adjacentSegments,

    // Segment slot mode (for constituent image navigation)
    segmentSlotMode,
  } = props;

  return (
    <div
      className="w-full h-full flex bg-black/90"
      onClick={(e) => {
        e.stopPropagation();
        // Close if clicking directly on the background (not on children)
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Media section - Left side (60% width) */}
      <div
        className="flex-1 flex items-center justify-center relative overflow-hidden"
        style={{ width: '60%' }}
        onClick={(e) => {
          e.stopPropagation();
          // Close if clicking directly on the background (not on children)
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        {/* Navigation Arrows */}
        <NavigationArrows
          showNavigation={showNavigation}
          readOnly={readOnly}
          onPrevious={handleSlotNavPrev}
          onNext={handleSlotNavNext}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          variant="desktop"
        />

        {/* Media Content */}
        {isVideo && isVideoEditModeActive && videoEditing ? (
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
        ) : isVideo && isVideoTrimModeActive ? (
          <VideoTrimModeDisplay
            videoRef={trimVideoRef}
            videoUrl={effectiveVideoUrl}
            posterUrl={activeVariant?.thumbnail_url || media.thumbUrl}
            trimState={trimState}
            onLoadedMetadata={setVideoDuration}
            onTimeUpdate={setTrimCurrentTime}
          />
        ) : (
          <MediaDisplayWithCanvas
            effectiveImageUrl={isVideo ? effectiveVideoUrl : effectiveMediaUrl}
            thumbUrl={activeVariant?.thumbnail_url || media.thumbUrl}
            isVideo={isVideo}
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
            onVideoLoadedMetadata={(e) => {
              const video = e.currentTarget;
              if (Number.isFinite(video.duration) && video.duration > 0) {
                setVideoDuration(video.duration);
              }
            }}
            onContainerClick={onClose}
            variant="desktop-side-panel"
            containerClassName="max-w-full max-h-full"
            tasksPaneWidth={effectiveTasksPaneOpen && !isMobile ? effectiveTasksPaneWidth : 0}
            debugContext="Desktop"
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

        {/* Top Center - Adjacent Segment Navigation (only for images with adjacent segments) */}
        {adjacentSegments && !isVideo && (
          <AdjacentSegmentNavigation adjacentSegments={adjacentSegments} />
        )}

        {/* Top Center - Main Variant Badge/Button */}
        <VariantOverlayBadge
          activeVariant={activeVariant}
          variants={variants}
          readOnly={readOnly}
          isMakingMainVariant={isMakingMainVariant}
          canMakeMainVariant={canMakeMainVariant}
          onMakeMainVariant={handleMakeMainVariant}
          hasSegmentNavAbove={!!(adjacentSegments && !isVideo)}
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

        {/* Floating Tool Controls - Tablet (landscape with sidebar) */}
        {isSpecialEditMode && (
          <FloatingToolControls
            variant="tablet"
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

        {/* Bottom Left Controls - Edit & Upscale */}
        <BottomLeftControls {...buttonGroupProps.bottomLeft} />

        {/* Bottom Right Controls - Star & Add to References */}
        <BottomRightControls {...buttonGroupProps.bottomRight} />

        {/* Top Right Controls - Download, Delete & Close */}
        <TopRightControls {...buttonGroupProps.topRight} />

        {/* Bottom Center - Constituent Image Navigation (when viewing segment video) */}
        {segmentSlotMode?.onNavigateToImage && (
          <ConstituentImageNavigation
            startImageId={segmentSlotMode.pairData.startImage?.id}
            endImageId={segmentSlotMode.pairData.endImage?.id}
            startImageUrl={segmentSlotMode.pairData.startImage?.thumbUrl || segmentSlotMode.pairData.startImage?.url}
            endImageUrl={segmentSlotMode.pairData.endImage?.thumbUrl || segmentSlotMode.pairData.endImage?.url}
            onNavigateToImage={segmentSlotMode.onNavigateToImage}
            variant="overlay"
          />
        )}

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
      </div>

      {/* Task Details / Inpaint / Magic Edit / Video Trim Panel - Right side (40% width) */}
      <div
        data-task-details-panel
        className={cn(
          "bg-background border-l border-border h-full overflow-hidden relative z-[60]"
          // h-full constrains height so TaskDetailsPanel's footer stays visible
          // overflow-hidden lets child components handle their own scrolling
        )}
        style={{ width: '40%' }}
      >
        <ControlsPanel
          variant="desktop"
          {...controlsPanelProps}
        />
      </div>
    </div>
  );
};

export default DesktopSidePanelLayout;
