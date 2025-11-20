import React from 'react';
import { GenerationRow } from '@/types/shots';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Separator } from '@/shared/components/ui/separator';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Label } from '@/shared/components/ui/label';
import { Star } from 'lucide-react';

interface GalleryControlsProps {
  sortedVideoOutputs: GenerationRow[];
  isLoadingGenerations: boolean;
  isFetchingGenerations: boolean;
  totalPages: number;
  currentPage: number;
  cachedCount?: number | null; // Add cached count prop
  totalCount?: number;
  showStarredOnly?: boolean;
  onStarredFilterChange?: (starredOnly: boolean) => void;
}

export const GalleryControls = React.memo<GalleryControlsProps>(({
  sortedVideoOutputs,
  isLoadingGenerations,
  isFetchingGenerations,
  totalPages,
  currentPage,
  cachedCount,
  totalCount,
  showStarredOnly = false,
  onStarredFilterChange
}) => (
  <>
    <div className="flex items-center justify-between flex-wrap gap-2">
      <h3 className="text-base sm:text-lg font-light flex items-center gap-2">
        Output Videos &nbsp;
        {(isLoadingGenerations || isFetchingGenerations) ? (
          // Show cached count immediately if available, otherwise skeleton
          typeof cachedCount === 'number' ? `(${cachedCount})` : <Skeleton className="h-5 w-8 inline-block" />
        ) : (
          `(${totalCount ?? sortedVideoOutputs.length})`
        )}
      </h3>
      <div className="flex items-center gap-4">
        {/* Starred Filter */}
        {onStarredFilterChange && (
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="starred-filter-video"
              checked={showStarredOnly}
              onCheckedChange={(checked) => {
                const newStarredOnly = Boolean(checked);
                onStarredFilterChange(newStarredOnly);
              }}
            />
            <Label 
              htmlFor="starred-filter-video" 
              className="text-xs cursor-pointer flex items-center space-x-1 text-muted-foreground"
            >
              <Star className="h-3 w-3" />
              <span>Starred</span>
            </Label>
          </div>
        )}
        
        {/* Page indicator */}
        {totalPages > 1 && !isLoadingGenerations && (
          <div className="flex items-center space-x-2">
            <span className="text-xs sm:text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
          </div>
        )}
      </div>
    </div>

    <Separator className="my-2" />
  </>
));
