/**
 * Shared types for ShotImageManager components
 */

import { GenerationRow } from '@/types/shots';

export interface BaseShotImageManagerProps {
  images: GenerationRow[];
  onImageDelete: (shotImageEntryId: string) => void;
  onBatchImageDelete?: (shotImageEntryIds: string[]) => void;
  onImageDuplicate?: (shotImageEntryId: string, timeline_frame: number) => void;
  onImageReorder: (orderedShotGenerationIds: string[]) => void;
  columns?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  generationMode: 'batch' | 'timeline';
  onImageSaved?: (imageId: string, newImageUrl: string, createNew?: boolean) => Promise<void>;
  onMagicEdit?: (imageUrl: string, prompt: string, numImages: number) => void;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;
  projectAspectRatio?: string;
}

export interface MobileImageItemProps {
  image: GenerationRow;
  isSelected: boolean;
  index: number;
  onMobileTap: () => void;
  onDelete: () => void;
  onDuplicate?: (shotImageEntryId: string, timeline_frame: number) => void;
  hideDeleteButton?: boolean;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;
  shouldLoad?: boolean;
  projectAspectRatio?: string;
}
