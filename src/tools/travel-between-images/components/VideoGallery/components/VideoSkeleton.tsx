import React from 'react';
import { Skeleton } from '@/shared/components/ui/skeleton';

interface VideoSkeletonProps {
  index: number;
}

// Skeleton component for loading states - defined outside to prevent recreation
export const VideoSkeleton = React.memo<VideoSkeletonProps>(({ index }) => (
  <div className="w-1/2 lg:w-1/3 px-1 sm:px-1.5 md:px-2 mb-2 sm:mb-3 md:mb-4">
    <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden shadow-sm border relative">
      {/* Use consistent gray-100 background instead of muted to prevent flashing */}
      <div className="w-full h-full bg-gray-100 animate-pulse" />
      
      {/* Loading indicator like real videos - stable animation */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-400 border-t-gray-600 rounded-full animate-spin" 
             style={{ animationDuration: '1s' }} />
      </div>
    </div>
  </div>
));
