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
  isLightboxOpen?: boolean;
  instanceId?: string; // Unique ID to prevent state conflicts between multiple instances
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
  isLightboxOpen = false,
  instanceId,
  children
}) => {
  
  console.log(`🔍 [PAGELOADINGDEBUG] [MANAGER:${instanceId}] ProgressiveLoadingManager rendering with:`, {
    imagesLength: images.length,
    page,
    enabled,
    isLightboxOpen,
    timestamp: Date.now()
  });
  
  const { showImageIndices } = useProgressiveImageLoading({
    images,
    page,
    enabled,
    isMobile,
    onImagesReady,
    isLightboxOpen,
    instanceId,
  });

  console.log(`🔍 [PAGELOADINGDEBUG] [MANAGER:${instanceId}] showImageIndices:`, {
    size: showImageIndices.size,
    indices: Array.from(showImageIndices).slice(0, 10),
    timestamp: Date.now()
  });

  // Render children with showImageIndices via render prop
  return <>{children(showImageIndices)}</>;
};
