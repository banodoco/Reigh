import { useState, useRef, useCallback, useEffect } from 'react';
import { GenerationRow } from '@/types/shots';

/**
 * Hook to manage video loading state and lifecycle
 * Simplified: all videos load immediately with preload='metadata'
 * Browser handles concurrent requests efficiently
 */
export const useVideoLoader = (
  video: GenerationRow, 
  index: number, 
  shouldPreload: string
) => {
  // Simplified: all videos load immediately
  const [shouldLoad] = useState(true);
  const [videoMetadataLoaded, setVideoMetadataLoaded] = useState(false);
  const [videoPosterLoaded, setVideoPosterLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const posterFallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const logVideoEvent = useCallback((phase: string, extraData: Record<string, any> = {}) => {
    // Logging removed - too verbose
  }, []);

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
    logVideoEvent
  };
};
