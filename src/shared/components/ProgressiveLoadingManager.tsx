/**
 * ProgressiveLoadingManager
 * 
 * Dedicated component for handling progressive image loading.
 * Clear separation from preloading and gallery rendering concerns.
 */

import React from 'react';
import { useProgressiveImageLoading } from '@/shared/hooks/useProgressiveImageLoading';

interface ProgressiveLoadingManagerProps {
  images: any[];
  page: number;
  enabled?: boolean;
  isMobile: boolean;
  onImagesReady?: () => void;
  children: (showImageIndices: Set<number>) => React.ReactNode;
}

/**
 * This component manages progressive loading and provides the showImageIndices
 * to its children via render prop pattern for clear data flow
 */
export const ProgressiveLoadingManager: React.FC<ProgressiveLoadingManagerProps> = ({
  images,
  page,
  enabled = true,
  isMobile,
  onImagesReady,
  children
}) => {
  
  const { showImageIndices } = useProgressiveImageLoading({
    images,
    page,
    enabled,
    isMobile,
    onImagesReady,
  });

  // Render children with showImageIndices via render prop
  return <>{children(showImageIndices)}</>;
};
