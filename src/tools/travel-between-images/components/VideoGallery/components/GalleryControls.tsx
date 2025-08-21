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
}

export const GalleryControls = React.memo<GalleryControlsProps>(({
  sortedVideoOutputs,
  isLoadingGenerations,
  isFetchingGenerations,
  totalPages,
  currentPage
}) => (
  <>
    <div className="flex items-center justify-between flex-wrap gap-2">
      <h3 className="text-base sm:text-lg font-light flex items-center gap-2">
        Output Videos &nbsp;
        {(isLoadingGenerations || isFetchingGenerations) ? (
          <Skeleton className="h-5 w-8 inline-block" />
        ) : (
          `(${sortedVideoOutputs.length})`
        )}
      </h3>
      {totalPages > 1 && !(isLoadingGenerations || isFetchingGenerations) && (
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
