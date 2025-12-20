import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Shot } from '@/types/shots';
import VideoShotDisplay from './VideoShotDisplay';
import { cn } from '@/shared/lib/utils';
import { isValidDropTarget, getGenerationDropData, isFileDrag, type GenerationDropData } from '@/shared/lib/dragDrop';
import { isVideoGeneration } from '@/shared/lib/typeGuards';
import { Loader2, Check } from 'lucide-react';

export interface DropOptions {
  withoutPosition?: boolean;
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
  onGenerationDrop?: (shotId: string, data: GenerationDropData, options?: DropOptions) => Promise<void>;
  // Drop handling for external files
  onFilesDrop?: (shotId: string, files: File[], options?: DropOptions) => Promise<void>;
  // Initial pending uploads (for newly created shots from drop)
  initialPendingUploads?: number;
  // Baseline non-video image count at the moment the new shot appeared
  // (used to avoid latching after some images already arrived)
  initialPendingBaselineNonVideoCount?: number;
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
  initialPendingBaselineNonVideoCount,
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
  // Track if hovering over the "Without Position" zone
  const [isOverWithoutPositionZone, setIsOverWithoutPositionZone] = useState(false);
  const withoutPositionZoneRef = useRef<HTMLDivElement>(null);
  
  // Track "without position" drop state: 'idle' | 'loading' | 'success'
  const [withoutPositionDropState, setWithoutPositionDropState] = useState<'idle' | 'loading' | 'success'>('idle');
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track "with position" drop state for centered loading indicator
  const [withPositionDropState, setWithPositionDropState] = useState<'idle' | 'loading' | 'success'>('idle');
  const withPositionSuccessTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track uploads using refs so we can compute skeleton count during render (no flicker)
  const expectedNewCountRef = useRef(0);
  const baselineNonVideoIdsRef = useRef<Set<string> | null>(null);
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // "Latch" the initial pending uploads so we don't lose track when parent clears state
  // Once we receive initialPendingUploads > 0, we store it and track progress locally
  const latchedInitialPendingRef = useRef(0);
  const initialBaselineCountRef = useRef(0);
  
  // Get current non-video image IDs
  const nonVideoImageIds = (shot.images || [])
    .filter(img => !isVideoGeneration(img))
    .map(img => img.id);
  const nonVideoImageCount = nonVideoImageIds.length;

  // Latch the initial pending count when we first receive it.
  // IMPORTANT: `initialPendingUploads` is now "remaining" uploads, so baseline is the *current* count.
  if (initialPendingUploads > 0 && latchedInitialPendingRef.current === 0) {
    latchedInitialPendingRef.current = initialPendingUploads;
    initialBaselineCountRef.current =
      typeof initialPendingBaselineNonVideoCount === 'number'
        ? initialPendingBaselineNonVideoCount
        : nonVideoImageCount;
  }

  // Compute pending skeleton count DURING RENDER (no state delay = no flicker)
  let pendingSkeletonCount = 0;
  
  // First check if we have our own drop-initiated pending uploads (from drops on existing shot)
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
  // Otherwise, check for latched initial pending uploads (from newly created shot)
  else if (latchedInitialPendingRef.current > 0) {
    // How many images have appeared since we latched?
    const newlyAppearedCount = nonVideoImageCount - initialBaselineCountRef.current;
    pendingSkeletonCount = Math.max(0, latchedInitialPendingRef.current - newlyAppearedCount);
    
    // If all images have appeared, clear the latch
    if (pendingSkeletonCount === 0) {
      latchedInitialPendingRef.current = 0;
      initialBaselineCountRef.current = 0;
    }
  }

  // If initial pending uploads are fully satisfied, notify parent (effect; avoids forever-skeleton)
  useEffect(() => {
    if (!onInitialPendingUploadsConsumed) return;
    if (latchedInitialPendingRef.current <= 0) return;
    const baseline = initialBaselineCountRef.current;
    const expected = latchedInitialPendingRef.current;
    if (nonVideoImageCount >= baseline + expected) {
      latchedInitialPendingRef.current = 0;
      initialBaselineCountRef.current = 0;
      onInitialPendingUploadsConsumed();
    }
  }, [nonVideoImageCount, onInitialPendingUploadsConsumed]);

  // Track previous pending count to detect when uploads complete
  const prevPendingCountRef = useRef(pendingSkeletonCount);
  
  // When pending count drops to 0 from >0 AND we're showing loading state, show success
  useEffect(() => {
    const wasLoading = prevPendingCountRef.current > 0;
    const nowComplete = pendingSkeletonCount === 0;
    
    if (wasLoading && nowComplete && withPositionDropState === 'loading') {
      // Upload completed - show success state
      setWithPositionDropState('success');
      
      // Clear success state after 1.5s
      if (withPositionSuccessTimeoutRef.current) clearTimeout(withPositionSuccessTimeoutRef.current);
      withPositionSuccessTimeoutRef.current = setTimeout(() => {
        setWithPositionDropState('idle');
        withPositionSuccessTimeoutRef.current = null;
      }, 1500);
    }
    
    prevPendingCountRef.current = pendingSkeletonCount;
  }, [pendingSkeletonCount, withPositionDropState]);

  // Cleanup success timeouts on unmount
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
      if (withPositionSuccessTimeoutRef.current) {
        clearTimeout(withPositionSuccessTimeoutRef.current);
      }
    };
  }, []);

  // Listen for cross-component "Add to shot" button clicks from GenerationsPane
  // This triggers the same skeleton animation as drag-and-drop
  useEffect(() => {
    const handlePendingUpload = (event: CustomEvent<{ shotId: string; expectedCount: number }>) => {
      const { shotId, expectedCount } = event.detail;
      
      // Only handle if this event is for our shot
      if (shotId !== shot.id) return;
      
      console.log('[ShotDrop] Received shot-pending-upload event:', {
        shotId: shotId.substring(0, 8),
        shotName: shot.name,
        expectedCount,
        currentImageCount: nonVideoImageIds.length,
        timestamp: Date.now()
      });
      
      // Trigger the same skeleton setup as drag-drop
      setWithPositionDropState('loading');
      
      // Setup skeleton placeholders
      baselineNonVideoIdsRef.current = new Set(nonVideoImageIds);
      expectedNewCountRef.current = expectedCount;
      
      // Safety timeout - clear after 5s (same as generation drops)
      if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = setTimeout(() => {
        expectedNewCountRef.current = 0;
        baselineNonVideoIdsRef.current = null;
        safetyTimeoutRef.current = null;
      }, 5000);
    };
    
    window.addEventListener('shot-pending-upload', handlePendingUpload as EventListener);
    return () => window.removeEventListener('shot-pending-upload', handlePendingUpload as EventListener);
  }, [shot.id, shot.name, nonVideoImageIds]);

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

  // Handle drop - shared logic for both main area and "without position" zone
  const handleDropInternal = useCallback(async (e: React.DragEvent, withoutPosition: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    
    // For "without position" drops, keep the zone visible with loading state
    if (!withoutPosition) {
      setIsDropTarget(false);
    }
    setIsOverWithoutPositionZone(false);

    const dropOptions: DropOptions = { withoutPosition };

    // Try generation drop first
    const generationData = getGenerationDropData(e);
    if (generationData && onGenerationDrop) {
      console.log('[ShotDrop] Dropping generation onto shot:', {
        shotId: shot.id.substring(0, 8),
        shotName: shot.name,
        generationId: generationData.generationId?.substring(0, 8),
        currentImageCount: nonVideoImageIds.length,
        withoutPosition,
        timestamp: Date.now()
      });

      if (withoutPosition) {
        // For "without position" drops: show loading in the drop zone, no skeleton
        setWithoutPositionDropState('loading');
        
        try {
          await onGenerationDrop(shot.id, generationData, dropOptions);
          // Show success state
          setWithoutPositionDropState('success');
          // Clear success state after 1.5s
          if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
          successTimeoutRef.current = setTimeout(() => {
            setWithoutPositionDropState('idle');
            setIsDropTarget(false);
            successTimeoutRef.current = null;
          }, 1500);
        } catch (error) {
          console.error('[ShotDrop] Error handling generation drop:', error);
          setWithoutPositionDropState('idle');
          setIsDropTarget(false);
        }
      } else {
        // For normal drops: show both skeleton placeholders AND centered loading indicator
        setWithPositionDropState('loading');
        
        // Setup skeleton placeholders
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
          await onGenerationDrop(shot.id, generationData, dropOptions);
          // Show success state
          setWithPositionDropState('success');
          // Clear success state after 1.5s
          if (withPositionSuccessTimeoutRef.current) clearTimeout(withPositionSuccessTimeoutRef.current);
          withPositionSuccessTimeoutRef.current = setTimeout(() => {
            setWithPositionDropState('idle');
            withPositionSuccessTimeoutRef.current = null;
          }, 1500);
        } catch (error) {
          console.error('[ShotDrop] Error handling generation drop:', error);
          setWithPositionDropState('idle');
          // Clear skeleton on error
          expectedNewCountRef.current = 0;
          baselineNonVideoIdsRef.current = null;
          if (safetyTimeoutRef.current) {
            clearTimeout(safetyTimeoutRef.current);
            safetyTimeoutRef.current = null;
          }
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
        setIsDropTarget(false);
        return;
      }

      console.log('[ShotDrop] Dropping files onto shot:', {
        shotId: shot.id.substring(0, 8),
        shotName: shot.name,
        fileCount: validFiles.length,
        currentImageCount: nonVideoImageIds.length,
        withoutPosition,
        timestamp: Date.now()
      });

      if (withoutPosition) {
        // For "without position" drops: show loading in the drop zone, no skeleton
        setWithoutPositionDropState('loading');
        
        try {
          await onFilesDrop(shot.id, validFiles, dropOptions);
          // Show success state
          setWithoutPositionDropState('success');
          // Clear success state after 1.5s
          if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
          successTimeoutRef.current = setTimeout(() => {
            setWithoutPositionDropState('idle');
            setIsDropTarget(false);
            successTimeoutRef.current = null;
          }, 1500);
        } catch (error) {
          console.error('[ShotDrop] Error handling file drop:', error);
          setWithoutPositionDropState('idle');
          setIsDropTarget(false);
        }
      } else {
        // For normal drops: show both skeleton placeholders AND centered loading indicator
        setWithPositionDropState('loading');
        
        // Setup skeleton placeholders
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
          await onFilesDrop(shot.id, validFiles, dropOptions);
          // Show success state
          setWithPositionDropState('success');
          // Clear success state after 1.5s
          if (withPositionSuccessTimeoutRef.current) clearTimeout(withPositionSuccessTimeoutRef.current);
          withPositionSuccessTimeoutRef.current = setTimeout(() => {
            setWithPositionDropState('idle');
            withPositionSuccessTimeoutRef.current = null;
          }, 1500);
        } catch (error) {
          console.error('[ShotDrop] Error handling file drop:', error);
          setWithPositionDropState('idle');
          // Clear skeleton on error
          expectedNewCountRef.current = 0;
          baselineNonVideoIdsRef.current = null;
          if (safetyTimeoutRef.current) {
            clearTimeout(safetyTimeoutRef.current);
            safetyTimeoutRef.current = null;
          }
        }
      }
    }
  }, [onGenerationDrop, onFilesDrop, shot.id, shot.name, nonVideoImageIds]);

  // Handle drop on main area (with position)
  const handleDrop = useCallback((e: React.DragEvent) => {
    handleDropInternal(e, false);
  }, [handleDropInternal]);

  // Handle drop on "Without Position" zone
  const handleWithoutPositionDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleDropInternal(e, true);
  }, [handleDropInternal]);

  // Handle drag events for the "Without Position" zone
  const handleWithoutPositionDragEnter = useCallback((e: React.DragEvent) => {
    if (canAcceptDrop(e)) {
      e.preventDefault();
      e.stopPropagation();
      setIsOverWithoutPositionZone(true);
    }
  }, [canAcceptDrop]);

  const handleWithoutPositionDragOver = useCallback((e: React.DragEvent) => {
    if (canAcceptDrop(e)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setIsOverWithoutPositionZone(true);
    }
  }, [canAcceptDrop]);

  const handleWithoutPositionDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if actually leaving the zone
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsOverWithoutPositionZone(false);
    }
  }, []);

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
        'transition-all duration-200 relative self-start',
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
        dropLoadingState={withPositionDropState}
      />
      
      {/* "Without Position" drop zone - appears when dragging over the shot or during loading/success */}
      {(isDropTarget || withoutPositionDropState !== 'idle') && (
        <div
          ref={withoutPositionZoneRef}
          onDragEnter={handleWithoutPositionDragEnter}
          onDragOver={handleWithoutPositionDragOver}
          onDragLeave={handleWithoutPositionDragLeave}
          onDrop={handleWithoutPositionDrop}
          className={cn(
            'absolute bottom-2 left-2 px-2 py-1 rounded text-xs font-medium transition-all duration-150 z-10 flex items-center gap-1.5',
            // Default state
            withoutPositionDropState === 'idle' && 'bg-muted/90 text-muted-foreground border border-border/50',
            // Hover state (only when idle and hovering)
            withoutPositionDropState === 'idle' && isOverWithoutPositionZone && 'bg-primary text-primary-foreground border-primary scale-105',
            // Loading state
            withoutPositionDropState === 'loading' && 'bg-primary/90 text-primary-foreground border border-primary',
            // Success state
            withoutPositionDropState === 'success' && 'bg-green-600 text-white border border-green-600'
          )}
        >
          {withoutPositionDropState === 'loading' && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Adding...
            </>
          )}
          {withoutPositionDropState === 'success' && (
            <>
              <Check className="h-3 w-3" />
              Added
            </>
          )}
          {withoutPositionDropState === 'idle' && 'Without Position'}
        </div>
      )}
    </div>
  );
};

export default SortableShotItem; 