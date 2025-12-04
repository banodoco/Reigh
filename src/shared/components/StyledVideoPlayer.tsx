import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';

interface StyledVideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  style?: React.CSSProperties;
  loop?: boolean;
  muted?: boolean;
  autoPlay?: boolean;
  playsInline?: boolean;
  preload?: 'auto' | 'metadata' | 'none';
  /** Callback when video metadata loads */
  onLoadedMetadata?: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
}

export const StyledVideoPlayer: React.FC<StyledVideoPlayerProps> = ({
  src,
  poster,
  className = '',
  style = {},
  loop = true,
  muted = true,
  autoPlay = true,
  playsInline = true,
  preload = 'auto',
  onLoadedMetadata,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isMobile = useIsMobile();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  const formatTime = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return '0:00';
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const handleTimelineChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const newTime = (parseFloat(e.target.value) / 100) * duration;
    video.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  const toggleFullscreen = useCallback(() => {
    // Disable fullscreen on mobile
    if (isMobile) return;
    
    const video = videoRef.current;
    if (!video) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      video.requestFullscreen();
    }
  }, [isMobile]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => setCurrentTime(video.currentTime);
    const updateDuration = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration);
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('loadedmetadata', updateDuration);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('loadedmetadata', updateDuration);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, []);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    
    if (isHovering) {
      setShowControls(true);
    } else {
      timeout = setTimeout(() => setShowControls(false), 2000);
    }

    return () => clearTimeout(timeout);
  }, [isHovering]);

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'VIDEO' || target.closest('.video-clickable-area')) {
      togglePlayPause();
    }
  }, [togglePlayPause]);

  return (
    <div 
      className={cn("relative block", className)}
      style={style}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onClick={handleContainerClick}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        loop={loop}
        muted={isMuted}
        autoPlay={autoPlay}
        playsInline={playsInline}
        preload={preload}
        className="w-full h-auto object-contain rounded-lg bg-black/5 cursor-pointer video-clickable-area"
        style={{ maxHeight: '100%' }}
        onDoubleClick={isMobile ? undefined : toggleFullscreen}
        onLoadedMetadata={onLoadedMetadata}
      >
        Your browser does not support the video tag.
      </video>

      {/* Clickable overlay for play/pause */}
      <div 
        className="absolute inset-0 video-clickable-area"
        style={{ pointerEvents: (showControls && isPlaying) ? 'none' : 'all' }}
      />

      {/* Custom Controls Overlay */}
      <div 
        className={cn(
          "absolute inset-0 transition-opacity duration-300 pointer-events-none",
          showControls || !isPlaying ? "opacity-100" : "opacity-0"
        )}
      >
        {/* Play/Pause Button Overlay - Center */}
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Button
              variant="secondary"
              size="lg"
              onClick={togglePlayPause}
              className="bg-black/70 hover:bg-black/90 text-white h-16 w-16 rounded-full p-0 shadow-wes border border-white/20 pointer-events-auto"
            >
              <Play className="h-8 w-8 ml-1" fill="currentColor" />
            </Button>
          </div>
        )}

        {/* Bottom Controls Bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-4 rounded-b-lg pointer-events-auto">
          <div className="flex items-center space-x-3">
            {/* Play/Pause */}
            <Button
              variant="ghost"
              size="sm"
              onClick={togglePlayPause}
              className="text-white hover:bg-white/20 h-8 w-8 p-0"
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" fill="currentColor" />
              ) : (
                <Play className="h-4 w-4 ml-0.5" fill="currentColor" />
              )}
            </Button>

            {/* Current Time */}
            <span className="text-white text-xs font-mono min-w-[40px]">
              {formatTime(currentTime)}
            </span>

            {/* Timeline/Progress Bar */}
            <div className="flex-1 mx-2">
              <input
                type="range"
                min="0"
                max="100"
                value={duration ? (currentTime / duration) * 100 : 0}
                onChange={handleTimelineChange}
                className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer styled-video-range"
              />
            </div>

            {/* Duration */}
            <span className="text-white text-xs font-mono min-w-[40px]">
              {formatTime(duration)}
            </span>

            {/* Mute/Unmute */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleMute}
              className="text-white hover:bg-white/20 h-8 w-8 p-0"
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>

            {/* Fullscreen - hidden on mobile */}
            {!isMobile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleFullscreen}
                className="text-white hover:bg-white/20 h-8 w-8 p-0"
              >
                <Maximize className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};

export default StyledVideoPlayer;
