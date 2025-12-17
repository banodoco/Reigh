import React, { useState, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Shot } from '@/types/shots';
import VideoShotDisplay from './VideoShotDisplay';
import { cn } from '@/shared/lib/utils';
import { isValidDropTarget, getGenerationDropData, isFileDrag, type GenerationDropData } from '@/shared/lib/dragDrop';
import { Loader2 } from 'lucide-react';

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
  // Drop handling for external files
  onFilesDrop?: (shotId: string, files: File[]) => Promise<void>;
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
  onFilesDrop,
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
  // Processing state for showing loading indicator during upload
  const [isProcessingDrop, setIsProcessingDrop] = useState(false);

  // Check if we can accept this drop (generation or file)
  const canAcceptDrop = useCallback((e: React.DragEvent): boolean => {
    return isValidDropTarget(e) && (!!onGenerationDrop || !!onFilesDrop);
  }, [onGenerationDrop, onFilesDrop]);

  // Handle drag enter for drop feedback
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (canAcceptDrop(e)) {
      e.preventDefault();
      e.stopPropagation();
      setIsDropTarget(true);
    }
  }, [canAcceptDrop]);

  // Handle drag over to allow drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (canAcceptDrop(e)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setIsDropTarget(true);
    }
  }, [canAcceptDrop]);

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

    // Try generation drop first (fast - no loading state needed)
    const generationData = getGenerationDropData(e);
    if (generationData && onGenerationDrop) {
      console.log('[ShotDrop] Dropping generation onto shot:', {
        shotId: shot.id.substring(0, 8),
        shotName: shot.name,
        generationId: generationData.generationId?.substring(0, 8),
        timestamp: Date.now()
      });

      try {
        await onGenerationDrop(shot.id, generationData);
      } catch (error) {
        console.error('[ShotDrop] Error handling generation drop:', error);
      }
      return;
    }

    // Try file drop
    if (isFileDrag(e) && onFilesDrop) {
      const files = Array.from(e.dataTransfer.files);
      const validImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      const validFiles = files.filter(file => validImageTypes.includes(file.type));
      
      if (validFiles.length === 0) {
        console.warn('[ShotDrop] No valid image files in drop');
        return;
      }

      console.log('[ShotDrop] Dropping files onto shot:', {
        shotId: shot.id.substring(0, 8),
        shotName: shot.name,
        fileCount: validFiles.length,
        timestamp: Date.now()
      });

      setIsProcessingDrop(true);
      try {
        await onFilesDrop(shot.id, validFiles);
      } catch (error) {
        console.error('[ShotDrop] Error handling file drop:', error);
      } finally {
        setIsProcessingDrop(false);
      }
    }
  }, [onGenerationDrop, onFilesDrop, shot.id, shot.name]);

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
        'transition-all duration-200 relative',
        isDropTarget && 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.02]',
        isProcessingDrop && 'ring-2 ring-primary/50 ring-offset-2 ring-offset-background'
      )}
    >
      <VideoShotDisplay
        shot={shot}
        onSelectShot={onSelectShot}
        currentProjectId={currentProjectId}
        // TEMPORARILY DISABLED: Drag handle hidden while reordering is disabled (Task 20)
        // To restore: uncomment dragHandleProps below
        // dragHandleProps={{
        //   ...attributes,
        //   ...listeners,
        //   disabled: isDragDisabled,
        // }}
        // dragDisabledReason={disabledReason}
        shouldLoadImages={shouldLoadImages}
        shotIndex={shotIndex}
        projectAspectRatio={projectAspectRatio}
        isHighlighted={isHighlighted || isDropTarget}
      />
      {/* Loading overlay during file upload */}
      {isProcessingDrop && (
        <div className="absolute inset-0 bg-background/60 backdrop-blur-sm rounded-lg flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <span className="text-sm text-muted-foreground">Uploading...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SortableShotItem; 