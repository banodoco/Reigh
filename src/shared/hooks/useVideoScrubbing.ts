import { useState, useRef, useCallback, useEffect } from 'react';

export const useVideoScrubbing = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const playbackRateRef = useRef<number>(0);
  const mouseMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [playbackRate, setPlaybackRate] = useState<number | null>(null);
  const [progress, setProgress] = useState<number>(0);

  const stopScrubbing = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    lastFrameTimeRef.current = 0;
    
    // When scrubbing stops, we want native playback to resume
    const video = videoRef.current;
    if (video && video.paused) {
        // We use a promise-based play to avoid console errors if interrupted.
        video.play().catch(() => {/* ignore */});
    }
  }, []);

  const scrub = useCallback((timestamp: number) => {
    const video = videoRef.current;
    // If the video element is gone, stop the loop.
    if (!video) {
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
    
    if (isFinite(newTime)) {
        video.currentTime = newTime;
    }
    
    // Also update progress bar during scrub
    if(video.duration > 0 && isFinite(video.duration)){
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
      if (mouseMoveTimeoutRef.current) {
        clearTimeout(mouseMoveTimeoutRef.current);
      }

      // If scrubbing isn't active, start it.
      if (animationFrameRef.current === null) {
        startScrubbing();
      }

      const { offsetX } = e.nativeEvent;
      const width = e.currentTarget.offsetWidth;
      const normalizedPosition = offsetX / width;

      let newRate;
      if (normalizedPosition < 0.4) {
          // Left 2/5ths: Map 0.0-0.4 to -3x to 0x
          const p = normalizedPosition / 0.4;
          newRate = -3 + p * 3;
      } else if (normalizedPosition <= 0.6) {
          // Middle 1/5th: Map 0.4-0.6 to 0x to 1x
          const p = (normalizedPosition - 0.4) / 0.2;
          newRate = p;
      } else {
          // Right 2/5ths: Map 0.6-1.0 to 1x to 3x
          const p = (normalizedPosition - 0.6) / 0.4;
          newRate = 1 + p * 2;
      }

      playbackRateRef.current = newRate;
      setPlaybackRate(newRate);

      // Set a timer to automatically stop scrubbing if the mouse stops moving.
      mouseMoveTimeoutRef.current = setTimeout(() => {
        stopScrubbing();
        setPlaybackRate(null); // Hide the rate indicator
      }, 150);

  }, [startScrubbing, stopScrubbing]);
  
  const handleMouseEnter = useCallback(() => {
    const video = videoRef.current;
    if (video && video.paused) {
      video.play().catch(() => {/* ignore */});
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
      // Clear any pending timeout to stop scrubbing
      if (mouseMoveTimeoutRef.current) {
        clearTimeout(mouseMoveTimeoutRef.current);
      }
      
      // Stop the animation frame loop directly, bypassing stopScrubbing's "play"
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

  useEffect(() => {
    const video = videoRef.current;
    
    // This listener updates the progress bar during normal playback.
    const handleProgress = () => {
        if (video && video.duration > 0 && animationFrameRef.current === null) {
            setProgress((video.currentTime / video.duration) * 100);
        }
    };

    video?.addEventListener('timeupdate', handleProgress);

    // Cleanup on unmount
    return () => {
        video?.removeEventListener('timeupdate', handleProgress);
        if (mouseMoveTimeoutRef.current) {
            clearTimeout(mouseMoveTimeoutRef.current);
        }
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