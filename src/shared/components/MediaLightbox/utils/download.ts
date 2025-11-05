import { toast } from 'sonner';

/**
 * Download media (image or video) from a URL
 * Handles timeouts, fallbacks, and error cases
 */
export const downloadMedia = async (url: string, mediaId: string, isVideo: boolean): Promise<void> => {
  const downloadStartTime = Date.now();
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

    - downloadStartTime,
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

