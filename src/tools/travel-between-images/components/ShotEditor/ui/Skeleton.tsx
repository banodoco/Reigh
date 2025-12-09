import React from 'react';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { CardHeader, CardTitle, CardContent } from '@/shared/components/ui/card';
import { GenerationRow } from '@/types/shots';
import { Image } from 'lucide-react';
import { isVideoGeneration } from '@/shared/lib/typeGuards';

interface ImageManagerSkeletonProps {
  isMobile: boolean;
  shotImages?: GenerationRow[]; // New prop: actual shot image data
  projectAspectRatio?: string; // New prop: project aspect ratio for proper dimensions
  columns?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12; // Match grid to runtime layout
}

export const ImageManagerSkeleton: React.FC<ImageManagerSkeletonProps> = ({ 
  isMobile, 
  shotImages = [], 
  projectAspectRatio,
  columns
}) => {
  // Filter out videos AND unpositioned images to match the actual filtering logic
  const actualImageCount = React.useMemo(() => {
    let positionedNonVideoCount = 0;
    let videosFiltered = 0;
    let unpositionedFiltered = 0;
    
    // Single pass through the array for efficiency
    // Uses canonical isVideoGeneration from typeGuards
    // NOTE: -1 is used as sentinel for unpositioned items in useTimelinePositionUtils
    shotImages.forEach(img => {
      if (isVideoGeneration(img)) {
        videosFiltered++;
      } else {
        const frame = (img as any).timeline_frame;
        const hasTimelineFrame = frame !== null && frame !== undefined && frame >= 0;
        if (hasTimelineFrame) {
          positionedNonVideoCount++;
        } else {
          unpositionedFiltered++;
        }
      }
    });
    
    console.log('[PROFILING] Skeleton - Real shot composition:', {
      totalImages: shotImages.length,
      positionedNonVideoCount,
      videosFiltered,
      unpositionedFiltered,
      projectAspectRatio
    });
    
    return positionedNonVideoCount;
  }, [shotImages, projectAspectRatio]);

  // Determine grid columns based on explicit columns prop if provided
  const gridCols = React.useMemo(() => {
    if (columns) {
      return `grid-cols-${columns}`;
    }
    return isMobile ? 'grid-cols-2' : 'grid-cols-6';
  }, [columns, isMobile]);
  
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
    <>
      {/* Only render content skeleton since header is now always rendered in ShotImagesEditor */}
      <div className="p-1">
          {actualImageCount > 0 ? (
            /* Real shot composition skeleton - show actual image count */
            <div className={`grid gap-3 ${gridCols}`}>
              {Array.from({ length: actualImageCount }).map((_, i) => (
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
            /* Empty state skeleton - matches the uploader UI when no images */
            <div className="w-full sm:w-2/3 md:w-1/2 lg:w-1/3 p-4 border rounded-lg bg-muted/20">
              <div className="flex flex-col items-center gap-3 text-center">
                <Image className="h-8 w-8 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  Add images to start building your animation
                </p>
                <div className="flex gap-2 w-full">
                  <Skeleton className="flex-1 h-9" />
                  <Skeleton className="flex-1 h-9" />
                </div>
              </div>
            </div>
          )}
        </div>
    </>
  );
}; // Modified file
