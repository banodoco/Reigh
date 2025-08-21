import { useState } from 'react';
import { GenerationRow } from '@/types/shots';

/**
 * Hook to manage thumbnail loading state
 */
export const useThumbnailLoader = (video: GenerationRow) => {
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);
  
  const hasThumbnail = video.thumbUrl && 
    video.thumbUrl !== video.location && 
    video.thumbUrl !== video.imageUrl;

  return {
    thumbnailLoaded,
    setThumbnailLoaded,
    thumbnailError,
    setThumbnailError,
    hasThumbnail
  };
};
