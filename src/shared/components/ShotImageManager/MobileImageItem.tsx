/**
 * Mobile-optimized image item component
 * Extracted from ShotImageManager for better organization
 */

import React, { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Trash2, Copy, Check, Pencil, Maximize2 } from 'lucide-react';
import { cn, getDisplayUrl } from '@/shared/lib/utils';
import { useProgressiveImage } from '@/shared/hooks/useProgressiveImage';
import { isProgressiveLoadingEnabled } from '@/shared/settings/progressiveLoading';
import { MobileImageItemProps } from './types';
import { framesToSeconds } from '@/tools/travel-between-images/components/Timeline/utils/time-utils';
import { VariantBadge } from '@/shared/components/VariantBadge';

export const MobileImageItem: React.FC<MobileImageItemProps> = ({
  image,
  isSelected,
  index,
  onMobileTap,
  onDelete,
  onDuplicate,
  onOpenLightbox,
  onInpaintClick,
  hideDeleteButton = false,
  duplicatingImageId,
  duplicateSuccessImageId,
  shouldLoad = true,
  projectAspectRatio,
  frameNumber,
  readOnly = false,
}) => {
  // Progressive loading setup
  const progressiveEnabled = isProgressiveLoadingEnabled();
  const { src: progressiveSrc, phase, isThumbShowing, isFullLoaded, ref: progressiveRef } = useProgressiveImage(
    progressiveEnabled ? image.thumbUrl : null,
    image.imageUrl,
    {
      priority: false,
      lazy: true,
      enabled: progressiveEnabled && shouldLoad,
      crossfadeMs: 200
    }
  );

  const displayImageUrl = progressiveEnabled && progressiveSrc ? progressiveSrc : getDisplayUrl(image.thumbUrl || image.imageUrl);

  // Calculate aspect ratio for consistent sizing
  const getAspectRatioStyle = () => {
    // Try to get dimensions from image metadata first
    let width = (image as any).metadata?.width;
    let height = (image as any).metadata?.height;
    
    // If not found, try to extract from resolution string
    if (!width || !height) {
      const resolution = (image as any).metadata?.originalParams?.orchestrator_details?.resolution;
      if (resolution && typeof resolution === 'string' && resolution.includes('x')) {
        const [w, h] = resolution.split('x').map(Number);
        if (!isNaN(w) && !isNaN(h)) {
          width = w;
          height = h;
        }
      }
    }
    
    // If we have image dimensions, use them
    if (width && height) {
      const aspectRatio = width / height;
      return { aspectRatio: `${aspectRatio}` };
    }
    
    // Fall back to project aspect ratio if available
    if (projectAspectRatio) {
      const [w, h] = projectAspectRatio.split(':').map(Number);
      if (!isNaN(w) && !isNaN(h)) {
        const aspectRatio = w / h;
        return { aspectRatio: `${aspectRatio}` };
      }
    }
    
    // Default to square aspect ratio
    return { aspectRatio: '1' };
  };

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const isButton = target.closest('button') !== null;

    if (!isButton) {
      onMobileTap();
    }
  };

  // image.id is shot_generations.id - unique per entry
  const isDuplicating = duplicatingImageId === image.id;
  const showSuccessIcon = duplicateSuccessImageId === image.id;

  return (
    <>
      <div
        className={cn(
          "relative group cursor-pointer rounded-lg overflow-hidden border-4",
          isSelected
            ? "border-blue-500 ring-4 ring-blue-200 dark:ring-blue-800"
            : "border-transparent"
        )}
        onClick={handleContainerClick}
        style={getAspectRatioStyle()}
      >
        {/* Image */}
        <img
          ref={progressiveRef}
          src={shouldLoad ? displayImageUrl : undefined}
          alt={`Generated image ${index + 1}`}
          className={cn(
            "w-full h-full object-cover",
            !shouldLoad && "bg-gray-100 dark:bg-gray-800"
          )}
          loading="lazy"
        />

        {/* Frame number overlay - bottom (matching timeline style) */}
        {frameNumber !== undefined && (
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] leading-none text-center py-0.5 pointer-events-none whitespace-nowrap overflow-hidden">
            <span className="inline-block">{framesToSeconds(frameNumber)}</span>
          </div>
        )}

        {/* Variant Count + NEW badge - top left */}
        <VariantBadge
          derivedCount={(image as any).derivedCount}
          unviewedVariantCount={(image as any).unviewedVariantCount}
          hasUnviewedVariants={(image as any).hasUnviewedVariants}
          variant="overlay"
          size="sm"
        />

        {/* Center lightbox button - shows when selected */}
        {isSelected && onOpenLightbox && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Button
              size="icon"
              variant="secondary"
              className="h-12 w-12 rounded-full bg-background/90 hover:bg-background shadow-lg pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation();
                onOpenLightbox();
              }}
              title="Open lightbox"
            >
              <Maximize2 className="h-5 w-5" />
            </Button>
          </div>
        )}

        {/* Bottom left - Edit Image button */}
        <div className="absolute bottom-2 left-2 flex gap-2 items-start opacity-100 transition-opacity">
          {/* Edit Image button (hidden in readOnly) */}
          {!readOnly && onInpaintClick && (
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 bg-card/75 dark:bg-gray-800/75 hover:bg-card/90 dark:hover:bg-gray-800/90"
              onClick={(e) => {
                e.stopPropagation();
                // Open lightbox in unified edit mode
                onInpaintClick();
              }}
              title="Edit image"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Top right - Copy and Delete buttons */}
        <div className="absolute top-2 right-2 flex gap-2 items-end opacity-100 transition-opacity">
          {/* Duplicate button - hidden when selected */}
          {!readOnly && onDuplicate && !isSelected && (
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 bg-card/75 dark:bg-gray-800/75 hover:bg-card/90 dark:hover:bg-gray-800/90"
              onClick={(e) => {
                e.stopPropagation();
                // Use id (shot_generations.id) for duplication
                onDuplicate(image.id, (image as any).timeline_frame ?? index);
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
              }}
              disabled={isDuplicating || image.id?.startsWith('temp-')}
              title={image.id?.startsWith('temp-') ? "Please wait..." : "Duplicate"}
            >
              {showSuccessIcon ? (
                <Check className="h-3 w-3 text-green-600" />
              ) : isDuplicating ? (
                <div className="h-3 w-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          )}
          {/* Delete button - only shown when selected */}
          {!readOnly && isSelected && onDelete && (
            <Button
              size="icon"
              variant="destructive"
              className="h-8 w-8 bg-red-500/75 hover:bg-red-500/90"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              disabled={image.id?.startsWith('temp-')}
              title={image.id?.startsWith('temp-') ? "Please wait..." : "Delete"}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </>
  );
};
