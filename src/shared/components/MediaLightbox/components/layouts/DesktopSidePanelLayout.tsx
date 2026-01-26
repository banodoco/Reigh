/**
 * DesktopSidePanelLayout - Desktop/tablet layout with side panel
 *
 * Used when viewing with task details, edit mode, or video trim mode on larger screens.
 * Features a 60/40 split with media on left and controls/panels on right.
 */

import React from 'react';
import { cn } from '@/shared/lib/utils';
import type { LightboxLayoutProps } from './types';

// Sub-components
import { MediaContentDisplay } from './MediaContentDisplay';
import { VariantOverlayBadge } from './VariantOverlayBadge';
import { NewImageOverlayButton } from './NewImageOverlayButton';
import { AnnotationOverlayControls } from './AnnotationOverlayControls';

// Existing components
import { NavigationArrows } from '../NavigationArrows';
import { FloatingToolControls } from '../FloatingToolControls';
import {
  TopRightControls,
  BottomLeftControls,
  BottomRightControls,
} from '../ButtonGroups';
import { EditModePanel } from '../EditModePanel';
import { VideoEditPanel } from '../VideoEditPanel';
import { ControlsPanel } from '../ControlsPanel';
import { InfoPanel } from '../InfoPanel';
import { VariantSelector } from '@/tools/travel-between-images/components/VideoGallery/components/VideoTrimEditor';

interface DesktopSidePanelLayoutProps extends LightboxLayoutProps {}

export const DesktopSidePanelLayout: React.FC<DesktopSidePanelLayoutProps> = (props) => {
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
    thumbUrl,
    imageDimensions,
    setImageDimensions,

    // Variants
    variants,
    activeVariant,
    primaryVariant,
    isLoadingVariants,
    setActiveVariantId,
    setPrimaryVariant,
    deleteVariant,
    isViewingNonPrimaryVariant,
    promoteSuccess,
    isPromoting,
    handlePromoteToGeneration,
    isMakingMainVariant,
    canMakeMainVariant,
    handleMakeMainVariant,
    variantParamsToLoad,
    setVariantParamsToLoad,
    variantsSectionRef,

    // Video edit
    isVideoTrimModeActive,
    isVideoEditModeActive,
    videoEditSubMode,
    setVideoEditSubMode,
    trimVideoRef,
    trimState,
    setVideoDuration,
    setTrimCurrentTime,
    createAsGeneration,
    setCreateAsGeneration,
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

    // Panel
    showTaskDetails,
    effectiveTasksPaneOpen,
    effectiveTasksPaneWidth,

    // Button groups
    buttonGroupProps,

    // Edit panel
    editPanelProps,

    // Task details
    adjustedTaskDetailsData,

    // Segment mode
    isSegmentSlotMode,
    hasSegmentVideo,
    segmentSlotMode,
  } = props;

  return (
    <div
      className="w-full h-full flex bg-black/90"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Media section - Left side (60% width) */}
      <div
        className="flex-1 flex items-center justify-center relative"
        style={{ width: '60%' }}
        onClick={(e) => {
          e.stopPropagation();
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
        <MediaContentDisplay
          isVideo={isVideo}
          effectiveMediaUrl={effectiveMediaUrl}
          effectiveVideoUrl={effectiveVideoUrl}
          thumbUrl={activeVariant?.thumbnail_url || media.thumbUrl}
          isVideoEditModeActive={isVideoEditModeActive}
          isVideoTrimModeActive={isVideoTrimModeActive}
          videoEditing={videoEditing || undefined}
          trimVideoRef={trimVideoRef}
          trimState={trimState}
          setVideoDuration={setVideoDuration}
          setTrimCurrentTime={setTrimCurrentTime}
          isFlippedHorizontally={isFlippedHorizontally}
          isSaving={isSaving}
          isInpaintMode={isInpaintMode}
          editMode={editMode}
          repositionTransformStyle={getTransformStyle()}
          repositionDragHandlers={repositionDragHandlers || undefined}
          isRepositionDragging={isRepositionDragging}
          imageContainerRef={imageContainerRef}
          canvasRef={canvasRef}
          maskCanvasRef={maskCanvasRef}
          setImageDimensions={setImageDimensions}
          onContainerClick={onClose}
          variant="desktop-side-panel"
          containerClassName="max-w-full max-h-full"
          tasksPaneWidth={effectiveTasksPaneOpen && !isMobile ? effectiveTasksPaneWidth : 0}
          debugContext="Desktop"
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

        {/* Annotation overlay controls */}
        <AnnotationOverlayControls
          selectedShapeId={selectedShapeId}
          isAnnotateMode={isAnnotateMode}
          brushStrokes={brushStrokes}
          getDeleteButtonPosition={getDeleteButtonPosition}
          onToggleFreeForm={handleToggleFreeForm}
          onDeleteSelected={handleDeleteSelected}
        />

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

        {/* Floating Tool Controls - Tablet (landscape with sidebar) */}
        <FloatingToolControls
          {...buttonGroupProps.topLeft}
          variant="tablet"
        />

        {/* Button groups */}
        <TopRightControls {...buttonGroupProps.topRight} />
        <BottomLeftControls {...buttonGroupProps.bottomLeft} />
        <BottomRightControls {...buttonGroupProps.bottomRight} />
      </div>

      {/* Side panel - Right side (40% width) */}
      <div
        className="w-[40%] h-full overflow-y-auto bg-background/95 border-l border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Video Edit Panel (for trim/replace/regenerate modes) */}
        {isVideo && (isVideoTrimModeActive || isVideoEditModeActive) ? (
          <VideoEditPanel
            trimState={trimState}
            videoEditSubMode={videoEditSubMode}
            setVideoEditSubMode={setVideoEditSubMode}
            onClose={onClose}
            // ... other video edit props
          />
        ) : isSpecialEditMode ? (
          /* Edit Mode Panel (for inpaint/annotate/reposition) */
          <EditModePanel
            editMode={editMode}
            onClose={onClose}
            {...editPanelProps}
          />
        ) : (
          /* Default: Controls Panel + Info Panel */
          <>
            <ControlsPanel
              taskDetailsData={adjustedTaskDetailsData}
              onClose={onClose}
            />
            <InfoPanel
              taskDetailsData={adjustedTaskDetailsData}
            />
          </>
        )}

        {/* Variant Selector - Always show at bottom of side panel */}
        <div ref={variantsSectionRef}>
          <VariantSelector
            variants={variants || []}
            activeVariantId={activeVariant?.id || null}
            onVariantSelect={setActiveVariantId}
            onMakePrimary={setPrimaryVariant}
            isLoadingVariants={isLoadingVariants}
            onPromoteToGeneration={handlePromoteToGeneration}
            isPromoting={isPromoting}
            onDeleteVariant={deleteVariant}
            onLoadVariantSettings={setVariantParamsToLoad}
          />
        </div>
      </div>
    </div>
  );
};

export default DesktopSidePanelLayout;
