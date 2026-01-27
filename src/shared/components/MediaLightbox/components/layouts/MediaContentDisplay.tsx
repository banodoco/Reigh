/**
 * MediaContentDisplay - Unified media display component
 *
 * Handles the decision tree for displaying:
 * - VideoEditModeDisplay (video edit/regenerate mode)
 * - VideoTrimModeDisplay (video trim mode)
 * - StyledVideoPlayer (normal video playback)
 * - MediaDisplayWithCanvas (images with canvas overlay for editing)
 */

import React from 'react';
import StyledVideoPlayer from '@/shared/components/StyledVideoPlayer';
import { MediaDisplayWithCanvas } from '../MediaDisplayWithCanvas';
import VideoEditModeDisplay from '../VideoEditModeDisplay';
import VideoTrimModeDisplay from '../VideoTrimModeDisplay';
import type { BrushStroke, AnnotationMode } from '../../hooks/useInpainting';
import type { EditMode } from '../../hooks/useGenerationEditSettings';

interface MediaContentDisplayProps {
  // Media type
  isVideo: boolean;

  // URLs
  effectiveMediaUrl: string;
  effectiveVideoUrl: string;
  thumbUrl?: string;

  // Video mode states
  isVideoEditModeActive: boolean;
  isVideoTrimModeActive: boolean;

  // Video edit mode props
  videoEditing?: {
    videoRef: React.RefObject<HTMLVideoElement>;
    selections: any[];
    activeSelectionId: string | null;
    handleUpdateSelection: (id: string, updates: any) => void;
    setActiveSelectionId: (id: string | null) => void;
    handleRemoveSelection: (id: string) => void;
    handleAddSelection: () => void;
  };

  // Video trim mode props
  trimVideoRef?: React.RefObject<HTMLVideoElement>;
  trimState?: {
    videoDuration: number;
    startTime: number;
    endTime: number;
  };

  // Callbacks
  setVideoDuration: (duration: number) => void;
  setTrimCurrentTime?: (time: number) => void;

  // Image/Canvas props (for MediaDisplayWithCanvas)
  isFlippedHorizontally: boolean;
  isSaving: boolean;
  isInpaintMode: boolean;
  editMode: EditMode | null;
  repositionTransformStyle?: React.CSSProperties;
  repositionDragHandlers?: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
  isRepositionDragging: boolean;
  imageContainerRef: React.RefObject<HTMLDivElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  maskCanvasRef: React.RefObject<HTMLCanvasElement>;
  setImageDimensions: (dims: { width: number; height: number }) => void;
  onContainerClick: () => void;

  // Konva stroke overlay props
  imageDimensions: { width: number; height: number } | null;
  brushStrokes: BrushStroke[];
  currentStroke: BrushStroke | null;
  isDrawing: boolean;
  isEraseMode: boolean;
  brushSize: number;
  annotationMode: AnnotationMode | null;
  selectedShapeId: string | null;
  onStrokePointerDown: (e: any) => void;
  onStrokePointerMove: (e: any) => void;
  onStrokePointerUp: (e: any) => void;
  onShapeClick: (id: string) => void;
  strokeOverlayRef: React.RefObject<any>;

  // Layout variant
  variant: 'desktop-side-panel' | 'mobile-stacked' | 'regular-centered';
  containerClassName?: string;
  tasksPaneWidth?: number;
  debugContext?: string;
}

export const MediaContentDisplay: React.FC<MediaContentDisplayProps> = ({
  isVideo,
  effectiveMediaUrl,
  effectiveVideoUrl,
  thumbUrl,
  isVideoEditModeActive,
  isVideoTrimModeActive,
  videoEditing,
  trimVideoRef,
  trimState,
  setVideoDuration,
  setTrimCurrentTime,
  isFlippedHorizontally,
  isSaving,
  isInpaintMode,
  editMode,
  repositionTransformStyle,
  repositionDragHandlers,
  isRepositionDragging,
  imageContainerRef,
  canvasRef,
  maskCanvasRef,
  setImageDimensions,
  onContainerClick,
  imageDimensions,
  brushStrokes,
  currentStroke,
  isDrawing,
  isEraseMode,
  brushSize,
  annotationMode,
  selectedShapeId,
  onStrokePointerDown,
  onStrokePointerMove,
  onStrokePointerUp,
  onShapeClick,
  strokeOverlayRef,
  variant,
  containerClassName,
  tasksPaneWidth = 0,
  debugContext,
}) => {
  // Video in edit mode
  if (isVideo && isVideoEditModeActive && videoEditing) {
    return (
      <VideoEditModeDisplay
        videoRef={videoEditing.videoRef}
        videoUrl={effectiveVideoUrl}
        posterUrl={thumbUrl}
        videoDuration={trimState?.videoDuration || 0}
        onLoadedMetadata={setVideoDuration}
        selections={videoEditing.selections}
        activeSelectionId={videoEditing.activeSelectionId}
        onSelectionChange={videoEditing.handleUpdateSelection}
        onSelectionClick={videoEditing.setActiveSelectionId}
        onRemoveSelection={videoEditing.handleRemoveSelection}
        onAddSelection={videoEditing.handleAddSelection}
      />
    );
  }

  // Video in trim mode
  if (isVideo && isVideoTrimModeActive && trimVideoRef && trimState) {
    return (
      <VideoTrimModeDisplay
        videoRef={trimVideoRef}
        videoUrl={effectiveVideoUrl}
        posterUrl={thumbUrl}
        trimState={trimState}
        onLoadedMetadata={setVideoDuration}
        onTimeUpdate={setTrimCurrentTime}
      />
    );
  }

  // Normal video playback
  if (isVideo) {
    return (
      <StyledVideoPlayer
        src={effectiveVideoUrl}
        poster={thumbUrl}
        loop
        muted
        autoPlay
        playsInline
        preload="auto"
        className={`max-w-full max-h-full shadow-wes border border-border/20 ${variant === 'regular-centered' ? 'rounded' : ''}`}
        videoDimensions={imageDimensions ?? undefined}
        onLoadedMetadata={(e) => {
          const video = e.currentTarget;
          if (Number.isFinite(video.duration) && video.duration > 0) {
            setVideoDuration(video.duration);
          }
        }}
      />
    );
  }

  // Image with canvas overlay
  return (
    <MediaDisplayWithCanvas
      effectiveImageUrl={effectiveMediaUrl}
      thumbUrl={thumbUrl}
      isVideo={false}
      isFlippedHorizontally={isFlippedHorizontally}
      isSaving={isSaving}
      isInpaintMode={isInpaintMode}
      editMode={editMode}
      repositionTransformStyle={editMode === 'reposition' ? repositionTransformStyle : undefined}
      repositionDragHandlers={editMode === 'reposition' ? repositionDragHandlers : undefined}
      isRepositionDragging={isRepositionDragging}
      imageContainerRef={imageContainerRef}
      canvasRef={canvasRef}
      maskCanvasRef={maskCanvasRef}
      onImageLoad={setImageDimensions}
      onContainerClick={onContainerClick}
      variant={variant}
      containerClassName={containerClassName || 'max-w-full max-h-full'}
      tasksPaneWidth={tasksPaneWidth}
      debugContext={debugContext}
      imageDimensions={imageDimensions}
      brushStrokes={brushStrokes}
      currentStroke={currentStroke}
      isDrawing={isDrawing}
      isEraseMode={isEraseMode}
      brushSize={brushSize}
      annotationMode={editMode === 'annotate' ? annotationMode : null}
      selectedShapeId={selectedShapeId}
      onStrokePointerDown={onStrokePointerDown}
      onStrokePointerMove={onStrokePointerMove}
      onStrokePointerUp={onStrokePointerUp}
      onShapeClick={onShapeClick}
      strokeOverlayRef={strokeOverlayRef}
    />
  );
};

export default MediaContentDisplay;
