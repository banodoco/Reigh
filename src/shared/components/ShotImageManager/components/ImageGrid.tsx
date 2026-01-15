import React from 'react';
import { GenerationRow } from '@/types/shots';
import { SortableImageItem } from '@/tools/travel-between-images/components/SortableImageItem';
import { cn } from '@/shared/lib/utils';
import { DEFAULT_BATCH_VIDEO_FRAMES } from '../constants';
import { AddImagesCard } from './AddImagesCard';
import { PairPromptIndicator } from './PairPromptIndicator';
import { BatchSegmentVideo } from './BatchSegmentVideo';
import { SegmentSlot } from '@/tools/travel-between-images/hooks/useSegmentOutputsForShot';

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
  // Pair prompt props
  onPairClick?: (pairIndex: number, pairData: any) => void;
  pairPrompts?: Record<number, { prompt: string; negativePrompt: string }>;
  enhancedPrompts?: Record<number, string>;
  defaultPrompt?: string;
  defaultNegativePrompt?: string;
  onClearEnhancedPrompt?: (pairIndex: number) => void;
  isDragging?: boolean;
  activeDragId?: string | null;
  dropTargetIndex?: number | null;
  // Segment video output props
  segmentSlots?: SegmentSlot[];
  onSegmentClick?: (slotIndex: number) => void;
  /** Check if a pair_shot_generation_id has a pending task */
  hasPendingTask?: (pairShotGenerationId: string | null | undefined) => boolean;
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
  isDragging = false,
  activeDragId = null,
  dropTargetIndex = null,
  segmentSlots,
  onSegmentClick,
  hasPendingTask,
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
            {isAtStartOfRow && prevSegmentSlot && !shouldHideIndicator && (
              <div className="absolute -top-4 -left-[6px] -translate-x-1/2 z-20 pointer-events-auto w-28">
                <BatchSegmentVideo
                  slot={prevSegmentSlot}
                  pairIndex={index - 1}
                  onClick={() => onSegmentClick?.(index - 1)}
                  onOpenPairSettings={onPairClick ? (pairIdx) => onPairClick(pairIdx, {
                    index: pairIdx,
                    frames: batchVideoFrames,
                    startFrame: pairIdx * batchVideoFrames,
                    endFrame: (pairIdx + 1) * batchVideoFrames,
                    startImage: images[pairIdx] ? {
                      id: images[pairIdx].id,
                      url: images[pairIdx].imageUrl || images[pairIdx].location,
                      thumbUrl: images[pairIdx].thumbUrl,
                      position: pairIdx + 1
                    } : null,
                    endImage: images[pairIdx + 1] ? {
                      id: images[pairIdx + 1].id,
                      url: images[pairIdx + 1].imageUrl || images[pairIdx + 1].location,
                      thumbUrl: images[pairIdx + 1].thumbUrl,
                      position: pairIdx + 2
                    } : null
                  }) : undefined}
                  projectAspectRatio={projectAspectRatio}
                  isMobile={isMobile}
                  compact={true}
                  isPending={hasPendingTask?.(prevSegmentSlot.pairShotGenerationId)}
                />
              </div>
            )}

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
                    onPairClick(index - 1, {
                      index: index - 1,
                      frames: batchVideoFrames,
                      startFrame: (index - 1) * batchVideoFrames,
                      endFrame: index * batchVideoFrames,
                      startImage: prevStartImage ? {
                        id: prevStartImage.id,
                        url: prevStartImage.imageUrl || prevStartImage.location,
                        thumbUrl: prevStartImage.thumbUrl,
                        position: index
                      } : null,
                      endImage: prevEndImage ? {
                        id: prevEndImage.id,
                        url: prevEndImage.imageUrl || prevEndImage.location,
                        thumbUrl: prevEndImage.thumbUrl,
                        position: index + 1
                      } : null
                    });
                  }}
                  pairPrompt={prevPairPrompt?.prompt}
                  pairNegativePrompt={prevPairPrompt?.negativePrompt}
                  enhancedPrompt={prevEnhancedPrompt}
                  defaultPrompt={defaultPrompt}
                  defaultNegativePrompt={defaultNegativePrompt}
                />
              </div>
            )}

            {/* Video output above pair indicator - positioned in the gap to the right (skip if at end of row) */}
            {!isLastImage && !isAtEndOfRow && segmentSlot && !shouldHideIndicator && (
              <div className="absolute -top-4 -right-[6px] translate-x-1/2 z-20 pointer-events-auto w-28">
                <BatchSegmentVideo
                  slot={segmentSlot}
                  pairIndex={index}
                  onClick={() => onSegmentClick?.(index)}
                  onOpenPairSettings={onPairClick ? (pairIdx) => onPairClick(pairIdx, {
                    index: pairIdx,
                    frames: batchVideoFrames,
                    startFrame: pairIdx * batchVideoFrames,
                    endFrame: (pairIdx + 1) * batchVideoFrames,
                    startImage: images[pairIdx] ? {
                      id: images[pairIdx].id,
                      url: images[pairIdx].imageUrl || images[pairIdx].location,
                      thumbUrl: images[pairIdx].thumbUrl,
                      position: pairIdx + 1
                    } : null,
                    endImage: images[pairIdx + 1] ? {
                      id: images[pairIdx + 1].id,
                      url: images[pairIdx + 1].imageUrl || images[pairIdx + 1].location,
                      thumbUrl: images[pairIdx + 1].thumbUrl,
                      position: pairIdx + 2
                    } : null
                  }) : undefined}
                  projectAspectRatio={projectAspectRatio}
                  isMobile={isMobile}
                  compact={true}
                  isPending={hasPendingTask?.(segmentSlot.pairShotGenerationId)}
                />
              </div>
            )}

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
                    onPairClick(index, {
                      index,
                      frames: batchVideoFrames,
                      startFrame: index * batchVideoFrames,
                      endFrame: (index + 1) * batchVideoFrames,
                      startImage: startImage ? {
                        id: startImage.id, // shot_generations.id
                        url: startImage.imageUrl || startImage.location,
                        thumbUrl: startImage.thumbUrl,
                        position: index + 1
                      } : null,
                      endImage: endImage ? {
                        id: endImage.id, // shot_generations.id
                        url: endImage.imageUrl || endImage.location,
                        thumbUrl: endImage.thumbUrl,
                        position: index + 2
                      } : null
                    });
                  }}
                  pairPrompt={pairPrompt?.prompt}
                  pairNegativePrompt={pairPrompt?.negativePrompt}
                  enhancedPrompt={enhancedPrompt}
                  defaultPrompt={defaultPrompt}
                  defaultNegativePrompt={defaultNegativePrompt}
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

