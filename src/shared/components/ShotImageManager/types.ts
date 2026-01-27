import { GenerationRow, PairLoraConfig, PairMotionSettings } from '@/types/shots';
import { SegmentSlot } from '@/tools/travel-between-images/hooks/useSegmentOutputsForShot';
import type { PhaseConfig } from '@/tools/travel-between-images/settings';
import type { PairData } from '@/tools/travel-between-images/components/Timeline/TimelineContainer';

/** Per-pair parameter overrides for showing override icons */
export type PairOverridesMap = Record<number, {
  phaseConfig?: PhaseConfig;
  loras?: PairLoraConfig[];
  motionSettings?: PairMotionSettings;
}>;

export interface ShotImageManagerProps {
  images: GenerationRow[];
  onImageDelete: (shotImageEntryId: string) => void;
  onBatchImageDelete?: (shotImageEntryIds: string[]) => void;
  onImageDuplicate?: (shotImageEntryId: string, timeline_frame: number) => void;
  /** @param draggedItemId - The ID of the item that was actually dragged (for midpoint insertion) */
  onImageReorder: (orderedShotGenerationIds: string[], draggedItemId?: string) => void;
  columns?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  generationMode: 'batch' | 'timeline';
  onMagicEdit?: (imageUrl: string, prompt: string, numImages: number) => void;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;
  projectAspectRatio?: string;
  onImageUpload?: (files: File[]) => Promise<void>;
  isUploadingImage?: boolean;
  onOpenLightbox?: (index: number) => void;
  batchVideoFrames?: number;
  onSelectionChange?: (hasSelection: boolean) => void;
  readOnly?: boolean;
  onFileDrop?: (files: File[], targetPosition?: number, framePosition?: number) => Promise<void>;
  onGenerationDrop?: (generationId: string, imageUrl: string, thumbUrl: string | undefined, targetPosition?: number, framePosition?: number) => Promise<void>;
  shotId?: string;
  projectId?: string;
  toolTypeOverride?: string;
  allShots?: Array<{ id: string; name: string }>;
  selectedShotId?: string;
  onShotChange?: (shotId: string) => void;
  // CRITICAL: targetShotId is the shot selected in the DROPDOWN, not the shot being viewed
  onAddToShot?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onCreateShot?: (shotName: string, files: File[]) => Promise<{shotId?: string; shotName?: string} | void>;
  // Pair prompt props - pass index and optionally pairData (for single-image mode)
  onPairClick?: (pairIndex: number, pairData?: PairData) => void;
  pairPrompts?: Record<number, { prompt: string; negativePrompt: string }>;
  enhancedPrompts?: Record<number, string>;
  defaultPrompt?: string;
  defaultNegativePrompt?: string;
  /** Callback to notify parent of drag state changes - used to suppress query refetches during drag */
  onDragStateChange?: (isDragging: boolean) => void;
  /** Callback to clear enhanced prompt for a pair */
  onClearEnhancedPrompt?: (pairIndex: number) => void;
  /** Per-pair parameter overrides for showing override icons */
  pairOverrides?: PairOverridesMap;
}

/** Props for segment video outputs in batch view */
export interface BatchSegmentOutputProps {
  segmentSlots: SegmentSlot[];
  onSegmentClick: (slotIndex: number) => void;
  onOpenPairSettings?: (pairIndex: number) => void;
  projectAspectRatio?: string;
  isMobile?: boolean;
}

export interface DerivedNavContext {
  sourceGenerationId: string;
  derivedGenerationIds: string[];
}

export interface ExternalGeneration extends GenerationRow {
  based_on?: string;
}

// Props used by the mobile variant (existing component)
export interface BaseShotImageManagerProps {
  images: GenerationRow[];
  onImageDelete: (shotImageEntryId: string) => void;
  onBatchImageDelete?: (shotImageEntryIds: string[]) => void;
  onImageDuplicate?: (shotImageEntryId: string, timeline_frame: number) => void;
  /** @param draggedItemId - The ID of the item that was actually dragged (for midpoint insertion) */
  onImageReorder: (orderedShotGenerationIds: string[], draggedItemId?: string) => void;
  onOpenLightbox?: (index: number) => void;
  onInpaintClick?: (index: number) => void;
  columns?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;
  projectAspectRatio?: string;
  batchVideoFrames?: number;
  onImageUpload?: (files: File[]) => Promise<void>;
  isUploadingImage?: boolean;
  onSelectionChange?: (hasSelection: boolean) => void;
  readOnly?: boolean;
  // Pair prompt props - pass index and optionally pairData (for single-image mode)
  onPairClick?: (pairIndex: number, pairData?: PairData) => void;
  pairPrompts?: Record<number, { prompt: string; negativePrompt: string }>;
  enhancedPrompts?: Record<number, string>;
  defaultPrompt?: string;
  defaultNegativePrompt?: string;
  onClearEnhancedPrompt?: (pairIndex: number) => void;
  /** Per-pair parameter overrides for showing override icons */
  pairOverrides?: PairOverridesMap;
  // Segment video output props
  segmentSlots?: SegmentSlot[];
  onSegmentClick?: (slotIndex: number) => void;
  /** Check if a pair_shot_generation_id has a pending task */
  hasPendingTask?: (pairShotGenerationId: string | null | undefined) => boolean;
}

export interface MobileImageItemProps {
  image: GenerationRow;
  isSelected: boolean;
  index: number;
  onMobileTap: () => void;
  onDelete: () => void;
  onDuplicate?: (shotImageEntryId: string, timeline_frame: number) => void;
  onOpenLightbox?: () => void;
  onInpaintClick?: () => void;
  hideDeleteButton?: boolean;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;
  shouldLoad?: boolean;
  projectAspectRatio?: string;
  frameNumber?: number;
  readOnly?: boolean;
  /** Callback to mark all variants for this generation as viewed */
  onMarkAllViewed?: () => void;
}
