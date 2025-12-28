import { GenerationRow } from '@/types/shots';

/**
 * Mobile double-tap detection logic with video preloading on first tap
 */
export const createMobileTapHandler = (
  lastTouchTimeRef: React.MutableRefObject<number>,
  doubleTapTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>,
  onLightboxOpen: (index: number) => void,
  onFirstTapPreload?: (index: number) => void
) => {
  return (originalIndex: number) => {
    const currentTime = Date.now();
    const timeSinceLastTap = currentTime - lastTouchTimeRef.current;
    
    console.log('[MobileTapFlow] createMobileTapHandler INVOKED', {
      originalIndex,
      currentTime,
      lastTouchTime: lastTouchTimeRef.current,
      timeSinceLastTap,
      isDoubleTap: timeSinceLastTap < 300 && timeSinceLastTap > 0,
      hasOnFirstTapPreload: !!onFirstTapPreload,
      onLightboxOpenType: typeof onLightboxOpen,
      timestamp: Date.now()
    });
    
    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
      // This is a double-tap, clear any pending timeout and open lightbox
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
        doubleTapTimeoutRef.current = null;
      }
      console.log('[MobileTapFlow] ✅ DOUBLE-TAP detected - calling onLightboxOpen', {
        originalIndex,
        timeSinceLastTap,
        timestamp: Date.now()
      });
      onLightboxOpen(originalIndex);
      console.log('[MobileTapFlow] ✅ onLightboxOpen RETURNED', {
        originalIndex,
        timestamp: Date.now()
      });
    } else {
      // This is a single tap, start preloading the video for faster lightbox experience
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
      
      // NEW: Start preloading video immediately on first tap
      if (onFirstTapPreload) {
        console.log('[MobileTapFlow] First tap detected - starting video preload', {
          originalIndex,
          timeSinceLastTap,
          timestamp: Date.now()
        });
        onFirstTapPreload(originalIndex);
      } else {
        console.log('[MobileTapFlow] First tap detected - NO preload callback', {
          originalIndex,
          timeSinceLastTap,
          timestamp: Date.now()
        });
      }
      
      doubleTapTimeoutRef.current = setTimeout(() => {
        // Single tap timeout - video preloading continues in background
        console.log('[MobileTapFlow] Single tap timeout - video continues preloading', {
          originalIndex,
          timestamp: Date.now()
        });
        doubleTapTimeoutRef.current = null;
      }, 300);
    }
    
    lastTouchTimeRef.current = currentTime;
  };
};

/**
 * Derive input images from task params
 * Strips any surrounding quotes from URLs that may have been improperly stored
 * For segment tasks (child generations), returns empty array since they don't have
 * their own input images - they inherit from the parent orchestrator
 */
export const deriveInputImages = (task: any): string[] => {
  const cleanUrl = (url: string): string => {
    if (typeof url !== 'string') return url;
    // Remove surrounding quotes if present
    return url.replace(/^["']|["']$/g, '');
  };
  
  const p = task?.params || {};
  
  // For segment tasks, don't show the parent's input images
  // Segments are generated from the video flow, not from input images
  if (p.segment_index !== undefined) {
    return [];
  }
  
  if (Array.isArray(p.input_images) && p.input_images.length > 0) {
    return p.input_images.map(cleanUrl);
  }
  if (p.full_orchestrator_payload && Array.isArray(p.full_orchestrator_payload.input_image_paths_resolved)) {
    return p.full_orchestrator_payload.input_image_paths_resolved.map(cleanUrl);
  }
  // Check orchestrator_details for input images (parent/orchestrator tasks store data here)
  if (p.orchestrator_details && Array.isArray(p.orchestrator_details.input_image_paths_resolved)) {
    return p.orchestrator_details.input_image_paths_resolved.map(cleanUrl);
  }
  if (Array.isArray(p.input_image_paths_resolved)) {
    return p.input_image_paths_resolved.map(cleanUrl);
  }
  return [];
};

/**
 * Result of extracting segment input images from params
 */
export interface SegmentImageInfo {
  startUrl: string | undefined;
  endUrl: string | undefined;
  startGenId: string | undefined;
  endGenId: string | undefined;
  hasImages: boolean;
}

/**
 * Extract segment input images from task/generation params
 *
 * This is the single source of truth for getting start/end images for a segment.
 * It handles multiple storage formats:
 * 1. Explicit URLs (start_image_url, end_image_url) - used by individual segment tasks
 * 2. Array indexing (input_image_paths_resolved[index]) - used by orchestrator tasks
 *
 * @param params - Task or generation params object
 * @param segmentIndex - Optional segment index for array-based extraction (default: 0)
 * @returns SegmentImageInfo with start/end URLs and generation IDs
 */
export const extractSegmentImages = (params: any, segmentIndex: number = 0): SegmentImageInfo => {
  const cleanUrl = (url: string | undefined): string | undefined => {
    if (typeof url !== 'string') return undefined;
    // Remove surrounding quotes if present
    return url.replace(/^["']|["']$/g, '');
  };

  const p = params || {};
  const orchestratorDetails = p.orchestrator_details || {};
  const individualSegmentParams = p.individual_segment_params || {};

  // Priority 1: Explicit URLs (set by individual_travel_segment tasks)
  const explicitStartUrl = cleanUrl(individualSegmentParams.start_image_url || p.start_image_url);
  const explicitEndUrl = cleanUrl(individualSegmentParams.end_image_url || p.end_image_url);
  const explicitStartGenId = individualSegmentParams.start_image_generation_id || p.start_image_generation_id;
  const explicitEndGenId = individualSegmentParams.end_image_generation_id || p.end_image_generation_id;

  // Priority 2: Array-based extraction (orchestrator tasks store all images in arrays)
  const allUrls = orchestratorDetails.input_image_paths_resolved ||
                  p.input_image_paths_resolved ||
                  [];
  const allGenIds = orchestratorDetails.input_image_generation_ids ||
                    p.input_image_generation_ids ||
                    [];

  // For segment at index N, we need images[N] (start) and images[N+1] (end)
  const arrayStartUrl = cleanUrl(allUrls[segmentIndex]);
  const arrayEndUrl = cleanUrl(allUrls[segmentIndex + 1]);
  const arrayStartGenId = allGenIds[segmentIndex];
  const arrayEndGenId = allGenIds[segmentIndex + 1];

  // Use explicit values if available, otherwise fall back to array
  const startUrl = explicitStartUrl || arrayStartUrl;
  const endUrl = explicitEndUrl || arrayEndUrl;
  const startGenId = explicitStartGenId || arrayStartGenId;
  const endGenId = explicitEndGenId || arrayEndGenId;

  return {
    startUrl,
    endUrl,
    startGenId,
    endGenId,
    hasImages: !!(startUrl || endUrl),
  };
};

/**
 * Handle hover preview opening details
 */
export const createHoverDetailsHandler = (
  hoveredVideo: GenerationRow | null,
  sortedVideoOutputs: GenerationRow[],
  isMobile: boolean,
  setSelectedVideoForDetails: (video: GenerationRow | null) => void,
  setLightboxIndex: (index: number | null) => void,
  handleHoverEnd: () => void
) => {
  return () => {
    if (hoveredVideo) {
      if (isMobile) {
        // On mobile, open the modal for better UX
        setSelectedVideoForDetails(hoveredVideo);
      } else {
        // On desktop, open the lightbox
        const videoIndex = sortedVideoOutputs.findIndex(v => v.id === hoveredVideo.id);
        if (videoIndex !== -1) {
          setLightboxIndex(videoIndex);
        }
      }
      // Clear hover state when opening details
      handleHoverEnd();
    }
  };
};

/**
 * Create stable callback for showing task details
 */
export const createTaskDetailsHandler = (
  lightboxIndex: number | null,
  sortedVideoOutputs: GenerationRow[],
  setSelectedVideoForDetails: (video: GenerationRow | null) => void,
  setShowTaskDetailsModal: (show: boolean) => void,
  setLightboxIndex: (index: number | null) => void
) => {
  return () => {
    console.log('[TaskToggle] VideoOutputsGallery: handleShowTaskDetails called', { 
      lightboxIndex, 
      video: sortedVideoOutputs[lightboxIndex || 0]?.id,
    });
    const currentVideo = sortedVideoOutputs[lightboxIndex || 0];
    if (currentVideo) {
      // Set up task details modal state first
      setSelectedVideoForDetails(currentVideo);
      // Use setTimeout to ensure state update happens before opening modal
      setTimeout(() => {
        setShowTaskDetailsModal(true);
        // Close lightbox after modal is set to open
        setLightboxIndex(null);
        console.log('[TaskToggle] VideoOutputsGallery: State updated for task details modal', {
          newSelectedVideo: currentVideo.id,
          newShowModal: true,
          closedLightbox: true
        });
      }, 100);
    } else {
      console.error('[TaskToggle] VideoOutputsGallery: No current video found for lightboxIndex:', lightboxIndex);
    }
  };
};
