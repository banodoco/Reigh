import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Shot } from '@/types/shots';
import VideoShotDisplay from './VideoShotDisplay';
import { cn } from '@/shared/lib/utils';
import { isValidDropTarget, getGenerationDropData, isFileDrag, type GenerationDropData } from '@/shared/lib/dragDrop';
import { isVideoGeneration } from '@/shared/lib/typeGuards';

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
  // Initial pending uploads (for newly created shots from drop)
  initialPendingUploads?: number;
  // Callback when initial pending uploads are consumed
  onInitialPendingUploadsConsumed?: () => void;
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
  initialPendingUploads = 0,
  onInitialPendingUploadsConsumed,
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
  
  // Track uploads using refs so we can compute skeleton count during render (no flicker)
  const expectedNewCountRef = useRef(0);
  const baselineNonVideoIdsRef = useRef<Set<string> | null>(null);
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get current non-video image IDs
  const nonVideoImageIds = (shot.images || [])
    .filter(img => !isVideoGeneration(img))
    .map(img => img.id);
  const nonVideoImageCount = nonVideoImageIds.length;

  // Compute pending skeleton count DURING RENDER (no state delay = no flicker)
  let pendingSkeletonCount = 0;
  
  // First check if we have our own drop-initiated pending uploads
  if (expectedNewCountRef.current > 0 && baselineNonVideoIdsRef.current) {
    const baseline = baselineNonVideoIdsRef.current;
    const newlyAppearedCount = nonVideoImageIds.filter(id => !baseline.has(id)).length;
    pendingSkeletonCount = Math.max(0, expectedNewCountRef.current - newlyAppearedCount);
    
    // If all images have appeared, clear the refs
    if (pendingSkeletonCount === 0) {
      expectedNewCountRef.current = 0;
      baselineNonVideoIdsRef.current = null;
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
    }
  }
  // Otherwise, check for initial pending uploads (from newly created shot)
  else if (initialPendingUploads > 0) {
    // Show skeletons for images that haven't appeared yet
    pendingSkeletonCount = Math.max(0, initialPendingUploads - nonVideoImageCount);
  }

  // If initial pending uploads are fully satisfied, notify parent (in an effect, not during render)
  useEffect(() => {
    if (!onInitialPendingUploadsConsumed) return;
    if (initialPendingUploads <= 0) return;
    if (nonVideoImageCount < initialPendingUploads) return;
    onInitialPendingUploadsConsumed();
  }, [initialPendingUploads, nonVideoImageCount, onInitialPendingUploadsConsumed]);

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

    // Try generation drop first
    const generationData = getGenerationDropData(e);
    if (generationData && onGenerationDrop) {
      console.log('[ShotDrop] Dropping generation onto shot:', {
        shotId: shot.id.substring(0, 8),
        shotName: shot.name,
        generationId: generationData.generationId?.substring(0, 8),
        currentImageCount: nonVideoImageIds.length,
        timestamp: Date.now()
      });

      // Snapshot IDs at drop time - skeleton count computed during render
      baselineNonVideoIdsRef.current = new Set(nonVideoImageIds);
      expectedNewCountRef.current = 1; // Generation drop adds 1 image
      
      // Safety timeout - clear after 5s (generation drops are fast)
      if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = setTimeout(() => {
        expectedNewCountRef.current = 0;
        baselineNonVideoIdsRef.current = null;
        safetyTimeoutRef.current = null;
      }, 5000);

      try {
        await onGenerationDrop(shot.id, generationData);
        // Don't clear here - the render-time computation will clear it when image appears
      } catch (error) {
        console.error('[ShotDrop] Error handling generation drop:', error);
        // On error, clear immediately
        expectedNewCountRef.current = 0;
        baselineNonVideoIdsRef.current = null;
        if (safetyTimeoutRef.current) {
          clearTimeout(safetyTimeoutRef.current);
          safetyTimeoutRef.current = null;
        }
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
        currentImageCount: nonVideoImageIds.length,
        timestamp: Date.now()
      });

      // Snapshot IDs at drop time - skeleton count computed during render
      baselineNonVideoIdsRef.current = new Set(nonVideoImageIds);
      expectedNewCountRef.current = validFiles.length;
      
      // Safety timeout - clear after 10s if images don't appear
      if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = setTimeout(() => {
        expectedNewCountRef.current = 0;
        baselineNonVideoIdsRef.current = null;
        safetyTimeoutRef.current = null;
      }, 10000);
      
      try {
        await onFilesDrop(shot.id, validFiles);
        // Don't clear here - the render-time computation will clear it when images appear
      } catch (error) {
        console.error('[ShotDrop] Error handling file drop:', error);
        // On error, clear immediately
        expectedNewCountRef.current = 0;
        baselineNonVideoIdsRef.current = null;
        if (safetyTimeoutRef.current) {
          clearTimeout(safetyTimeoutRef.current);
          safetyTimeoutRef.current = null;
        }
      }
    }
  }, [onGenerationDrop, onFilesDrop, shot.id, shot.name, nonVideoImageIds]);

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
        isDropTarget && 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.02]'
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
        pendingUploads={pendingSkeletonCount}
      />
    </div>
  );
};

export default SortableShotItem; 