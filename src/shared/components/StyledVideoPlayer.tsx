import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { getDisplayUrl } from '@/shared/lib/utils';

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
  /** Optional playback start time in seconds (for trim preview) */
  playbackStart?: number;
  /** Optional playback end time in seconds (for trim preview) */
  playbackEnd?: number;
  /**
   * Video dimensions for aspect ratio preservation before metadata loads.
   * Prevents poster "zoom to top" issue on mobile for tall videos.
   */
  videoDimensions?: { width: number; height: number };
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
  playbackStart,
  playbackEnd,
  videoDimensions,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isMobile = useIsMobile();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  // Track video loading state - show thumbnail until video can play
  const [isVideoReady, setIsVideoReady] = useState(false);

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

  // Constrained playback mode (for trim preview)
  const hasPlaybackConstraints = playbackStart !== undefined && playbackEnd !== undefined;
  const effectiveStart = playbackStart ?? 0;
  const effectiveEnd = playbackEnd ?? duration;

  // Reset video ready state when src changes
  useEffect(() => {
    setIsVideoReady(false);
    console.log('[StyledVideoPlayer] src changed, resetting isVideoReady:', {
      src: src?.substring(0, 60),
      poster: poster?.substring(0, 60),
      hasPoster: !!poster
    });
  }, [src, poster]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => {
      setCurrentTime(video.currentTime);
      
      // Constrain playback to trim range
      if (hasPlaybackConstraints && !video.paused) {
        if (video.currentTime >= effectiveEnd) {
          // Loop back to start of trim range
          video.currentTime = effectiveStart;
        } else if (video.currentTime < effectiveStart) {
          // If somehow before start, jump to start
          video.currentTime = effectiveStart;
        }
      }
    };
    const updateDuration = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration);
        
        // Seek to playbackStart when video loads (if constrained)
        if (hasPlaybackConstraints && effectiveStart > 0) {
          video.currentTime = effectiveStart;
        }
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    
    // iOS debug logging
    const handleLoadStart = () => {
      console.log('[iOSPlaybackDebug] loadstart - video beginning to load:', {
        src: src?.substring(0, 80),
        readyState: video.readyState,
        networkState: video.networkState,
      });
    };
    
    const handleCanPlay = () => {
      console.log('[iOSPlaybackDebug] canplay - video can start playing:', {
        src: src?.substring(0, 80),
        readyState: video.readyState,
        duration: video.duration,
      });
      setIsVideoReady(true);
    };
    
    const handleError = (e: Event) => {
      const mediaError = video.error;
      console.error('[iOSPlaybackDebug] Video error:', {
        src: src?.substring(0, 80),
        errorCode: mediaError?.code,
        errorMessage: mediaError?.message,
        readyState: video.readyState,
        networkState: video.networkState,
        // NetworkState: 0=EMPTY, 1=IDLE, 2=LOADING, 3=NO_SOURCE
        networkStateLabel: ['EMPTY', 'IDLE', 'LOADING', 'NO_SOURCE'][video.networkState],
      });
    };
    
    const handleStalled = () => {
      console.warn('[iOSPlaybackDebug] Video stalled (download interrupted):', {
        src: src?.substring(0, 80),
        readyState: video.readyState,
        networkState: video.networkState,
        buffered: video.buffered.length > 0 ? `${video.buffered.start(0)}-${video.buffered.end(0)}` : 'none',
      });
    };
    
    const handleWaiting = () => {
      console.log('[iOSPlaybackDebug] waiting - video waiting for more data:', {
        currentTime: video.currentTime,
        readyState: video.readyState,
      });
    };

    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('loadedmetadata', updateDuration);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);
    video.addEventListener('stalled', handleStalled);
    video.addEventListener('waiting', handleWaiting);

    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('loadedmetadata', updateDuration);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
      video.removeEventListener('stalled', handleStalled);
      video.removeEventListener('waiting', handleWaiting);
    };
  }, [src, hasPlaybackConstraints, effectiveStart, effectiveEnd]);

  // Seek to start when playback constraints change
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hasPlaybackConstraints || duration === 0) return;
    
    // Seek to the start of the constrained range
    if (video.currentTime < effectiveStart || video.currentTime > effectiveEnd) {
      video.currentTime = effectiveStart;
    }
  }, [hasPlaybackConstraints, effectiveStart, effectiveEnd, duration]);

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
    // Only toggle if clicking on video itself or the container background
    // Don't toggle if clicking on control buttons
    if (target.tagName === 'VIDEO' || target === e.currentTarget) {
      e.stopPropagation(); // Prevent bubbling to parent modal close handlers
      togglePlayPause();
    }
  }, [togglePlayPause]);

  // The wrapper should shrink to fit the video content so controls overlay the video correctly
  // Using inline-flex makes the container shrink-wrap the video element
  const wrapperStyle: React.CSSProperties = {
    ...style,
  };

  return (
    <div
      className={cn("relative inline-flex items-center justify-center max-w-full max-h-full", className)}
      style={wrapperStyle}
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
        className="block max-w-full max-h-full object-contain rounded-lg bg-black cursor-pointer"
        onDoubleClick={isMobile ? undefined : toggleFullscreen}
        onLoadedMetadata={onLoadedMetadata}
      >
        Your browser does not support the video tag.
      </video>

      {/* Thumbnail overlay while video is loading */}
      {/* Uses aspectRatio on img to help with initial sizing for tall videos on mobile */}
      {poster && !isVideoReady && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
          <img
            src={getDisplayUrl(poster)}
            alt=""
            className="max-w-full max-h-full object-contain rounded-lg"
            style={videoDimensions ? { aspectRatio: `${videoDimensions.width} / ${videoDimensions.height}` } : undefined}
          />
          {/* Loading spinner overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-black/60 rounded-full p-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            </div>
          </div>
        </div>
      )}

      {/* Loading spinner when no thumbnail available */}
      {!poster && !isVideoReady && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/60 rounded-full p-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        </div>
      )}


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
              onClick={(e) => { e.stopPropagation(); togglePlayPause(); }}
              className="bg-black/70 hover:bg-black/90 text-white h-16 w-16 rounded-full p-0 shadow-wes border border-white/20 pointer-events-auto"
            >
              <Play className="h-8 w-8 ml-1" fill="currentColor" />
            </Button>
          </div>
        )}

        {/* Bottom Controls Bar */}
        <div
          className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-4 rounded-b-lg pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
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
