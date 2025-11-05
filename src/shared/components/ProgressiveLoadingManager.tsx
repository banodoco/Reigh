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
const ProgressiveLoadingManagerComponent: React.FC<ProgressiveLoadingManagerProps> = ({
  images,
  page,
  enabled = true,
  isMobile,
  onImagesReady,
  isLightboxOpen = false,
  instanceId,
  children
}) => {
  
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

  .slice(0, 10),
    timestamp: Date.now()
  });

  // Render children with showImageIndices via render prop
  return <>{children(showImageIndices)}</>;
};

// Memoize with custom comparison for performance
export const ProgressiveLoadingManager = React.memo(ProgressiveLoadingManagerComponent, (prevProps, nextProps) => {
  return (
    prevProps.images === nextProps.images &&
    prevProps.page === nextProps.page &&
    prevProps.enabled === nextProps.enabled &&
    prevProps.isMobile === nextProps.isMobile &&
    prevProps.isLightboxOpen === nextProps.isLightboxOpen &&
    prevProps.instanceId === nextProps.instanceId &&
    prevProps.onImagesReady === nextProps.onImagesReady
  );
});
