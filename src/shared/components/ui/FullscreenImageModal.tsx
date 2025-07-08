import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Download, FlipHorizontal, Save, ChevronLeft, ChevronRight, X, PlusCircle, Check, Trash2, Info, Settings } from 'lucide-react'; // Import navigation icons
import { Button } from "./button"; // Updated
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { Popover, PopoverTrigger, PopoverContent } from "./popover";
import { usePanes } from '@/shared/contexts/PanesContext';
import { useToast } from '@/shared/hooks/use-toast';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { getDisplayUrl } from '@/shared/lib/utils';
import { Shot } from '@/types/shots';
import { formatDistanceToNow, isValid } from "date-fns";

// Import types from ImageGallery
import { DisplayableMetadata } from '@/shared/components/ImageGallery';

interface FullscreenImageModalProps {
  imageUrl: string | null;
  imageAlt?: string; // Optional alt text
  imageId?: string; // Optional image ID for download filename
  onClose: () => void;
  onImageSaved?: (newImageUrl: string) => void; // Callback when image is saved with changes
  onNext?: () => void; // Optional navigation to next image
  onPrevious?: () => void; // Optional navigation to previous image
  hasNext?: boolean; // Whether there is a next image
  hasPrevious?: boolean; // Whether there is a previous image
  // Gallery overlay props
  currentImage?: {
    id: string;
    url: string;
    metadata?: DisplayableMetadata;
    createdAt?: string;
  };
  allShots?: Shot[];
  selectedShotId?: string;
  onShotChange?: (shotId: string) => void;
  onAddToShot?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onDelete?: (id: string) => void;
  isDeleting?: string | null;
  onApplySettings?: (metadata: DisplayableMetadata) => void;
  showTickForImageId?: string | null;
  onShowTick?: (imageId: string) => void; // Callback to trigger tick animation
}

const FullscreenImageModal: React.FC<FullscreenImageModalProps> = ({ 
  imageUrl, 
  imageAlt, 
  imageId, 
  onClose, 
  onImageSaved, 
  onNext, 
  onPrevious, 
  hasNext = false, 
  hasPrevious = false,
  currentImage,
  allShots = [],
  selectedShotId,
  onShotChange,
  onAddToShot,
  onDelete,
  isDeleting,
  onApplySettings,
  showTickForImageId,
  onShowTick
}) => {
  const [isDownloading, setIsDownloading] = useState(false); // State for download button loading
  const [isSaving, setIsSaving] = useState(false); // State for save button loading
  const [isFlippedHorizontally, setIsFlippedHorizontally] = useState(false); // State for horizontal flip
  const [hasChanges, setHasChanges] = useState(false); // State to track if there are unsaved changes
  const imgRef = useRef<HTMLImageElement>(null); // Reference to the image element
  const { toast } = useToast();

  // Add keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && onNext && hasNext) onNext();
      if (e.key === 'ArrowLeft' && onPrevious && hasPrevious) onPrevious();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNext, onPrevious, hasNext, hasPrevious]);

  // Get pane state for positioning adjustments
  const { 
    isTasksPaneLocked, 
    tasksPaneWidth, 
    isShotsPaneLocked, 
    shotsPaneWidth, 
    isGenerationsPaneLocked, 
    generationsPaneHeight 
  } = usePanes();

  // Helper functions for overlay buttons
  const simplifiedShotOptions = allShots.map(s => ({ id: s.id, name: s.name }));
  const currentTargetShotName = selectedShotId ? allShots.find(s => s.id === selectedShotId)?.name : '';
  const isCurrentDeleting = isDeleting === currentImage?.id;

  // Format metadata for display in info popover
  const formatMetadataForDisplay = (metadata: DisplayableMetadata): string => {
    let displayText = "";
    if (metadata.prompt) displayText += `Prompt: ${metadata.prompt}\n`;
    if (metadata.seed) displayText += `Seed: ${metadata.seed}\n`;
    if (metadata.imagesPerPrompt) displayText += `Images/Prompt: ${metadata.imagesPerPrompt}\n`;
    if (metadata.width && metadata.height) displayText += `Dimensions: ${metadata.width}x${metadata.height}\n`;
    if (metadata.num_inference_steps) displayText += `Steps: ${metadata.num_inference_steps}\n`;
    if (metadata.guidance_scale) displayText += `Guidance: ${metadata.guidance_scale}\n`;
    if (metadata.scheduler) displayText += `Scheduler: ${metadata.scheduler}\n`;
    if (metadata.tool_type) displayText += `Tool: ${metadata.tool_type}\n`;
    
    if (metadata.activeLoras && metadata.activeLoras.length > 0) {
      displayText += "Active LoRAs:\n";
      metadata.activeLoras.forEach(lora => {
        const displayName = lora.name || lora.id;
        displayText += `  - ${displayName} (Strength: ${lora.strength}%)\n`;
      });
    }
    if (metadata.depthStrength !== undefined) displayText += `Depth Strength: ${(metadata.depthStrength * 100).toFixed(0)}%\n`;
    if (metadata.softEdgeStrength !== undefined) displayText += `Soft Edge Strength: ${(metadata.softEdgeStrength * 100).toFixed(0)}%\n`;
    if (metadata.userProvidedImageUrl) {
      const urlParts = metadata.userProvidedImageUrl.split('/');
      const imageName = urlParts[urlParts.length -1] || metadata.userProvidedImageUrl;
      displayText += `User Image: ${imageName}\n`;
    }
    
    return displayText.trim() || "No metadata available.";
  };

  const metadataForDisplay = currentImage?.metadata ? formatMetadataForDisplay(currentImage.metadata) : "No metadata available.";

  // InfoPopover component for metadata display
  const InfoPopover: React.FC<{ metadata: DisplayableMetadata | undefined; metadataForDisplay: string }> = ({ metadata, metadataForDisplay }) => {
    const [isOpen, setIsOpen] = useState(false);
    const closePopover = () => setIsOpen(false);

    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            className="h-7 w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white"
            onClick={() => setIsOpen((prev) => !prev)}
            onPointerLeave={(e) => {
              setTimeout(() => {
                if (!document.querySelector(':hover')?.closest('[data-info-popover]')) {
                  closePopover();
                }
              }, 50);
            }}
          >
            <Info className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          className="max-w-md text-xs p-3 leading-relaxed shadow-lg bg-background border max-h-80 overflow-y-auto"
          onPointerLeave={closePopover}
          data-info-popover="true"
        >
          {metadata?.userProvidedImageUrl && (
            <img
              src={metadata.userProvidedImageUrl}
              alt="User provided image preview"
              className="w-full h-auto max-h-24 object-contain rounded-sm mb-2 border"
              loading="lazy"
            />
          )}
          <pre className="font-sans whitespace-pre-wrap">{metadataForDisplay}</pre>
        </PopoverContent>
      </Popover>
    );
  };

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
      {ReactDOM.createPortal(
        <div
          className="fixed z-[99999] flex items-center justify-center bg-black bg-opacity-75 transition-opacity duration-300 ease-in-out isolate"
          style={modalStyle}
          onClick={onClose} // Close on backdrop click
        >
          {/* Previous button */}
          {onPrevious && hasPrevious && (
            <button 
              onClick={(e) => { e.stopPropagation(); onPrevious(); }} 
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors z-10 p-2 rounded-full bg-black/20 hover:bg-black/40"
              aria-label="Previous image"
            >
              <ChevronLeft size={40} />
            </button>
          )}

          {/* Next button */}
          {onNext && hasNext && (
            <button 
              onClick={(e) => { e.stopPropagation(); onNext(); }} 
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors z-10 p-2 rounded-full bg-black/20 hover:bg-black/40"
              aria-label="Next image"
            >
              <ChevronRight size={40} />
            </button>
          )}

          {/* Close button */}
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors z-10"
            aria-label="Close modal"
          >
            <X size={32} />
          </button>

          <div
            className="relative p-4 bg-white rounded-lg shadow-xl max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-fadeIn z-[99999]"
            onClick={(e) => e.stopPropagation()} // Prevent modal close when clicking on the image/modal content itself
          >
            {/* Gallery overlay buttons - positioned relative to container */}
            {currentImage?.id && (
              <>
                {/* Add to Shot UI - Top Left */}
                {simplifiedShotOptions.length > 0 && onAddToShot && (
                  <div className="absolute top-6 left-6 flex flex-col items-start gap-1 opacity-80 hover:opacity-100 transition-opacity z-10">
                    <Select
                      value={selectedShotId || ''}
                      onValueChange={(value) => {
                        if (onShotChange) onShotChange(value);
                      }}
                    >
                      <SelectTrigger
                        className="h-7 px-2 py-1 rounded-md bg-black/50 hover:bg-black/70 text-white text-xs min-w-[70px] max-w-[120px] truncate focus:ring-0 focus:ring-offset-0"
                        aria-label="Select target shot"
                      >
                        <SelectValue placeholder="Shot..." />
                      </SelectTrigger>
                      <SelectContent className="z-[99999]">
                        {simplifiedShotOptions.map(shot => (
                          <SelectItem key={shot.id} value={shot.id} className="text-xs">
                            {shot.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className={`h-7 w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white ${showTickForImageId === currentImage.id ? 'bg-green-500 hover:bg-green-600 !text-white' : ''}`}
                          onClick={async () => {
                            if (!selectedShotId) {
                              toast({ title: "Select a Shot", description: "Please select a shot first to add this image.", variant: "destructive" });
                              return;
                            }
                            if (onAddToShot) {
                              const success = await onAddToShot(currentImage.id, getDisplayUrl(currentImage.url), getDisplayUrl(currentImage.url));
                              if (success && onShowTick) {
                                onShowTick(currentImage.id);
                              }
                            }
                          }}
                          disabled={!selectedShotId || showTickForImageId === currentImage.id}
                          aria-label={showTickForImageId === currentImage.id ? `Added to ${currentTargetShotName}` : (currentTargetShotName ? `Add to shot: ${currentTargetShotName}` : "Add to selected shot")}
                        >
                          {showTickForImageId === currentImage.id ? <Check className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {showTickForImageId === currentImage.id ? `Added to ${currentTargetShotName || 'shot'}` :
                        (selectedShotId && currentTargetShotName ? `Add to: ${currentTargetShotName}` : "Select a shot then click to add")}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )}

                {/* Action buttons - Top Right (timestamp, Info & Apply) */}
                <div className="absolute top-6 right-6 flex flex-col items-end gap-1.5">
                  {/* Timestamp */}
                  {currentImage.createdAt && isValid(new Date(currentImage.createdAt)) && (
                    <span className="text-xs text-white bg-black/50 px-1.5 py-0.5 rounded-md opacity-80 hover:opacity-100 transition-opacity">
                      {formatDistanceToNow(new Date(currentImage.createdAt), { addSuffix: true })
                        .replace(" minutes", " mins")
                        .replace(" minute", " min")
                        .replace(" hours", " hrs")
                        .replace(" hour", " hr")
                        .replace(" seconds", " secs")
                        .replace(" second", " sec")
                        .replace("less than a minute", "< 1 min")}
                    </span>
                  )}

                  {/* Info button */}
                  {currentImage.metadata && (
                    <div className="opacity-80 hover:opacity-100 transition-opacity">
                      <InfoPopover metadata={currentImage.metadata} metadataForDisplay={metadataForDisplay} />
                    </div>
                  )}

                  {/* Apply settings button (currently disabled) */}
                  {false && currentImage.metadata && onApplySettings && (
                    <div className="opacity-80 hover:opacity-100 transition-opacity">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="outline"
                            size="icon" 
                            className="h-7 w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white"
                            onClick={() => onApplySettings(currentImage.metadata!)}
                          >
                            <Settings className="h-4 w-4 mr-1" /> Apply
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Apply these generation settings to the form</TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                </div>
              </>
            )}
            
            <div className="relative">
              <img
                ref={imgRef}
                src={imageUrl}
                alt={imageAlt || "Fullscreen view"}
                className={`w-auto h-auto max-w-full max-h-[calc(85vh-40px)] object-contain rounded mb-2 transition-transform duration-200 ${
                  isFlippedHorizontally ? 'scale-x-[-1]' : ''
                }`}
              />
              
              {/* Download button - Bottom Left of image */}
              {currentImage?.id && (
                <div className="absolute bottom-2 left-2 opacity-80 hover:opacity-100 transition-opacity">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white"
                    onClick={() => handleDownloadClick()}
                    disabled={isDownloading}
                  >
                    {isDownloading ? (
                      <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-current"></div>
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              )}

              {/* Delete button - Bottom Right of image */}
              {currentImage?.id && onDelete && (
                <div className="absolute bottom-2 right-2 opacity-80 hover:opacity-100 transition-opacity">
                  <Button 
                    variant="destructive" 
                    size="icon" 
                    className="h-7 w-7 p-0 rounded-full"
                    onClick={() => onDelete(currentImage.id)}
                    disabled={isCurrentDeleting}
                  >
                    {isCurrentDeleting ? (
                      <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-white"></div>
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              )}
            </div>
            
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
        </div>,
        document.body
      )}
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