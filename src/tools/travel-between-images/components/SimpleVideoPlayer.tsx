import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/shared/components/ui/button';
import { getDisplayUrl } from '@/shared/lib/utils';
import { cn } from '@/lib/utils';
import { Play, Pause } from 'lucide-react';

interface SimpleVideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
}

const SimpleVideoPlayer: React.FC<SimpleVideoPlayerProps> = ({
  src,
  poster,
  className = '',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);

  const speedOptions = [0.5, 1, 1.5, 2];

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const hasTriedAutoplayRef = { current: false } as { current: boolean };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    // Prefer canplay to avoid stutter at start; only attempt once
    const handleCanPlay = () => {
      if (hasTriedAutoplayRef.current) return;
      hasTriedAutoplayRef.current = true;
      video.play().catch((error) => {
        // Autoplay may be blocked; user can tap play
        });
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('canplay', handleCanPlay);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('canplay', handleCanPlay);
    };
  }, []);

  const handleSpeedChange = (speed: number) => {
    const video = videoRef.current;
    if (!video) return;

    video.playbackRate = speed;
    setPlaybackRate(speed);
  };

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch((error) => {
        });
    } else {
      video.pause();
    }
  };

  return (
    <div
      className={cn("relative w-[95vw] sm:w-auto", className)}
      style={{ maxHeight: '85vh', maxWidth: '95vw' }}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        src={getDisplayUrl(src)}
        poster={poster ? getDisplayUrl(poster) : undefined}
        controls={false}
        loop
        muted
        playsInline
        preload="auto"
        className="object-contain w-full sm:w-auto max-w-full"
        style={{ maxHeight: '85vh' }}
      >
        Your browser does not support the video tag.
      </video>

      {/* Custom play/pause button overlay - center */}
      <div 
        className="absolute inset-0 flex items-center justify-center cursor-pointer z-20"
        onClick={togglePlayPause}
      >
        {!isPlaying && (
          <Button
            variant="secondary"
            size="lg"
            className="bg-black/70 hover:bg-black/90 text-white h-16 w-16 rounded-full p-0"
            onClick={(e) => {
              e.stopPropagation();
              togglePlayPause();
            }}
          >
            <Play className="h-8 w-8 ml-1" fill="currentColor" />
          </Button>
        )}
      </div>

      {/* Playback speed controls – overlay at top left */}
      <div className="absolute top-2 left-2 flex items-center space-x-2 bg-black/60 rounded-md px-2 py-1 backdrop-blur-sm z-10">
        {speedOptions.map((speed) => (
          <Button
            key={speed}
            variant={playbackRate === speed ? 'default' : 'secondary'}
            size="sm"
            onClick={() => handleSpeedChange(speed)}
            className={cn(
              'h-6 min-w-[48px] px-2 text-xs',
              playbackRate === speed ? 'text-white' : 'text-foreground'
            )}
          >
            {speed}x
          </Button>
        ))}
      </div>
    </div>
  );
};

export default SimpleVideoPlayer; 