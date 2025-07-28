import React, { useState, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GenerationRow } from '@/types/shots';
import { Button } from '@/shared/components/ui/button';
import { Trash2, Copy } from 'lucide-react';
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
  onDuplicate?: (generationId: string, position: number) => void;
  onDoubleClick: () => void;
  onClick: (event: React.MouseEvent) => void;
  onPointerDown?: (event: React.PointerEvent) => void;
  isSelected: boolean;
  isDragDisabled?: boolean;
  position?: number;
  skipConfirmation: boolean;
  onSkipConfirmationSave: () => void;
}

export const SortableImageItem: React.FC<SortableImageItemProps> = ({
  image,
  onDelete,
  onDuplicate,
  onDoubleClick,
  onClick,
  onPointerDown,
  isSelected,
  isDragDisabled = false,
  position,
  skipConfirmation,
  onSkipConfirmationSave,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.shotImageEntryId,
    disabled: isDragDisabled,
  });
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] = useState(false);
  const [skipConfirmationNextTimeVisual, setSkipConfirmationNextTimeVisual] = useState(skipConfirmation);
  const currentDialogSkipChoiceRef = useRef(skipConfirmation);
  const isMobile = useIsMobile();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: isDragDisabled ? 'auto' : 'none',
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
      onDuplicate(image.id, position + 1);
    }
  };

  // Add cache-busting parameter to ensure updated images are displayed
  const imageUrl = image.thumbUrl || image.imageUrl;
  // Use forceRefresh for flipped images to ensure immediate display update
  const isFlippedImage = imageUrl && imageUrl.includes('flipped_');
  const displayUrl = getDisplayUrl(imageUrl, isFlippedImage);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative border rounded-lg overflow-hidden cursor-pointer bg-card hover:ring-2 hover:ring-primary/50 transition-colors",
        isSelected && "ring-2 ring-blue-500 bg-blue-500/20",
        isDragDisabled && "cursor-default"
      )}
      {...(!isDragDisabled ? attributes : {})}
      {...(!isDragDisabled ? listeners : {})}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      <img
        src={displayUrl}
        alt="Shot image"
        loading="lazy"
        className="w-full h-full object-cover"
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
              title="Duplicate image"
            >
              <Copy className="h-3.5 w-3.5" />
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
            <Label htmlFor="skip-confirm" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
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