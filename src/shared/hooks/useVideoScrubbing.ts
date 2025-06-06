import { useState, useRef, useCallback, useEffect } from 'react';

export const useVideoScrubbing = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const playbackRateRef = useRef<number>(0);

  const [playbackRate, setPlaybackRate] = useState<number | null>(null);
  const [progress, setProgress] = useState<number>(0);

  const stopScrubbing = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    lastFrameTimeRef.current = 0;
  }, []);

  const scrub = useCallback((timestamp: number) => {
    const video = videoRef.current;
    if (!video) return;

    const rate = playbackRateRef.current;
    if (rate === undefined) {
      return;
    }
    
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
    
    video.currentTime = newTime;
    setProgress((newTime / video.duration) * 100);

    animationFrameRef.current = requestAnimationFrame(scrub);
  }, []);

  const startScrubbing = useCallback(() => {
    // Ensure no other scrubbing loops are running before starting a new one
    stopScrubbing();
    // NOTE: We intentionally no longer pause the video here to avoid the visual "freeze" effect
    // that occurred when simply hovering over the video element. The video will keep playing
    // underneath while we adjust currentTime when the mouse actually moves (scrubbing).
    lastFrameTimeRef.current = 0; // Reset timer for smooth start
    animationFrameRef.current = requestAnimationFrame((timestamp) => {
      lastFrameTimeRef.current = timestamp; // Initialize frame time
      scrub(timestamp);
    });
  }, [scrub, stopScrubbing]);

  // We no longer start scrubbing immediately on hover because that caused the video
  // to appear frozen when the pointer entered the element without any movement.
  // Instead, scrubbing starts the first time the mouse actually *moves*.
  const handleMouseEnter = useCallback(() => {
    /* Intentionally left blank – actual scrubbing starts on first movement */
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      // Ensure the scrubbing loop is running
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
  }, [startScrubbing]);
  
  const handleMouseLeave = useCallback(() => {
    stopScrubbing();
    const video = videoRef.current;
    if (video) {
        // Reset playback position but immediately resume playing so the preview keeps looping
        // when the user moves the cursor away.
        video.currentTime = 0;
        // `play()` can fail if the browser policies disallow it, but since the video is muted
        // (see VideoOutputItem & VideoLightbox components) autoplay should be allowed.
        video.play().catch(() => {/* ignored */});
    }
    playbackRateRef.current = 0;
    setPlaybackRate(null);
    setProgress(0);
  }, [stopScrubbing]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const { offsetX } = e.nativeEvent;
    const width = e.currentTarget.offsetWidth;
    const newTime = (offsetX / width) * video.duration;
    video.currentTime = newTime;
    setProgress((newTime / video.duration) * 100);
  }, []);

  useEffect(() => {
    // Cleanup on unmount
    return () => stopScrubbing();
  }, [stopScrubbing]);

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