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
        <div className="flex flex-col space-y-4 pb-16">
          <div className="flex-shrink-0 space-y-1 sm:space-y-3 pb-2">
            {/* Desktop skeleton - centered shot name navigation */}
            <div className="hidden sm:flex justify-center items-center gap-y-2 px-2">
              <div className="flex items-center space-x-2">
                <Skeleton className="h-8 w-8" />
                <Skeleton className="h-12 w-64" />
                <Skeleton className="h-8 w-8" />
              </div>
            </div>
            
            {/* Mobile skeleton - centered shot name navigation only */}
            <div className="sm:hidden flex justify-center px-2">
              <div className="flex items-center space-x-1">
                <Skeleton className="h-8 w-8" />
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-8 w-8" />
              </div>
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

