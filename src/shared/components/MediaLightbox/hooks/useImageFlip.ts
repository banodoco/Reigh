import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { GenerationRow } from '@/types/shots';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';

export interface UseImageFlipProps {
  media: GenerationRow;
  onImageSaved?: (newImageUrl: string, createNew?: boolean) => Promise<void>;
  onClose: () => void;
}

export interface UseImageFlipReturn {
  isFlippedHorizontally: boolean;
  hasChanges: boolean;
  isSaving: boolean;
  imageDimensions: { width: number; height: number } | null;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  setImageDimensions: (dimensions: { width: number; height: number } | null) => void;
  handleFlip: () => void;
  handleSave: (displayUrl: string) => Promise<void>;
}

/**
 * Hook for managing image flipping functionality
 * Handles flip state, canvas processing, and saving
 */
export const useImageFlip = ({
  media,
  onImageSaved,
  onClose,
}: UseImageFlipProps): UseImageFlipReturn => {
  const [isFlippedHorizontally, setIsFlippedHorizontally] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Log what callback we received
  useEffect(() => {
    console.log('[ImageFlipDebug] MediaLightbox mounted/updated', {
      mediaId: media.id,
      hasOnImageSaved: !!onImageSaved,
      onImageSavedType: typeof onImageSaved,
      onImageSavedName: onImageSaved?.name,
      timestamp: Date.now()
    });
  }, [media.id, onImageSaved]);

  // Log flip state changes
  useEffect(() => {
    console.log('[ImageFlipDebug] Flip state changed', {
      mediaId: media.id,
      isFlippedHorizontally,
      hasChanges,
      isSaving,
      timestamp: Date.now()
    });
  }, [isFlippedHorizontally, hasChanges, isSaving, media.id]);

  const handleFlip = () => {
    const newFlipState = !isFlippedHorizontally;
    console.log('[ImageFlipDebug] handleFlip called', {
      mediaId: media.id,
      oldState: isFlippedHorizontally,
      newState: newFlipState,
      hasChanges: hasChanges,
      timestamp: Date.now()
    });
    setIsFlippedHorizontally(newFlipState);
    setHasChanges(true);
  };

  const handleSave = async (displayUrl: string) => {
    // Capture the current image URL at save time to prevent it from changing during the async operation
    const sourceImageUrl = displayUrl;
    const flipStateAtSave = isFlippedHorizontally;
    
    console.log('[ImageFlipDebug] handleSave called', {
      mediaId: media.id,
      hasChanges,
      hasCanvasRef: !!canvasRef.current,
      isSaving,
      isFlippedHorizontally: flipStateAtSave,
      sourceImageUrl,
      mediaLocation: media.location,
      mediaImageUrl: media.imageUrl,
      timestamp: Date.now()
    });

    if (!hasChanges || !canvasRef.current || isSaving) {
      console.log('[ImageFlipDebug] handleSave early return', {
        reason: !hasChanges ? 'no changes' : !canvasRef.current ? 'no canvas' : 'already saving',
        hasChanges,
        hasCanvasRef: !!canvasRef.current,
        isSaving
      });
      return;
    }

    setIsSaving(true);

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      console.log('[ImageFlipDebug] Canvas context obtained', {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height
      });

      // Create a promise that resolves with the blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
          console.log('[ImageFlipDebug] Image loaded for canvas', {
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            flipStateAtSave,
            currentFlipState: isFlippedHorizontally
          });

          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          ctx.save();
          if (flipStateAtSave) {
            console.log('[ImageFlipDebug] Applying flip transform to canvas', {
              canvasWidth: canvas.width,
              flipStateAtSave
            });
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(img, 0, 0);
          ctx.restore();
          
          canvas.toBlob(blob => {
            if (blob) {
              console.log('[ImageFlipDebug] Canvas to blob conversion successful', {
                blobSize: blob.size,
                blobType: blob.type
              });
              resolve(blob);
            } else {
              console.error('[ImageFlipDebug] Canvas to blob conversion failed');
              reject(new Error('Canvas to Blob conversion failed'));
            }
          }, 'image/png');
        };

        img.onerror = (err) => {
          console.error('[ImageFlipDebug] Image load error', err);
          reject(err);
        };

        console.log('[ImageFlipDebug] Loading image for canvas', { 
          src: sourceImageUrl,
          willApplyFlip: flipStateAtSave
        });
        img.src = sourceImageUrl;
      });

      if (onImageSaved) {
        // Convert Blob to File and upload so we return a persistent URL
        const fileName = `flipped_${media.id || 'image'}_${Date.now()}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });

        console.log('[ImageFlipDebug] Starting upload to storage', {
          fileName,
          fileSize: file.size,
          timestamp: Date.now()
        });

        // Upload to storage and get a public URL
        const uploadedUrl = await uploadImageToStorage(file);

        console.log('[ImageFlipDebug] Upload completed', {
          uploadedUrl,
          timestamp: Date.now()
        });

        // Don't reset flip state yet - keep showing flipped version during save
        // This will be reset when the lightbox closes

        console.log('[ImageFlipDebug] Calling onImageSaved callback', {
          uploadedUrl,
          createNew: false,
          hasCallback: !!onImageSaved,
          callbackType: typeof onImageSaved,
          callbackName: onImageSaved?.name,
          timestamp: Date.now()
        });

        // Await parent handler with the persistent URL - always replace original
        const result = await onImageSaved(uploadedUrl, false);
        
        console.log('[ImageFlipDebug] onImageSaved callback returned', {
          result,
          resultType: typeof result,
          timestamp: Date.now()
        });

        console.log('[ImageFlipDebug] onImageSaved callback completed, closing lightbox', {
          timestamp: Date.now()
        });

        // Close the lightbox on successful save
        onClose();
      } else {
        console.warn('[ImageFlipDebug] No onImageSaved callback provided');
      }
    } catch (error) {
      console.error('[ImageFlipDebug] Error during save process:', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        timestamp: Date.now()
      });
      toast.error('Failed to save image.');
    } finally {
      // This will now run after onImageSaved has completed
      setIsSaving(false);
    }
  };

  return {
    isFlippedHorizontally,
    hasChanges,
    isSaving,
    imageDimensions,
    canvasRef,
    setImageDimensions,
    handleFlip,
    handleSave,
  };
};

