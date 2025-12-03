import React, { useState, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Shot } from '@/types/shots';
import VideoShotDisplay from './VideoShotDisplay';
import { cn } from '@/shared/lib/utils';

interface GenerationDropData {
  generationId: string;
  imageUrl: string;
  thumbUrl?: string;
  metadata?: any;
}

interface SortableShotItemProps {
  shot: Shot;
  onSelectShot: () => void;
  currentProjectId: string | null;
  isDragDisabled?: boolean;
  disabledReason?: string;
  shouldLoadImages?: boolean;
  shotIndex?: number;
  projectAspectRatio?: string;
  isHighlighted?: boolean;
  // Drop handling for generations from GenerationsPane
  onGenerationDrop?: (shotId: string, data: GenerationDropData) => Promise<void>;
}

const SortableShotItem: React.FC<SortableShotItemProps> = ({
  shot,
  onSelectShot,
  currentProjectId,
  isDragDisabled = false,
  disabledReason,
  shouldLoadImages = true,
  shotIndex = 0,
  projectAspectRatio,
  isHighlighted = false,
  onGenerationDrop,
}) => {
  // [ShotReorderDebug] Debug tag for shot reordering issues
  const REORDER_DEBUG_TAG = '[ShotReorderDebug]';
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: shot.id,
    disabled: isDragDisabled,
  });

  // Drop state for visual feedback
  const [isDropTarget, setIsDropTarget] = useState(false);

  // Detect if this is a generation drag from GenerationsPane
  const isGenerationDrag = useCallback((e: React.DragEvent): boolean => {
    return e.dataTransfer.types.includes('application/x-generation');
  }, []);

  // Handle drag enter for drop feedback
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (isGenerationDrag(e) && onGenerationDrop) {
      e.preventDefault();
      e.stopPropagation();
      setIsDropTarget(true);
    }
  }, [isGenerationDrag, onGenerationDrop]);

  // Handle drag over to allow drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (isGenerationDrag(e) && onGenerationDrop) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setIsDropTarget(true);
    }
  }, [isGenerationDrag, onGenerationDrop]);

  // Handle drag leave
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if we're leaving the container entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDropTarget(false);
    }
  }, []);

  // Handle drop
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropTarget(false);

    if (!onGenerationDrop || !isGenerationDrag(e)) return;

    try {
      const dataString = e.dataTransfer.getData('application/x-generation');
      if (!dataString) return;

      const data: GenerationDropData = JSON.parse(dataString);
      
      console.log('[ShotDrop] Dropping generation onto shot:', {
        shotId: shot.id.substring(0, 8),
        shotName: shot.name,
        generationId: data.generationId?.substring(0, 8),
        timestamp: Date.now()
      });

      // Don't set processing state - let mutation handle its own loading states
      await onGenerationDrop(shot.id, data);
    } catch (error) {
      console.error('[ShotDrop] Error handling drop:', error);
    }
  }, [onGenerationDrop, isGenerationDrag, shot.id, shot.name]);

  // [ShotReorderDebug] Log dragging state changes (only when actually dragging to reduce noise)
  React.useEffect(() => {
    if (isDragging) {
      console.log(`${REORDER_DEBUG_TAG} Shot ${shot.id} is being dragged:`, {
        shotId: shot.id,
        shotName: shot.name,
        shotPosition: shot.position,
        shotIndex,
        isDragging,
        timestamp: Date.now()
      });
    }
  }, [isDragging]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'transition-all duration-200',
        isDropTarget && 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.02]'
      )}
    >
      <VideoShotDisplay
        shot={shot}
        onSelectShot={onSelectShot}
        currentProjectId={currentProjectId}
        dragHandleProps={{
          ...attributes,
          ...listeners,
          disabled: isDragDisabled,
        }}
        dragDisabledReason={disabledReason}
        shouldLoadImages={shouldLoadImages}
        shotIndex={shotIndex}
        projectAspectRatio={projectAspectRatio}
        isHighlighted={isHighlighted || isDropTarget}
      />
    </div>
  );
};

export default SortableShotItem; 