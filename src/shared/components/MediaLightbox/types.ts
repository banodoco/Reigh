import type { GenerationRow } from '@/types/shots';

export interface BrushStroke {
  id: string;
  points: Array<{ x: number; y: number }>;
  isErasing: boolean;
}

export interface QuickCreateSuccess {
  isSuccessful: boolean;
  shotId: string | null;
  shotName: string | null;
  isLoading?: boolean; // True when shot is created but still syncing/loading
}

export interface ShotOption {
  id: string;
  name: string;
}

/**
 * Unified segment slot data for MediaLightbox segment editor mode.
 * Combines pair data (images on timeline) with optional segment video.
 */
export interface SegmentSlotModeData {
  /** Current pair index (0-based) */
  currentIndex: number;
  /** Total number of pairs */
  totalPairs: number;

  /** Pair data from the timeline */
  pairData: {
    index: number;
    frames: number;
    startFrame: number;
    endFrame: number;
    startImage: {
      id: string;           // shot_generation.id
      generationId?: string; // generation_id
      url?: string;
      thumbUrl?: string;
      position: number;
    } | null;
    endImage: {
      id: string;
      generationId?: string;
      url?: string;
      thumbUrl?: string;
      position: number;
    } | null;
  };

  /** The video generation if this slot has one, null otherwise */
  segmentVideo: GenerationRow | null;
  /** Active child generation ID (for creating variants on correct child) */
  activeChildGenerationId?: string;

  /** Navigation callback - called with new pair index */
  onNavigateToPair: (index: number) => void;

  /** Project/shot context */
  projectId: string | null;
  shotId: string;
  /** Parent generation ID (for regeneration task linking) */
  parentGenerationId?: string;

  /** Prompts for this pair */
  pairPrompt?: string;
  pairNegativePrompt?: string;
  defaultPrompt?: string;
  defaultNegativePrompt?: string;
  enhancedPrompt?: string;

  /** Project resolution for output */
  projectResolution?: string;

  /** Structure video config for this segment (if applicable) */
  structureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth' | null;
  structureVideoDefaults?: {
    motionStrength: number;
    treatment: 'adjust' | 'clip';
    uni3cEndPercent: number;
  };
  structureVideoUrl?: string;
  structureVideoFrameRange?: {
    segmentStart: number;
    segmentEnd: number;
    videoTotalFrames: number;
    videoFps: number;
  };

  /** Callback when frame count changes - for instant timeline updates */
  onFrameCountChange?: (pairShotGenerationId: string, frameCount: number) => void;
  /** Callback when generate is initiated (for optimistic UI updates) */
  onGenerateStarted?: (pairShotGenerationId: string | null | undefined) => void;
}
