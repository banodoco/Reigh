import type { Shot, GenerationRow } from "@/types/shots";

// Define types here to avoid circular imports
export interface MetadataLora {
  id: string;
  name: string;
  path: string;
  strength: number;
  previewImageUrl?: string;
}

export interface DisplayableMetadata extends Record<string, any> {
  prompt?: string;
  imagesPerPrompt?: number;
  seed?: number;
  width?: number;
  height?: number;
  content_type?: string;
  activeLoras?: MetadataLora[];
  depthStrength?: number;
  softEdgeStrength?: number;
  userProvidedImageUrl?: string | null;
  num_inference_steps?: number;
  guidance_scale?: number;
  scheduler?: string;
  tool_type?: string;
  original_image_filename?: string;
  original_frame_timestamp?: number;
  source_frames?: number;
  original_duration?: number;
}

export interface GeneratedImageWithMetadata {
  id: string;
  url: string;
  thumbUrl?: string;
  prompt?: string;
  seed?: number;
  metadata?: DisplayableMetadata;
  temp_local_path?: string;
  error?: string;
  file?: File;
  isVideo?: boolean;
  unsaved?: boolean;
  createdAt?: string;
  updatedAt?: string | null;
  starred?: boolean;
  shot_id?: string;
  position?: number | null;
  timeline_frame?: number | null;
  name?: string; // Variant name for the generation
  all_shot_associations?: Array<{ shot_id: string; position: number | null; timeline_frame?: number | null }>;
  based_on?: string | null; // ID of source generation for lineage tracking (magic edits, variations)
  derivedCount?: number; // Number of generations based on this one
}

export interface ImageGalleryProps {
  images: GeneratedImageWithMetadata[];
  onDelete?: (id: string) => void;
  isDeleting?: string | null;
  onApplySettings?: (metadata: DisplayableMetadata) => void;
  allShots: Shot[];
  lastShotId?: string;
  lastShotNameForTooltip?: string;
  onAddToLastShot?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToLastShotWithoutPosition?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  currentToolType?: string;
  initialFilterState?: boolean;
  currentViewingShotId?: string;
  offset?: number;
  totalCount?: number;
  whiteText?: boolean;
  columnsPerRow?: number;
  itemsPerPage?: number;
  initialMediaTypeFilter?: 'all' | 'image' | 'video';
  onServerPageChange?: (page: number, fromBottom?: boolean) => void;
  serverPage?: number;
  showShotFilter?: boolean;
  initialShotFilter?: string;
  onShotFilterChange?: (shotId: string) => void;
  initialExcludePositioned?: boolean;
  onExcludePositionedChange?: (exclude: boolean) => void;
  showSearch?: boolean;
  initialSearchTerm?: string;
  onSearchChange?: (searchTerm: string) => void;
  onMediaTypeFilterChange?: (mediaType: 'all' | 'image' | 'video') => void;
  onToggleStar?: (id: string, starred: boolean) => void;
  initialStarredFilter?: boolean;
  onStarredFilterChange?: (starredOnly: boolean) => void;
  onToolTypeFilterChange?: (enabled: boolean) => void;
  initialToolTypeFilter?: boolean;
  currentToolTypeName?: string;
  formAssociatedShotId?: string | null;
  onSwitchToAssociatedShot?: (shotId: string) => void;
  reducedSpacing?: boolean;
  hidePagination?: boolean;
  hideTopFilters?: boolean;
  onPrefetchAdjacentPages?: (prevPage: number | null, nextPage: number | null) => void;
  enableAdjacentPagePreloading?: boolean;
  onCreateShot?: (shotName: string, files: File[]) => Promise<void>;
  onBackfillRequest?: (deletedCount: number, currentPage: number, itemsPerPage: number) => Promise<GeneratedImageWithMetadata[]>;
  showDelete?: boolean;
  showDownload?: boolean;
  showShare?: boolean;
  showEdit?: boolean;
  showStar?: boolean;
  showAddToShot?: boolean;
  enableSingleClick?: boolean;
  onImageClick?: (image: GeneratedImageWithMetadata) => void;
  hideBottomPagination?: boolean;
  /** When true, videos are rendered as static thumbnail images instead of HoverScrubVideo for better performance */
  videosAsThumbnails?: boolean;
  /** When true, hides the shot filter notifier message */
  hideShotNotifier?: boolean;
}

