/**
 * Autoplay Monitor - Tracks autoplay state changes over time
 * 
 * This utility periodically monitors video autoplay states to help
 * identify when and why autoplay permissions change.
 */

let monitoringActive = false;
let monitorInterval: NodeJS.Timeout | null = null;

interface VideoState {
  element: HTMLVideoElement;
  src: string;
  paused: boolean;
  currentTime: number;
  readyState: number;
  isGallery: boolean;
  isLightbox: boolean;
}

let previousVideoStates: VideoState[] = [];

const captureVideoStates = (): VideoState[] => {
  const videos = document.querySelectorAll('video');
  return Array.from(videos).map(video => ({
    element: video,
    src: video.src?.substring(video.src.lastIndexOf('/') + 1) || 'no-src',
    paused: video.paused,
    currentTime: video.currentTime,
    readyState: video.readyState,
    isGallery: !!video.getAttribute('data-video-id'),
    isLightbox: !!video.getAttribute('data-lightbox-video')
  }));
};

const compareVideoStates = (current: VideoState[], previous: VideoState[]): boolean => {
  if (current.length !== previous.length) return true;
  
  return current.some((curr, index) => {
    const prev = previous[index];
    if (!prev) return true;
    
    return curr.paused !== prev.paused || 
           Math.abs(curr.currentTime - prev.currentTime) > 0.1 ||
           curr.readyState !== prev.readyState;
  });
};

const logVideoStateChanges = (current: VideoState[], previous: VideoState[]) => {
  const changes: any[] = [];
  
  // Check for new/removed videos
  if (current.length !== previous.length) {
    changes.push({
      type: 'count_change',
      from: previous.length,
      to: current.length
    });
  }
  
  // Check for state changes in existing videos
  current.forEach((curr, index) => {
    const prev = previous[index];
    if (!prev) return;
    
    if (curr.paused !== prev.paused) {
      changes.push({
        type: 'play_state_change',
        video: curr.src,
        isLightbox: curr.isLightbox,
        isGallery: curr.isGallery,
        from: prev.paused ? 'paused' : 'playing',
        to: curr.paused ? 'paused' : 'playing'
      });
    }
    
    if (curr.readyState !== prev.readyState) {
      changes.push({
        type: 'ready_state_change',
        video: curr.src,
        from: prev.readyState,
        to: curr.readyState
      });
    }
  });
  
  if (changes.length > 0) {
    ),
      timestamp: Date.now()
    });
  }
};

export const startAutoplayMonitoring = () => {
  if (monitoringActive || process.env.NODE_ENV !== 'development') return;
  
  monitoringActive = true;
  previousVideoStates = captureVideoStates();
  
  monitorInterval = setInterval(() => {
    const currentStates = captureVideoStates();
    
    if (compareVideoStates(currentStates, previousVideoStates)) {
      logVideoStateChanges(currentStates, previousVideoStates);
      previousVideoStates = currentStates;
    }
  }, 1000); // Check every second
};

export const stopAutoplayMonitoring = () => {
  if (!monitoringActive) return;
  
  monitoringActive = false;
  
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
};

// Auto-start monitoring in development
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  // Start monitoring after a short delay to let the page load
  setTimeout(() => {
    startAutoplayMonitoring();
  }, 2000);
}
