import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Download, FlipHorizontal, Save } from 'lucide-react'; // Import FlipHorizontal and Save icons
import { Button } from "./button"; // Updated
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "./tooltip"; // Updated
import { useToast } from "@/shared/hooks/use-toast"; // Updated
import { usePanes } from "@/shared/contexts/PanesContext"; // Added
import { uploadImageToStorage } from '@/shared/lib/imageUploader';


interface FullscreenImageModalProps {
  imageUrl: string | null;
  imageAlt?: string; // Optional alt text
  imageId?: string; // Optional image ID for download filename
  onClose: () => void;
  onImageSaved?: (newImageUrl: string) => void; // Callback when image is saved with changes
}

const FullscreenImageModal: React.FC<FullscreenImageModalProps> = ({ imageUrl, imageAlt, imageId, onClose, onImageSaved }) => {
  const [isDownloading, setIsDownloading] = useState(false); // State for download button loading
  const [isSaving, setIsSaving] = useState(false); // State for save button loading
  const [isFlippedHorizontally, setIsFlippedHorizontally] = useState(false); // State for horizontal flip
  const [hasChanges, setHasChanges] = useState(false); // State to track if there are unsaved changes
  const imgRef = useRef<HTMLImageElement>(null); // Reference to the image element
  const { toast } = useToast(); // Initialize useToast
  
  // Get pane state for positioning adjustments
  const { 
    isTasksPaneLocked, 
    tasksPaneWidth, 
    isShotsPaneLocked, 
    shotsPaneWidth, 
    isGenerationsPaneLocked, 
    generationsPaneHeight 
  } = usePanes();

  // Debug: Check if callback is provided
  console.log(`[FullscreenImageModal] Component initialized with:`, {
    imageId,
    imageUrl,
    hasOnImageSavedCallback: !!onImageSaved,
    onImageSavedType: typeof onImageSaved
  });

  if (!imageUrl) return null;

  const downloadFileName = `artful_pane_craft_fullscreen_${imageId || 'image'}_${Date.now()}.png`;

  // Function to create a canvas with the flipped image
  const createFlippedCanvas = useCallback(async (): Promise<HTMLCanvasElement | Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = async () => {
        try {
          // Check if OffscreenCanvas is available for better performance
          if (typeof OffscreenCanvas !== 'undefined') {
            const offscreen = new OffscreenCanvas(img.width, img.height);
            const ctx = offscreen.getContext('2d');
            if (!ctx) {
              throw new Error('Could not get offscreen canvas context');
            }

            // Apply horizontal flip if needed
            if (isFlippedHorizontally) {
              ctx.scale(-1, 1);
              ctx.drawImage(img, -img.width, 0);
            } else {
              ctx.drawImage(img, 0, 0);
            }

            // Convert to blob directly from OffscreenCanvas
            const blob = await offscreen.convertToBlob({ type: 'image/png', quality: 0.95 });
            resolve(blob);
          } else {
            // Fallback to regular canvas
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Could not get canvas context'));
              return;
            }

            canvas.width = img.width;
            canvas.height = img.height;

            // Apply horizontal flip if needed
            if (isFlippedHorizontally) {
              ctx.scale(-1, 1);
              ctx.drawImage(img, -img.width, 0);
            } else {
              ctx.drawImage(img, 0, 0);
            }

            resolve(canvas);
          }
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageUrl;
    });
  }, [imageUrl, isFlippedHorizontally]);

  const handleFlipHorizontal = () => {
    setIsFlippedHorizontally(!isFlippedHorizontally);
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!hasChanges) return;
    
    console.log(`[FlipSave] Starting save process for image:`, { imageId, imageUrl, isFlippedHorizontally });
    
    setIsSaving(true);
    try {
      console.log(`[FlipSave] Creating flipped canvas...`);
      const result = await createFlippedCanvas();
      
      let blob: Blob;
      if (result instanceof Blob) {
        console.log(`[FlipSave] OffscreenCanvas blob created:`, { size: result.size, type: result.type });
        blob = result;
      } else {
        console.log(`[FlipSave] Canvas created:`, { width: result.width, height: result.height });
        // Convert canvas to blob
        blob = await new Promise<Blob>((resolve, reject) => {
          result.toBlob((b) => {
            if (!b) {
              console.error(`[FlipSave] ERROR: Failed to create image blob from canvas`);
              reject(new Error('Failed to create image blob'));
            } else {
              resolve(b);
            }
          }, 'image/png', 0.95);
        });
      }

        console.log(`[FlipSave] Blob created:`, { size: blob.size, type: blob.type });

        const fileName = `flipped_${imageId || 'image'}_${Date.now()}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });

        console.log(`[FlipSave] Uploading file to Supabase:`, { fileName, fileSize: file.size, fileType: file.type });

        try {
          // Upload directly to Supabase Storage and get the public URL
          const newImageUrl = await uploadImageToStorage(file);
          console.log(`[FlipSave] New image URL:`, newImageUrl);

          console.log(`[FlipSave] CRITICAL CHECK - About to call callback:`, {
            hasNewImageUrl: !!newImageUrl,
            hasOnImageSavedCallback: !!onImageSaved,
            newImageUrl: newImageUrl,
            callbackFunction: onImageSaved?.toString()
          });

          if (newImageUrl && onImageSaved) {
            console.log(`[FlipSave] Calling onImageSaved callback with:`, { newImageUrl });
            onImageSaved(newImageUrl);
            console.log(`[FlipSave] onImageSaved callback called successfully`);
          } else {
            console.warn(`[FlipSave] WARNING: No newImageUrl or onImageSaved callback`, { newImageUrl, hasCallback: !!onImageSaved });
          }

          // RESET FLIP STATE after successful save to avoid double-flip on updated image
          setIsFlippedHorizontally(false);
          setHasChanges(false);
          console.log(`[FlipSave] Save process completed successfully`);
          toast({ 
            title: "Image Saved", 
            description: "Flipped image has been saved successfully",
          });
        } catch (error) {
          console.error('[FlipSave] ERROR during upload to Supabase:', error);
          toast({ 
            title: "Save Failed", 
            description: "Could not save the flipped image",
            variant: "destructive"
          });
        }
    } catch (error) {
      console.error('[FlipSave] ERROR creating flipped image:', error);
      toast({ 
        title: "Save Failed", 
        description: "Could not process the image",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadClick = async () => {
    if (!imageUrl) return;
    setIsDownloading(true);

    try {
      let downloadUrl = imageUrl;
      let downloadName = downloadFileName;

      // If the image has been flipped, download the flipped version
      if (isFlippedHorizontally) {
        const result = await createFlippedCanvas();
        let blob: Blob;
        
        if (result instanceof Blob) {
          blob = result;
        } else {
          blob = await new Promise<Blob>((resolve, reject) => {
            result.toBlob((b) => {
              if (!b) {
                reject(new Error('Failed to create blob'));
              } else {
                resolve(b);
              }
            }, 'image/png', 0.95);
          });
        }
        
        downloadUrl = URL.createObjectURL(blob);
        downloadName = `flipped_${downloadFileName}`;
        
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = downloadUrl;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(downloadUrl);
        document.body.removeChild(a);
        return;
      }

      // Use XMLHttpRequest for original image download
      const xhr = new XMLHttpRequest();
      xhr.open('GET', imageUrl, true);
      xhr.responseType = 'blob';

      xhr.onload = function() {
        if (this.status === 200) {
          const blob = new Blob([this.response], { type: 'image/png' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = downloadName;
          document.body.appendChild(a);
          a.click();
          URL.revokeObjectURL(url);
          document.body.removeChild(a);
        } else {
          throw new Error(`Failed to fetch image: ${this.status} ${this.statusText}`);
        }
      };

      xhr.onerror = function() {
        throw new Error('Network request failed');
      };

      xhr.send();
    } catch (error) {
      console.error("Error downloading image:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast({ 
        title: "Download Failed", 
        description: `Could not download ${downloadFileName}. ${errorMessage}`,
        variant: "destructive"
      });
    } finally {
      setIsDownloading(false);
    }
  };

  // Calculate positioning adjustments for locked panes
  const modalStyle = {
    left: isShotsPaneLocked ? `${shotsPaneWidth}px` : '0px',
    right: isTasksPaneLocked ? `${tasksPaneWidth}px` : '0px',
    bottom: isGenerationsPaneLocked ? `${generationsPaneHeight}px` : '0px',
    top: '0px',
    transition: 'left 300ms ease-in-out, right 300ms ease-in-out, bottom 300ms ease-in-out',
  };

  // Reset flip state when a different image URL is provided (e.g., after saving)
  useEffect(() => {
    // Whenever the displayed image source changes, clear flip & change flags
    setIsFlippedHorizontally(false);
    setHasChanges(false);
  }, [imageUrl]);

  return (
    <TooltipProvider>
      <div
        className="fixed z-[9999] flex items-center justify-center bg-black bg-opacity-75 transition-opacity duration-300 ease-in-out"
        style={modalStyle}
        onClick={onClose} // Close on backdrop click
      >
        <div
          className="relative p-4 bg-white rounded-lg shadow-xl max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-fadeIn"
          onClick={(e) => e.stopPropagation()} // Prevent modal close when clicking on the image/modal content itself
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt={imageAlt || "Fullscreen view"}
            className={`w-auto h-auto max-w-full max-h-[calc(85vh-40px)] object-contain rounded mb-2 transition-transform duration-200 ${
              isFlippedHorizontally ? 'scale-x-[-1]' : ''
            }`}
          />
          {/* Buttons container */}
          <div className="flex justify-between items-center mt-auto pt-2">
            {/* Left side buttons */}
            <div className="flex items-center space-x-2">
              {/* Download Button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-black/10 hover:bg-black/20 text-black"
                    onClick={handleDownloadClick}
                    disabled={isDownloading}
                  >
                    {isDownloading ? (
                      <>
                        <div className="h-4 w-4 mr-2 animate-spin rounded-full border-b-2 border-current"></div>
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top"><p>Download Image</p></TooltipContent>
              </Tooltip>

              {/* Flip Horizontal Button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`bg-black/10 hover:bg-black/20 text-black ${
                      isFlippedHorizontally ? 'bg-blue-100 border-blue-300' : ''
                    }`}
                    onClick={handleFlipHorizontal}
                  >
                    <FlipHorizontal className="h-4 w-4 mr-2" />
                    Flip
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top"><p>Flip Horizontally</p></TooltipContent>
              </Tooltip>

              {/* Save Button (only show when there are changes) */}
              {hasChanges && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="default"
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={handleSave}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <>
                          <div className="h-4 w-4 mr-2 animate-spin rounded-full border-b-2 border-current"></div>
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Save
                        </>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top"><p>Save Changes</p></TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* Close Button (Bottom Right) */}
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="bg-black/10 hover:bg-black/20 text-black"
              aria-label="Close image view"
            >
              <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Close
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default FullscreenImageModal;

// Basic fadeIn animation for the modal
// This should ideally be in your global CSS or a Tailwind plugin
const style = document.createElement('style');
style.innerHTML = `
  @keyframes fadeIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
  .animate-fadeIn {
    animation: fadeIn 0.3s ease-out forwards;
  }
`;
document.head.appendChild(style); 