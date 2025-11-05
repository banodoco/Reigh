/**
 * Image Loading Debugger
 * 
 * Call these functions in the browser console to diagnose loading issues
 */

// Add to window for easy console access
declare global {
  interface Window {
    imageLoadingDebugger: {
      getGalleryState: () => any;
      getProgressiveState: () => any;
      getCacheState: () => any;
      diagnoseStuckPage: () => any;
      logCurrentIssues: () => void;
    };
  }
}

export const imageLoadingDebugger = {
  /**
   * Get current gallery state
   */
  getGalleryState: () => {
    const galleryElements = document.querySelectorAll('[data-testid="image-gallery"], .image-gallery');
    const progressiveElements = document.querySelectorAll('[data-progressive-loading]');
    
    return {
      galleryElements: galleryElements.length,
      progressiveElements: progressiveElements.length,
      visibleImages: document.querySelectorAll('img[src]:not([style*="display: none"])').length,
      hiddenImages: document.querySelectorAll('img[src][style*="display: none"]').length,
      loadingSkeletons: document.querySelectorAll('.animate-pulse').length,
      timestamp: new Date().toISOString()
    };
  },

  /**
   * Get progressive loading state from console logs
   */
  getProgressiveState: () => {
    // This would need to be called from console to access recent logs
    return {
      instruction: 'Check console logs for [ProgressiveDebug] entries',
      tip: 'Look for multiple sessions running simultaneously or rapid effect triggers'
    };
  },

  /**
   * Get cache state
   */
  getCacheState: () => {
    const imageElements = document.querySelectorAll('img[src]');
    const cached = Array.from(imageElements).filter(img => {
      const src = (img as HTMLImageElement).src;
      return src && !src.includes('placeholder');
    });
    
    return {
      totalImages: imageElements.length,
      cachedImages: cached.length,
      cacheRatio: cached.length / imageElements.length,
      timestamp: new Date().toISOString()
    };
  },

  /**
   * Diagnose stuck page issues
   */
  diagnoseStuckPage: () => {
    const issues = [];
    
    // Check for loading skeletons that have been visible too long
    const skeletons = document.querySelectorAll('.animate-pulse');
    if (skeletons.length > 0) {
      issues.push(`${skeletons.length} loading skeletons still visible`);
    }
    
    // Check for images without src
    const imagesWithoutSrc = document.querySelectorAll('img:not([src])');
    if (imagesWithoutSrc.length > 0) {
      issues.push(`${imagesWithoutSrc.length} images without src attribute`);
    }
    
    // Check for failed images
    const failedImages = Array.from(document.querySelectorAll('img[src]')).filter(img => {
      const htmlImg = img as HTMLImageElement;
      return htmlImg.complete && htmlImg.naturalWidth === 0;
    });
    if (failedImages.length > 0) {
      issues.push(`${failedImages.length} images failed to load`);
    }
    
    // Check for duplicate progressive loading sessions (look for overlapping logs)
    return {
      issues,
      recommendations: [
        'Check console for multiple progressive loading sessions',
        'Look for rapid effect re-triggers in [ProgressiveDebug] logs',
        'Verify onImagesReady callbacks are executing',
        'Check if images array is being recreated on every render'
      ],
      timestamp: new Date().toISOString()
    };
  },

  /**
   * Log current issues to console with formatting
   */
  logCurrentIssues: () => {
    console.group('🖼️ Image Loading Diagnostics');
    
    const galleryState = imageLoadingDebugger.getGalleryState();
    const cacheState = imageLoadingDebugger.getCacheState();
    const diagnosis = imageLoadingDebugger.diagnoseStuckPage();
    console.groupEnd();
    
    // Return summary for easy access
    return {
      summary: `${galleryState.visibleImages} visible images, ${galleryState.loadingSkeletons} loading, ${diagnosis.issues.length} issues`,
      details: { galleryState, cacheState, diagnosis }
    };
  }
};

// Make available globally for console access
if (typeof window !== 'undefined') {
  window.imageLoadingDebugger = imageLoadingDebugger;
}

export default imageLoadingDebugger;
