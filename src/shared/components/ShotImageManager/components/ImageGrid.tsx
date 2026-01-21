import React from 'react';
import { GenerationRow, PairLoraConfig, PairMotionSettings } from '@/types/shots';
import { SortableImageItem } from '@/tools/travel-between-images/components/SortableImageItem';
import { cn } from '@/shared/lib/utils';
import { DEFAULT_BATCH_VIDEO_FRAMES } from '../constants';
import { AddImagesCard } from './AddImagesCard';
import { PairPromptIndicator } from './PairPromptIndicator';
import { InlineSegmentVideo } from '@/tools/travel-between-images/components/Timeline/InlineSegmentVideo';
import { SegmentSlot } from '@/tools/travel-between-images/hooks/useSegmentOutputsForShot';
import type { PhaseConfig } from '@/tools/travel-between-images/settings';
import type { UseVideoScrubbingReturn } from '@/shared/hooks/useVideoScrubbing';

const FPS = 16;

interface ImageGridProps {
  images: GenerationRow[];
  selectedIds: string[];
  gridColsClass: string;
  /** Number of columns in the grid (for row boundary calculations) */
  columns?: number;
  onItemClick: (imageKey: string, event: React.MouseEvent) => void;
  onItemDoubleClick: (idx: number) => void;
  onInpaintClick: (idx: number) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (shotImageEntryId: string, timeline_frame: number) => void;
  isMobile: boolean;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;
  projectAspectRatio?: string;
  batchVideoFrames?: number;
  onGridDoubleClick?: () => void;
  onImageUpload?: (files: File[]) => Promise<void>;
  isUploadingImage?: boolean;
  readOnly?: boolean;
  // Pair prompt props - only pass index, parent handles lookup from pairDataByIndex
  onPairClick?: (pairIndex: number) => void;
  pairPrompts?: Record<number, { prompt: string; negativePrompt: string }>;
  enhancedPrompts?: Record<number, string>;
  defaultPrompt?: string;
  defaultNegativePrompt?: string;
  onClearEnhancedPrompt?: (pairIndex: number) => void;
  // NEW: Per-pair parameter overrides for showing override icons
  pairOverrides?: Record<number, {
    phaseConfig?: PhaseConfig;
    loras?: PairLoraConfig[];
    motionSettings?: PairMotionSettings;
  }>;
  isDragging?: boolean;
  activeDragId?: string | null;
  dropTargetIndex?: number | null;
  // Segment video output props
  segmentSlots?: SegmentSlot[];
  onSegmentClick?: (slotIndex: number) => void;
  /** Check if a pair_shot_generation_id has a pending task */
  hasPendingTask?: (pairShotGenerationId: string | null | undefined) => boolean;
  // Scrubbing preview props
  /** Index of the currently scrubbing segment (null if none) */
  activeScrubbingIndex?: number | null;
  /** Callback when scrubbing starts on a segment */
  onScrubbingStart?: (index: number, rect: DOMRect) => void;
  /** Scrubbing hook return for the active segment */
  scrubbing?: UseVideoScrubbingReturn;
}

export const ImageGrid: React.FC<ImageGridProps> = ({
  images,
  selectedIds,
  gridColsClass,
  columns = 4,
  onItemClick,
  onItemDoubleClick,
  onInpaintClick,
  onDelete,
  onDuplicate,
  isMobile,
  duplicatingImageId,
  duplicateSuccessImageId,
  projectAspectRatio,
  batchVideoFrames = DEFAULT_BATCH_VIDEO_FRAMES,
  onGridDoubleClick,
  onImageUpload,
  isUploadingImage,
  readOnly = false,
  onPairClick,
  pairPrompts,
  enhancedPrompts,
  defaultPrompt,
  defaultNegativePrompt,
  onClearEnhancedPrompt,
  pairOverrides,
  isDragging = false,
  activeDragId = null,
  dropTargetIndex = null,
  segmentSlots,
  onSegmentClick,
  hasPendingTask,
  activeScrubbingIndex,
  onScrubbingStart,
  scrubbing,
}) => {
  // [BatchModeSelection] Debug: trace segmentSlots in ImageGrid
  console.log('[BatchModeSelection] ImageGrid received segmentSlots:', {
    count: segmentSlots?.length || 0,
    slotSummary: segmentSlots?.slice(0, 3).map(s => ({
      index: s.index,
      type: s.type,
      childId: s.type === 'child' ? s.child.id.substring(0, 8) : null,
      hasLocation: s.type === 'child' ? !!s.child.location : false,
    })) || [],
    imagesCount: images.length,
  });

  return (
    <div
      className={cn("grid gap-3 pt-6 overflow-visible", gridColsClass)}
      onDoubleClick={(e) => {
        // Only deselect if double-clicking on the grid itself, not on an image
        if (e.target === e.currentTarget) {
          onGridDoubleClick?.();
        }
      }}
    >
      {images.map((image, index) => {
        // imageKey is shot_generations.id - unique per entry
        const imageKey = image.id as string;
        const desktopSelected = selectedIds.includes(imageKey);
        // Use actual timeline_frame for duplication (not calculated from index)
        // For batch view display: show index × duration per pair in seconds
        const durationPerPairSeconds = batchVideoFrames / FPS;
        const displayTimeSeconds = index * durationPerPairSeconds;
        const actualTimelineFrame = (image as any).timeline_frame;
        const isLastImage = index === images.length - 1;

        // Get pair data for the indicator after this image
        const pairPrompt = pairPrompts?.[index];
        const enhancedPrompt = enhancedPrompts?.[index];
        const startImage = images[index];
        const endImage = images[index + 1];
        
        // Get segment slot for this pair (if available)
        const segmentSlot = segmentSlots?.find(s => s.index === index);
        // Get previous pair's segment slot (for cross-row display)
        const prevSegmentSlot = index > 0 ? segmentSlots?.find(s => s.index === index - 1) : undefined;

        // Row boundary detection
        const isAtEndOfRow = (index + 1) % columns === 0;
        const isAtStartOfRow = index > 0 && index % columns === 0;

        // Previous pair data (for cross-row indicator on left)
        const prevPairPrompt = index > 0 ? pairPrompts?.[index - 1] : undefined;
        const prevEnhancedPrompt = index > 0 ? enhancedPrompts?.[index - 1] : undefined;
        const prevStartImage = index > 0 ? images[index - 1] : undefined;
        const prevEndImage = images[index]; // Current image is the end of the previous pair

        // Hide indicator if this item is being dragged OR if an external file is being dropped into this gap
        // The gap after item 'index' corresponds to insertion at 'index + 1'
        const isDraggingThisItem = image.id === activeDragId;
        const isDropTargetGap = dropTargetIndex !== null && dropTargetIndex === index + 1;

        // Only hide if specifically affected by drag/drop
        const shouldHideIndicator = isDraggingThisItem || isDropTargetGap;
        
        return (
          <div key={imageKey} data-sortable-item className="relative">
            <SortableImageItem
              image={image}
              isSelected={desktopSelected}
              isDragDisabled={isMobile}
              onClick={isMobile ? undefined : (e) => {
                onItemClick(imageKey, e);
              }}
              onDelete={() => onDelete(image.id)}
              onDuplicate={onDuplicate}
              timeline_frame={actualTimelineFrame}
              displayTimeSeconds={displayTimeSeconds}
              onDoubleClick={isMobile ? () => {} : () => onItemDoubleClick(index)}
              onInpaintClick={isMobile ? undefined : () => onInpaintClick(index)}
              duplicatingImageId={duplicatingImageId}
              duplicateSuccessImageId={duplicateSuccessImageId}
              shouldLoad={true}
              projectAspectRatio={projectAspectRatio}
            />

            {/* Cross-row: Previous pair's video output - shows on LEFT at start of row */}
            {isAtStartOfRow && prevSegmentSlot && !shouldHideIndicator && (() => {
              const slotIndex = index - 1;
              const isActiveScrubbing = activeScrubbingIndex === slotIndex;
              return (
                <div className="absolute -top-4 -left-[6px] -translate-x-1/2 z-20 pointer-events-auto w-20">
                  <InlineSegmentVideo
                    slot={prevSegmentSlot}
                    pairIndex={slotIndex}
                    onClick={() => onSegmentClick?.(slotIndex)}
                    onOpenPairSettings={onPairClick}
                    projectAspectRatio={projectAspectRatio}
                    isMobile={isMobile}
                    layout="flow"
                    compact={true}
                    isPending={hasPendingTask?.(prevSegmentSlot.pairShotGenerationId)}
                    // Scrubbing props
                    isScrubbingActive={isActiveScrubbing}
                    onScrubbingStart={onScrubbingStart ? (rect: DOMRect) => onScrubbingStart(slotIndex, rect) : undefined}
                    scrubbingContainerRef={isActiveScrubbing ? scrubbing?.containerRef : undefined}
                    scrubbingContainerProps={isActiveScrubbing ? scrubbing?.containerProps : undefined}
                    scrubbingProgress={isActiveScrubbing ? scrubbing?.progress : undefined}
                  />
                </div>
              );
            })()}

            {/* Cross-row: Previous pair indicator - shows on LEFT at start of row (below video if present) */}
            {isAtStartOfRow && onPairClick && !shouldHideIndicator && (
              <div className={cn(
                "absolute -left-[6px] -translate-y-1/2 -translate-x-1/2 z-30 pointer-events-auto",
                prevSegmentSlot ? "top-[calc(50%+24px)]" : "top-1/2"
              )}>
                <PairPromptIndicator
                  pairIndex={index - 1}
                  frames={batchVideoFrames}
                  startFrame={(index - 1) * batchVideoFrames}
                  endFrame={index * batchVideoFrames}
                  onClearEnhancedPrompt={onClearEnhancedPrompt}
                  onPairClick={() => {
                    console.log('[PairIndicatorDebug] Cross-row pair indicator clicked (left)', { pairIndex: index - 1 });
                    onPairClick(index - 1);
                  }}
                  pairPrompt={prevPairPrompt?.prompt}
                  pairNegativePrompt={prevPairPrompt?.negativePrompt}
                  enhancedPrompt={prevEnhancedPrompt}
                  defaultPrompt={defaultPrompt}
                  defaultNegativePrompt={defaultNegativePrompt}
                  pairPhaseConfig={pairOverrides?.[index - 1]?.phaseConfig}
                  pairLoras={pairOverrides?.[index - 1]?.loras}
                  pairMotionSettings={pairOverrides?.[index - 1]?.motionSettings}
                />
              </div>
            )}

            {/* Video output above pair indicator - positioned in the gap to the right (skip if at end of row) */}
            {!isLastImage && !isAtEndOfRow && segmentSlot && !shouldHideIndicator && (() => {
              const slotIndex = index;
              const isActiveScrubbing = activeScrubbingIndex === slotIndex;
              return (
                <div className="absolute -top-4 -right-[6px] translate-x-1/2 z-20 pointer-events-auto w-20">
                  <InlineSegmentVideo
                    slot={segmentSlot}
                    pairIndex={slotIndex}
                    onClick={() => onSegmentClick?.(slotIndex)}
                    onOpenPairSettings={onPairClick}
                    projectAspectRatio={projectAspectRatio}
                    isMobile={isMobile}
                    layout="flow"
                    compact={true}
                    isPending={hasPendingTask?.(segmentSlot.pairShotGenerationId)}
                    // Scrubbing props
                    isScrubbingActive={isActiveScrubbing}
                    onScrubbingStart={onScrubbingStart ? (rect: DOMRect) => onScrubbingStart(slotIndex, rect) : undefined}
                    scrubbingContainerRef={isActiveScrubbing ? scrubbing?.containerRef : undefined}
                    scrubbingContainerProps={isActiveScrubbing ? scrubbing?.containerProps : undefined}
                    scrubbingProgress={isActiveScrubbing ? scrubbing?.progress : undefined}
                  />
                </div>
              );
            })()}

            {/* Pair indicator positioned in the gap to the right (below video if present, skip if at end of row) */}
            {!isLastImage && !isAtEndOfRow && onPairClick && !shouldHideIndicator && (
              <div className={cn(
                "absolute -right-[6px] -translate-y-1/2 translate-x-1/2 z-30 pointer-events-auto",
                segmentSlot ? "top-[calc(50%+24px)]" : "top-1/2"
              )}>
                <PairPromptIndicator
                  pairIndex={index}
                  frames={batchVideoFrames}
                  startFrame={index * batchVideoFrames}
                  endFrame={(index + 1) * batchVideoFrames}
                  onClearEnhancedPrompt={onClearEnhancedPrompt}
                  onPairClick={() => {
                    console.log('[PairIndicatorDebug] Pair indicator clicked', { index });
                    onPairClick(index);
                  }}
                  pairPrompt={pairPrompt?.prompt}
                  pairNegativePrompt={pairPrompt?.negativePrompt}
                  enhancedPrompt={enhancedPrompt}
                  defaultPrompt={defaultPrompt}
                  defaultNegativePrompt={defaultNegativePrompt}
                  pairPhaseConfig={pairOverrides?.[index]?.phaseConfig}
                  pairLoras={pairOverrides?.[index]?.loras}
                  pairMotionSettings={pairOverrides?.[index]?.motionSettings}
                />
              </div>
            )}
          </div>
        );
      })}
      
      {/* Add Images card - appears as next item in grid */}
      {onImageUpload && !readOnly && (
        <AddImagesCard
          projectAspectRatio={projectAspectRatio}
          onImageUpload={onImageUpload}
          isUploadingImage={isUploadingImage}
        />
      )}
    </div>
  );
};

