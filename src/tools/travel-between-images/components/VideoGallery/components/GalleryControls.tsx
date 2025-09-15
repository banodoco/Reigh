import React from 'react';
import { GenerationRow } from '@/types/shots';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Separator } from '@/shared/components/ui/separator';

interface GalleryControlsProps {
  sortedVideoOutputs: GenerationRow[];
  isLoadingGenerations: boolean;
  isFetchingGenerations: boolean;
  totalPages: number;
  currentPage: number;
  cachedCount?: number | null; // Add cached count prop
}

export const GalleryControls = React.memo<GalleryControlsProps>(({
  sortedVideoOutputs,
  isLoadingGenerations,
  isFetchingGenerations,
  totalPages,
  currentPage,
  cachedCount
}) => (
  <>
    <div className="flex items-center justify-between flex-wrap gap-2">
      <h3 className="text-base sm:text-lg font-light flex items-center gap-2">
        Output Videos &nbsp;
        {(isLoadingGenerations || isFetchingGenerations) ? (
          // Show cached count immediately if available, otherwise skeleton
          typeof cachedCount === 'number' ? `(${cachedCount})` : <Skeleton className="h-5 w-8 inline-block" />
        ) : (
          `(${sortedVideoOutputs.length})`
        )}
      </h3>
      {totalPages > 1 && !isLoadingGenerations && (
        <div className="flex items-center space-x-2">
          <span className="text-xs sm:text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
        </div>
      )}
    </div>

    <Separator className="my-2" />
  </>
));
