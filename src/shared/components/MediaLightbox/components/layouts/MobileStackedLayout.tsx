/**
 * MobileStackedLayout - Mobile layout with stacked media and controls
 *
 * Used on mobile when viewing with task details, edit mode, or video trim mode.
 * Features a 50/50 vertical split with media on top and controls/panels on bottom.
 */

import React from 'react';
import { cn } from '@/shared/lib/utils';
import StyledVideoPlayer from '@/shared/components/StyledVideoPlayer';
import type { LightboxLayoutProps } from './types';

// Sub-components
import { MediaContentDisplay } from './MediaContentDisplay';
import { VariantOverlayBadge } from './VariantOverlayBadge';
import { NewImageOverlayButton } from './NewImageOverlayButton';
import { AnnotationOverlayControls } from './AnnotationOverlayControls';

// Existing components
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
import { MediaDisplayWithCanvas } from '../MediaDisplayWithCanvas';
import VideoEditModeDisplay from '../VideoEditModeDisplay';
import VideoTrimModeDisplay from '../VideoTrimModeDisplay';
import { VariantSelector } from '@/tools/travel-between-images/components/VideoGallery/components/VideoTrimEditor';

interface MobileStackedLayoutProps extends LightboxLayoutProps {}

export const MobileStackedLayout: React.FC<MobileStackedLayoutProps> = (props) => {
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
    promoteSuccess,
    isPromoting,
    handlePromoteToGeneration,
    isMakingMainVariant,
    canMakeMainVariant,
    handleMakeMainVariant,
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
    swipeNavigation,

    // Button groups
    buttonGroupProps,

    // Edit panel
    editPanelProps,

    // Task details
    adjustedTaskDetailsData,
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
            variant="mobile-stacked"
            containerClassName="w-full h-full"
            debugContext="Mobile Stacked"
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

        {/* Floating Tool Controls - Mobile (portrait, no sidebar) */}
        <FloatingToolControls
          {...buttonGroupProps.topLeft}
          variant="mobile"
        />

        {/* Button groups */}
        <TopRightControls {...buttonGroupProps.topRight} />
        <BottomLeftControls {...buttonGroupProps.bottomLeft} />
        <BottomRightControls {...buttonGroupProps.bottomRight} />
      </div>

      {/* Controls section - Bottom (50% height) */}
      <div
        className="flex-1 overflow-y-auto bg-background/95 border-t border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Video Edit Panel (for trim/replace/regenerate modes) */}
        {isVideo && (isVideoTrimModeActive || isVideoEditModeActive) ? (
          <VideoEditPanel
            trimState={trimState}
            videoEditSubMode={videoEditSubMode}
            setVideoEditSubMode={setVideoEditSubMode}
            onClose={onClose}
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

        {/* Variant Selector - Always show at bottom */}
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

export default MobileStackedLayout;
