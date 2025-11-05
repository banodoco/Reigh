/**
 * Autoplay Debugger - Comprehensive mobile autoplay policy analysis
 * 
 * This utility helps debug why autoplay fails on mobile devices,
 * especially in scenarios with multiple video elements.
 */

export interface AutoplayContext {
  // Video elements on page
  totalVideos: number;
  playingVideos: number;
  pausedVideos: number;
  galleryVideos: number;
  lightboxVideos: number;
  
  // User interaction context
  hasUserGesture: boolean;
  documentFocused: boolean;
  visibilityState: string;
  
  // Browser context
  isMobile: boolean;
  userAgent: string;
  
  // Autoplay policy hints
  likelyAutoplayBlocked: boolean;
  possibleCauses: string[];
  
  timestamp: number;
}

export const getAutoplayContext = (isMobile: boolean): AutoplayContext => {
  const allVideos = document.querySelectorAll('video');
  const playingVideos = Array.from(allVideos).filter(v => !v.paused);
  const galleryVideos = document.querySelectorAll('[data-video-id]');
  const lightboxVideos = document.querySelectorAll('[data-lightbox-video]');
  
  // Heuristics for detecting autoplay blocking
  const hasMultipleVideos = allVideos.length > 1;
  const hasPlayingVideos = playingVideos.length > 0;
  const isBackground = document.visibilityState !== 'visible';
  
  const likelyAutoplayBlocked = isMobile && (hasMultipleVideos || isBackground);
  
  const possibleCauses: string[] = [];
  if (isMobile) possibleCauses.push('Mobile browser autoplay restrictions');
  if (hasMultipleVideos) possibleCauses.push(`Multiple videos competing (${allVideos.length} total)`);
  if (hasPlayingVideos) possibleCauses.push(`Other videos already playing (${playingVideos.length})`);
  if (isBackground) possibleCauses.push('Page in background/hidden');
  if (!document.hasFocus()) possibleCauses.push('Document not focused');
  
  return {
    totalVideos: allVideos.length,
    playingVideos: playingVideos.length,
    pausedVideos: allVideos.length - playingVideos.length,
    galleryVideos: galleryVideos.length,
    lightboxVideos: lightboxVideos.length,
    
    hasUserGesture: true, // We assume user opened lightbox
    documentFocused: document.hasFocus(),
    visibilityState: document.visibilityState,
    
    isMobile,
    userAgent: navigator.userAgent,
    
    likelyAutoplayBlocked,
    possibleCauses,
    
    timestamp: Date.now()
  };
};

export const logAutoplayAttempt = (
  context: AutoplayContext,
  videoSrc: string,
  success: boolean,
  error?: Error
) => {
  const logLevel = success ? 'log' : 'error';
  const emoji = success ? '✅' : '❌';
  
  console[logLevel](`[AutoplayDebugger] ${emoji} Autoplay ${success ? 'SUCCESS' : 'FAILED'}`, {
    videoSrc: videoSrc.substring(videoSrc.lastIndexOf('/') + 1),
    success,
    error: error ? {
      name: error.name,
      message: error.message,
      isAutoplayBlocked: error.name === 'NotAllowedError'
    } : null,
    context,
    
    // Quick diagnosis
    diagnosis: {
      primarySuspect: context.likelyAutoplayBlocked ? 
        'Mobile autoplay policy + multiple videos' : 
        'Unknown cause',
      recommendations: success ? [] : [
        'Try user gesture before autoplay',
        'Reduce number of video elements',
        'Use poster images instead of videos in gallery',
        'Implement click-to-play fallback'
      ]
    }
  });
};

export const trackVideoStates = () => {
  const allVideos = document.querySelectorAll('video');
  const states = Array.from(allVideos).map((video, index) => ({
    index,
    src: video.src?.substring(video.src.lastIndexOf('/') + 1) || 'no-src',
    paused: video.paused,
    muted: video.muted,
    readyState: video.readyState,
    currentTime: video.currentTime,
    isGalleryVideo: !!video.getAttribute('data-video-id'),
    isLightboxVideo: !!video.getAttribute('data-lightbox-video')
  }));
  
  return states;
};
