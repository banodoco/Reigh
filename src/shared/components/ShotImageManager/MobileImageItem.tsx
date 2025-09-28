/**
 * Mobile-optimized image item component
 * Extracted from ShotImageManager for better organization
 */

import React, { useState, useRef } from 'react';
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
}) => {
  const [isMagicEditOpen, setIsMagicEditOpen] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  
  // Progressive loading setup
  const progressiveEnabled = isProgressiveLoadingEnabled();
  const { src: progressiveSrc, phase, isThumbShowing, isFullLoaded, ref: progressiveRef } = useProgressiveImage({
    thumbUrl: image.thumbUrl || image.imageUrl,
    fullUrl: image.imageUrl,
    enabled: progressiveEnabled && shouldLoad,
  });

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

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    
    const touch = e.changedTouches[0];
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
    
    // Only trigger tap if movement is minimal (not a scroll)
    if (deltaX < 10 && deltaY < 10) {
      // Check if the touch target is a button or button child
      const target = e.target as HTMLElement;
      const isButton = target.closest('button') !== null;
      
      // Don't trigger mobile tap if touching a button
      if (!isButton) {
        onMobileTap();
      }
    }
    
    touchStartRef.current = null;
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
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
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

        {/* Selection overlay - removed blue tick */}

        {/* Bottom left action buttons */}
        <div className="absolute bottom-2 left-2 flex gap-1 opacity-100 transition-opacity z-20">
          {/* Lightbox button */}
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 bg-red-500 hover:bg-red-600 text-white z-30"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('[MobileImageItem] 🔴 RED LIGHTBOX BUTTON CLICKED!', { index, onOpenLightbox: !!onOpenLightbox });
              if (onOpenLightbox) {
                onOpenLightbox(index);
              } else {
                console.error('[MobileImageItem] onOpenLightbox is not defined!');
              }
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('[MobileImageItem] 🔴 RED LIGHTBOX BUTTON TOUCH START!', { index });
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('[MobileImageItem] 🔴 RED LIGHTBOX BUTTON TOUCH END!', { index });
            }}
            title="View Full Size"
            style={{ pointerEvents: 'auto', position: 'relative', zIndex: 999 }}
          >
            <Eye className="h-3 w-3" />
          </Button>

          {/* Magic Edit button */}
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 bg-white/90 hover:bg-white"
            onClick={(e) => {
              e.stopPropagation();
              setIsMagicEditOpen(true);
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
            }}
            title="Magic Edit"
          >
            <Sparkles className="h-3 w-3" />
          </Button>
        </div>

        {/* Top right action buttons */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-100 transition-opacity">

          {/* Duplicate button */}
          {onDuplicate && (
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 bg-white/90 hover:bg-white"
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
              className="h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
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
