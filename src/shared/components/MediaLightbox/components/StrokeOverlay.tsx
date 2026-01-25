import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Stage, Layer, Line, Rect } from 'react-konva';
import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';

export interface BrushStroke {
  id: string;
  points: Array<{ x: number; y: number }>;
  isErasing: boolean;
  brushSize: number;
  shapeType?: 'line' | 'rectangle';
  isFreeForm?: boolean;
}

interface StrokeOverlayProps {
  // Image dimensions (strokes are stored in these coordinates)
  imageWidth: number;
  imageHeight: number;

  // Display dimensions (how big the overlay appears on screen)
  displayWidth: number;
  displayHeight: number;

  // Strokes to render
  strokes: BrushStroke[];
  currentStroke: Array<{ x: number; y: number }>;

  // Current drawing state
  isDrawing: boolean;
  isEraseMode: boolean;
  brushSize: number;
  annotationMode: 'rectangle' | null;
  selectedShapeId: string | null;

  // Event handlers - coordinates are in IMAGE space (not display space)
  onPointerDown: (point: { x: number; y: number }, e: KonvaEventObject<PointerEvent>) => void;
  onPointerMove: (point: { x: number; y: number }, e: KonvaEventObject<PointerEvent>) => void;
  onPointerUp: (e: KonvaEventObject<PointerEvent>) => void;
  onShapeClick?: (strokeId: string, point: { x: number; y: number }) => void;
}

export interface StrokeOverlayHandle {
  /**
   * Export strokes as a mask image (white shapes on black background).
   * Returns a data URL of the mask at the specified resolution.
   */
  exportMask: (options?: { pixelRatio?: number }) => string | null;
}

/**
 * Konva-based stroke overlay for inpainting/annotation.
 *
 * Key simplification: Konva handles all coordinate transformation.
 * - Stage is sized to display dimensions
 * - Content is scaled to match image dimensions
 * - Event coordinates are automatically converted to image space
 *
 * Exposes exportMask() via ref for generating mask images.
 */
export const StrokeOverlay = forwardRef<StrokeOverlayHandle, StrokeOverlayProps>(({
  imageWidth,
  imageHeight,
  displayWidth,
  displayHeight,
  strokes,
  currentStroke,
  isDrawing,
  isEraseMode,
  brushSize,
  annotationMode,
  selectedShapeId,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onShapeClick,
}, ref) => {

  const stageRef = useRef<Konva.Stage>(null);

  // Scale factors: display coords -> image coords
  const scaleX = displayWidth / imageWidth;
  const scaleY = displayHeight / imageHeight;

  // Convert stage coordinates to image coordinates
  const stageToImage = (stageX: number, stageY: number) => ({
    x: stageX / scaleX,
    y: stageY / scaleY,
  });

  // Convert image coordinates to stage coordinates
  const imageToStage = (imageX: number, imageY: number) => ({
    x: imageX * scaleX,
    y: imageY * scaleY,
  });

  // Expose exportMask function via ref
  useImperativeHandle(ref, () => ({
    exportMask: (options?: { pixelRatio?: number }) => {
      const pixelRatio = options?.pixelRatio ?? 1.5;

      if (strokes.length === 0) {
        console.log('[StrokeOverlay] exportMask: No strokes to export');
        return null;
      }

      // Create an offscreen stage at image dimensions (not display dimensions)
      // This ensures the mask matches the actual image size
      const maskWidth = imageWidth;
      const maskHeight = imageHeight;

      // Create a container div (required by Konva)
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      document.body.appendChild(container);

      try {
        // Create offscreen stage at actual image dimensions
        const offscreenStage = new Konva.Stage({
          container,
          width: maskWidth,
          height: maskHeight,
        });

        const layer = new Konva.Layer();
        offscreenStage.add(layer);

        // Draw black background
        const background = new Konva.Rect({
          x: 0,
          y: 0,
          width: maskWidth,
          height: maskHeight,
          fill: 'black',
        });
        layer.add(background);

        // Draw each stroke as WHITE outline (not filled)
        const strokeWidth = 6; // Outline thickness for mask

        strokes.forEach((stroke) => {
          if (stroke.points.length < 2) return;

          if (stroke.shapeType === 'rectangle') {
            if (stroke.isFreeForm && stroke.points.length === 4) {
              // Free-form quadrilateral - draw as outline
              const flatPoints = stroke.points.flatMap(p => [p.x, p.y]);
              const line = new Konva.Line({
                points: flatPoints,
                stroke: 'white',
                strokeWidth,
                closed: true,
                lineCap: 'round',
                lineJoin: 'round',
              });
              layer.add(line);
            } else {
              // Standard rectangle - draw as outline (not filled)
              const x = Math.min(stroke.points[0].x, stroke.points[1].x);
              const y = Math.min(stroke.points[0].y, stroke.points[1].y);
              const width = Math.abs(stroke.points[1].x - stroke.points[0].x);
              const height = Math.abs(stroke.points[1].y - stroke.points[0].y);

              const rect = new Konva.Rect({
                x,
                y,
                width,
                height,
                stroke: 'white',
                strokeWidth,
              });
              layer.add(rect);
            }
          } else {
            // Freehand line - draw as thick white stroke
            const flatPoints = stroke.points.flatMap(p => [p.x, p.y]);
            const line = new Konva.Line({
              points: flatPoints,
              stroke: 'white',
              strokeWidth: stroke.brushSize,
              lineCap: 'round',
              lineJoin: 'round',
            });
            layer.add(line);
          }
        });

        layer.draw();

        // Export as data URL
        const dataUrl = offscreenStage.toDataURL({
          pixelRatio,
          mimeType: 'image/png',
        });

        console.log('[StrokeOverlay] exportMask: Generated mask', {
          imageSize: { width: maskWidth, height: maskHeight },
          pixelRatio,
          outputSize: { width: maskWidth * pixelRatio, height: maskHeight * pixelRatio },
          strokeCount: strokes.length,
        });

        // Cleanup
        offscreenStage.destroy();
        document.body.removeChild(container);

        return dataUrl;
      } catch (error) {
        console.error('[StrokeOverlay] exportMask failed:', error);
        document.body.removeChild(container);
        return null;
      }
    },
  }), [strokes, imageWidth, imageHeight]);

  const handlePointerDown = (e: KonvaEventObject<PointerEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    const imagePoint = stageToImage(pos.x, pos.y);
    onPointerDown(imagePoint, e);
  };

  const handlePointerMove = (e: KonvaEventObject<PointerEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    const imagePoint = stageToImage(pos.x, pos.y);
    onPointerMove(imagePoint, e);
  };

  const handlePointerUp = (e: KonvaEventObject<PointerEvent>) => {
    onPointerUp(e);
  };

  // Render a single stroke for display (outlines with colors)
  const renderStroke = (stroke: BrushStroke) => {
    const isSelected = stroke.id === selectedShapeId;
    const strokeColor = isSelected ? 'rgba(0, 255, 100, 0.9)' :
                        stroke.isErasing ? 'rgba(0, 0, 0, 0.5)' :
                        'rgba(255, 0, 0, 0.7)';

    if (stroke.shapeType === 'rectangle' && stroke.points.length >= 2) {
      if (stroke.isFreeForm && stroke.points.length === 4) {
        // Free-form quadrilateral - render as closed line (outline only)
        const flatPoints = stroke.points.flatMap(p => {
          const stagePos = imageToStage(p.x, p.y);
          return [stagePos.x, stagePos.y];
        });
        return (
          <Line
            key={stroke.id}
            points={[...flatPoints, flatPoints[0], flatPoints[1]]}
            stroke={strokeColor}
            strokeWidth={3}
            closed
            onClick={() => onShapeClick?.(stroke.id, stroke.points[0])}
          />
        );
      } else {
        // Standard rectangle (outline only)
        const p0 = imageToStage(stroke.points[0].x, stroke.points[0].y);
        const p1 = imageToStage(stroke.points[1].x, stroke.points[1].y);
        const x = Math.min(p0.x, p1.x);
        const y = Math.min(p0.y, p1.y);
        const width = Math.abs(p1.x - p0.x);
        const height = Math.abs(p1.y - p0.y);

        return (
          <Rect
            key={stroke.id}
            x={x}
            y={y}
            width={width}
            height={height}
            stroke={strokeColor}
            strokeWidth={3}
            onClick={() => onShapeClick?.(stroke.id, stroke.points[0])}
          />
        );
      }
    } else {
      // Freehand line
      const flatPoints = stroke.points.flatMap(p => {
        const stagePos = imageToStage(p.x, p.y);
        return [stagePos.x, stagePos.y];
      });
      const scaledBrushSize = stroke.brushSize * scaleX;
      const effectiveStrokeColor = stroke.isErasing ? 'rgba(0, 0, 0, 1)' : strokeColor;

      return (
        <Line
          key={stroke.id}
          points={flatPoints}
          stroke={effectiveStrokeColor}
          strokeWidth={scaledBrushSize}
          lineCap="round"
          lineJoin="round"
          globalCompositeOperation={stroke.isErasing ? 'destination-out' : 'source-over'}
        />
      );
    }
  };

  // Render current stroke being drawn (preview)
  const renderCurrentStroke = () => {
    if (currentStroke.length === 0) return null;

    const strokeColor = isEraseMode ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 0, 0, 0.4)';

    if (annotationMode === 'rectangle' && currentStroke.length >= 1) {
      // Rectangle preview
      const start = imageToStage(currentStroke[0].x, currentStroke[0].y);
      const end = imageToStage(currentStroke[currentStroke.length - 1].x, currentStroke[currentStroke.length - 1].y);
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const width = Math.abs(end.x - start.x);
      const height = Math.abs(end.y - start.y);

      return (
        <Rect
          x={x}
          y={y}
          width={width}
          height={height}
          stroke="rgba(100, 200, 255, 0.8)"
          strokeWidth={3}
          dash={[5, 5]}
        />
      );
    } else {
      // Freehand preview
      const flatPoints = currentStroke.flatMap(p => {
        const stagePos = imageToStage(p.x, p.y);
        return [stagePos.x, stagePos.y];
      });
      const scaledBrushSize = brushSize * scaleX;

      return (
        <Line
          points={flatPoints}
          stroke={strokeColor}
          strokeWidth={scaledBrushSize}
          lineCap="round"
          lineJoin="round"
        />
      );
    }
  };

  if (displayWidth === 0 || displayHeight === 0) {
    return null;
  }

  return (
    <Stage
      ref={stageRef}
      width={displayWidth}
      height={displayHeight}
      style={{
        display: 'block',
        cursor: 'crosshair',
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <Layer>
        {strokes.map(stroke => renderStroke(stroke))}
        {renderCurrentStroke()}
      </Layer>
    </Stage>
  );
});

StrokeOverlay.displayName = 'StrokeOverlay';

export default StrokeOverlay;
