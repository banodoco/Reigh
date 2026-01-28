/**
 * Video Trim Editor Types
 *
 * TypeScript interfaces for the video trimming feature.
 * Following the MediaLightbox pattern for type organization.
 */

import { GenerationRow } from '@/types/shots';

// Re-export variant types from shared (canonical source)
export type { GenerationVariant, UseVariantsReturn } from '@/shared/hooks/useVariants';

/**
 * State for video trimming controls
 */
export interface TrimState {
  /** Seconds to cut from the beginning */
  startTrim: number;
  /** Seconds to cut from the end */
  endTrim: number;
  /** Total video duration in seconds */
  videoDuration: number;
  /** Whether the current trim values are valid */
  isValid: boolean;
}

/**
 * Return type for useVideoTrimming hook
 */
export interface UseVideoTrimmingReturn {
  trimState: TrimState;
  setStartTrim: (seconds: number) => void;
  setEndTrim: (seconds: number) => void;
  resetTrim: () => void;
  setVideoDuration: (duration: number) => void;
  /** Duration after trimming is applied */
  trimmedDuration: number;
  /** Preview start time (where kept portion begins) */
  previewStartTime: number;
  /** Preview end time (where kept portion ends) */
  previewEndTime: number;
  /** Whether any trimming has been applied */
  hasTrimChanges: boolean;
}

/**
 * Return type for useTrimSave hook
 */
export interface UseTrimSaveReturn {
  isSaving: boolean;
  saveProgress: number;
  saveError: string | null;
  saveSuccess: boolean;
  saveTrimmedVideo: () => Promise<void>;
  resetSaveState: () => void;
}

/**
 * Props for TrimControlsPanel component
 */
export interface TrimControlsPanelProps {
  /** Current trim state */
  trimState: TrimState;
  /** Handler to update start trim */
  onStartTrimChange: (seconds: number) => void;
  /** Handler to update end trim */
  onEndTrimChange: (seconds: number) => void;
  /** Handler to reset trim */
  onResetTrim: () => void;
  /** Calculated trimmed duration */
  trimmedDuration: number;
  /** Whether trim has changes */
  hasTrimChanges: boolean;
  /** Save handler */
  onSave: () => void;
  /** Whether save is in progress */
  isSaving: boolean;
  /** Save progress 0-100 */
  saveProgress: number;
  /** Save error message */
  saveError: string | null;
  /** Save success state */
  saveSuccess: boolean;
  /** Close handler */
  onClose: () => void;
  /** Variant: desktop or mobile */
  variant: 'desktop' | 'mobile';
  /** Video URL for frame extraction */
  videoUrl?: string;
  /** Current playback time for timeline indicator */
  currentTime?: number;
  /** Video ref for scrubbing/seeking */
  videoRef?: React.RefObject<HTMLVideoElement>;
  /** Hide the header (when embedded in a parent panel with its own header) */
  hideHeader?: boolean;
}

/**
 * Props for TrimTimelineBar component
 */
export interface TrimTimelineBarProps {
  /** Total video duration in seconds */
  duration: number;
  /** Current start trim in seconds */
  startTrim: number;
  /** Current end trim in seconds */
  endTrim: number;
  /** Handler for start trim change */
  onStartTrimChange: (seconds: number) => void;
  /** Handler for end trim change */
  onEndTrimChange: (seconds: number) => void;
  /** Current playback position (optional) */
  currentTime?: number;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Video ref for scrubbing/seeking (optional, enables click-to-seek) */
  videoRef?: React.RefObject<HTMLVideoElement>;
  /** Handler when user seeks by clicking on timeline */
  onSeek?: (time: number) => void;
}

/**
 * Props for VariantSelector component
 */
export interface VariantSelectorProps {
  /** List of variants */
  variants: GenerationVariant[];
  /** Currently active variant ID */
  activeVariantId: string | null;
  /** Handler for variant selection */
  onVariantSelect: (variantId: string) => void;
  /** Handler to make a variant primary */
  onMakePrimary?: (variantId: string) => Promise<void>;
  /** Whether component is loading */
  isLoading?: boolean;
  /** Handler to promote variant to a standalone generation */
  onPromoteToGeneration?: (variantId: string) => Promise<void>;
  /** Whether a promotion is currently in progress */
  isPromoting?: boolean;
  /** Handler to load a variant's settings into the regenerate form */
  onLoadVariantSettings?: (variantParams: Record<string, any>) => void;
  /** Handler to delete a variant (not available for primary variant) */
  onDeleteVariant?: (variantId: string) => Promise<void>;
  /** Read-only mode - hides action buttons (Make Primary, Promote, Delete) */
  readOnly?: boolean;
}

/**
 * Props for TrimPreviewPlayer component
 */
export interface TrimPreviewPlayerProps {
  /** Video source URL */
  src: string;
  /** Poster/thumbnail URL */
  poster?: string;
  /** Trim state for visualization */
  trimState: TrimState;
  /** Current time callback */
  onTimeUpdate?: (time: number) => void;
  /** Duration loaded callback */
  onDurationLoaded?: (duration: number) => void;
  /** Whether to show trim overlay */
  showTrimOverlay?: boolean;
}

/**
 * Parameters for video trimming utility
 */
export interface TrimVideoParams {
  sourceUrl: string;
  startTime: number;
  endTime: number;
  projectId: string;
  generationId: string;
}

/**
 * Result from video trimming utility
 */
export interface TrimVideoResult {
  videoUrl: string;
  thumbnailUrl: string;
}

