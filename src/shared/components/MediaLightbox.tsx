import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, FlipHorizontal, Save, Download, Trash2, Settings, PlusCircle, CheckCircle, Sparkles, Star } from 'lucide-react';
import { GenerationRow } from '@/types/shots';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { getDisplayUrl, cn } from '@/shared/lib/utils';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';
import SimpleVideoPlayer from '@/tools/travel-between-images/components/SimpleVideoPlayer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Textarea } from '@/shared/components/ui/textarea';
import { Label } from '@/shared/components/ui/label';
import { SliderWithValue } from '@/shared/components/ui/slider-with-value';
import { useToggleGenerationStar } from '@/shared/hooks/useGenerations';

interface Shot {
  id: string;
  name: string;
}

interface MediaLightboxProps {
  media: GenerationRow;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onImageSaved?: (newImageUrl: string, createNew?: boolean) => void;
  // Configuration props to control features
  showNavigation?: boolean;
  showImageEditTools?: boolean;
  showDownload?: boolean;
  showMagicEdit?: boolean;
  videoPlayerComponent?: 'hover-scrub' | 'simple-player';
  // Workflow-specific props
  allShots?: Shot[];
  selectedShotId?: string;
  onShotChange?: (shotId: string) => void;
  onAddToShot?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onDelete?: (id: string) => void;
  isDeleting?: string | null;
  onApplySettings?: (metadata: any) => void;
  showTickForImageId?: string | null;
  onShowTick?: (imageId: string) => void;
  onMagicEdit?: (imageUrl: string, prompt: string, numImages: number) => void;
  // Star functionality
  starred?: boolean;
  onToggleStar?: (id: string, starred: boolean) => void;
}

const MediaLightbox: React.FC<MediaLightboxProps> = ({ 
  media, 
  onClose, 
  onNext, 
  onPrevious, 
  onImageSaved,
  showNavigation = true,
  showImageEditTools = true,
  showDownload = true,
  showMagicEdit = false,
  videoPlayerComponent = 'hover-scrub',
  // Workflow-specific props
  allShots = [],
  selectedShotId,
  onShotChange,
  onAddToShot,
  onDelete,
  isDeleting,
  onApplySettings,
  showTickForImageId,
  onShowTick,
  onMagicEdit,
  // Star functionality
  starred = false,
  onToggleStar
}) => {
  const [isFlippedHorizontally, setIsFlippedHorizontally] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isMagicEditOpen, setIsMagicEditOpen] = useState(false);
  const [magicEditPrompt, setMagicEditPrompt] = useState('');
  const [magicEditNumImages, setMagicEditNumImages] = useState(4);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Ref for the dialog content so we can programmatically focus it, enabling keyboard shortcuts immediately
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Star functionality
  const toggleStarMutation = useToggleGenerationStar();

  const isVideo = media.type === 'video_travel_output' || media.location?.endsWith('.mp4');
  const displayUrl = getDisplayUrl(media.location || media.imageUrl);

  // Clear saving state when URL changes (indicating new image is ready)
  useEffect(() => {
    if (isSaving) {
      setIsSaving(false);
    }
  }, [displayUrl, isSaving]);

  /**
   * Global key handler
   * --------------------------------------------------
   * We register a window-level keydown listener so that
   * arrow navigation still works even when an embedded
   * <video> element (which is focusable) steals keyboard
   * focus. Without this, users need to press an arrow
   * key twice: the first keystroke focuses the video and
   * is consumed by the browser, the second finally
   * reaches our onKeyDown handler. Capturing the event at
   * the window level avoids that issue entirely.
   */
  useEffect(() => {
    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && onPrevious) {
        e.preventDefault();
        onPrevious();
      } else if (e.key === 'ArrowRight' && onNext) {
        e.preventDefault();
        onNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [onNext, onPrevious, onClose]);

  const handleFlip = () => {
    setIsFlippedHorizontally(!isFlippedHorizontally);
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!hasChanges || !canvasRef.current || isSaving) return;

    setIsSaving(true);

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Failed to get canvas context');
        setIsSaving(false);
        return;
      }

      // Store the current flip state
      const wasFlipped = isFlippedHorizontally;

      // Create a new image element to load the original image
      const img = new Image();
      img.crossOrigin = 'anonymous'; // Enable CORS for cross-origin images
      
      img.onload = () => {
        // Set canvas dimensions to match the image
        canvas.width = img.width;
        canvas.height = img.height;

        // Clear the canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Save the current context state
        ctx.save();

        // Apply horizontal flip transformation if needed
        if (wasFlipped) {
          // Move to the center, flip, then move back
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }

        // Draw the image
        ctx.drawImage(img, 0, 0);

        // Restore the context state
        ctx.restore();

        // Convert canvas to blob
        canvas.toBlob((blob) => {
          if (blob && onImageSaved) {
            const url = URL.createObjectURL(blob);
            // Reset flip state BEFORE calling onImageSaved
            // This ensures the UI is ready for the flipped image
            setIsFlippedHorizontally(false);
            setHasChanges(false);
            // Pass true to indicate this should create a new image
            // Don't clear isSaving here - let the parent handle it when new image is ready
            onImageSaved(url, true);
          }
        }, 'image/png');
      };

      img.onerror = (error) => {
        console.error('Error loading image:', error);
        setIsSaving(false);
      };

      // Start loading the image
      img.src = displayUrl;
    } catch (error) {
      console.error('Error saving image:', error);
      setIsSaving(false);
    }
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(displayUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `media_${media.id}.${isVideo ? 'mp4' : 'png'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the object URL
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      // Fallback to direct link
      const link = document.createElement('a');
      link.href = displayUrl;
      link.download = `media_${media.id}.${isVideo ? 'mp4' : 'png'}`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleAddToShot = async () => {
    if (!onAddToShot || !selectedShotId) return;
    
    const success = await onAddToShot(media.id, media.imageUrl, media.thumbUrl);
    if (success && onShowTick) {
      onShowTick(media.id);
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      // Trigger the deletion in the parent component
      onDelete(media.id);

      // After requesting deletion, attempt to move the lightbox to another item
      if (onNext) {
        onNext();
      } else if (onPrevious) {
        onPrevious();
      } else {
        // Fallback: close the lightbox if no navigation callbacks are available
        onClose();
      }
    }
  };

  const handleApplySettings = () => {
    if (onApplySettings && media.metadata) {
      onApplySettings(media.metadata);
    }
  };

  const handleMagicEditGenerate = () => {
    if (onMagicEdit && magicEditPrompt.trim()) {
      onMagicEdit(displayUrl, magicEditPrompt, magicEditNumImages);
      setIsMagicEditOpen(false);
      setMagicEditPrompt('');
      setMagicEditNumImages(4);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && onPrevious) {
      onPrevious();
    } else if (e.key === 'ArrowRight' && onNext) {
      onNext();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <TooltipProvider delayDuration={500}>
      <DialogPrimitive.Root open={true} onOpenChange={(open) => !open && onClose()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay 
            className="fixed inset-0 z-[10000] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          />
          <DialogPrimitive.Content
            ref={contentRef}
            tabIndex={-1} // Make the content focusable so it can receive key events
            onOpenAutoFocus={(event) => {
              // Prevent initial auto-focus on the first interactive element (e.g., the flip button)
              // which was causing tooltips to appear immediately when the modal opens.
              event.preventDefault();
              // Manually focus the dialog content so keyboard navigation works right away
              contentRef.current?.focus();
            }}
            className={cn(
              "fixed left-[50%] top-[50%] z-[10000] translate-x-[-50%] translate-y-[-50%] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
              "w-auto h-auto p-0 border-none bg-transparent shadow-none"
            )}
            onKeyDown={handleKeyDown}
            onPointerDownOutside={onClose}
          >
            <div 
              className="relative flex items-center justify-center"
              style={{
                maxHeight: '95vh',
                maxWidth: '95vw',
                width: 'auto'
              }}
            >
              {/* Navigation Controls - Left Arrow */}
              {showNavigation && onPrevious && (
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={onPrevious}
                  className="hidden sm:flex bg-black/50 hover:bg-black/70 text-white z-20 h-10 w-10 sm:h-12 sm:w-12 absolute left-2 top-1/2 -translate-y-1/2"
                >
                  <ChevronLeft className="h-6 w-6 sm:h-8 sm:w-8" />
                </Button>
              )}

              {/* Media Content */}
              <div className="relative">
                {isVideo ? (
                  videoPlayerComponent === 'simple-player' ? (
                    <div style={{ maxWidth: '95vw' }}>
                      <SimpleVideoPlayer
                        src={displayUrl}
                        poster={media.thumbUrl}
                        className="w-full h-full max-h-[85vh] sm:max-h-[80vh] object-contain"
                      />
                    </div>
                  ) : (
                    <HoverScrubVideo
                      src={displayUrl}
                      poster={media.thumbUrl}
                      className="w-full h-full max-h-[85vh] sm:max-h-[80vh] object-contain"
                      style={{ maxWidth: '95vw' }}
                    />
                  )
                ) : (
                  <div className="relative">
                    {isSaving ? (
                      <div 
                        className="flex items-center justify-center bg-black/20 rounded-lg object-contain"
                        style={{ 
                          width: 'auto',
                          height: 'auto',
                          maxHeight: '85vh',
                          maxWidth: '95vw',
                          aspectRatio: imageDimensions ? `${imageDimensions.width}/${imageDimensions.height}` : '1',
                          minWidth: '300px',
                          minHeight: '300px'
                        }}
                      >
                        <div className="text-white text-center">
                          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-2"></div>
                          <p>Saving image...</p>
                        </div>
                      </div>
                    ) : (
                      <img 
                        src={displayUrl} 
                        alt="Media content"
                        className={`w-full h-full object-contain ${
                          isFlippedHorizontally ? 'scale-x-[-1]' : ''
                        }`}
                        style={{ 
                          maxHeight: '85vh',
                          maxWidth: '95vw',
                          width: 'auto',
                          height: 'auto',
                          transform: isFlippedHorizontally ? 'scaleX(-1)' : 'none'
                        }}
                        onLoad={(e) => {
                          const img = e.target as HTMLImageElement;
                          setImageDimensions({
                            width: img.naturalWidth,
                            height: img.naturalHeight
                          });
                        }}
                      />
                    )}
                    {/* Hidden canvas for image processing */}
                    <canvas 
                      ref={canvasRef}
                      className="hidden"
                    />
                  </div>
                )}

                {/* Top Controls */}
                <div className="absolute top-2 sm:top-4 right-2 sm:right-4 flex items-center space-x-1 sm:space-x-2 z-10">
                  {/* Star Button */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (onToggleStar) {
                        onToggleStar(media.id, !starred);
                      } else {
                        toggleStarMutation.mutate({ id: media.id, starred: !starred });
                      }
                    }}
                    disabled={toggleStarMutation.isPending}
                    className="transition-colors bg-black/50 hover:bg-black/70 text-white"
                  >
                    <Star className={`h-4 w-4 ${starred ? 'fill-current' : ''}`} />
                  </Button>

                  {!isVideo && showMagicEdit && onMagicEdit && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setIsMagicEditOpen(true)}
                          className="bg-black/50 hover:bg-black/70 text-white"
                        >
                          <Sparkles className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Magic Edit</TooltipContent>
                    </Tooltip>
                  )}

                  {!isVideo && showImageEditTools && (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleFlip}
                            className="bg-black/50 hover:bg-black/70 text-white"
                          >
                            <FlipHorizontal className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Flip horizontally</TooltipContent>
                      </Tooltip>

                      {hasChanges && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={handleSave}
                              disabled={isSaving}
                              className="bg-green-600/80 hover:bg-green-600 text-white disabled:opacity-50"
                            >
                              <Save className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{isSaving ? 'Saving...' : 'Save changes'}</TooltipContent>
                        </Tooltip>
                      )}
                    </>
                  )}

                  {showDownload && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleDownload}
                          className="bg-black/50 hover:bg-black/70 text-white"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Download {isVideo ? 'video' : 'image'}</TooltipContent>
                    </Tooltip>
                  )}

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onClose}
                    className="bg-black/50 hover:bg-black/70 text-white"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Bottom Workflow Controls */}
                {(onAddToShot || onDelete || onApplySettings) && (
                  <div className="absolute bottom-2 sm:bottom-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-1 sm:space-x-2 z-10">
                    <div className="bg-black/80 backdrop-blur-sm rounded-lg p-1 sm:p-2 flex items-center space-x-1 sm:space-x-2">
                      {/* Shot Selection and Add to Shot */}
                      {onAddToShot && allShots.length > 0 && (
                        <>
                          <Select value={selectedShotId} onValueChange={onShotChange}>
                            <SelectTrigger className="w-24 sm:w-32 h-7 sm:h-8 bg-black/50 border-white/20 text-white text-xs">
                              <SelectValue placeholder="Select shot" />
                            </SelectTrigger>
                            <SelectContent>
                              {allShots.map((shot) => (
                                <SelectItem key={shot.id} value={shot.id}>
                                  {shot.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleAddToShot}
                                disabled={!selectedShotId}
                                className="bg-blue-600/80 hover:bg-blue-600 text-white h-7 sm:h-8 px-2 sm:px-3"
                              >
                                {showTickForImageId === media.id ? (
                                  <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                                ) : (
                                  <PlusCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Add to shot</TooltipContent>
                          </Tooltip>
                        </>
                      )}

                      {/* Apply Settings */}
                      {onApplySettings && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={handleApplySettings}
                              className="bg-purple-600/80 hover:bg-purple-600 text-white h-7 sm:h-8 px-2 sm:px-3"
                            >
                              <Settings className="h-3 w-3 sm:h-4 sm:w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Apply settings</TooltipContent>
                        </Tooltip>
                      )}

                      {/* Delete */}
                      {onDelete && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={handleDelete}
                              disabled={isDeleting === media.id}
                              className="bg-red-600/80 hover:bg-red-600 text-white h-7 sm:h-8 px-2 sm:px-3"
                            >
                              <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete image</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                )}

                {/* Mobile Navigation Controls */}
                <div className="sm:hidden">
                  {showNavigation && onPrevious && (
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={onPrevious}
                      className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-10 h-12 w-12"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </Button>
                  )}
                  
                  {showNavigation && onNext && (
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={onNext}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-10 h-12 w-12"
                    >
                      <ChevronRight className="h-6 w-6" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Navigation Controls - Right Arrow (Desktop Only) */}
              {showNavigation && onNext && (
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={onNext}
                  className="hidden sm:flex bg-black/50 hover:bg-black/70 text-white z-20 h-10 w-10 sm:h-12 sm:w-12 absolute right-2 top-1/2 -translate-y-1/2"
                >
                  <ChevronRight className="h-6 w-6 sm:h-8 sm:w-8" />
                </Button>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Magic Edit Modal */}
      <Dialog open={isMagicEditOpen} onOpenChange={setIsMagicEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Magic Edit
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {/* Image Preview */}
            <div className="relative w-full">
              <Label>Image</Label>
              <div className="mt-2 rounded-lg border border-border overflow-hidden bg-muted/50">
                <img 
                  src={displayUrl} 
                  alt="Image to edit"
                  className="w-full h-48 object-contain"
                />
              </div>
            </div>

            {/* Prompt Input */}
            <div className="space-y-2">
              <Label htmlFor="magic-edit-prompt">Prompt</Label>
              <Textarea
                id="magic-edit-prompt"
                value={magicEditPrompt}
                onChange={(e) => setMagicEditPrompt(e.target.value)}
                placeholder="Describe how you want to transform this image..."
                className="min-h-[100px] resize-none"
                autoFocus
              />
            </div>

            {/* Number of Images Slider */}
            <div className="space-y-2">
              <SliderWithValue
                label="Number to Generate"
                value={magicEditNumImages}
                onChange={setMagicEditNumImages}
                min={1}
                max={16}
                step={1}
              />
            </div>

            {/* Generate Button */}
            <Button 
              onClick={handleMagicEditGenerate}
              disabled={!magicEditPrompt.trim()}
              className="w-full"
            >
              Generate
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

export default MediaLightbox; 