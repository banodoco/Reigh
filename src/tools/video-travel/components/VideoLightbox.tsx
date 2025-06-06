import React from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';
import { GenerationRow } from '@/types/shots';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';

interface VideoLightboxProps {
  video: GenerationRow;
  onClose: () => void;
}

const VideoLightbox: React.FC<VideoLightboxProps> = ({ video, onClose }) => {
  return ReactDOM.createPortal(
    <div 
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-4xl h-auto aspect-video"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking on the video
      >
        <HoverScrubVideo
          src={video.location || video.imageUrl}
          poster={video.thumbUrl}
          className="w-full h-full"
        />
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