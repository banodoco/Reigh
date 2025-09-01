import React, { useState, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GenerationRow } from '@/types/shots';
import { Button } from '@/shared/components/ui/button';
import { Trash2, Copy, Check } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogOverlay,
} from '@/shared/components/ui/alert-dialog';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Label } from '@/shared/components/ui/label';
import { cn, getDisplayUrl } from '@/shared/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';

interface SortableImageItemProps {
  image: GenerationRow;
  onDelete: (shotImageEntryId: string) => void;
  onDuplicate?: (shotImageEntryId: string, position: number) => void;
  onDoubleClick: () => void;
  onMobileTap?: () => void;
  onClick: (event: React.MouseEvent) => void;
  onPointerDown?: (event: React.PointerEvent) => void;
  isSelected: boolean;
  isDragDisabled?: boolean;
  position?: number;
  skipConfirmation: boolean;
  onSkipConfirmationSave: () => void;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;
  /** When provided, image src will only be set once this is true */
  shouldLoad?: boolean;
  /** Project aspect ratio for proper dimensions */
  projectAspectRatio?: string;
}

export const SortableImageItem: React.FC<SortableImageItemProps> = ({
  image,
  onDelete,
  onDuplicate,
  onDoubleClick,
  onMobileTap,
  onClick,
  onPointerDown,
  isSelected,
  isDragDisabled = false,
  position,
  skipConfirmation,
  onSkipConfirmationSave,
  duplicatingImageId,
  duplicateSuccessImageId,
  shouldLoad = true,
  projectAspectRatio,
}) => {
  // Simple approach like ShotsPane - just use the image URL directly
  const displayImageUrl = getDisplayUrl(image.thumbUrl || image.imageUrl);

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

  const sortableId = (image.shotImageEntryId as any) || (image.id as any);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
    disabled: isDragDisabled,
  });
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] = useState(false);
  const [skipConfirmationNextTimeVisual, setSkipConfirmationNextTimeVisual] = useState(skipConfirmation);
  const currentDialogSkipChoiceRef = useRef(skipConfirmation);
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
    e.stopPropagation();
    if (skipConfirmation) {
      onDelete(image.shotImageEntryId);
    } else {
      setSkipConfirmationNextTimeVisual(false);
      currentDialogSkipChoiceRef.current = false;
      setIsConfirmDeleteDialogOpen(true);
    }
  };

  const handleConfirmDelete = () => {
    onDelete(image.shotImageEntryId);
    if (currentDialogSkipChoiceRef.current) {
      onSkipConfirmationSave();
    }
    setIsConfirmDeleteDialogOpen(false);
  };

  const handleDuplicateClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDuplicate && position !== undefined) {
      onDuplicate(image.shotImageEntryId, position);
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

  console.log('[SelectionDebug:SortableImageItem] DEEP RENDER TRACE', {
    imageId: ((image.shotImageEntryId as any) || (image.id as any) || '').toString().substring(0, 8),
    isSelected,
    isDragDisabled,
    isMobile,
    hasOnClick: !!onClick,
    finalClassName,
    classNameIncludes: {
      hasRing4: finalClassName.includes('ring-4'),
      hasRingOrange: finalClassName.includes('ring-orange-500'),
      hasBgOrange: finalClassName.includes('bg-orange-500/15'),
      hasBorderOrange: finalClassName.includes('border-orange-500'),
    },
    cnResult: isSelected ? "ring-4 ring-orange-500 ring-offset-2 ring-offset-background bg-orange-500/15 border-orange-500" : "NO_SELECTION_CLASSES",
    timestamp: Date.now()
  });

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={finalClassName}
      data-selected={isSelected}
      data-image-id={((image.shotImageEntryId as any) || (image.id as any) || '').toString().substring(0, 8)}
      {...(!isDragDisabled ? attributes : {})}
      {...(!isDragDisabled ? listeners : {})}
      onClick={(e) => {
        console.log('[SelectionDebug:SortableImageItem] onClick triggered', {
          imageId: ((image.shotImageEntryId as any) || (image.id as any) || '').toString().substring(0, 8),
          isSelected,
          hasOnClickHandler: !!onClick,
          eventTarget: e.target?.tagName || 'unknown',
          actualDOMClasses: (e.currentTarget as HTMLElement)?.className || 'NO_CLASSES',
          timestamp: Date.now()
        });
        onClick?.(e);
      }}
      onPointerDown={(e) => {
        // Add DOM inspection after render
        setTimeout(() => {
          const element = e.currentTarget as HTMLElement;
          console.log('[SelectionDebug:SortableImageItem] DOM INSPECTION POST-RENDER', {
            imageId: ((image.shotImageEntryId as any) || (image.id as any) || '').toString().substring(0, 8),
            isSelected,
            actualDOMClasses: element.className,
            computedStyles: {
              borderColor: window.getComputedStyle(element).borderColor,
              backgroundColor: window.getComputedStyle(element).backgroundColor,
              boxShadow: window.getComputedStyle(element).boxShadow,
              outline: window.getComputedStyle(element).outline,
            },
            dataAttributes: {
              selected: element.getAttribute('data-selected'),
              imageId: element.getAttribute('data-image-id'),
            }
          });
        }, 100);
        onPointerDown?.(e);
      }}
      onPointerDown={onPointerDown}
      onDoubleClick={isMobile ? undefined : onDoubleClick}
    >
      {/* Simple image display like ShotsPane - no complex loading states */}
      <img
        src={shouldLoad ? displayImageUrl : '/placeholder.svg'}
        alt={`Generated image ${(position ?? 0) + 1}`}
        className="w-full h-full object-cover transition-opacity duration-200"
        onTouchStart={isMobile ? handleTouchStart : undefined}
        onTouchEnd={isMobile ? handleTouchEnd : undefined}
        loading="lazy"
        draggable={false}
        onError={(e) => {
          // Fallback to original URL if display URL fails
          const target = e.target as HTMLImageElement;
          if (target.src !== (image.thumbUrl || image.imageUrl)) {
            target.src = image.thumbUrl || image.imageUrl;
          }
        }}
      />
      {(!isMobile || !isDragDisabled) && (
        <>
          {onDuplicate && position !== undefined && (
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-1 right-9 h-7 w-7 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
              onClick={handleDuplicateClick}
              disabled={duplicatingImageId === image.shotImageEntryId}
              title="Duplicate image"
            >
              {duplicatingImageId === image.shotImageEntryId ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-b-2 border-white"></div>
              ) : duplicateSuccessImageId === image.shotImageEntryId ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-1 right-1 h-7 w-7 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
            onClick={handleDeleteClick}
            title="Remove image from shot"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
      <AlertDialog open={isConfirmDeleteDialogOpen} onOpenChange={setIsConfirmDeleteDialogOpen}>
        <AlertDialogOverlay
          onPointerDown={(e) => {
            // Prevent underlying sortable interactions when clicking overlay
            e.stopPropagation();
          }}
        />
        <AlertDialogContent
          onPointerDown={(e) => {
            // Prevent underlying sortable item click / drag sensors when the dialog is open
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Image</AlertDialogTitle>
            <AlertDialogDescription>
              Do you want to permanently remove this image from the shot? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center space-x-2 my-4">
            <Checkbox
              id="skip-confirm"
              checked={skipConfirmationNextTimeVisual}
              onCheckedChange={(checked) => {
                const booleanValue = Boolean(checked);
                setSkipConfirmationNextTimeVisual(booleanValue);
                currentDialogSkipChoiceRef.current = booleanValue;
              }}
            />
            <Label htmlFor="skip-confirm" className="text-sm font-light leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Delete without confirmation in the future
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>Confirm Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}; 