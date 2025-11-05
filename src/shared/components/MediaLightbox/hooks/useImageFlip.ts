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
    });
  }, [media.id, onImageSaved]);

  // Log flip state changes
  useEffect(() => {
    });
  }, [isFlippedHorizontally, hasChanges, isSaving, media.id]);

  const handleFlip = () => {
    const newFlipState = !isFlippedHorizontally;
    });
    setIsFlippedHorizontally(newFlipState);
    setHasChanges(true);
  };

  const handleSave = async (displayUrl: string) => {
    // Capture the current image URL at save time to prevent it from changing during the async operation
    const sourceImageUrl = displayUrl;
    const flipStateAtSave = isFlippedHorizontally;
    
    });

    if (!hasChanges || !canvasRef.current || isSaving) {
      return;
    }

    setIsSaving(true);

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      // Create a promise that resolves with the blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          ctx.save();
          if (flipStateAtSave) {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(img, 0, 0);
          ctx.restore();
          
          canvas.toBlob(blob => {
            if (blob) {
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

        img.src = sourceImageUrl;
      });

      if (onImageSaved) {
        // Convert Blob to File and upload so we return a persistent URL
        const fileName = `flipped_${media.id || 'image'}_${Date.now()}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });

        });

        // Upload to storage and get a public URL
        const uploadedUrl = await uploadImageToStorage(file);

        });

        // Don't reset flip state yet - keep showing flipped version during save
        // This will be reset when the lightbox closes

        });

        // Await parent handler with the persistent URL - always replace original
        const result = await onImageSaved(uploadedUrl, false);
        
        });

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

