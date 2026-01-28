/**
 * AdjacentSegmentNavigation - Navigation buttons to jump to adjacent segment videos
 *
 * Shows above the media display when viewing an image that has adjacent segments:
 * - Left button: Jump to video that ENDS with this image (previous segment)
 * - Right button: Jump to video that STARTS with this image (next segment)
 *
 * Each button shows the segment's start/end image thumbnails with a video icon overlay.
 */

import React from 'react';
import { Video } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { AdjacentSegmentsData } from '../../types';

interface AdjacentSegmentNavigationProps {
  adjacentSegments: AdjacentSegmentsData;
}

export const AdjacentSegmentNavigation: React.FC<AdjacentSegmentNavigationProps> = ({
  adjacentSegments,
}) => {
  const { prev, next, onNavigateToSegment } = adjacentSegments;

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

  return (
    <div
      className="flex items-center gap-3 select-none"
      onClick={(e) => e.stopPropagation()}
    >
        {/* Previous segment button (ends with current image) */}
        <button
          onClick={handlePrevClick}
          disabled={!prev}
          title="View previous video segment"
          className={cn(
            'relative w-9 h-9 md:w-10 md:h-10 rounded-md overflow-hidden shadow-md transition-all',
            'hover:scale-105 hover:shadow-lg hover:ring-2 hover:ring-white/40',
            'focus:outline-none focus:ring-2 focus:ring-white/50',
            !prev && 'opacity-30 cursor-not-allowed pointer-events-none'
          )}
        >
          {/* Two images side by side in square container */}
          <div className="absolute inset-0 flex">
            {prev?.startImageUrl && (
              <div className="w-1/2 h-full overflow-hidden">
                <img
                  src={prev.startImageUrl}
                  alt="Start"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            {prev?.endImageUrl && (
              <div className="w-1/2 h-full overflow-hidden">
                <img
                  src={prev.endImageUrl}
                  alt="End"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>
          {/* Video icon overlay */}
          {prev && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Video className="w-4 h-4 text-white/50" />
            </div>
          )}
        </button>

        {/* Next segment button (starts with current image) */}
        <button
          onClick={handleNextClick}
          disabled={!next}
          title="View next video segment"
          className={cn(
            'relative w-9 h-9 md:w-10 md:h-10 rounded-md overflow-hidden shadow-md transition-all',
            'hover:scale-105 hover:shadow-lg hover:ring-2 hover:ring-white/40',
            'focus:outline-none focus:ring-2 focus:ring-white/50',
            !next && 'opacity-30 cursor-not-allowed pointer-events-none'
          )}
        >
          {/* Two images side by side in square container */}
          <div className="absolute inset-0 flex">
            {next?.startImageUrl && (
              <div className="w-1/2 h-full overflow-hidden">
                <img
                  src={next.startImageUrl}
                  alt="Start"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            {next?.endImageUrl && (
              <div className="w-1/2 h-full overflow-hidden">
                <img
                  src={next.endImageUrl}
                  alt="End"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>
          {/* Video icon overlay */}
          {next && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Video className="w-4 h-4 text-white/50" />
            </div>
          )}
        </button>
    </div>
  );
};

export default AdjacentSegmentNavigation;
