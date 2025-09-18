import { useEffect } from 'react';
import { GenerationRow } from '@/types/shots';
import { useVideoLoader } from './useVideoLoader';

/**
 * Hook to manage video element integration with HoverScrubVideo
 * Handles the complex DOM integration and event listener setup
 */
export const useVideoElementIntegration = (
  video: GenerationRow,
  index: number,
  shouldLoad: boolean,
  shouldPreload: string,
  videoLoader: ReturnType<typeof useVideoLoader>,
  isMobile: boolean
) => {
  const { 
    setVideoMetadataLoaded, 
    setVideoPosterLoaded, 
    videoRef, 
    posterFallbackTimeoutRef, 
    triggerLoadOnce,
    logVideoEvent,
    videoPosterLoaded 
  } = videoLoader;

  useEffect(() => {
    if (!shouldLoad) return;
    
    // Skip hover video integration on mobile devices (use consistent detection)
    if (isMobile) {
      console.log(`🎬 [VideoLifecycle] Video ${index + 1} - MOBILE_SKIP: Hover integration disabled on mobile`);
      return;
    }
    
    const timeoutId = setTimeout(() => {
      const container = document.querySelector(`[data-video-id="${video.id}"]`);
      const videoElement = container?.querySelector('video') as HTMLVideoElement | null;
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_ELEMENT_SEARCH:`, {
          videoId: video.id,
          phase: 'VIDEO_ELEMENT_SEARCH',
          containerFound: !!container,
          videoElementFound: !!videoElement,
          containerSelector: `[data-video-id="${video.id}"]`,
          videoSrc: videoElement?.src || 'NO_SRC',
          shouldPreload: shouldPreload,
          videoReadyState: videoElement?.readyState || 'NO_ELEMENT',
          isFirstVideo: index === 0,
          timestamp: Date.now()
        });
      }
      
      if (videoElement) {
        videoRef.current = videoElement;
        
        // Event handlers
        const handleLoadStart = () => {
          if (process.env.NODE_ENV === 'development') {
            console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_LOAD_STARTED:`, {
              videoId: video.id,
              phase: 'VIDEO_LOAD_STARTED',
              src: videoElement.src,
              preload: shouldPreload,
              timestamp: Date.now()
            });
          }
        };

        const handleLoadedMetadata = () => {
          if (process.env.NODE_ENV === 'development') {
            console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_METADATA_LOADED:`, {
              videoId: video.id,
              phase: 'VIDEO_METADATA_LOADED',
              duration: videoElement?.duration,
              dimensions: `${videoElement?.videoWidth}x${videoElement?.videoHeight}`,
              timestamp: Date.now()
            });
          }
          setVideoMetadataLoaded(true);
          
          // Fallback: If onLoadedData doesn't fire within 2 seconds, consider poster ready
          if (posterFallbackTimeoutRef.current) {
            clearTimeout(posterFallbackTimeoutRef.current);
          }
          posterFallbackTimeoutRef.current = setTimeout(() => {
            if (!videoPosterLoaded) {
              if (process.env.NODE_ENV === 'development') {
                console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_POSTER_FALLBACK:`, {
                  videoId: video.id,
                  phase: 'VIDEO_POSTER_FALLBACK',
                  reason: 'onLoadedData did not fire within 2 seconds',
                  readyState: videoElement?.readyState,
                  networkState: videoElement?.networkState,
                  timestamp: Date.now()
                });
              }
              setVideoPosterLoaded(true);
            }
          }, 2000);
        };

        const handleLoadedData = () => {
          console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_POSTER_LOADED:`, {
            videoId: video.id,
            phase: 'VIDEO_POSTER_LOADED',
            currentTime: videoElement?.currentTime,
            readyState: videoElement?.readyState,
            nextPhase: 'Will transition to VIDEO_READY',
            timestamp: Date.now()
          });
          setVideoPosterLoaded(true);
          
          if (posterFallbackTimeoutRef.current) {
            clearTimeout(posterFallbackTimeoutRef.current);
            posterFallbackTimeoutRef.current = null;
          }
        };

        const handleSuspend = () => {
          console.warn(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_LOADING_SUSPENDED:`, {
            videoId: video.id,
            phase: 'VIDEO_LOADING_SUSPENDED',
            readyState: videoElement?.readyState,
            networkState: videoElement?.networkState,
            preload: shouldPreload,
            recovery: 'Will retry in 500ms if readyState=0',
            timestamp: Date.now()
          });
          
          if (shouldPreload === 'none' && videoElement?.readyState === 0) {
            setTimeout(() => {
              triggerLoadOnce('(suspended with readyState=0)');
            }, 500);
          }
        };

        const handleCanPlay = () => {
          console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_CAN_PLAY:`, {
            videoId: video.id,
            phase: 'VIDEO_CAN_PLAY',
            readyState: videoElement?.readyState,
            timestamp: Date.now()
          });
          
          if (!videoPosterLoaded && shouldPreload === 'none') {
            console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_CANPLAY_FALLBACK:`, {
              videoId: video.id,
              phase: 'VIDEO_CANPLAY_FALLBACK',
              reason: 'preload=none fallback trigger',
              triggeredBy: 'onCanPlay',
              timestamp: Date.now()
            });
            setVideoPosterLoaded(true);
            
            if (posterFallbackTimeoutRef.current) {
              clearTimeout(posterFallbackTimeoutRef.current);
              posterFallbackTimeoutRef.current = null;
            }
          }
        };

        // Add event listeners
        videoElement.addEventListener('loadstart', handleLoadStart);
        videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
        videoElement.addEventListener('loadeddata', handleLoadedData);
        videoElement.addEventListener('suspend', handleSuspend);
        videoElement.addEventListener('canplay', handleCanPlay);
        
        // Check if video is already loaded
        console.log(`🎬 [VideoLifecycle] Video ${index + 1} - PRELOAD_CHECK:`, {
          videoId: video.id,
          phase: 'PRELOAD_CHECK',
          shouldPreload: shouldPreload,
          willTriggerManualLoad: shouldPreload === 'none',
          videoReadyState: videoElement.readyState,
          timestamp: Date.now()
        });
        
        if (videoElement.readyState >= 2) {
          console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_ALREADY_LOADED:`, {
            videoId: video.id,
            phase: 'VIDEO_ALREADY_LOADED',
            readyState: videoElement.readyState,
            readyStateText: videoElement.readyState === 4 ? 'HAVE_ENOUGH_DATA' : 
                           videoElement.readyState === 3 ? 'HAVE_FUTURE_DATA' : 
                           videoElement.readyState === 2 ? 'HAVE_CURRENT_DATA' : 'UNKNOWN',
            willSetStates: true,
            timestamp: Date.now()
          });
          
          setVideoMetadataLoaded(true);
          if (videoElement.readyState >= 3) {
            setVideoPosterLoaded(true);
          }
        }
        
        if (shouldPreload === 'none') {
          setTimeout(() => {
            triggerLoadOnce('(HoverScrubVideo integration)');
          }, 50);
        } else {
          console.log(`🎬 [VideoLifecycle] Video ${index + 1} - AUTO_PRELOAD_EXPECTED:`, {
            videoId: video.id,
            phase: 'AUTO_PRELOAD_EXPECTED',
            shouldPreload: shouldPreload,
            message: 'Video should start loading automatically with this preload setting',
            videoReadyState: videoElement.readyState,
            timestamp: Date.now()
          });
        }
        
        return () => {
          videoElement.removeEventListener('loadstart', handleLoadStart);
          videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
          videoElement.removeEventListener('loadeddata', handleLoadedData);
          videoElement.removeEventListener('suspend', handleSuspend);
          videoElement.removeEventListener('canplay', handleCanPlay);
        };
      } else {
        console.warn(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_ELEMENT_NOT_FOUND:`, {
          videoId: video.id,
          phase: 'VIDEO_ELEMENT_NOT_FOUND',
          issue: 'HoverScrubVideo did not create video element',
          containerFound: !!container,
          retryIn: 'Will retry with longer timeout',
          timestamp: Date.now()
        });
        
        // Retry with a longer timeout in case the video element is created later
        const retryTimeoutId = setTimeout(() => {
          const retryContainer = document.querySelector(`[data-video-id="${video.id}"]`);
          const retryVideoElement = retryContainer?.querySelector('video') as HTMLVideoElement | null;
          
          if (retryVideoElement) {
            console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_ELEMENT_FOUND_ON_RETRY:`, {
              videoId: video.id,
              phase: 'VIDEO_ELEMENT_FOUND_ON_RETRY',
              retrySuccessful: true,
              timestamp: Date.now()
            });
            
            videoRef.current = retryVideoElement;
            
            // Apply the same event listeners as in the main path
            const handleLoadStart = () => {
              if (process.env.NODE_ENV === 'development') {
                console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_LOAD_STARTED (retry):`, {
                  videoId: video.id,
                  phase: 'VIDEO_LOAD_STARTED',
                  src: retryVideoElement.src,
                  preload: shouldPreload,
                  timestamp: Date.now()
                });
              }
            };

            const handleLoadedMetadata = () => {
              if (process.env.NODE_ENV === 'development') {
                console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_METADATA_LOADED (retry):`, {
                  videoId: video.id,
                  phase: 'VIDEO_METADATA_LOADED',
                  duration: retryVideoElement?.duration,
                  dimensions: `${retryVideoElement?.videoWidth}x${retryVideoElement?.videoHeight}`,
                  timestamp: Date.now()
                });
              }
              setVideoMetadataLoaded(true);
              
              // Fallback: If onLoadedData doesn't fire within 2 seconds, consider poster ready
              if (posterFallbackTimeoutRef.current) {
                clearTimeout(posterFallbackTimeoutRef.current);
              }
              posterFallbackTimeoutRef.current = setTimeout(() => {
                if (!videoPosterLoaded) {
                  if (process.env.NODE_ENV === 'development') {
                    console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_POSTER_FALLBACK (retry):`, {
                      videoId: video.id,
                      phase: 'VIDEO_POSTER_FALLBACK',
                      reason: 'onLoadedData did not fire within 2 seconds',
                      readyState: retryVideoElement?.readyState,
                      networkState: retryVideoElement?.networkState,
                      timestamp: Date.now()
                    });
                  }
                  setVideoPosterLoaded(true);
                }
              }, 2000);
            };

            const handleLoadedData = () => {
              console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_POSTER_LOADED (retry):`, {
                videoId: video.id,
                phase: 'VIDEO_POSTER_LOADED',
                currentTime: retryVideoElement?.currentTime,
                readyState: retryVideoElement?.readyState,
                nextPhase: 'Will transition to VIDEO_READY',
                timestamp: Date.now()
              });
              setVideoPosterLoaded(true);
              
              if (posterFallbackTimeoutRef.current) {
                clearTimeout(posterFallbackTimeoutRef.current);
                posterFallbackTimeoutRef.current = null;
              }
            };

            retryVideoElement.addEventListener('loadstart', handleLoadStart);
            retryVideoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
            retryVideoElement.addEventListener('loadeddata', handleLoadedData);
            
            // Check if video is already loaded
            if (retryVideoElement.readyState >= 2) {
              console.log(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_ALREADY_LOADED (retry):`, {
                videoId: video.id,
                phase: 'VIDEO_ALREADY_LOADED',
                readyState: retryVideoElement.readyState,
                timestamp: Date.now()
              });
              
              setVideoMetadataLoaded(true);
              if (retryVideoElement.readyState >= 3) {
                setVideoPosterLoaded(true);
              }
            }
            
            if (shouldPreload === 'none') {
              setTimeout(() => {
                triggerLoadOnce('(retry integration)');
              }, 50);
            }
          } else {
            console.warn(`🎬 [VideoLifecycle] Video ${index + 1} - VIDEO_ELEMENT_STILL_NOT_FOUND:`, {
              videoId: video.id,
              phase: 'VIDEO_ELEMENT_STILL_NOT_FOUND',
              issue: 'Video element not found even after retry',
              timestamp: Date.now()
            });
          }
        }, 500); // Retry after 500ms
        
        return () => clearTimeout(retryTimeoutId);
      }
    }, 200); // Increased timeout for more reliable video element detection
    
    return () => clearTimeout(timeoutId);
  }, [shouldLoad, video.id, index, shouldPreload, triggerLoadOnce, setVideoMetadataLoaded, setVideoPosterLoaded, videoPosterLoaded, posterFallbackTimeoutRef, logVideoEvent, videoRef]);
};
