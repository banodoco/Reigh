/**
 * ConstituentImageNavigation - Navigation buttons to jump to segment's constituent images
 *
 * Shows below the segment video or form to allow navigation to the images
 * that make up this segment:
 * - Left button: Jump to the START image of this segment
 * - Right button: Jump to the END image of this segment
 *
 * Each button shows the image thumbnail with a subtle image icon overlay.
 */

import React from 'react';
import { Image } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface ConstituentImageNavigationProps {
  startImageId?: string;
  endImageId?: string;
  startImageUrl?: string;
  endImageUrl?: string;
  onNavigateToImage: (shotGenerationId: string) => void;
  /** Variant: 'overlay' for on top of video, 'inline' for within form */
  variant?: 'overlay' | 'inline';
}

export const ConstituentImageNavigation: React.FC<ConstituentImageNavigationProps> = ({
  startImageId,
  endImageId,
  startImageUrl,
  endImageUrl,
  onNavigateToImage,
  variant = 'overlay',
}) => {
  // Don't render if no images to navigate to
  if (!startImageId && !endImageId) {
    return null;
  }

  const handleStartClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (startImageId) {
      onNavigateToImage(startImageId);
    }
  };

  const handleEndClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (endImageId) {
      onNavigateToImage(endImageId);
    }
  };

  if (variant === 'inline') {
    // Inline variant for use within forms
    return (
      <div className="flex items-center justify-center gap-3 py-3 border-t border-border mt-4">
        <span className="text-xs text-muted-foreground">Jump to image:</span>
        <div className="flex items-center gap-2">
          {/* Start image button */}
          <button
            onClick={handleStartClick}
            disabled={!startImageId}
            title="View start image"
            className={cn(
              'relative w-10 h-10 rounded-lg overflow-hidden transition-all',
              'hover:scale-105 hover:ring-2 hover:ring-primary/50',
              'focus:outline-none focus:ring-2 focus:ring-primary/50',
              !startImageId && 'opacity-40 cursor-not-allowed pointer-events-none'
            )}
          >
            {startImageUrl && (
              <img
                src={startImageUrl}
                alt="Start image"
                className="w-full h-full object-cover"
              />
            )}
            {/* Image icon overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Image className="w-4 h-4 text-white/50" />
            </div>
          </button>

          {/* End image button */}
          <button
            onClick={handleEndClick}
            disabled={!endImageId}
            title="View end image"
            className={cn(
              'relative w-10 h-10 rounded-lg overflow-hidden transition-all',
              'hover:scale-105 hover:ring-2 hover:ring-primary/50',
              'focus:outline-none focus:ring-2 focus:ring-primary/50',
              !endImageId && 'opacity-40 cursor-not-allowed pointer-events-none'
            )}
          >
            {endImageUrl && (
              <img
                src={endImageUrl}
                alt="End image"
                className="w-full h-full object-cover"
              />
            )}
            {/* Image icon overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Image className="w-4 h-4 text-white/50" />
            </div>
          </button>
        </div>
      </div>
    );
  }

  // Overlay variant for positioning on top of video
  // Position above WorkflowControlsBar (which is at bottom-8 md:bottom-16)
  // Mobile: very close to edge (bottom-4), Desktop: more spacing (bottom-28)
  return (
    <div
      className="absolute bottom-4 md:bottom-28 left-1/2 transform -translate-x-1/2 z-[70] select-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-3">
        {/* Start image button */}
        <button
          onClick={handleStartClick}
          disabled={!startImageId}
          title="View start image"
          className={cn(
            'relative w-12 h-12 md:w-14 md:h-14 rounded-lg overflow-hidden shadow-lg transition-all',
            'hover:scale-105 hover:shadow-xl hover:ring-2 hover:ring-white/40',
            'focus:outline-none focus:ring-2 focus:ring-white/50',
            !startImageId && 'opacity-30 cursor-not-allowed pointer-events-none'
          )}
        >
          {startImageUrl && (
            <img
              src={startImageUrl}
              alt="Start image"
              className="w-full h-full object-cover"
            />
          )}
          {/* Image icon overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <Image className="w-5 h-5 md:w-6 md:h-6 text-white/50" />
          </div>
        </button>

        {/* End image button */}
        <button
          onClick={handleEndClick}
          disabled={!endImageId}
          title="View end image"
          className={cn(
            'relative w-12 h-12 md:w-14 md:h-14 rounded-lg overflow-hidden shadow-lg transition-all',
            'hover:scale-105 hover:shadow-xl hover:ring-2 hover:ring-white/40',
            'focus:outline-none focus:ring-2 focus:ring-white/50',
            !endImageId && 'opacity-30 cursor-not-allowed pointer-events-none'
          )}
        >
          {endImageUrl && (
            <img
              src={endImageUrl}
              alt="End image"
              className="w-full h-full object-cover"
            />
          )}
          {/* Image icon overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <Image className="w-5 h-5 md:w-6 md:h-6 text-white/50" />
          </div>
        </button>
      </div>
    </div>
  );
};

export default ConstituentImageNavigation;
