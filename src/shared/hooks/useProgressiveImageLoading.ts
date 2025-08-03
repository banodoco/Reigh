import { useEffect, useState } from 'react';

interface UseProgressiveImageLoadingProps {
  images: any[];
  page: number;
  enabled?: boolean;
}

export const useProgressiveImageLoading = ({ 
  images, 
  page, 
  enabled = true 
}: UseProgressiveImageLoadingProps) => {
  const [showImageIndices, setShowImageIndices] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!enabled || images.length === 0) return;

    let isCurrentPage = true; // Flag to check if this effect is still valid
    const timeouts: NodeJS.Timeout[] = [];

    // Reset and show first 10 images immediately
    setShowImageIndices(new Set(Array.from({ length: Math.min(10, images.length) }, (_, i) => i)));

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
      // Hard reset to prevent any stale state from affecting new page
      setShowImageIndices(new Set());
    };
  }, [images, page, enabled]);

  return { showImageIndices };
}; 