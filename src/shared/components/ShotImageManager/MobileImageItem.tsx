/**
 * Mobile-optimized image item component
 * Extracted from ShotImageManager for better organization
 */

import React, { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Trash2, Copy, Check, Sparkles, Eye } from 'lucide-react';
import { cn, getDisplayUrl } from '@/shared/lib/utils';
import { useProgressiveImage } from '@/shared/hooks/useProgressiveImage';
import { isProgressiveLoadingEnabled } from '@/shared/settings/progressiveLoading';
import MagicEditModal from '@/shared/components/MagicEditModal';
import { MobileImageItemProps } from './types';

export const MobileImageItem: React.FC<MobileImageItemProps> = ({
  image,
  isSelected,
  index,
  onMobileTap,
  onDelete,
  onDuplicate,
  onOpenLightbox,
  hideDeleteButton = false,
  duplicatingImageId,
  duplicateSuccessImageId,
  shouldLoad = true,
  projectAspectRatio,
  frameNumber,
}) => {
  const [isMagicEditOpen, setIsMagicEditOpen] = useState(false);
  
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

  const handleOpenLightbox = () => {
    console.log('[MobileImageItemDebug] Eye button clicked:', {
      index,
      imageId: (image as any).id?.substring(0, 8),
      hasOnOpenLightbox: !!onOpenLightbox,
      timestamp: Date.now()
    });
    if (onOpenLightbox) {
      console.log('[MobileImageItemDebug] Calling onOpenLightbox with index:', index);
      onOpenLightbox(index);
    } else {
      console.warn('[MobileImageItemDebug] onOpenLightbox is not defined!');
    }
  };

  const isDuplicating = duplicatingImageId === ((image as any).shotImageEntryId ?? (image as any).id);
  const showSuccessIcon = duplicateSuccessImageId === ((image as any).shotImageEntryId ?? (image as any).id);

  return (
    <>
      <div
        className={cn(
          "relative group cursor-pointer transition-all duration-200 rounded-lg overflow-hidden border-4",
          isSelected 
            ? "border-blue-500 ring-4 ring-blue-200 dark:ring-blue-800" 
            : "border-transparent hover:border-gray-300 dark:hover:border-gray-600"
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
            "w-full h-full object-cover transition-opacity duration-300",
            !shouldLoad && "bg-gray-100 dark:bg-gray-800",
            // Remove blur effect on mobile - it's too aggressive and causes poor UX
            // progressiveEnabled && isThumbShowing && !isFullLoaded && "filter blur-sm",
            progressiveEnabled && isFullLoaded && "filter blur-none"
          )}
          loading="lazy"
        />

        {/* Frame number overlay - bottom (matching timeline style) */}
        {frameNumber !== undefined && (
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] leading-none text-center py-0.5 pointer-events-none whitespace-nowrap overflow-hidden">
            <span className="inline-block">{frameNumber}</span>
          </div>
        )}

        {/* Selection overlay - removed blue tick */}

        {/* Top left action buttons - all 4 icons evenly spaced */}
        <div className="absolute top-2 left-2 right-2 flex justify-between opacity-100 transition-opacity px-1">
          {/* Lightbox button */}
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 bg-white/75 hover:bg-white/90"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenLightbox();
            }}
            title="View Full Size"
          >
            <Eye className="h-3 w-3" />
          </Button>

          {/* Magic Edit button */}
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 bg-white/75 hover:bg-white/90"
            onClick={(e) => {
              e.stopPropagation();
              setIsMagicEditOpen(true);
            }}
            title="Magic Edit"
          >
            <Sparkles className="h-3 w-3" />
          </Button>

          {/* Duplicate button */}
          {onDuplicate && (
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 bg-white/75 hover:bg-white/90"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate((image as any).shotImageEntryId ?? (image as any).id, (image as any).timeline_frame || index);
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
              }}
              disabled={isDuplicating}
              title="Duplicate"
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

          {/* Delete button */}
          {!hideDeleteButton && (
            <Button
              size="icon"
              variant="destructive"
              className="h-8 w-8 bg-red-500/75 hover:bg-red-500/90"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Magic Edit Modal */}
      <MagicEditModal
        isOpen={isMagicEditOpen}
        onClose={() => setIsMagicEditOpen(false)}
        imageUrl={displayImageUrl}
        shotGenerationId={(image as any).shotImageEntryId}
      />
    </>
  );
};
