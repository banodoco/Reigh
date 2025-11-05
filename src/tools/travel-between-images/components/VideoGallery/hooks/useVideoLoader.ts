import { useState, useRef, useCallback, useEffect } from 'react';
import { GenerationRow } from '@/types/shots';

/**
 * Hook to manage video loading state and lifecycle
 * Handles staggered loading, preload settings, and state synchronization
 */
export const useVideoLoader = (
  video: GenerationRow, 
  index: number, 
  isFirstVideo: boolean, 
  shouldPreload: string
) => {
  const [shouldLoad, setShouldLoad] = useState(isFirstVideo);
  const [videoMetadataLoaded, setVideoMetadataLoaded] = useState(false);
  const [videoPosterLoaded, setVideoPosterLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const posterFallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasTriggeredLoadRef = useRef(false);

  const logVideoEvent = useCallback((phase: string, extraData: Record<string, any> = {}) => {
    if (process.env.NODE_ENV === 'development') {
      ,
        ...extraData
      });
    }
  }, [video.id, index]);

  const triggerLoadOnce = useCallback((reason: string) => {
    if (process.env.NODE_ENV === 'development') {
      });
    }
    
    if (!hasTriggeredLoadRef.current && videoRef.current && shouldPreload === 'none') {
      hasTriggeredLoadRef.current = true;
      videoRef.current.load();
      
      if (process.env.NODE_ENV === 'development') {
        });
      }
    }
  }, [index, shouldPreload, video.id]);

  // Component mount/unmount tracking
  useEffect(() => {
    logVideoEvent('COMPONENT_MOUNTED', {
      isFirstVideo,
      priority: isFirstVideo ? 'priority' : 'delayed'
    });
    
    return () => {
      logVideoEvent('COMPONENT_UNMOUNTED', { reason: 'Component destroyed/re-rendered' });
    };
  }, [logVideoEvent, isFirstVideo]);

  // Staggered loading logic
  useEffect(() => {
    if (!isFirstVideo) {
      const delay = 200 + (index * 150);
      const timer = setTimeout(() => {
        setShouldLoad(true);
        setTimeout(() => triggerLoadOnce('(staggered timeout)'), 100);
      }, delay);
      
      return () => clearTimeout(timer);
    }
  }, [index, isFirstVideo, triggerLoadOnce]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (posterFallbackTimeoutRef.current) {
        clearTimeout(posterFallbackTimeoutRef.current);
      }
    };
  }, []);

  return {
    shouldLoad,
    videoMetadataLoaded,
    setVideoMetadataLoaded,
    videoPosterLoaded,
    setVideoPosterLoaded,
    videoRef,
    posterFallbackTimeoutRef,
    triggerLoadOnce,
    logVideoEvent
  };
};
