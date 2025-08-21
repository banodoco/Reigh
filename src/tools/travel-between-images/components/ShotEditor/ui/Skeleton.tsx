import React from 'react';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { GenerationRow } from '@/types/shots';

interface ImageManagerSkeletonProps {
  isMobile: boolean;
  shotImages?: GenerationRow[]; // New prop: actual shot image data
  projectAspectRatio?: string; // New prop: project aspect ratio for proper dimensions
}

export const ImageManagerSkeleton: React.FC<ImageManagerSkeletonProps> = ({ 
  isMobile, 
  shotImages = [], 
  projectAspectRatio 
}) => {
  // Filter out videos to match the actual filtering logic
  const actualImageCount = React.useMemo(() => {
    const nonVideoImages = shotImages.filter(img => {
      const isVideo = img.type === 'video' ||
                     img.type === 'video_travel_output' ||
                     (img.location && img.location.endsWith('.mp4')) ||
                     (img.imageUrl && img.imageUrl.endsWith('.mp4'));
      return !isVideo;
    });
    
    console.log('[PROFILING] Skeleton - Real shot composition:', {
      totalImages: shotImages.length,
      nonVideoCount: nonVideoImages.length,
      videosFiltered: shotImages.length - nonVideoImages.length,
      projectAspectRatio
    });
    
    return nonVideoImages.length;
  }, [shotImages, projectAspectRatio]);

  // Determine grid columns based on device and actual image count
  const gridCols = isMobile ? 'grid-cols-2' : 'grid-cols-6';
  
  // If we have shot data, show exact count; otherwise fall back to default
  const skeletonCount = actualImageCount > 0 ? actualImageCount : (isMobile ? 2 : 6);
  
  // Calculate exact aspect ratio for skeleton items based on project dimensions
  const aspectRatioStyle = React.useMemo(() => {
    if (!projectAspectRatio) return { aspectRatio: '1' }; // Default square
    
    const [width, height] = projectAspectRatio.split(':').map(Number);
    if (width && height) {
      const ratio = width / height;
      return { aspectRatio: ratio.toString() };
    }
    
    return { aspectRatio: '1' }; // Fallback to square
  }, [projectAspectRatio]);

  return (
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
      
      {/* Content area skeleton - matches real shot composition */}
      <div className="p-1 min-h-[200px]">
        {actualImageCount > 0 ? (
          /* Real shot composition skeleton */
          <div className={`grid gap-3 ${gridCols}`}>
            {Array.from({ length: skeletonCount }).map((_, i) => (
              <div key={i} style={aspectRatioStyle}>
                <div className="w-full h-full relative">
                  {/* Realistic image skeleton with subtle loading animation */}
                  <Skeleton className="w-full h-full rounded-lg" />
                  
                  {/* Simulate loading indicator like real images */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-muted-foreground/60 rounded-full animate-spin" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Fallback generic skeleton when no shot data available */
          <div className={`grid gap-3 ${gridCols}`}>
            {Array.from({ length: skeletonCount }).map((_, i) => (
              <div key={i} style={aspectRatioStyle}>
                <Skeleton className="w-full h-full rounded-lg" />
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Upload section skeleton */}
      <div className="pt-4 border-t space-y-3">
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}; 