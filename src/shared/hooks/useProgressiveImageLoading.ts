import { useEffect, useState, useRef } from 'react';

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
  const currentPageRef = useRef(page);
  currentPageRef.current = page;

  useEffect(() => {
    if (!enabled || images.length === 0) return;

    let isCurrentPage = true; // Flag to check if this effect is still valid
    const timeouts: NodeJS.Timeout[] = [];

    // Reset and show first 10 images immediately (this ensures clean state for new page)
    const initialIndices = new Set(Array.from({ length: Math.min(10, images.length) }, (_, i) => i));
    setShowImageIndices(initialIndices);
    
    // Notify that initial images are ready (with small delay to avoid layout thrashing)
    if (onImagesReady) {
      const readyTimeout = setTimeout(() => {
        if (isCurrentPage && currentPageRef.current === page) {
          onImagesReady();
        }
      }, 16); // Next frame timing for smoother transitions
      timeouts.push(readyTimeout);
    }

    // Progressive loading for remaining images (if more than 10)
    if (images.length > 10) {
      // Restore original optimized batching logic
      const remainingImages = images.length - 10;
      const batchSize = Math.min(10, remainingImages); // Dynamic batch size like original
      const maxBatches = page > 10 ? 2 : Math.ceil(remainingImages / batchSize); // Smart limits
      let batchCount = 0;
      
      for (let i = 10; i < images.length && batchCount < maxBatches; i += batchSize) {
        const batchNumber = Math.floor((i - 10) / batchSize);
        const delay = (batchNumber + 1) * 100; // Shorter delay like original
        
        const timeout = setTimeout(() => {
          // Enhanced race condition check like original
          if (isCurrentPage && currentPageRef.current === page) {
            setShowImageIndices(prev => {
              const newSet = new Set(prev);
              // Add next batch (or remaining if less than batchSize)
              for (let j = i; j < Math.min(i + batchSize, images.length); j++) {
                newSet.add(j);
              }
              return newSet;
            });
          }
        }, delay);
        
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