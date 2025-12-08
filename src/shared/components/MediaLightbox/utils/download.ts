import { toast } from 'sonner';

/**
 * Detect if running as iOS/iPadOS PWA (standalone mode)
 */
const isIOSPwa = (): boolean => {
  // Check if running in standalone mode (PWA)
  const isStandalone = (window.navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  
  // Check if iOS/iPadOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  
  return isStandalone && isIOS;
};

/**
 * Download media (image or video) from a URL
 * Handles timeouts, fallbacks, and error cases
 * Special handling for iOS PWA where download attribute doesn't work
 */
export const downloadMedia = async (url: string, mediaId: string, isVideo: boolean): Promise<void> => {
  const downloadStartTime = Date.now();
  console.log('[PollingBreakageIssue] [MediaLightbox] Download started', {
    mediaId,
    displayUrl: url,
    isVideo,
    isIOSPwa: isIOSPwa(),
    timestamp: downloadStartTime
  });

  // For iOS PWA, use Web Share API or open in new tab
  // The download attribute doesn't work in standalone mode
  if (isIOSPwa()) {
    console.log('[Download] iOS PWA detected, using alternative download method');
    
    try {
      // Try Web Share API first (allows saving to Photos or Files)
      if (navigator.share && navigator.canShare) {
        // Fetch the file as blob
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch');
        
        const blob = await response.blob();
        const filename = `media_${mediaId}.${isVideo ? 'mp4' : 'png'}`;
        const file = new File([blob], filename, { type: blob.type });
        
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Save Media',
          });
          console.log('[Download] iOS PWA: Shared via Web Share API');
          return;
        }
      }
    } catch (shareError) {
      console.log('[Download] Web Share failed, falling back to window.open:', shareError);
    }
    
    // Fallback: Open URL in new window - iOS will show its native preview
    // which allows saving to Photos
    try {
      window.open(url, '_blank');
      toast.info('Long press the image/video to save it');
      console.log('[Download] iOS PWA: Opened in new window');
      return;
    } catch (openError) {
      console.error('[Download] iOS PWA fallback failed:', openError);
      toast.error('Unable to download. Try opening in Safari.');
      return;
    }
  }

  try {
    // Add timeout to prevent hanging downloads
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn('[PollingBreakageIssue] [MediaLightbox] Download timeout, aborting', {
        mediaId,
        timeoutMs: 15000,
        timestamp: Date.now()
      });
      controller.abort();
    }, 15000); // 15 second timeout

    const response = await fetch(url, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const blob = await response.blob();
    const downloadDuration = Date.now() - downloadStartTime;
    console.log('[PollingBreakageIssue] [MediaLightbox] Download blob received', {
      mediaId,
      blobSize: blob.size,
      durationMs: downloadDuration,
      timestamp: Date.now()
    });

    const objectUrl = URL.createObjectURL(blob);
    const filename = `media_${mediaId}.${isVideo ? 'mp4' : 'png'}`;
    
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    
    // Programmatic click to trigger download
    link.click();

    // Keep link in DOM briefly to allow download to initiate
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
    }, 1500);
    
    // Delay object URL cleanup to avoid interrupting download (give browsers time)
    setTimeout(() => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {}
    }, 10000);

    console.log('[PollingBreakageIssue] [MediaLightbox] Download completed successfully', {
      mediaId,
      totalDurationMs: Date.now() - downloadStartTime,
      timestamp: Date.now()
    });
    
  } catch (error: any) {
    const errorDuration = Date.now() - downloadStartTime;
    console.error('[PollingBreakageIssue] [MediaLightbox] Download failed', {
      mediaId,
      error: error.message,
      errorName: error.name,
      isAbortError: error.name === 'AbortError',
      durationMs: errorDuration,
      timestamp: Date.now()
    });

    if (error.name === 'AbortError') {
      toast.error('Download timed out. Please try again.');
      return; // Don't try fallback for timeout
    }

    // Minimal error logging for fallback
    console.error('Download failed, falling back to direct link:', error);
    
    // Fallback 1: direct link with download attribute
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = `media_${mediaId}.${isVideo ? 'mp4' : 'png'}`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
      }, 1500);
    } catch {}

    // Fallback 2: window.open (some browsers block programmatic downloads)
    try {
      window.open(url, '_blank');
    } catch {}
  }
};

