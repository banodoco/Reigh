import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { GenerationRow } from '@/types/shots';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';
import { getDisplayUrl } from '../lib/utils';

interface MediaLightboxProps {
  media: GenerationRow;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

const isVideo = (media: GenerationRow): boolean => {
    const url = media.location || media.imageUrl;
    return url ? url.endsWith('.mp4') : false;
};

const MediaLightbox: React.FC<MediaLightboxProps> = ({ media, onClose, onNext, onPrevious }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onNext();
      if (e.key === 'ArrowLeft') onPrevious();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNext, onPrevious]);

  return ReactDOM.createPortal(
    <div 
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-in fade-in"
      onClick={onClose}
    >
      <button 
        onClick={(e) => { e.stopPropagation(); onPrevious(); }} 
        className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors z-10 p-2 rounded-full bg-black/20 hover:bg-black/40"
        aria-label="Previous image"
      >
        <ChevronLeft size={40} />
      </button>

      <div 
        className="relative w-full max-w-5xl h-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {isVideo(media) ? (
            <HoverScrubVideo
                src={getDisplayUrl(media.location || media.imageUrl)}
                poster={getDisplayUrl(media.thumbUrl)}
                className="w-full h-full object-contain"
            />
        ) : (
            <img 
                src={getDisplayUrl(media.imageUrl)} 
                alt={media.metadata?.prompt || 'Lightbox image'} 
                className="max-h-[90vh] w-full object-contain" 
            />
        )}
      </div>

      <button 
        onClick={(e) => { e.stopPropagation(); onNext(); }} 
        className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors z-10 p-2 rounded-full bg-black/20 hover:bg-black/40"
        aria-label="Next image"
      >
        <ChevronRight size={40} />
      </button>

      <button 
        onClick={onClose} 
        className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
        aria-label="Close lightbox"
      >
        <X size={32} />
      </button>
    </div>,
    document.body
  );
};

export default MediaLightbox; 