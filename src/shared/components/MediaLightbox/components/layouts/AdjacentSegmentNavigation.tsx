/**
 * AdjacentSegmentNavigation - Navigation buttons to jump to adjacent segment videos
 *
 * Shows above the media display when viewing an image that has adjacent segments:
 * - Left button: Jump to video that ENDS with this image (previous segment)
 * - Right button: Jump to video that STARTS with this image (next segment)
 *
 * On hover, shows preview of the segment's start/end images.
 */

import React, { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { ArrowUpLeft, MoveRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { AdjacentSegmentsData } from '../../types';

interface AdjacentSegmentNavigationProps {
  adjacentSegments: AdjacentSegmentsData;
}

export const AdjacentSegmentNavigation: React.FC<AdjacentSegmentNavigationProps> = ({
  adjacentSegments,
}) => {
  const { prev, next, onNavigateToSegment } = adjacentSegments;
  const [hoveredSide, setHoveredSide] = useState<'prev' | 'next' | null>(null);

  // Don't render if no adjacent segments
  if (!prev && !next) {
    return null;
  }

  const handlePrevClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (prev) {
      onNavigateToSegment(prev.pairIndex);
    }
  };

  const handleNextClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (next) {
      onNavigateToSegment(next.pairIndex);
    }
  };

  // Container gets higher z-index when hovering to ensure popover shows above VariantOverlayBadge (z-[60])
  const isHovering = hoveredSide !== null;

  return (
    <div
      className={cn(
        "absolute top-2 md:top-4 left-1/2 transform -translate-x-1/2 select-none",
        isHovering ? "z-[70]" : "z-[55]"
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        {/* Previous segment button (ends with current image) */}
        <div className="relative">
          <Button
            variant="secondary"
            size="sm"
            onClick={handlePrevClick}
            onMouseEnter={() => setHoveredSide('prev')}
            onMouseLeave={() => setHoveredSide(null)}
            disabled={!prev}
            className={cn(
              'bg-black/70 hover:bg-black/90 text-white border-none shadow-lg transition-all px-3',
              !prev && 'opacity-30 cursor-not-allowed'
            )}
          >
            <ArrowUpLeft className="w-5 h-5" strokeWidth={2.5} />
          </Button>

          {/* Hover preview for prev */}
          {hoveredSide === 'prev' && prev && (
            <div className="absolute top-full left-0 mt-2 p-2 bg-popover rounded-lg shadow-xl border border-border z-[100] min-w-[180px]">
              <div className="text-xs text-muted-foreground mb-1.5 text-center">
                {prev.hasVideo ? 'Video ending here' : 'Segment ending here'}
              </div>
              <div className="flex items-center gap-1.5">
                {prev.startImageUrl && (
                  <div className="w-16 h-10 rounded overflow-hidden bg-muted flex-shrink-0">
                    <img
                      src={prev.startImageUrl}
                      alt="Start"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <MoveRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                {prev.endImageUrl && (
                  <div className="w-16 h-10 rounded overflow-hidden bg-muted flex-shrink-0 ring-2 ring-orange-500">
                    <img
                      src={prev.endImageUrl}
                      alt="End (current)"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 text-center">
                Click to {prev.hasVideo ? 'view video' : 'open segment'}
              </div>
            </div>
          )}
        </div>

        {/* Next segment button (starts with current image) */}
        <div className="relative">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleNextClick}
            onMouseEnter={() => setHoveredSide('next')}
            onMouseLeave={() => setHoveredSide(null)}
            disabled={!next}
            className={cn(
              'bg-black/70 hover:bg-black/90 text-white border-none shadow-lg transition-all px-3',
              !next && 'opacity-30 cursor-not-allowed'
            )}
          >
            <ArrowUpLeft className="w-5 h-5 -scale-x-100" strokeWidth={2.5} />
          </Button>

          {/* Hover preview for next */}
          {hoveredSide === 'next' && next && (
            <div className="absolute top-full right-0 mt-2 p-2 bg-popover rounded-lg shadow-xl border border-border z-[100] min-w-[180px]">
              <div className="text-xs text-muted-foreground mb-1.5 text-center">
                {next.hasVideo ? 'Video starting here' : 'Segment starting here'}
              </div>
              <div className="flex items-center gap-1.5">
                {next.startImageUrl && (
                  <div className="w-16 h-10 rounded overflow-hidden bg-muted flex-shrink-0 ring-2 ring-orange-500">
                    <img
                      src={next.startImageUrl}
                      alt="Start (current)"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <MoveRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                {next.endImageUrl && (
                  <div className="w-16 h-10 rounded overflow-hidden bg-muted flex-shrink-0">
                    <img
                      src={next.endImageUrl}
                      alt="End"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 text-center">
                Click to {next.hasVideo ? 'view video' : 'open segment'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdjacentSegmentNavigation;
