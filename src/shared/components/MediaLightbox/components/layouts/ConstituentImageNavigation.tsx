/**
 * ConstituentImageNavigation - Navigation buttons to jump to segment's constituent images
 *
 * Shows below the segment video or form to allow navigation to the images
 * that make up this segment:
 * - Left button: Jump to the START image of this segment
 * - Right button: Jump to the END image of this segment
 *
 * Each button shows the image thumbnail with a subtle image icon overlay.
 * Hovering shows a larger preview of the image.
 */

import React from 'react';
import { Image } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/shared/components/ui/hover-card';

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

  // Shared image button component
  const ImageButton = ({
    imageId,
    imageUrl,
    label,
    onClick,
  }: {
    imageId?: string;
    imageUrl?: string;
    label: string;
    onClick: (e: React.MouseEvent) => void;
  }) => {
    const isInline = variant === 'inline';
    const buttonSize = isInline ? 'w-10 h-10' : 'w-9 h-9 md:w-10 md:h-10';
    const buttonRounding = isInline ? 'rounded-lg' : 'rounded-md';
    const hoverRing = isInline ? 'hover:ring-primary/50' : 'hover:ring-white/40';
    const focusRing = isInline ? 'focus:ring-primary/50' : 'focus:ring-white/50';

    const button = (
      <button
        onClick={onClick}
        disabled={!imageId}
        title={`View ${label.toLowerCase()}`}
        className={cn(
          'relative overflow-hidden transition-all',
          buttonSize,
          buttonRounding,
          !isInline && 'shadow-md',
          'hover:scale-105',
          !isInline && 'hover:shadow-lg',
          `hover:ring-2 ${hoverRing}`,
          `focus:outline-none focus:ring-2 ${focusRing}`,
          !imageId && (isInline ? 'opacity-40' : 'opacity-30'),
          !imageId && 'cursor-not-allowed pointer-events-none'
        )}
      >
        {imageUrl && (
          <img
            src={imageUrl}
            alt={label}
            className="w-full h-full object-cover"
          />
        )}
        {/* Image icon overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Image className="w-4 h-4 text-white/50" />
        </div>
      </button>
    );

    // Don't show hover card if no image URL
    if (!imageUrl || !imageId) {
      return button;
    }

    return (
      <HoverCard openDelay={200} closeDelay={100}>
        <HoverCardTrigger asChild>
          {button}
        </HoverCardTrigger>
        <HoverCardContent
          side="top"
          sideOffset={8}
          className="p-1 w-auto border-0 bg-background/95 backdrop-blur-sm z-[100001]"
        >
          <div className="flex flex-col items-center gap-1">
            <img
              src={imageUrl}
              alt={label}
              className="w-40 h-40 object-cover rounded-md"
            />
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  };

  if (variant === 'inline') {
    // Inline variant for use within forms
    return (
      <div className="flex items-center justify-center gap-3 py-3 border-t border-border mt-4">
        <span className="text-xs text-muted-foreground">Jump to image:</span>
        <div className="flex items-center gap-2">
          <ImageButton
            imageId={startImageId}
            imageUrl={startImageUrl}
            label="Start image"
            onClick={handleStartClick}
          />
          <ImageButton
            imageId={endImageId}
            imageUrl={endImageUrl}
            label="End image"
            onClick={handleEndClick}
          />
        </div>
      </div>
    );
  }

  // Overlay variant for positioning on top of video
  // Same level as other bottom controls (bottom-4)
  return (
    <div
      className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-[70] select-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <ImageButton
          imageId={startImageId}
          imageUrl={startImageUrl}
          label="Start image"
          onClick={handleStartClick}
        />
        <ImageButton
          imageId={endImageId}
          imageUrl={endImageUrl}
          label="End image"
          onClick={handleEndClick}
        />
      </div>
    </div>
  );
};

export default ConstituentImageNavigation;
