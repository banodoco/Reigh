import { GenerationRow } from '@/types/shots';

/**
 * Mobile double-tap detection logic
 */
export const createMobileTapHandler = (
  lastTouchTimeRef: React.MutableRefObject<number>,
  doubleTapTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>,
  onLightboxOpen: (index: number) => void
) => {
  return (originalIndex: number) => {
    const currentTime = Date.now();
    const timeSinceLastTap = currentTime - lastTouchTimeRef.current;
    
    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
      // This is a double-tap, clear any pending timeout and open lightbox
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
        doubleTapTimeoutRef.current = null;
      }
      onLightboxOpen(originalIndex);
    } else {
      // This is a single tap, set a timeout to handle it if no second tap comes
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
      doubleTapTimeoutRef.current = setTimeout(() => {
        // Single tap on mobile - you could add single tap behavior here if needed
        doubleTapTimeoutRef.current = null;
      }, 300);
    }
    
    lastTouchTimeRef.current = currentTime;
  };
};

/**
 * Derive input images from task params
 */
export const deriveInputImages = (task: any): string[] => {
  const p = task?.params || {};
  if (Array.isArray(p.input_images) && p.input_images.length > 0) return p.input_images;
  if (p.full_orchestrator_payload && Array.isArray(p.full_orchestrator_payload.input_image_paths_resolved)) {
    return p.full_orchestrator_payload.input_image_paths_resolved;
  }
  if (Array.isArray(p.input_image_paths_resolved)) return p.input_image_paths_resolved;
  return [];
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
