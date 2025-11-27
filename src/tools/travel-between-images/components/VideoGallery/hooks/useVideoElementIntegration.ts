import { useEffect, RefObject } from 'react';
import { GenerationRow } from '@/types/shots';
import { useVideoLoader } from './useVideoLoader';

/**
 * Hook to manage video element integration with HoverScrubVideo
 * Simplified: all videos use preload='metadata', so browser handles loading
 */
export const useVideoElementIntegration = (
  video: GenerationRow,
  index: number,
  shouldLoad: boolean,
  shouldPreload: string,
  videoLoader: ReturnType<typeof useVideoLoader>,
  isMobile: boolean,
  containerRef?: RefObject<HTMLDivElement>
) => {
  const { 
    setVideoMetadataLoaded, 
    setVideoPosterLoaded, 
    videoRef, 
    posterFallbackTimeoutRef, 
    videoPosterLoaded 
  } = videoLoader;

  useEffect(() => {
    if (!shouldLoad) return;
    
    // Skip hover video integration on mobile devices
    if (isMobile) {
      return;
    }
    
    const timeoutId = setTimeout(() => {
      let videoElement: HTMLVideoElement | null = null;
      let container: Element | null = null;

      if (containerRef?.current) {
        container = containerRef.current;
        videoElement = container.querySelector('video');
      } else {
        // Fallback to ID selector if ref not provided
        container = document.querySelector(`[data-video-id="${video.id}"]`);
        videoElement = container?.querySelector('video') as HTMLVideoElement | null;
      }
      
      if (videoElement) {
        videoRef.current = videoElement;
        
        // Event handlers
        const handleLoadedMetadata = () => {
          setVideoMetadataLoaded(true);
          
          // Fallback: If onLoadedData doesn't fire within 2 seconds, consider poster ready
          if (posterFallbackTimeoutRef.current) {
            clearTimeout(posterFallbackTimeoutRef.current);
          }
          posterFallbackTimeoutRef.current = setTimeout(() => {
            if (!videoPosterLoaded) {
              setVideoPosterLoaded(true);
            }
          }, 2000);
        };

        const handleLoadedData = () => {
          setVideoPosterLoaded(true);
          
          if (posterFallbackTimeoutRef.current) {
            clearTimeout(posterFallbackTimeoutRef.current);
            posterFallbackTimeoutRef.current = null;
          }
        };

        // Add event listeners
        videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
        videoElement.addEventListener('loadeddata', handleLoadedData);
        
        // Check if video is already loaded (from browser cache)
        if (videoElement.readyState >= 2) {
          setVideoMetadataLoaded(true);
          if (videoElement.readyState >= 3) {
            setVideoPosterLoaded(true);
          }
        }
        
        return () => {
          videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
          videoElement.removeEventListener('loadeddata', handleLoadedData);
        };
      } else {
        // Retry with a longer timeout in case the video element is created later
        const retryTimeoutId = setTimeout(() => {
          const retryContainer = document.querySelector(`[data-video-id="${video.id}"]`);
          const retryVideoElement = retryContainer?.querySelector('video') as HTMLVideoElement | null;
          
          if (retryVideoElement) {
            videoRef.current = retryVideoElement;
            
            const handleLoadedMetadata = () => {
              setVideoMetadataLoaded(true);
              
              if (posterFallbackTimeoutRef.current) {
                clearTimeout(posterFallbackTimeoutRef.current);
              }
              posterFallbackTimeoutRef.current = setTimeout(() => {
                if (!videoPosterLoaded) {
                  setVideoPosterLoaded(true);
                }
              }, 2000);
            };

            const handleLoadedData = () => {
              setVideoPosterLoaded(true);
              
              if (posterFallbackTimeoutRef.current) {
                clearTimeout(posterFallbackTimeoutRef.current);
                posterFallbackTimeoutRef.current = null;
              }
            };

            retryVideoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
            retryVideoElement.addEventListener('loadeddata', handleLoadedData);
            
            // Check if video is already loaded
            if (retryVideoElement.readyState >= 2) {
              setVideoMetadataLoaded(true);
              if (retryVideoElement.readyState >= 3) {
                setVideoPosterLoaded(true);
              }
            }
          }
        }, 500);
        
        return () => clearTimeout(retryTimeoutId);
      }
    }, 200);
    
    return () => clearTimeout(timeoutId);
  }, [shouldLoad, video.id, index, shouldPreload, setVideoMetadataLoaded, setVideoPosterLoaded, videoPosterLoaded, posterFallbackTimeoutRef, videoRef, isMobile, containerRef]);
};
