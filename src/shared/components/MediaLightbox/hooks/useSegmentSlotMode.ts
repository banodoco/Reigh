import { useCallback, useMemo } from 'react';
import { GenerationRow } from '@/types/shots';
import { SegmentSlotModeProps } from '../types';

interface UseSegmentSlotModeProps {
  segmentSlotMode?: SegmentSlotModeProps;
  mediaProp?: GenerationRow;
  hasNextProp: boolean;
  hasPreviousProp: boolean;
  onNext?: () => void;
  onPrevious?: () => void;
}

interface UseSegmentSlotModeReturn {
  /** Whether in segment slot mode */
  isSegmentSlotMode: boolean;
  /** Whether segment slot has a video */
  hasSegmentVideo: boolean;
  /** Whether in form-only mode (segment slot without video) */
  isFormOnlyMode: boolean;
  /** The resolved media object (from slot or prop, with placeholder fallback) */
  media: GenerationRow;
  /** Whether there's a next item to navigate to */
  hasNext: boolean;
  /** Whether there's a previous item to navigate to */
  hasPrevious: boolean;
  /** Navigate to next (handles slot mode vs normal mode) */
  handleSlotNavNext: () => void;
  /** Navigate to previous (handles slot mode vs normal mode) */
  handleSlotNavPrev: () => void;
}

// Placeholder media for form-only mode - ensures hooks always receive valid data
const placeholderMedia: GenerationRow = {
  id: 'placeholder',
  type: 'image',
  imageUrl: '',
  location: '',
  thumbUrl: '',
  contentType: 'image/png',
  params: {},
  metadata: {},
  created_at: new Date().toISOString(),
};

/**
 * Hook to manage segment slot mode state and navigation.
 * Handles the unified segment editor experience where the lightbox
 * can be opened in "slot mode" for navigating between segment pairs.
 */
export function useSegmentSlotMode({
  segmentSlotMode,
  mediaProp,
  hasNextProp,
  hasPreviousProp,
  onNext,
  onPrevious,
}: UseSegmentSlotModeProps): UseSegmentSlotModeReturn {
  // When in segment slot mode, derive media and navigation from the slot data
  const isSegmentSlotMode = !!segmentSlotMode;
  const hasSegmentVideo = isSegmentSlotMode && !!segmentSlotMode.segmentVideo;

  // Flag for simplified form-only rendering (segment slot mode without video)
  const isFormOnlyMode = isSegmentSlotMode && !hasSegmentVideo;

  // Debug logging for segment slot navigation
  console.log('[SegmentSlotNav] useSegmentSlotMode:', {
    isSegmentSlotMode,
    hasSegmentVideo,
    isFormOnlyMode,
    currentIndex: segmentSlotMode?.currentIndex,
    totalPairs: segmentSlotMode?.totalPairs,
    hasMediaProp: !!mediaProp,
    segmentVideoId: segmentSlotMode?.segmentVideo?.id?.substring(0, 8),
  });

  // More detailed debug logging with filterable tag
  if (isSegmentSlotMode) {
    console.log('[SegmentClickDebug] Segment slot mode active:', {
      currentIndex: segmentSlotMode?.currentIndex,
      hasSegmentVideo,
      segmentVideoId: segmentSlotMode?.segmentVideo?.id?.substring(0, 8),
      segmentVideoLocation: segmentSlotMode?.segmentVideo?.location?.substring(0, 50),
      segmentVideoType: segmentSlotMode?.segmentVideo?.type,
      mediaPropId: mediaProp?.id?.substring(0, 8),
      mediaPropType: mediaProp?.type,
      mediaPropLocation: mediaProp?.location?.substring(0, 50),
      pairDataIndex: segmentSlotMode?.pairData?.index,
      activeChildGenerationId: segmentSlotMode?.activeChildGenerationId?.substring(0, 8),
    });
  }

  // Raw media: use slot's video if in slot mode, otherwise use prop (can be undefined in form-only mode)
  const rawMedia = hasSegmentVideo
    ? segmentSlotMode!.segmentVideo!
    : mediaProp;

  // Media is always defined - use placeholder in form-only mode
  const media = rawMedia ?? placeholderMedia;

  // Slot-based navigation
  const hasNext = isSegmentSlotMode
    ? segmentSlotMode!.currentIndex < segmentSlotMode!.totalPairs - 1
    : hasNextProp;
  const hasPrevious = isSegmentSlotMode
    ? segmentSlotMode!.currentIndex > 0
    : hasPreviousProp;

  // Navigation handlers for slot mode
  const handleSlotNavNext = useCallback(() => {
    console.log('[SegmentSlotNav] handleSlotNavNext called:', {
      isSegmentSlotMode,
      hasNext,
      currentIndex: segmentSlotMode?.currentIndex,
      targetIndex: (segmentSlotMode?.currentIndex ?? -1) + 1,
    });
    if (isSegmentSlotMode && hasNext && segmentSlotMode) {
      segmentSlotMode.onNavigateToPair(segmentSlotMode.currentIndex + 1);
    } else if (onNext) {
      onNext();
    }
  }, [isSegmentSlotMode, hasNext, segmentSlotMode, onNext]);

  const handleSlotNavPrev = useCallback(() => {
    console.log('[SegmentSlotNav] handleSlotNavPrev called:', {
      isSegmentSlotMode,
      hasPrevious,
      currentIndex: segmentSlotMode?.currentIndex,
      targetIndex: (segmentSlotMode?.currentIndex ?? 1) - 1,
    });
    if (isSegmentSlotMode && hasPrevious && segmentSlotMode) {
      segmentSlotMode.onNavigateToPair(segmentSlotMode.currentIndex - 1);
    } else if (onPrevious) {
      onPrevious();
    }
  }, [isSegmentSlotMode, hasPrevious, segmentSlotMode, onPrevious]);

  return {
    isSegmentSlotMode,
    hasSegmentVideo,
    isFormOnlyMode,
    media,
    hasNext,
    hasPrevious,
    handleSlotNavNext,
    handleSlotNavPrev,
  };
}
