import React from 'react';
import { GenerationRow } from '@/types/shots';
import { SortableImageItem } from '@/tools/travel-between-images/components/SortableImageItem';
import { cn } from '@/shared/lib/utils';
import { DEFAULT_BATCH_VIDEO_FRAMES } from '../constants';
import { AddImagesCard } from './AddImagesCard';

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
  imageDeletionSettings: any;
  updateImageDeletionSettings: (settings: any) => void;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;
  projectAspectRatio?: string;
  batchVideoFrames?: number;
  onGridDoubleClick?: () => void;
  onImageUpload?: (files: File[]) => Promise<void>;
  isUploadingImage?: boolean;
  readOnly?: boolean;
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
  imageDeletionSettings,
  updateImageDeletionSettings,
  duplicatingImageId,
  duplicateSuccessImageId,
  projectAspectRatio,
  batchVideoFrames = DEFAULT_BATCH_VIDEO_FRAMES,
  onGridDoubleClick,
  onImageUpload,
  isUploadingImage,
  readOnly = false
}) => {
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
        const imageKey = ((image as any).shotImageEntryId ?? (image as any).id) as string;
        const desktopSelected = selectedIds.includes(imageKey);
        const frameNumber = index * batchVideoFrames;
        
        return (
          <div key={image.shotImageEntryId} data-sortable-item>
            <SortableImageItem
              image={image}
              isSelected={desktopSelected}
              isDragDisabled={isMobile}
              onClick={isMobile ? undefined : (e) => {
                onItemClick(imageKey, e);
              }}
              onDelete={() => onDelete(image.shotImageEntryId)}
              onDuplicate={onDuplicate}
              timeline_frame={frameNumber}
              onDoubleClick={isMobile ? () => {} : () => onItemDoubleClick(index)}
              onInpaintClick={isMobile ? undefined : () => onInpaintClick(index)}
              skipConfirmation={imageDeletionSettings.skipConfirmation}
              onSkipConfirmationSave={() => updateImageDeletionSettings({ skipConfirmation: true })}
              duplicatingImageId={duplicatingImageId}
              duplicateSuccessImageId={duplicateSuccessImageId}
              shouldLoad={true}
              projectAspectRatio={projectAspectRatio}
            />
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

