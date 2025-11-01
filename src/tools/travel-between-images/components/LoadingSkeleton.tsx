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
            {/* Desktop skeleton - 3-column layout matching actual Header */}
            <div className="hidden sm:flex items-center px-2">
              {/* Left: Back button */}
              <div className="flex-1 flex justify-start">
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
              
              {/* Right: Aspect Ratio Selector with visualizer */}
              <div className="flex-1 flex justify-end">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-32 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
              </div>
            </div>
            
            {/* Mobile skeleton - all in one row matching actual mobile Header */}
            <div className="sm:hidden flex items-center justify-between px-3">
              {/* Back button (icon only) */}
              <Skeleton className="h-9 w-9 rounded-md flex-shrink-0" />
              
              {/* Shot name with navigation buttons */}
              <div className="flex items-center space-x-1 flex-shrink-0">
                <Skeleton className="h-9 w-9 rounded-md" />
                <Skeleton className="h-9 w-[100px] rounded-md" />
                <Skeleton className="h-9 w-9 rounded-md" />
              </div>
              
              {/* Aspect Ratio Selector (without visualizer) - narrower to balance layout */}
              <Skeleton className="h-9 w-16 rounded-md flex-shrink-0" />
            </div>
          </div>
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </PageFadeIn>
    );
  }

  // Grid type
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-x-8 md:gap-y-8 pb-6 md:pb-8 px-4 pt-4 pb-2">
      {Array.from({ length: gridItemCount }).map((_, idx) => (
        <Skeleton key={idx} className="h-40 rounded-lg" />
      ))}
    </div>
  );
};

