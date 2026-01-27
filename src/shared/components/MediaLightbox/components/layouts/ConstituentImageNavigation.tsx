/**
 * ConstituentImageNavigation - Navigation buttons to jump to segment's constituent images
 *
 * Shows below the segment video or form to allow navigation to the images
 * that make up this segment:
 * - Left button: Jump to the START image of this segment
 * - Right button: Jump to the END image of this segment
 *
 * Uses downward-pointing arrows to indicate "going down to" the images.
 */

import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { ArrowDownLeft } from 'lucide-react';
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
            className={cn(
              "flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors text-xs",
              startImageId
                ? "hover:bg-muted cursor-pointer"
                : "opacity-40 cursor-not-allowed"
            )}
          >
            <ArrowDownLeft className="w-3.5 h-3.5" strokeWidth={2} />
            {startImageUrl && (
              <div className="w-8 h-8 rounded overflow-hidden bg-muted flex-shrink-0 ring-1 ring-border">
                <img
                  src={startImageUrl}
                  alt="Start"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <span className="text-muted-foreground">Start</span>
          </button>

          {/* End image button */}
          <button
            onClick={handleEndClick}
            disabled={!endImageId}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors text-xs",
              endImageId
                ? "hover:bg-muted cursor-pointer"
                : "opacity-40 cursor-not-allowed"
            )}
          >
            <span className="text-muted-foreground">End</span>
            {endImageUrl && (
              <div className="w-8 h-8 rounded overflow-hidden bg-muted flex-shrink-0 ring-1 ring-border">
                <img
                  src={endImageUrl}
                  alt="End"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <ArrowDownLeft className="w-3.5 h-3.5 -scale-x-100" strokeWidth={2} />
          </button>
        </div>
      </div>
    );
  }

  // Overlay variant for positioning on top of video
  return (
    <div
      className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-[60] select-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 bg-black/60 rounded-lg px-3 py-2 backdrop-blur-sm">
        {/* Start image button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleStartClick}
          disabled={!startImageId}
          className={cn(
            'text-white hover:bg-white/20 border-none transition-all px-2 h-auto py-1.5 gap-1.5',
            !startImageId && 'opacity-30 cursor-not-allowed'
          )}
        >
          <ArrowDownLeft className="w-4 h-4" strokeWidth={2.5} />
          {startImageUrl && (
            <div className="w-10 h-10 rounded overflow-hidden bg-muted/20 flex-shrink-0 ring-1 ring-white/30">
              <img
                src={startImageUrl}
                alt="Start"
                className="w-full h-full object-cover"
              />
            </div>
          )}
        </Button>

        {/* End image button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleEndClick}
          disabled={!endImageId}
          className={cn(
            'text-white hover:bg-white/20 border-none transition-all px-2 h-auto py-1.5 gap-1.5',
            !endImageId && 'opacity-30 cursor-not-allowed'
          )}
        >
          {endImageUrl && (
            <div className="w-10 h-10 rounded overflow-hidden bg-muted/20 flex-shrink-0 ring-1 ring-white/30">
              <img
                src={endImageUrl}
                alt="End"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <ArrowDownLeft className="w-4 h-4 -scale-x-100" strokeWidth={2.5} />
        </Button>
      </div>
    </div>
  );
};

export default ConstituentImageNavigation;
