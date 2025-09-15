/**
 * Progressive Image Loading Hook
 * 
 * Manages thumbnail → full resolution image loading for individual images.
 * Shows thumbnail immediately, loads full image in background, then transitions smoothly.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { isImageCached, markImageAsCached } from '@/shared/lib/imageCacheManager';

type ImagePhase = 'idle' | 'thumb' | 'loadingFull' | 'full' | 'error';

interface UseProgressiveImageOptions {
  priority?: boolean; // Load immediately without intersection observer
  lazy?: boolean; // Use intersection observer for lazy loading
  crossfadeMs?: number; // Crossfade duration in milliseconds
  prefetch?: boolean; // Prefetch full image without showing
  ioRootMargin?: string; // Intersection observer root margin
  enabled?: boolean; // Enable/disable progressive loading
}

interface UseProgressiveImageResult {
  src: string;
  phase: ImagePhase;
  isThumbShowing: boolean;
  isFullLoaded: boolean;
  error: string | null;
  retry: () => void;
  ref: (element: HTMLElement | null) => void;
}

interface LoadingSession {
  id: string;
  abortController: AbortController;
  timeouts: (NodeJS.Timeout | number)[];
  isActive: boolean;
}

export const useProgressiveImage = (
  thumbUrl?: string | null,
  fullUrl?: string | null,
  options: UseProgressiveImageOptions = {}
): UseProgressiveImageResult => {
  const {
    priority = false,
    lazy = true,
    crossfadeMs = 180,
    prefetch = false,
    ioRootMargin = '200px',
    enabled = true
  } = options;

  const [phase, setPhase] = useState<ImagePhase>('idle');
  const [currentSrc, setCurrentSrc] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isIntersecting, setIsIntersecting] = useState(!lazy || priority);

  const activeSessionRef = useRef<LoadingSession | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const retryCountRef = useRef(0);

  // Helper function to cancel active session
  const cancelActiveSession = useCallback((reason: string) => {
    if (activeSessionRef.current?.isActive) {
      console.log(`🧹 [ProgressiveImage] Canceling session: ${reason}`);
      activeSessionRef.current.abortController.abort();
      activeSessionRef.current.timeouts.forEach(timeout => clearTimeout(timeout));
      activeSessionRef.current.isActive = false;
      activeSessionRef.current = null;
    }
  }, []);

  // Helper function to create new session
  const createSession = useCallback((): LoadingSession => {
    const sessionId = `prog-img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const abortController = new AbortController();
    const timeouts: (NodeJS.Timeout | number)[] = [];
    
    const session: LoadingSession = {
      id: sessionId,
      abortController,
      timeouts,
      isActive: true
    };
    
    activeSessionRef.current = session;
    return session;
  }, []);

  // Helper function to check if session is still active
  const isSessionActive = useCallback((session: LoadingSession) => {
    return activeSessionRef.current?.id === session.id && 
           activeSessionRef.current?.isActive && 
           !session.abortController.signal.aborted;
  }, []);

  // Helper function to safely update state
  const safeSetState = useCallback((session: LoadingSession, updater: () => void) => {
    if (isSessionActive(session)) {
      updater();
      return true;
    }
    return false;
  }, [isSessionActive]);

  // Helper function to load an image
  const loadImage = useCallback((url: string, session: LoadingSession): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      if (!isSessionActive(session)) {
        reject(new Error('Session cancelled'));
        return;
      }

      const img = new Image();
      
      const cleanup = () => {
        img.onload = null;
        img.onerror = null;
        img.onabort = null;
      };

      img.onload = () => {
        cleanup();
        if (isSessionActive(session)) {
          markImageAsCached(url);
          resolve(img);
        } else {
          reject(new Error('Session cancelled during load'));
        }
      };

      img.onerror = () => {
        cleanup();
        reject(new Error(`Failed to load image: ${url}`));
      };

      img.onabort = () => {
        cleanup();
        reject(new Error('Image load aborted'));
      };

      // Handle session abortion
      session.abortController.signal.addEventListener('abort', () => {
        cleanup();
        reject(new Error('Session aborted'));
      });

      img.src = url;
    });
  }, [isSessionActive]);

  // Setup intersection observer for lazy loading
  useEffect(() => {
    if (!lazy || priority || !enabled) {
      setIsIntersecting(true);
      return;
    }

    if (!elementRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          setIsIntersecting(true);
          observerRef.current?.disconnect();
        }
      },
      { rootMargin: ioRootMargin }
    );

    observerRef.current.observe(elementRef.current);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [lazy, priority, enabled, ioRootMargin]);

  // Main loading logic
  useEffect(() => {
    if (!enabled || !isIntersecting) {
      return;
    }

    // Cancel any previous session
    cancelActiveSession('new loading session');
    
    // Reset error state
    setError(null);

    // Determine what to do based on available URLs
    const hasThumb = thumbUrl && thumbUrl !== fullUrl;
    const hasFull = !!fullUrl;

    if (!hasThumb && !hasFull) {
      setPhase('idle');
      setCurrentSrc('');
      return;
    }

    const session = createSession();

    // If no thumbnail or thumbnail equals full URL, load full directly
    if (!hasThumb) {
      if (hasFull) {
        safeSetState(session, () => {
          setPhase('loadingFull');
          setCurrentSrc('');
        });

        loadImage(fullUrl!, session)
          .then(() => {
            safeSetState(session, () => {
              setPhase('full');
              setCurrentSrc(fullUrl!);
            });
          })
          .catch((err) => {
            safeSetState(session, () => {
              setPhase('error');
              setError(err.message);
            });
          });
      }
      return;
    }

    // Progressive loading: Load thumbnail FIRST, then full image
    safeSetState(session, () => {
      setPhase('thumb');
      setCurrentSrc(''); // Don't show anything until thumbnail loads
    });

    // Step 1: Load thumbnail first
    loadImage(thumbUrl!, session)
      .then(() => {
        if (!isSessionActive(session)) return;

        // Show thumbnail once it's loaded
        safeSetState(session, () => {
          setCurrentSrc(thumbUrl!);
        });

        // If prefetch only, don't continue to full loading
        if (prefetch || !hasFull) {
          return;
        }

        // Step 2: Now start loading full image in background
        const isFullCached = isImageCached(fullUrl!);
        
        const loadFullImage = () => {
          safeSetState(session, () => setPhase('loadingFull'));

          loadImage(fullUrl!, session)
            .then(() => {
              if (!isSessionActive(session)) return;

              // Smooth transition to full image
              if (crossfadeMs > 0) {
                const timeout = setTimeout(() => {
                  safeSetState(session, () => {
                    setPhase('full');
                    setCurrentSrc(fullUrl!);
                  });
                }, crossfadeMs);
                session.timeouts.push(timeout);
              } else {
                safeSetState(session, () => {
                  setPhase('full');
                  setCurrentSrc(fullUrl!);
                });
              }
            })
            .catch((err) => {
              safeSetState(session, () => {
                setError(err.message);
                // Keep showing thumbnail on full image error
              });
            });
        };

        if (isFullCached || priority) {
          // Load immediately if cached or high priority
          loadFullImage();
        } else {
          // Small delay for non-cached images to let thumbnail render first
          const timeout = setTimeout(loadFullImage, 50);
          session.timeouts.push(timeout);
        }
      })
      .catch((thumbErr) => {
        // Thumbnail failed to load - fall back to loading full image directly
        if (!isSessionActive(session)) return;
        
        console.warn('[ProgressiveImage] Thumbnail failed to load, falling back to full image:', thumbErr.message);
        
        if (hasFull) {
          safeSetState(session, () => {
            setPhase('loadingFull');
            setCurrentSrc('');
          });

          loadImage(fullUrl!, session)
            .then(() => {
              safeSetState(session, () => {
                setPhase('full');
                setCurrentSrc(fullUrl!);
              });
            })
            .catch((fullErr) => {
              safeSetState(session, () => {
                setPhase('error');
                setError(`Both thumbnail and full image failed: ${fullErr.message}`);
              });
            });
        } else {
          safeSetState(session, () => {
            setPhase('error');
            setError(`Thumbnail failed to load: ${thumbErr.message}`);
          });
        }
      });

    return () => {
      if (activeSessionRef.current?.id === session.id) {
        cancelActiveSession('effect cleanup');
      }
    };
  }, [
    enabled,
    isIntersecting,
    thumbUrl,
    fullUrl,
    priority,
    prefetch,
    crossfadeMs,
    loadImage,
    cancelActiveSession,
    createSession,
    safeSetState
  ]);

  // Retry function
  const retry = useCallback(() => {
    retryCountRef.current += 1;
    setError(null);
    
    // Trigger re-run of loading effect
    const currentSession = activeSessionRef.current;
    cancelActiveSession('retry');
    
    // Small delay to ensure cleanup completes
    setTimeout(() => {
      setIsIntersecting(true);
    }, 100);
  }, [cancelActiveSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelActiveSession('component unmount');
      observerRef.current?.disconnect();
    };
  }, [cancelActiveSession]);

  // Ref callback for intersection observer
  const setRef = useCallback((element: HTMLElement | null) => {
    elementRef.current = element;
  }, []);

  return {
    src: currentSrc,
    phase,
    isThumbShowing: phase === 'thumb' || (phase === 'loadingFull' && currentSrc === thumbUrl),
    isFullLoaded: phase === 'full',
    error,
    retry,
    ref: setRef
  };
};
