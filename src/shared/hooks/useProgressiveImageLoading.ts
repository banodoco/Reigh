import { useEffect, useState } from 'react';

interface UseProgressiveImageLoadingProps {
  images: any[];
  page: number;
  enabled?: boolean;
  onImagesReady?: () => void; // Callback when first batch is ready
}

export const useProgressiveImageLoading = ({ 
  images, 
  page, 
  enabled = true,
  onImagesReady
}: UseProgressiveImageLoadingProps) => {
  const [showImageIndices, setShowImageIndices] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!enabled || images.length === 0) return;

    let isCurrentPage = true; // Flag to check if this effect is still valid
    const timeouts: NodeJS.Timeout[] = [];

    // Reset and show first 10 images immediately (this ensures clean state for new page)
    const initialIndices = new Set(Array.from({ length: Math.min(10, images.length) }, (_, i) => i));
    setShowImageIndices(initialIndices);
    
    // Notify that initial images are ready
    if (onImagesReady) {
      onImagesReady();
    }

    // Progressive loading for remaining images (if more than 10)
    if (images.length > 10) {
      let batchCount = 0;
      // Limit to avoid excessive complexity on high page numbers
      const maxBatches = page > 10 ? 2 : Math.ceil((images.length - 10) / 10);
      
      for (let i = 10; i < images.length && batchCount < maxBatches; i += 10) {
        const timeout = setTimeout(() => {
          if (isCurrentPage) {
            setShowImageIndices(prev => {
              const newSet = new Set(prev);
              // Add next batch of 10 images (or remaining if less than 10)
              for (let j = i; j < Math.min(i + 10, images.length); j++) {
                newSet.add(j);
              }
              return newSet;
            });
          }
        }, (batchCount + 1) * 100); // 100ms between batches
        
        timeouts.push(timeout);
        batchCount++;
      }
    }
    
    // Cleanup function that runs when dependencies change or component unmounts
    return () => {
      isCurrentPage = false; // Mark this effect as stale
      timeouts.forEach(timeout => clearTimeout(timeout));
      // Don't clear showImageIndices here - let the new effect handle setting them
    };
  }, [images, page, enabled]);

  return { showImageIndices };
}; 