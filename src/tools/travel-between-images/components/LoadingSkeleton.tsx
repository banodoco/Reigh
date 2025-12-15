import React from 'react';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { PageFadeIn } from '@/shared/components/transitions';

interface LoadingSkeletonProps {
  /** Type of skeleton to show */
  type: 'grid' | 'editor';
  /** Number of grid items to show (only for 'grid' type) */
  gridItemCount?: number;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ 
  type, 
  gridItemCount = 6 
}) => {
  if (type === 'editor') {
    return (
      <PageFadeIn className="pt-3 sm:pt-5">
        <div className="flex flex-col space-y-4 pb-4">
          <div className="flex-shrink-0 space-y-1 sm:space-y-3 pb-2">
            {/* Desktop skeleton - 3-column layout matching actual Header with fixed widths */}
            <div className="hidden sm:flex justify-between items-center gap-y-2 px-2">
              {/* Left: Back button container - fixed width matching Header */}
              <div className="w-[100px]">
                <Skeleton className="h-9 w-20 rounded-md" />
              </div>
              
              {/* Center: Navigation buttons with shot name */}
              <div className="flex items-center space-x-2">
                {/* ChevronLeft button - size="sm" is ~h-9 w-9 */}
                <Skeleton className="h-9 w-9 rounded-md" />
                {/* Shot name - 200px width with py-2 px-4 border = ~h-11 */}
                <Skeleton className="h-11 w-[200px] rounded-md" />
                {/* ChevronRight button - size="sm" is ~h-9 w-9 */}
                <Skeleton className="h-9 w-9 rounded-md" />
              </div>
              
              {/* Right: Aspect Ratio Selector container - fixed width matching Header, no visualizer */}
              <div className="w-[100px] flex justify-end">
                <Skeleton className="h-10 w-32 rounded-md" />
              </div>
            </div>
            
            {/* Mobile skeleton - all in one row matching actual mobile Header */}
            <div className="sm:hidden flex items-center justify-between">
              {/* Back button - fixed width container matching Header */}
              <div className="w-[75px]">
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
              
              {/* Shot name with navigation buttons */}
              <div className="flex items-center space-x-1 flex-shrink-0">
                <Skeleton className="h-9 w-9 rounded-md" />
                <Skeleton className="h-9 w-[70px] rounded-md" />
                <Skeleton className="h-9 w-9 rounded-md" />
              </div>
              
              {/* Aspect Ratio Selector - fixed width container matching Header */}
              <div className="w-[75px]">
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            </div>
          </div>
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </PageFadeIn>
    );
  }

  // Grid type - with header matching the actual layout from useVideoTravelHeader
  return (
    <>
      {/* Header matching VideoTravelToolPage shot list header */}
      <div className="mb-2 sm:mb-4 mt-4 sm:mt-6">
        {/* Title row with toggle link and New Shot button */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-end gap-4">
            {/* Title skeleton - "Shots" or "Videos" - text-3xl sm:text-4xl */}
            <Skeleton className="h-[30px] sm:h-[36px] w-20 sm:w-24 rounded-md" />
            {/* Toggle link skeleton - "See all videos" - text-sm with mb-1.5 */}
            <Skeleton className="h-5 w-24 rounded-md mb-1.5" />
          </div>
          {/* New Shot button skeleton - always reserve space for layout consistency */}
          <div className="flex items-center">
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </div>
        
        {/* Search box skeleton - wrapped in div matching actual structure */}
        <div>
          {/* Search box skeleton - matching h-8 w-full max-w-xs */}
          <Skeleton className="h-8 w-full max-w-xs rounded-md" />
          
          {/* Sort buttons row skeleton - matching text-base px-3 py-1 */}
          <div className="flex items-center space-x-2 mt-4 mb-1">
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-28 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </div>
      </div>
      
      {/* Grid content with matching container */}
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-x-8 md:gap-y-8 pb-6 md:pb-8 px-4 pt-4 pb-2">
          {Array.from({ length: gridItemCount }).map((_, idx) => (
            <Skeleton key={idx} className="h-40 rounded-lg" />
          ))}
        </div>
      </div>
    </>
  );
};

