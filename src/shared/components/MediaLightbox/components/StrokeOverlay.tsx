import React, { useRef, useEffect } from 'react';
import { Stage, Layer, Line, Rect, Group } from 'react-konva';
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

/**
 * Konva-based stroke overlay for inpainting/annotation.
 *
 * Key simplification: Konva handles all coordinate transformation.
 * - Stage is sized to display dimensions
 * - Content is scaled to match image dimensions
 * - Event coordinates are automatically converted to image space
 */
export const StrokeOverlay: React.FC<StrokeOverlayProps> = ({
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
}) => {
  const stageRef = useRef<any>(null);

  // Scale factors: display coords -> image coords
  // The Stage is sized to match the displayed image exactly
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

  // Render a single stroke
  const renderStroke = (stroke: BrushStroke, isPreview = false) => {
    const isSelected = stroke.id === selectedShapeId;
    const strokeColor = isSelected ? 'rgba(0, 255, 100, 0.9)' :
                        stroke.isErasing ? 'rgba(0, 0, 0, 0.5)' :
                        'rgba(255, 0, 0, 0.4)';
    const fillColor = isSelected ? 'rgba(0, 255, 100, 0.2)' :
                      stroke.isErasing ? 'rgba(0, 0, 0, 0.3)' :
                      'rgba(255, 0, 0, 0.2)';

    if (stroke.shapeType === 'rectangle' && stroke.points.length >= 2) {
      if (stroke.isFreeForm && stroke.points.length === 4) {
        // Free-form quadrilateral - render as closed line
        const flatPoints = stroke.points.flatMap(p => {
          const stagePos = imageToStage(p.x, p.y);
          return [stagePos.x, stagePos.y];
        });
        return (
          <Line
            key={stroke.id}
            points={[...flatPoints, flatPoints[0], flatPoints[1]]} // Close the path
            stroke={strokeColor}
            strokeWidth={3}
            fill={fillColor}
            closed
            onClick={() => onShapeClick?.(stroke.id, stroke.points[0])}
          />
        );
      } else {
        // Standard rectangle
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
            fill={fillColor}
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

      // For eraser strokes using destination-out, use full opacity so it fully erases
      // The alpha channel determines how much is erased, so 50% opacity = 50% erase
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
      // Rectangle preview - draw from first point to current mouse position
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

  // Debug: log dimensions when they change
  useEffect(() => {
    console.log('[KonvaDebug] StrokeOverlay dimensions:', {
      displayWidth,
      displayHeight,
      imageWidth,
      imageHeight,
      scaleX,
      scaleY
    });
  }, [displayWidth, displayHeight, imageWidth, imageHeight, scaleX, scaleY]);

  return (
    <Stage
      ref={stageRef}
      width={displayWidth}
      height={displayHeight}
      style={{
        // Use display:block to prevent inline sizing issues, no absolute positioning
        // The parent overlay container is already absolutely positioned with inset-0
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
        {/* Render saved strokes */}
        {strokes.map(stroke => renderStroke(stroke))}

        {/* Render current stroke being drawn */}
        {renderCurrentStroke()}
      </Layer>
    </Stage>
  );
};

export default StrokeOverlay;
