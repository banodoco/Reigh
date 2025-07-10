import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, FlipHorizontal, Save, Download, Trash2, Settings, PlusCircle, CheckCircle } from 'lucide-react';
import { GenerationRow } from '@/types/shots';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { getDisplayUrl, cn } from '@/shared/lib/utils';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';
import SimpleVideoPlayer from '@/tools/travel-between-images/components/SimpleVideoPlayer';

interface Shot {
  id: string;
  name: string;
}

interface MediaLightboxProps {
  media: GenerationRow;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onImageSaved?: (newImageUrl: string) => void;
  // Configuration props to control features
  showNavigation?: boolean;
  showImageEditTools?: boolean;
  showDownload?: boolean;
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
  onShowTick
}) => {
  const [isFlippedHorizontally, setIsFlippedHorizontally] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Ref for the dialog content so we can programmatically focus it, enabling keyboard shortcuts immediately
  const contentRef = useRef<HTMLDivElement>(null);

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
  
  const isVideo = media.type === 'video_travel_output' || media.location?.endsWith('.mp4');
  const displayUrl = getDisplayUrl(media.location || media.imageUrl);

  const handleFlip = () => {
    setIsFlippedHorizontally(!isFlippedHorizontally);
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!hasChanges || !canvasRef.current) return;

    try {
      const canvas = canvasRef.current;
      canvas.toBlob((blob) => {
        if (blob && onImageSaved) {
          const url = URL.createObjectURL(blob);
          onImageSaved(url);
          setHasChanges(false);
        }
      }, 'image/png');
    } catch (error) {
      console.error('Error saving image:', error);
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = displayUrl;
    link.download = `media_${media.id}.${isVideo ? 'mp4' : 'png'}`;
    link.click();
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
                maxHeight: '90vh',
                maxWidth: '90vw'
              }}
            >
              {/* Navigation Controls - Left Arrow */}
              {showNavigation && onPrevious && (
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={onPrevious}
                  className="bg-black/50 hover:bg-black/70 text-white z-10 mr-4 h-12 w-12"
                >
                  <ChevronLeft className="h-8 w-8" />
                </Button>
              )}

              {/* Media Content */}
              <div className="relative">
                {isVideo ? (
                  videoPlayerComponent === 'simple-player' ? (
                    <SimpleVideoPlayer
                      src={displayUrl}
                      poster={media.thumbUrl}
                      className="w-full h-full max-h-[80vh] object-contain"
                    />
                  ) : (
                    <HoverScrubVideo
                      src={displayUrl}
                      poster={media.thumbUrl}
                      className="w-full h-full max-h-[80vh] object-contain"
                    />
                  )
                ) : (
                  <div className="relative">
                    <img 
                      src={displayUrl} 
                      alt="Media content"
                      className={`w-full h-full object-contain ${
                        isFlippedHorizontally ? 'scale-x-[-1]' : ''
                      }`}
                      style={{ 
                        maxHeight: '80vh',
                        maxWidth: '80vw',
                        transform: isFlippedHorizontally ? 'scaleX(-1)' : 'none'
                      }}
                    />
                    {/* Hidden canvas for image processing */}
                    <canvas 
                      ref={canvasRef}
                      className="hidden"
                      width={800}
                      height={600}
                    />
                  </div>
                )}

                {/* Top Controls */}
                <div className="absolute top-4 right-4 flex items-center space-x-2 z-10">
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
                              className="bg-green-600/80 hover:bg-green-600 text-white"
                            >
                              <Save className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Save changes</TooltipContent>
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
                  <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-2 z-10">
                    <div className="bg-black/80 backdrop-blur-sm rounded-lg p-2 flex items-center space-x-2">
                      {/* Shot Selection and Add to Shot */}
                      {onAddToShot && allShots.length > 0 && (
                        <>
                          <Select value={selectedShotId} onValueChange={onShotChange}>
                            <SelectTrigger className="w-32 h-8 bg-black/50 border-white/20 text-white text-xs">
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
                                className="bg-blue-600/80 hover:bg-blue-600 text-white h-8 px-3"
                              >
                                {showTickForImageId === media.id ? (
                                  <CheckCircle className="h-4 w-4" />
                                ) : (
                                  <PlusCircle className="h-4 w-4" />
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
                              className="bg-purple-600/80 hover:bg-purple-600 text-white h-8 px-3"
                            >
                              <Settings className="h-4 w-4" />
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
                              className="bg-red-600/80 hover:bg-red-600 text-white h-8 px-3"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete image</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Navigation Controls - Right Arrow */}
              {showNavigation && onNext && (
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={onNext}
                  className="bg-black/50 hover:bg-black/70 text-white z-10 ml-4 h-12 w-12"
                >
                  <ChevronRight className="h-8 w-8" />
                </Button>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </TooltipProvider>
  );
};

export default MediaLightbox; 