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
} from '@/shared/components/ui/alert-dialog';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Label } from '@/shared/components/ui/label';

interface SortableImageItemProps {
  image: GenerationRow;
  onDelete: (generationId: string) => void;
  onDoubleClick: () => void;
}

const SKIP_CONFIRMATION_KEY = 'skipImageDeletionConfirmation';

const baseUrl = import.meta.env.VITE_API_TARGET_URL || '';

const getDisplayUrl = (relativePath: string | undefined): string => {
  if (!relativePath) return '/placeholder.svg'; // Default placeholder if no path
  // If it's already an absolute URL, a blob URL, or a root-relative path (like /placeholder.svg itself), use as is.
  if (relativePath.startsWith('http') || relativePath.startsWith('blob:') || relativePath.startsWith('/')) {
    return relativePath;
  }
  // For other relative paths (like 'files/image.png'), prepend the base URL.
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  // Ensure the relative path doesn't start with a slash if we are prepending base
  const cleanRelative = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
  return `${cleanBase}/${cleanRelative}`;
};

export const SortableImageItem: React.FC<SortableImageItemProps> = ({ image, onDelete, onDoubleClick }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id });
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
      onDelete(image.id);
    } else {
      setSkipConfirmationNextTimeVisual(false);
      currentDialogSkipChoiceRef.current = false;
      setIsConfirmDeleteDialogOpen(true);
    }
  };

  const handleConfirmDelete = () => {
    onDelete(image.id);
    if (currentDialogSkipChoiceRef.current) {
      sessionStorage.setItem(SKIP_CONFIRMATION_KEY, 'true');
    }
    setIsConfirmDeleteDialogOpen(false);
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      className="relative group bg-muted/50 rounded border p-1 flex flex-col items-center justify-center aspect-square overflow-hidden shadow-sm"
      onDoubleClick={onDoubleClick}
    >
      <img 
        src={getDisplayUrl(image.thumbUrl || image.imageUrl)} 
        alt={`Image ${image.id}`} 
        className="max-w-full max-h-full object-contain rounded-sm"
      />
      <div 
        {...listeners} 
        className="absolute inset-0 bg-black/30 group-hover:bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-grab active:cursor-grabbing"
      >
        {/* Optional: Add a drag handle icon here if desired */}
      </div>
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
        <AlertDialogContent>
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