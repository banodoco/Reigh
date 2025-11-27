import React from 'react';
import { GenerationRow } from '@/types/shots';
import { SortableImageItem } from '@/tools/travel-between-images/components/SortableImageItem';
import { cn } from '@/shared/lib/utils';
import { DEFAULT_BATCH_VIDEO_FRAMES } from '../constants';
import { AddImagesCard } from './AddImagesCard';
import { PairPromptIndicator } from './PairPromptIndicator';

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
}) => {
  console.log('[DataTrace] 🖼️  ImageGrid rendering:', {
    imagesCount: images.length,
    imageIds: images.map(img => img.id?.substring(0, 8)), // shot_generations.id
  });
  
  console.log('[PairIndicatorDebug] ImageGrid render:', {
    imagesCount: images.length,
    hasOnPairClick: !!onPairClick,
    hasPairPrompts: !!pairPrompts,
    hasEnhancedPrompts: !!enhancedPrompts,
    pairPromptsKeys: pairPrompts ? Object.keys(pairPrompts) : [],
    enhancedPromptsKeys: enhancedPrompts ? Object.keys(enhancedPrompts) : [],
    defaultPrompt: defaultPrompt?.substring(0, 50),
    defaultNegativePrompt: defaultNegativePrompt?.substring(0, 50),
  });

  return (
    <div
      className={cn("grid gap-3", gridColsClass)}
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
        
        console.log('[DataTrace] 🎨 Rendering image item:', {
          index,
          imageKey: imageKey?.substring(0, 8),
          imageId: image.id?.substring(0, 8),
        });
        
        // Get pair data for the indicator after this image
        const pairPrompt = pairPrompts?.[index];
        const enhancedPrompt = enhancedPrompts?.[index];
        const startImage = images[index];
        const endImage = images[index + 1];
        
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
            
            {/* Pair indicator positioned in the gap to the right */}
            {!isLastImage && onPairClick && (
              <div className="absolute top-1/2 -right-[6px] -translate-y-1/2 translate-x-1/2 z-30 pointer-events-auto">
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

