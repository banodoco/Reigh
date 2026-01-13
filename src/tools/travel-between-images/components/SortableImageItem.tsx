import React, { useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GenerationRow } from '@/types/shots';
import { Button } from '@/shared/components/ui/button';
import { Trash2, Copy, Check, Pencil } from 'lucide-react';
import { cn, getDisplayUrl } from '@/shared/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useProgressiveImage } from '@/shared/hooks/useProgressiveImage';
import { isProgressiveLoadingEnabled } from '@/shared/settings/progressiveLoading';
import { framesToSeconds } from './Timeline/utils/time-utils';
import { VariantBadge } from '@/shared/components/VariantBadge';

interface SortableImageItemProps {
  image: GenerationRow;
  onDelete: (shotImageEntryId: string) => void;
  onDuplicate?: (shotImageEntryId: string, timeline_frame: number) => void;
  onDoubleClick: () => void;
  onMobileTap?: () => void;
  onClick: (event: React.MouseEvent) => void;
  onPointerDown?: (event: React.PointerEvent) => void;
  onInpaintClick?: () => void;
  isSelected: boolean;
  isDragDisabled?: boolean;
  timeline_frame?: number;
  /** Display time in seconds (calculated from position × frames per image / fps) */
  displayTimeSeconds?: number;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;
  /** When provided, image src will only be set once this is true */
  shouldLoad?: boolean;
  /** Project aspect ratio for proper dimensions */
  projectAspectRatio?: string;
}

const SortableImageItemComponent: React.FC<SortableImageItemProps> = ({
  image,
  onDelete,
  onDuplicate,
  onDoubleClick,
  onMobileTap,
  onClick,
  onPointerDown,
  onInpaintClick,
  isSelected,
  isDragDisabled = false,
  timeline_frame,
  displayTimeSeconds,
  duplicatingImageId,
  duplicateSuccessImageId,
  shouldLoad = true,
  projectAspectRatio,
}) => {
  // Progressive loading for sortable image item
  const progressiveEnabled = isProgressiveLoadingEnabled();
  const { src: progressiveSrc, phase, isThumbShowing, isFullLoaded, ref: progressiveRef } = useProgressiveImage(
    progressiveEnabled ? image.thumbUrl : null,
    image.imageUrl,
    {
      priority: false, // Not high priority in travel tool
      lazy: true,
      enabled: progressiveEnabled && shouldLoad,
      crossfadeMs: 200
    }
  );

  // Use progressive src if available, otherwise fallback to display URL
  const displayImageUrl = progressiveEnabled && progressiveSrc ? progressiveSrc : getDisplayUrl(image.thumbUrl || image.imageUrl);

  // Calculate aspect ratio for consistent sizing with skeletons
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

  // Use image.id (shot_generations.id) - unique per entry
  const sortableId = image.id;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
    disabled: isDragDisabled,
  });
  const isMobile = useIsMobile();

  // Track touch position to detect scrolling vs tapping
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!onMobileTap || !touchStartRef.current) return;

    const touch = e.changedTouches[0];
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
    
    // Only trigger tap if movement is minimal (< 10px in any direction)
    // This prevents accidental selection during scrolling
    if (deltaX < 10 && deltaY < 10) {
      e.preventDefault();
      onMobileTap();
    }
    
    touchStartRef.current = null;
  };

  const aspectRatioStyle = getAspectRatioStyle();
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: isDragDisabled ? 'auto' : 'none',
    ...aspectRatioStyle, // Apply aspect ratio to maintain consistent dimensions
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    // Use id (shot_generations.id) - unique per entry
    onDelete(image.id);
  };

  const handleDuplicateClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    if (onDuplicate && timeline_frame !== undefined) {
      // Use id (shot_generations.id) - unique per entry
      onDuplicate(image.id, timeline_frame);
    }
  };

  // Add cache-busting parameter to ensure updated images are displayed
  const imageUrl = image.thumbUrl || image.imageUrl;
  // Use forceRefresh for flipped images to ensure immediate display update
  const isFlippedImage = imageUrl && imageUrl.includes('flipped_');
  const displayUrl = getDisplayUrl(imageUrl, isFlippedImage);

  const finalClassName = cn(
    "group relative border rounded-lg overflow-hidden cursor-pointer bg-card hover:ring-2 hover:ring-primary/50 transition-colors",
    isSelected && "ring-4 ring-orange-500 ring-offset-2 ring-offset-background bg-orange-500/15 border-orange-500",
    isDragDisabled && "cursor-default"
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={finalClassName}
      data-selected={isSelected}
      data-image-id={image.id?.substring(0, 8)}
      {...(!isDragDisabled ? attributes : {})}
      onClick={(e) => {
        // Check if the click originated from a button or its children
        const target = e.target as HTMLElement;
        const isButtonClick = target.closest('button') !== null;

        // Don't trigger onClick if the click came from a button
        if (!isButtonClick) {
          onClick?.(e);
        }
      }}
      onPointerDown={(e) => {
        // Check if the pointer down originated from a button or its children
        const target = e.target as HTMLElement;
        const isButtonClick = target.closest('button') !== null;

        // Don't trigger onPointerDown if the click came from a button
        if (!isButtonClick) {
          onPointerDown?.(e);
        }
      }}
      onDoubleClick={isMobile ? undefined : onDoubleClick}
    >
      {/* Progressive image display */}
      <img
        ref={progressiveRef}
        src={shouldLoad ? displayImageUrl : '/placeholder.svg'}
        alt={`Generated image ${Math.floor((timeline_frame ?? 0) / 50) + 1}`}
        className={cn(
          "w-full h-full object-cover transition-all duration-200",
          // Progressive loading visual states
          progressiveEnabled && isThumbShowing && "opacity-95",
          progressiveEnabled && isFullLoaded && "opacity-100"
        )}
        onTouchStart={isMobile ? handleTouchStart : undefined}
        onTouchEnd={isMobile ? handleTouchEnd : undefined}
        loading="lazy"
        draggable={false}
        {...(!isDragDisabled ? listeners : {})}
        onError={(e) => {
          // Fallback to original URL if display URL fails
          const target = e.target as HTMLImageElement;
          if (target.src !== (image.thumbUrl || image.imageUrl)) {
            target.src = image.thumbUrl || image.imageUrl;
          }
        }}
      />
      
      {/* Time overlay - bottom (showing position-based time in seconds) */}
      {(displayTimeSeconds !== undefined || timeline_frame !== undefined) && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] leading-none text-center py-0.5 pointer-events-none whitespace-nowrap overflow-hidden">
          <span className="inline-block">
            {displayTimeSeconds !== undefined 
              ? `${displayTimeSeconds.toFixed(2)}s`
              : framesToSeconds(timeline_frame!)}
          </span>
        </div>
      )}
      
      {(!isMobile || !isDragDisabled) && (
        <>
          {/* Edit Image trigger */}
          {onInpaintClick && (
            <Button
              variant="secondary"
              size="icon"
              className="absolute bottom-1 left-1 h-6 w-6 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
                onInpaintClick();
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
              }}
              title="Edit image"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          
          {onDuplicate && timeline_frame !== undefined && (
            <>
          {/* Variant Count + NEW badge - top left */}
          <VariantBadge
            derivedCount={(image as any).derivedCount}
            unviewedVariantCount={(image as any).unviewedVariantCount}
            hasUnviewedVariants={(image as any).hasUnviewedVariants}
            variant="overlay"
            size="md"
          />
              
              <Button
              variant="secondary"
              size="icon"
              className="absolute top-1 right-[2rem] h-6 w-6 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
              onClick={handleDuplicateClick}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
              }}
              disabled={duplicatingImageId === image.id || image.id?.startsWith('temp-')}
              title={image.id?.startsWith('temp-') ? "Please wait..." : "Duplicate image"}
            >
              {duplicatingImageId === image.id ? (
                <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-white"></div>
              ) : duplicateSuccessImageId === image.id ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
            </>
          )}
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-1 right-1 h-6 w-6 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
            onClick={handleDeleteClick}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
            }}
            disabled={image.id?.startsWith('temp-')}
            title={image.id?.startsWith('temp-') ? "Please wait..." : "Remove from timeline"}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </>
      )}
    </div>
  );
};

// 🎯 PERFORMANCE: Memoize component to prevent unnecessary re-renders
// Only re-render when these specific props change
export const SortableImageItem = React.memo(
  SortableImageItemComponent,
  (prevProps, nextProps) => {
    // Use image.id (shot_generations.id) - unique per entry
    return (
      prevProps.image.id === nextProps.image.id &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.isDragDisabled === nextProps.isDragDisabled &&
      prevProps.timeline_frame === nextProps.timeline_frame &&
      prevProps.displayTimeSeconds === nextProps.displayTimeSeconds &&
      prevProps.duplicatingImageId === nextProps.duplicatingImageId &&
      prevProps.duplicateSuccessImageId === nextProps.duplicateSuccessImageId &&
      prevProps.shouldLoad === nextProps.shouldLoad &&
      prevProps.projectAspectRatio === nextProps.projectAspectRatio &&
      prevProps.image.thumbUrl === nextProps.image.thumbUrl &&
      prevProps.image.imageUrl === nextProps.image.imageUrl
    );
  }
); 