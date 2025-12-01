import React from 'react';
import { cn } from '@/shared/lib/utils';
import { parseRatio } from '@/shared/lib/aspectRatios';

interface SkeletonGalleryProps {
  /** Number of skeleton items to show */
  count?: number;
  /** Number of columns for the grid */
  columns?: {
    base?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
    '2xl'?: number;
  };
  /** Custom gap classes (e.g. "gap-2 sm:gap-3 md:gap-4") - defaults to "gap-4" */
  gapClasses?: string;
  /** Whether to use white text/styling (for dark panes) */
  whiteText?: boolean;
  /** Custom className for the container */
  className?: string;
  /** Whether to show skeleton controls at the top (pagination, filters, search) */
  showControls?: boolean;
  /** Project aspect ratio (e.g. "16:9", "4:3", "1:1") to match project dimensions */
  projectAspectRatio?: string;
}

/**
 * A reusable skeleton loading component for gallery layouts.
 * Provides consistent skeleton styling across different tools and pages.
 */
export function SkeletonGallery({ 
  count = 20, 
  columns = { base: 2, sm: 3, md: 4, lg: 5, xl: 6 },
  gapClasses = 'gap-4',
  whiteText = false,
  className,
  showControls = false,
  projectAspectRatio
}: SkeletonGalleryProps) {
  
  // [VideoSkeletonDebug] Trace mount/render for skeleton usage with key parameters
  React.useEffect(() => {
    console.log('[VideoSkeletonDebug] SkeletonGallery mount/render:', {
      count,
      columns,
      gapClasses,
      whiteText,
      showControls,
      projectAspectRatio,
      timestamp: Date.now()
    });
  }, [count, columns, gapClasses, whiteText, showControls, projectAspectRatio]);

  const gridCols = cn(
    'grid',
    gapClasses,
    columns.base === 1 && 'grid-cols-1',
    columns.base === 2 && 'grid-cols-2',
    columns.base === 3 && 'grid-cols-3',
    columns.base === 4 && 'grid-cols-4',
    columns.base === 5 && 'grid-cols-5',
    columns.base === 6 && 'grid-cols-6',
    columns.sm && columns.sm === 1 && 'sm:grid-cols-1',
    columns.sm && columns.sm === 2 && 'sm:grid-cols-2', 
    columns.sm && columns.sm === 3 && 'sm:grid-cols-3',
    columns.sm && columns.sm === 4 && 'sm:grid-cols-4',
    columns.sm && columns.sm === 5 && 'sm:grid-cols-5',
    columns.sm && columns.sm === 6 && 'sm:grid-cols-6',
    columns.md && columns.md === 1 && 'md:grid-cols-1',
    columns.md && columns.md === 2 && 'md:grid-cols-2',
    columns.md && columns.md === 3 && 'md:grid-cols-3', 
    columns.md && columns.md === 4 && 'md:grid-cols-4',
    columns.md && columns.md === 5 && 'md:grid-cols-5',
    columns.md && columns.md === 6 && 'md:grid-cols-6',
    columns.lg && columns.lg === 1 && 'lg:grid-cols-1',
    columns.lg && columns.lg === 2 && 'lg:grid-cols-2',
    columns.lg && columns.lg === 3 && 'lg:grid-cols-3',
    columns.lg && columns.lg === 4 && 'lg:grid-cols-4', 
    columns.lg && columns.lg === 5 && 'lg:grid-cols-5',
    columns.lg && columns.lg === 6 && 'lg:grid-cols-6',
    columns.xl && columns.xl === 1 && 'xl:grid-cols-1',
    columns.xl && columns.xl === 2 && 'xl:grid-cols-2',
    columns.xl && columns.xl === 3 && 'xl:grid-cols-3',
    columns.xl && columns.xl === 4 && 'xl:grid-cols-4',
    columns.xl && columns.xl === 5 && 'xl:grid-cols-5', 
    columns.xl && columns.xl === 6 && 'xl:grid-cols-6',
    columns['2xl'] && columns['2xl'] === 1 && '2xl:grid-cols-1',
    columns['2xl'] && columns['2xl'] === 2 && '2xl:grid-cols-2',
    columns['2xl'] && columns['2xl'] === 3 && '2xl:grid-cols-3',
    columns['2xl'] && columns['2xl'] === 4 && '2xl:grid-cols-4',
    columns['2xl'] && columns['2xl'] === 5 && '2xl:grid-cols-5',
    columns['2xl'] && columns['2xl'] === 6 && '2xl:grid-cols-6'
  );

  const skeletonBg = whiteText ? 'bg-zinc-700/60' : 'bg-muted';

  // Calculate aspect ratio for skeleton items
  let aspectRatioPadding = '100%'; // Default to square (1:1)
  
  if (projectAspectRatio) {
    const ratio = parseRatio(projectAspectRatio);
    if (!isNaN(ratio)) {
      const calculatedPadding = (1 / ratio) * 100; // height/width * 100
      // Ensure reasonable aspect ratio bounds
      const minPadding = 60; // Minimum 60% height (for very wide images)
      const maxPadding = 200; // Maximum 200% height (for very tall images)
      aspectRatioPadding = `${Math.min(Math.max(calculatedPadding, minPadding), maxPadding)}%`;
    }
  }

  return (
    <div className={cn('space-y-6 pb-8', className)}>
      {showControls && (
        <div className="mt-0 space-y-3">
          {/* Pagination row - matches ImageGallery pagination section */}
          <div className="flex justify-between items-center">
            {/* Left side - Pagination controls skeleton */}
            <div className="flex items-center gap-2">
              <div className={cn('h-8 w-16 rounded animate-pulse', skeletonBg)} />
              <div className={cn('h-4 w-40 rounded animate-pulse', skeletonBg)} />
              <div className={cn('h-8 w-16 rounded animate-pulse', skeletonBg)} />
            </div>

            {/* Right side - Starred filter skeleton */}
            <div className="flex items-center space-x-2">
              <div className={cn('h-4 w-4 rounded animate-pulse', skeletonBg)} />
              <div className={cn('h-4 w-12 rounded animate-pulse', skeletonBg)} />
            </div>
          </div>

          {/* Filters row - matches ImageGallery filters section */}
          <div className="flex justify-between items-center flex-wrap gap-y-2">
            {/* Left side - Filters skeleton */}
            <div className="flex items-center gap-3">
              {/* Shot Filter skeleton */}
              <div className={cn('h-8 w-[140px] rounded animate-pulse', skeletonBg)} />
              
              {/* Search skeleton */}
              <div className={cn('h-8 w-8 rounded animate-pulse', skeletonBg)} />
            </div>
            
            {/* Right side - Media Type Filter skeleton */}
            <div className="flex items-center space-x-1.5">
              <div className={cn('h-4 w-8 rounded animate-pulse', skeletonBg)} />
              <div className={cn('h-8 w-[100px] rounded animate-pulse', skeletonBg)} />
            </div>
          </div>
        </div>
      )}
      
      {/* Gallery grid skeleton */}
      <div className={gridCols}>
        {Array.from({ length: count }).map((_, idx) => (
          <div 
            key={idx} 
            className={cn(
              'animate-pulse rounded-lg relative',
              skeletonBg
            )}
            style={{ paddingBottom: aspectRatioPadding }}
          />
        ))}
      </div>
    </div>
  );
}

export default React.memo(SkeletonGallery); 