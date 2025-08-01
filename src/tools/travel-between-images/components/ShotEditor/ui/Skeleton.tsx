import React from 'react';
import { Skeleton } from '@/shared/components/ui/skeleton';

interface ImageManagerSkeletonProps {
  isMobile: boolean;
}

export const ImageManagerSkeleton: React.FC<ImageManagerSkeletonProps> = ({ isMobile }) => (
  <div className="space-y-4">
    {/* Header skeleton */}
    <div className="flex items-center justify-between mb-4">
      <Skeleton className="h-7 w-48" />
      {!isMobile && (
        <Skeleton className="h-8 w-36" />
      )}
    </div>
    
    {/* Description skeleton */}
    <Skeleton className="h-4 w-full max-w-lg mb-6" />
    
    {/* Content area skeleton */}
    <div className="p-1 min-h-[200px]">
      {/* Image grid skeleton - fewer items initially */}
      <div className={`grid gap-3 ${isMobile ? 'grid-cols-2' : 'grid-cols-6'}`}>
        {Array.from({ length: isMobile ? 2 : 6 }).map((_, i) => (
          <div key={i} className="aspect-square">
            <Skeleton className="w-full h-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
    
    {/* Upload section skeleton */}
    <div className="pt-4 border-t space-y-3">
      <Skeleton className="h-12 w-full" />
    </div>
  </div>
); 