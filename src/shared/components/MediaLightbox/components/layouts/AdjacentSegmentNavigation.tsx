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
import { Play } from 'lucide-react';
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
      className="absolute top-2 md:top-4 left-1/2 transform -translate-x-1/2 z-[55] select-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-3">
        {/* Previous segment button (ends with current image) */}
        <button
          onClick={handlePrevClick}
          disabled={!prev}
          className={cn(
            'relative flex items-center gap-0.5 rounded-lg overflow-hidden shadow-lg transition-all',
            'hover:scale-105 hover:shadow-xl',
            'focus:outline-none focus:ring-2 focus:ring-white/50',
            !prev && 'opacity-30 cursor-not-allowed pointer-events-none'
          )}
        >
          {prev?.startImageUrl && (
            <div className="w-10 h-10 md:w-12 md:h-12 overflow-hidden">
              <img
                src={prev.startImageUrl}
                alt="Start"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          {prev?.endImageUrl && (
            <div className="w-10 h-10 md:w-12 md:h-12 overflow-hidden">
              <img
                src={prev.endImageUrl}
                alt="End"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          {/* Video icon overlay */}
          {prev && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="bg-black/50 rounded-full p-1">
                <Play className="w-3 h-3 md:w-4 md:h-4 text-white/80 fill-white/80" />
              </div>
            </div>
          )}
        </button>

        {/* Next segment button (starts with current image) */}
        <button
          onClick={handleNextClick}
          disabled={!next}
          className={cn(
            'relative flex items-center gap-0.5 rounded-lg overflow-hidden shadow-lg transition-all',
            'hover:scale-105 hover:shadow-xl',
            'focus:outline-none focus:ring-2 focus:ring-white/50',
            !next && 'opacity-30 cursor-not-allowed pointer-events-none'
          )}
        >
          {next?.startImageUrl && (
            <div className="w-10 h-10 md:w-12 md:h-12 overflow-hidden">
              <img
                src={next.startImageUrl}
                alt="Start"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          {next?.endImageUrl && (
            <div className="w-10 h-10 md:w-12 md:h-12 overflow-hidden">
              <img
                src={next.endImageUrl}
                alt="End"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          {/* Video icon overlay */}
          {next && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="bg-black/50 rounded-full p-1">
                <Play className="w-3 h-3 md:w-4 md:h-4 text-white/80 fill-white/80" />
              </div>
            </div>
          )}
        </button>
      </div>
    </div>
  );
};

export default AdjacentSegmentNavigation;
