import React, { useState, useCallback } from 'react';
import { Image, Upload } from 'lucide-react';
import { ImageUploadActions } from '@/shared/components/ImageUploadActions';
import { toast } from 'sonner';

interface EmptyStateProps {
  onImageUpload?: (files: File[]) => Promise<void>;
  isUploadingImage?: boolean;
  /** Optional shot ID to pre-select in the generation modal */
  shotId?: string;
  /** Handler for internal generation drops */
  onGenerationDrop?: (generationId: string, imageUrl: string, thumbUrl?: string) => Promise<void>;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ 
  onImageUpload, 
  isUploadingImage, 
  shotId,
  onGenerationDrop 
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragType, setDragType] = useState<'file' | 'generation' | null>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.types.includes('application/x-generation') && onGenerationDrop) {
      setIsDragOver(true);
      setDragType('generation');
    } else if (e.dataTransfer.types.includes('Files') && onImageUpload) {
      setIsDragOver(true);
      setDragType('file');
    }
  }, [onImageUpload, onGenerationDrop]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.types.includes('application/x-generation') && onGenerationDrop) {
      setIsDragOver(true);
      setDragType('generation');
      e.dataTransfer.dropEffect = 'copy';
    } else if (e.dataTransfer.types.includes('Files') && onImageUpload) {
      setIsDragOver(true);
      setDragType('file');
      e.dataTransfer.dropEffect = 'copy';
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
  }, [onImageUpload, onGenerationDrop]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsDragOver(false);
      setDragType(null);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setDragType(null);

    // Handle internal generation drop
    if (e.dataTransfer.types.includes('application/x-generation') && onGenerationDrop) {
      try {
        const dataString = e.dataTransfer.getData('application/x-generation');
        if (dataString) {
          const data = JSON.parse(dataString);
          if (data.generationId && data.imageUrl) {
            await onGenerationDrop(data.generationId, data.imageUrl, data.thumbUrl);
            return;
          }
        }
      } catch (error) {
        console.error('Error handling generation drop:', error);
        toast.error(`Failed to add image: ${(error as Error).message}`);
      }
      return;
    }

    // Handle file drop
    if (!onImageUpload) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const validImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const validFiles = files.filter(file => {
      if (validImageTypes.includes(file.type)) return true;
      toast.error(`Invalid file type for ${file.name}. Only JPEG, PNG, and WebP are supported.`);
      return false;
    });

    if (validFiles.length === 0) return;

    try {
      await onImageUpload(validFiles);
    } catch (error) {
      console.error('Error handling file drop:', error);
      toast.error(`Failed to add images: ${(error as Error).message}`);
    }
  }, [onImageUpload, onGenerationDrop]);

  const hasDropHandler = onImageUpload || onGenerationDrop;

  return (
    <div 
      className={`w-full h-full min-h-[200px] flex items-center justify-center transition-all duration-200 ${
        isDragOver 
          ? 'bg-primary/10 border-2 border-dashed border-primary rounded-lg' 
          : ''
      }`}
      onDragEnter={hasDropHandler ? handleDragEnter : undefined}
      onDragOver={hasDropHandler ? handleDragOver : undefined}
      onDragLeave={hasDropHandler ? handleDragLeave : undefined}
      onDrop={hasDropHandler ? handleDrop : undefined}
    >
      <div className={`p-4 rounded-lg transition-all duration-200 ${
        isDragOver ? 'bg-primary/5 scale-105' : 'bg-muted/20 border'
      }`}>
        <div className="flex flex-col items-center gap-3 text-center">
          {isDragOver ? (
            <>
              <Upload className="h-10 w-10 text-primary animate-bounce" />
              <div>
                <h3 className="font-medium text-primary">Drop {dragType === 'generation' ? 'image' : 'files'} here</h3>
                <p className="text-xs text-muted-foreground mt-1">Release to add to shot</p>
              </div>
            </>
          ) : (
            <>
              <Image className="h-8 w-8 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Add images to start building your animation
              </p>
              
              {onImageUpload && (
                <ImageUploadActions
                  onImageUpload={onImageUpload}
                  isUploadingImage={isUploadingImage}
                  shotId={shotId}
                  inputId="empty-shot-image-upload"
                  buttonSize="sm"
                />
              )}
              
              {hasDropHandler && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground/60 mt-2">
                  <Upload className="h-3 w-3" />
                  <span>or drag and drop</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

