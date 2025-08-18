/**
 * ImagePreloadManager
 * 
 * Dedicated component for handling adjacent page preloading.
 * Clear separation from progressive loading and gallery rendering.
 */

import React from 'react';
import { useAdjacentPagePreloading } from '@/shared/hooks/useAdjacentPagePreloading';

interface ImagePreloadManagerProps {
  enabled?: boolean;
  isServerPagination?: boolean;
  page: number;
  serverPage?: number;
  totalFilteredItems: number;
  itemsPerPage: number;
  onPrefetchAdjacentPages?: (prevPage: number | null, nextPage: number | null) => void;
  allImages?: any[];
}

/**
 * This component has one job: manage adjacent page preloading
 * It doesn't render anything visible - just handles preloading logic
 */
export const ImagePreloadManager: React.FC<ImagePreloadManagerProps> = ({
  enabled = true,
  isServerPagination = false,
  page,
  serverPage,
  totalFilteredItems,
  itemsPerPage,
  onPrefetchAdjacentPages,
  allImages = []
}) => {
  
  // Use the adjacent page preloading hook
  useAdjacentPagePreloading({
    enabled,
    isServerPagination,
    page,
    serverPage,
    totalFilteredItems,
    itemsPerPage,
    onPrefetchAdjacentPages,
    allImages,
  });

  // This component doesn't render anything
  return null;
};
