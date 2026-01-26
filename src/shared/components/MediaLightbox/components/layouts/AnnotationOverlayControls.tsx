/**
 * AnnotationOverlayControls - Delete and mode toggle for selected annotations
 *
 * Shows floating controls near the selected annotation shape:
 * - Mode toggle button (rectangle vs free-form)
 * - Delete button
 */

import React from 'react';
import { Trash2, Square, Diamond } from 'lucide-react';
import type { BrushStroke } from '../../hooks/useInpainting';

interface AnnotationOverlayControlsProps {
  selectedShapeId: string | null;
  isAnnotateMode: boolean;
  brushStrokes: BrushStroke[];
  getDeleteButtonPosition: () => { x: number; y: number } | null;
  onToggleFreeForm: () => void;
  onDeleteSelected: () => void;
}

export const AnnotationOverlayControls: React.FC<AnnotationOverlayControlsProps> = ({
  selectedShapeId,
  isAnnotateMode,
  brushStrokes,
  getDeleteButtonPosition,
  onToggleFreeForm,
  onDeleteSelected,
}) => {
  if (!selectedShapeId || !isAnnotateMode) {
    return null;
  }

  const buttonPos = getDeleteButtonPosition();
  if (!buttonPos) {
    return null;
  }

  // Get selected shape info
  const selectedShape = brushStrokes.find(s => s.id === selectedShapeId);
  const isFreeForm = selectedShape?.isFreeForm || false;

  return (
    <div
      className="fixed z-[100] flex gap-2"
      style={{
        left: `${buttonPos.x}px`,
        top: `${buttonPos.y}px`,
        transform: 'translate(-50%, -50%)'
      }}
    >
      {/* Mode toggle button */}
      <button
        onClick={onToggleFreeForm}
        className={`rounded-full p-2 shadow-lg transition-colors ${
          isFreeForm
            ? 'bg-purple-600 hover:bg-purple-700 text-white'
            : 'bg-gray-700 hover:bg-gray-600 text-white'
        }`}
        title={isFreeForm
          ? 'Switch to rectangle mode (edges move linearly)'
          : 'Switch to free-form mode (rhombus/non-orthogonal angles)'}
      >
        {isFreeForm ? <Diamond className="h-4 w-4" /> : <Square className="h-4 w-4" />}
      </button>

      {/* Delete button */}
      <button
        onClick={onDeleteSelected}
        className="bg-red-600 hover:bg-red-700 text-white rounded-full p-2 shadow-lg transition-colors"
        title="Delete annotation (or press DELETE key)"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
};

export default AnnotationOverlayControls;
