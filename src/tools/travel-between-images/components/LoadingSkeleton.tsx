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
          <div className="flex-shrink-0 space-y-1 sm:space-y-1 pb-2 sm:pb-1">
            {/* Desktop skeleton - 3-column layout matching actual Header with fixed widths */}
            <div className="hidden sm:flex justify-between items-center gap-y-2 px-2">
              {/* Left: Back button container - fixed width matching Header */}
              {/* Actual button has ArrowLeft icon + "Back" text, so wider than w-20 */}
              <div className="w-[100px]">
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
              
              {/* Center: Navigation buttons with shot name - matching actual layout */}
              <div className="flex items-center justify-center">
                <div className="flex items-center space-x-2">
                  {/* ChevronLeft button - size="sm" is ~h-9 w-9 */}
                  <Skeleton className="h-9 w-9 rounded-md" />
                  {/* Shot name - text-xl font-semibold with py-2 px-4 border-2 = ~h-10 */}
                  <Skeleton className="h-10 w-[200px] rounded-md" />
                  {/* ChevronRight button - size="sm" is ~h-9 w-9 */}
                  <Skeleton className="h-9 w-9 rounded-md" />
                </div>
              </div>
              
              {/* Right: Aspect Ratio Selector container - fixed width matching Header */}
              <div className="w-[100px]">
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            </div>
            
            {/* Mobile skeleton - all in one row matching actual mobile Header */}
            <div className="sm:hidden">
              <div className="flex items-center justify-between">
                {/* Back button - fixed width container matching Header */}
                {/* Mobile button only has icon, no text */}
                <div className="w-[75px]">
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
                
                {/* Shot name with navigation buttons - matching space-x-1 */}
                <div className="flex items-center space-x-1">
                  <Skeleton className="h-9 w-9 rounded-md" />
                  {/* Shot name - text-base with px-1 = ~h-6 */}
                  <Skeleton className="h-6 w-[70px] rounded-md" />
                  <Skeleton className="h-9 w-9 rounded-md" />
                </div>
                
                {/* Aspect Ratio Selector - fixed width container matching Header */}
                <div className="w-[75px]">
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
              </div>
            </div>
          </div>
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </PageFadeIn>
    );
  }

  // Grid type - with header matching the actual VideoTravelToolPage inline header
  return (
    <>
      {/* Header matching VideoTravelToolPage shot list header */}
      <div className="px-4 max-w-7xl mx-auto pt-6 pb-4">
        {/* Controls row - all on one line matching actual layout */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* SegmentedControl skeleton - Shots/Videos toggle */}
          {/* Actual has p-1 padding, each item is text-lg font-light px-5 py-0 */}
          <Skeleton className="h-10 w-[180px] sm:w-[200px] rounded-lg" />
          
          {/* Mobile: Search icon button skeleton */}
          <Skeleton className="h-8 w-8 rounded-md sm:hidden" />
          
          {/* Desktop: Search input skeleton - w-28 sm:w-52 h-8 */}
          <Skeleton className="hidden sm:block h-8 w-28 sm:w-52 rounded-md" />
          
          {/* Sort button skeleton - ml-auto to push right */}
          <Skeleton className="h-8 w-28 sm:w-32 rounded-md ml-auto" />
        </div>
      </div>
      
      {/* Grid content with matching container - matches ShotListDisplay grid exactly */}
      {/* Breakpoints: 1 col default, 2 cols at lg (1024px), 3 cols at xl (1280px) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-x-6 md:gap-y-5 pb-6 md:pb-8 px-4 pt-4">
        {Array.from({ length: gridItemCount }).map((_, idx) => (
          <Skeleton key={idx} className="h-32 rounded-lg" />
        ))}
      </div>
    </>
  );
};

