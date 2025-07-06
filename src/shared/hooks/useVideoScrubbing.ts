import { useState, useRef, useCallback, useEffect } from 'react';

export const useVideoScrubbing = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const playbackRateRef = useRef<number>(0);
  const isVisibleRef = useRef<boolean>(true);

  const [playbackRate, setPlaybackRate] = useState<number | null>(null);
  const [progress, setProgress] = useState<number>(0);

  const stopScrubbing = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    lastFrameTimeRef.current = 0;
    
    // When scrubbing stops, we no longer automatically resume playback.
    // Doing so caused a conflict where moving the mouse again would pause,
    // leading to a stuttering effect. Now, the video remains paused at the
    // current frame, awaiting further mouse movement to scrub again.
    const video = videoRef.current;
    if (video) {
        // It's already paused by startScrubbing, we just need to make sure
        // our animation loop is cancelled, which is done above.
    }
  }, []);

  const scrub = useCallback((timestamp: number) => {
    const video = videoRef.current;
    // If the video element is gone or not visible, stop the loop.
    if (!video || !isVisibleRef.current) {
        stopScrubbing();
        return;
    };

    const rate = playbackRateRef.current;
    
    if (!lastFrameTimeRef.current) {
        lastFrameTimeRef.current = timestamp;
    }
    const delta = (timestamp - lastFrameTimeRef.current) / 1000; // time in seconds
    lastFrameTimeRef.current = timestamp;

    let newTime = video.currentTime + rate * delta;

    // Looping logic
    if (newTime < 0) {
      newTime = video.duration + newTime;
    } else if (newTime > video.duration) {
      newTime = newTime - video.duration;
    }
    
    // Additional safety check before setting currentTime
    if (isFinite(newTime) && video && videoRef.current) {
        video.currentTime = newTime;
    }
    
    // Also update progress bar during scrub
    if(video && video.duration > 0 && isFinite(video.duration) && videoRef.current){
        setProgress((video.currentTime / video.duration) * 100);
    } else {
        setProgress(0);
    }

    // Continue the loop
    animationFrameRef.current = requestAnimationFrame(scrub);
  }, [stopScrubbing]);

  const startScrubbing = useCallback(() => {
    // Ensure no other loops are running before starting a new one
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    const video = videoRef.current;
    if (video) {
        video.pause(); // We take control of playback
    }
    lastFrameTimeRef.current = 0; // Reset timer for smooth start
    animationFrameRef.current = requestAnimationFrame((timestamp) => {
      lastFrameTimeRef.current = timestamp; // Initialize frame time
      scrub(timestamp);
    });
  }, [scrub]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      // If scrubbing isn't active, start it.
      if (animationFrameRef.current === null) {
        startScrubbing();
      }

      const { offsetX } = e.nativeEvent;
      const width = e.currentTarget.offsetWidth;
      const normalizedPosition = offsetX / width; // Value from 0.0 to 1.0

      // Reduced max speed from 3.0 to 2.0 for better performance
      const MAX_SPEED = 2.0;
      let newRate;

      // The new logic is simpler:
      // - Cursor at 0% width -> -2x speed (max reverse)
      // - Cursor at 50% width -> 0x speed (paused)
      // - Cursor at 100% width -> +2x speed (max forward)
      // The rate is linearly interpolated between these points.
      
      newRate = (normalizedPosition - 0.5) * 2 * MAX_SPEED;

      playbackRateRef.current = newRate;
      setPlaybackRate(newRate);

      // The timeout that stopped scrubbing on mouse inactivity has been removed.
      // Scrubbing now continues at the current rate until the mouse leaves the element.

  }, [startScrubbing]);
  
  const handleMouseEnter = useCallback(() => {
    const video = videoRef.current;
    if (video && video.paused) {
      video.play().catch(() => {/* ignore */});
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
      // Stop the animation frame loop directly.
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      lastFrameTimeRef.current = 0;

      const video = videoRef.current;
      if (video) {
          video.pause();
          video.currentTime = 0;
      }
      playbackRateRef.current = 0;
      setPlaybackRate(null);
      setProgress(0);
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !isFinite(video.duration)) return;

    const { offsetX } = e.nativeEvent;
    const width = e.currentTarget.offsetWidth;
    const newTime = (offsetX / width) * video.duration;
    video.currentTime = newTime;
    setProgress((newTime / video.duration) * 100);
  }, []);

  // Set up intersection observer to pause when off-screen
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isVisibleRef.current = entry.isIntersecting;
          if (!entry.isIntersecting && animationFrameRef.current) {
            // Stop scrubbing when video goes off-screen
            stopScrubbing();
          }
        });
      },
      { threshold: 0.1 } // Trigger when at least 10% visible
    );

    observer.observe(video);

    return () => {
      observer.disconnect();
    };
  }, [stopScrubbing]);

  useEffect(() => {
    const video = videoRef.current;
    
    // This listener updates the progress bar during normal playback.
    const handleProgress = () => {
        if (video && video.duration > 0 && animationFrameRef.current === null && videoRef.current) {
            setProgress((video.currentTime / video.duration) * 100);
        }
    };

    video?.addEventListener('timeupdate', handleProgress);

    // Cleanup on unmount
    return () => {
        video?.removeEventListener('timeupdate', handleProgress);
        // Bypassing stopScrubbing() on unmount to avoid auto-playing a video that is no longer visible.
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
    };
  }, []);

  return {
    videoRef,
    playbackRate,
    progress,
    handleMouseEnter,
    handleMouseMove,
    handleMouseLeave,
    handleSeek,
  };
}; 