import React from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';
import { getDisplayUrl } from '@/shared/lib/utils';
import { GenerationRow } from '@/types/shots';
import { useVideoScrubbing } from '@/shared/hooks/useVideoScrubbing';

interface VideoLightboxProps {
  video: GenerationRow;
  onClose: () => void;
}

const VideoLightbox: React.FC<VideoLightboxProps> = ({ video, onClose }) => {
  const {
    videoRef,
    playbackRate,
    progress,
    handleMouseEnter,
    handleMouseMove,
    handleMouseLeave,
    handleSeek,
  } = useVideoScrubbing();

  return ReactDOM.createPortal(
    <div 
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-4xl h-auto aspect-video"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking on the video
      >
        <div 
            className="w-full h-full relative group"
            onMouseEnter={handleMouseEnter}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
          <video
            ref={videoRef}
            src={getDisplayUrl(video.location || video.imageUrl)}
            poster={video.thumbUrl ? getDisplayUrl(video.thumbUrl) : getDisplayUrl('/placeholder.svg')}
            preload="auto"
            onLoadedData={(e) => { e.currentTarget.removeAttribute('poster'); }}
            loop
            muted
            autoPlay
            playsInline
            className="w-full h-full object-contain"
          >
            Your browser does not support the video tag.
          </video>

          {playbackRate !== null && (
            <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-md font-mono pointer-events-none z-20">
              {playbackRate.toFixed(1)}x
            </div>
          )}
          <div 
            className="absolute bottom-0 left-0 w-full h-1.5 bg-white/20 cursor-pointer z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            onClick={handleSeek}
          >
            <div 
              className="h-full bg-white" 
              style={{ width: `${progress || 0}%` }}
            />
          </div>
        </div>
      </div>
      <button 
        onClick={onClose} 
        className="absolute top-4 right-4 text-white hover:text-gray-300"
        aria-label="Close lightbox"
      >
        <X size={32} />
      </button>
    </div>,
    document.body
  );
};

export default VideoLightbox; 