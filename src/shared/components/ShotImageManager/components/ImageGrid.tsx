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
}

export const ImageGrid: React.FC<ImageGridProps> = ({
  images,
  selectedIds,
  gridColsClass,
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
}) => {
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
        if (index === 0) {
          const firstType = segmentSlots?.[0]?.type || 'none';
          const firstChildId = segmentSlots?.[0]?.type === 'child' ? segmentSlots[0].child.id?.substring(0, 8) : 'n/a';
          console.log(`[BatchSegments:Desktop] SUMMARY slotsCount=${segmentSlots?.length ?? 0} first.type=${firstType} first.childId=${firstChildId}`);
        }
        // FLAT LOG for visibility
        const slotType = segmentSlot?.type || 'none';
        const slotChildId = segmentSlot?.type === 'child' ? segmentSlot.child.id?.substring(0, 8) : 'n/a';
        const slotHasLocation = segmentSlot?.type === 'child' ? !!segmentSlot.child.location : false;
        console.log(`[BatchSegments:Desktop] idx=${index} type=${slotType} childId=${slotChildId} hasLoc=${slotHasLocation}`);
        
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
            
            {/* Video output above pair indicator - positioned in the gap to the right */}
            {(() => {
              const shouldRenderVideo = !isLastImage && segmentSlot && !shouldHideIndicator;
              console.log(`[BatchSegments:Desktop] RENDER idx=${index} last=${isLastImage} slot=${!!segmentSlot} hide=${shouldHideIndicator} → render=${shouldRenderVideo}`);
              return null;
            })()}
            {!isLastImage && segmentSlot && !shouldHideIndicator && (
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
                />
              </div>
            )}
            
            {/* Pair indicator positioned in the gap to the right (below video if present) */}
            {!isLastImage && onPairClick && !shouldHideIndicator && (
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

