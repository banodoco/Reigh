import React, { useState, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GenerationRow } from '@/types/shots';
import { Button } from '@/shared/components/ui/button';
import { Trash2 } from 'lucide-react';
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

interface SortableImageItemProps {
  image: GenerationRow;
  onDelete: (shotImageEntryId: string) => void;
  onDoubleClick: () => void;
  onClick: (event: React.MouseEvent) => void;
  isSelected: boolean;
}

const SKIP_CONFIRMATION_KEY = 'skipImageDeletionConfirmation';

export const SortableImageItem: React.FC<SortableImageItemProps> = ({
  image,
  onDelete,
  onDoubleClick,
  onClick,
  isSelected,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.shotImageEntryId,
  });
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] = useState(false);
  const [skipConfirmationNextTimeVisual, setSkipConfirmationNextTimeVisual] = useState(false);
  const currentDialogSkipChoiceRef = useRef(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: 'none', // Recommended for Sortable with pointer/touch sensors
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const shouldSkipConfirmation = sessionStorage.getItem(SKIP_CONFIRMATION_KEY) === 'true';
    if (shouldSkipConfirmation) {
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
      sessionStorage.setItem(SKIP_CONFIRMATION_KEY, 'true');
    }
    setIsConfirmDeleteDialogOpen(false);
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
      {...attributes}
      {...listeners}
      className={cn(
        'relative group bg-muted/50 rounded border p-1 flex flex-col items-center justify-center aspect-square overflow-hidden shadow-sm cursor-grab active:cursor-grabbing',
        { 'ring-2 ring-offset-2 ring-blue-500 border-blue-500': isSelected },
      )}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
    >
      <img
        src={displayUrl}
        alt={`Image ${image.id}`}
        className="max-w-full max-h-full object-contain rounded-sm"
        key={imageUrl} // Force re-render when imageUrl changes
      />
      <Button
        variant="destructive"
        size="icon"
        className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        onClick={handleDeleteClick}
        title="Remove image from shot"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
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