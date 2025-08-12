import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X, FlipHorizontal, Save, Download, Trash2, Settings, PlusCircle, CheckCircle, Star, Info } from 'lucide-react';
import { GenerationRow } from '@/types/shots';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { getDisplayUrl, cn } from '@/shared/lib/utils';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';
import SimpleVideoPlayer from '@/tools/travel-between-images/components/SimpleVideoPlayer';
import { useToggleGenerationStar } from '@/shared/hooks/useGenerations';
import MagicEditLauncher from '@/shared/components/MagicEditLauncher';
import TaskDetailsContent from '@/tools/travel-between-images/components/TaskDetailsContent';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { toast } from 'sonner';

interface Shot {
  id: string;
  name: string;
}

interface MediaLightboxProps {
  media: GenerationRow;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onImageSaved?: (newImageUrl: string, createNew?: boolean) => Promise<void>;
  // Configuration props to control features
  showNavigation?: boolean;
  showImageEditTools?: boolean;
  showDownload?: boolean;
  showMagicEdit?: boolean;
  videoPlayerComponent?: 'hover-scrub' | 'simple-player';
  // Navigation availability
  hasNext?: boolean;
  hasPrevious?: boolean;
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
  // Task details functionality
  showTaskDetails?: boolean;
  onApplySettingsFromTask?: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
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
  // Navigation availability
  hasNext = true,
  hasPrevious = true,
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
  onToggleStar,
  // Task details functionality
  showTaskDetails = false,
  onApplySettingsFromTask
}) => {
  const [isFlippedHorizontally, setIsFlippedHorizontally] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [showTaskDetailsModal, setShowTaskDetailsModal] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Ref for the dialog content so we can programmatically focus it, enabling keyboard shortcuts immediately
  const contentRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  

  
  // Star functionality
  const toggleStarMutation = useToggleGenerationStar();

  // Local starred state to ensure UI reflects updates immediately even if parent data is stale
  const initialStarred = useMemo(() => {
    // Prefer explicit prop, fall back to media.starred if available
    console.log('[StarDebug:MediaLightbox] Calculating initialStarred', {
      mediaId: media.id,
      starredProp: starred,
      mediaStarred: (media as any).starred,
      mediaKeys: Object.keys(media),
      timestamp: Date.now()
    });
    
    if (typeof starred === 'boolean') {
      console.log('[StarDebug:MediaLightbox] Using starred prop:', starred);
      return starred;
    }
    // @ts-ignore – media may include starred even if not in type
    if (typeof (media as any).starred === 'boolean') {
      console.log('[StarDebug:MediaLightbox] Using media.starred:', (media as any).starred);
      return (media as any).starred;
    }
    console.log('[StarDebug:MediaLightbox] Defaulting to false');
    return false;
  }, [starred, media]);

  const [localStarred, setLocalStarred] = useState<boolean>(initialStarred);

  // Keep local state in sync when parent updates (e.g., after query refetch)
  useEffect(() => {
    console.log('[StarDebug:MediaLightbox] Syncing localStarred', {
      mediaId: media.id,
      oldLocalStarred: localStarred,
      newInitialStarred: initialStarred,
      willUpdate: localStarred !== initialStarred,
      timestamp: Date.now()
    });
    setLocalStarred(initialStarred);
  }, [initialStarred]);

  // Safety check - if media is undefined, return early to prevent crashes
  if (!media) {
    return null;
  }

  console.log('[TaskDetails] MediaLightbox props:', {
    showTaskDetails,
    showTaskDetailsModal,
    mediaId: media.id,
    isMobile,
    hasOnApplySettingsFromTask: !!onApplySettingsFromTask
  });

  const isVideo = media.type === 'video' || media.type === 'video_travel_output' || media.location?.endsWith('.mp4');
  const displayUrl = getDisplayUrl(media.location || media.imageUrl);

  // This useEffect is no longer needed as the finally block in handleSave is more reliable.
  // useEffect(() => {
  //   if (isSaving) {
  //     setIsSaving(false);
  //   }
  // }, [displayUrl]);

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
          if (isFlippedHorizontally) {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(img, 0, 0);
          ctx.restore();
          canvas.toBlob(blob => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas to Blob conversion failed'));
            }
          }, 'image/png');
        };

        img.onerror = (err) => {
          reject(err);
        };

        img.src = displayUrl;
      });

      if (onImageSaved) {
        const url = URL.createObjectURL(blob);
        
        // Reset state
        setIsFlippedHorizontally(false);
        setHasChanges(false);

        // Await parent handler
        await onImageSaved(url, true);

        // Close the lightbox on successful save
        onClose();
      }
    } catch (error) {
      console.error('Error saving image:', error);
      toast.error('Failed to save image.');
    } finally {
      // This will now run after onImageSaved has completed
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
              className={cn(
                "relative",
                isMobile && showTaskDetails && showTaskDetailsModal 
                  ? "flex flex-col max-h-[95vh] max-w-[95vw]" 
                  : !isMobile && showTaskDetails && showTaskDetailsModal
                  ? "flex flex-row max-h-[95vh] max-w-[95vw] gap-4"
                  : "flex items-center justify-center max-h-[95vh] max-w-[95vw]"
              )}
              style={{
                width: 'auto'
              }}
            >
              {/* Media Content Container */}
              <div 
                className={cn(
                  "relative",
                  isMobile && showTaskDetails && showTaskDetailsModal 
                    ? "flex items-center justify-center flex-shrink-0" 
                    : !isMobile && showTaskDetails && showTaskDetailsModal
                    ? "flex items-center justify-center flex-shrink-0"
                    : "flex items-center justify-center"
                )}
                style={{
                  ...(isMobile && showTaskDetails && showTaskDetailsModal 
                    ? { maxHeight: '50vh', maxWidth: '95vw' }
                    : !isMobile && showTaskDetails && showTaskDetailsModal
                    ? { maxHeight: '95vh', maxWidth: '60vw' }
                    : { maxHeight: '95vh', maxWidth: '95vw' })
                }}
              >
                {/* Navigation Controls - Left Arrow */}
                {showNavigation && onPrevious && hasPrevious && (
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
                    <div style={{ 
                      maxWidth: isMobile && showTaskDetails && showTaskDetailsModal 
                        ? '95vw' 
                        : !isMobile && showTaskDetails && showTaskDetailsModal
                        ? '60vw'
                        : '95vw' 
                    }}>
                      <SimpleVideoPlayer
                        src={displayUrl}
                        poster={media.thumbUrl}
                        className={cn(
                          "h-auto object-contain",
                          isMobile && showTaskDetails && showTaskDetailsModal 
                            ? "max-h-[40vh]"
                            : !isMobile && showTaskDetails && showTaskDetailsModal
                            ? "max-h-[85vh]"
                            : "max-h-[85vh] sm:max-h-[85vh]"
                        )}
                      />
                    </div>
                  ) : (
                    <HoverScrubVideo
                      src={displayUrl}
                      poster={media.thumbUrl}
                      className={cn(
                        "h-auto object-contain",
                        isMobile && showTaskDetails && showTaskDetailsModal 
                          ? "max-h-[40vh] w-[95vw]"
                          : !isMobile && showTaskDetails && showTaskDetailsModal
                          ? "max-h-[85vh] w-auto"
                          : "max-h-[85vh] sm:max-h-[85vh] object-contain w-[95vw] sm:w-auto"
                      )}
                      style={{ 
                        maxWidth: isMobile && showTaskDetails && showTaskDetailsModal 
                          ? '95vw' 
                          : !isMobile && showTaskDetails && showTaskDetailsModal
                          ? '60vw'
                          : '95vw' 
                      }}
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
                          maxHeight: isMobile && showTaskDetails && showTaskDetailsModal 
                            ? '40vh'
                            : !isMobile && showTaskDetails && showTaskDetailsModal
                            ? '85vh'
                            : '85vh',
                          maxWidth: isMobile && showTaskDetails && showTaskDetailsModal 
                            ? '95vw' 
                            : !isMobile && showTaskDetails && showTaskDetailsModal
                            ? '60vw'
                            : '95vw',
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
                      const newStarred = !localStarred;
                      console.log('[StarDebug:MediaLightbox] Star button clicked', {
                        mediaId: media.id,
                        oldLocalStarred: localStarred,
                        newStarred,
                        hasOnToggleStar: !!onToggleStar,
                        timestamp: Date.now()
                      });
                      
                      setLocalStarred(newStarred); // Optimistic UI update

                      if (onToggleStar) {
                        console.log('[StarDebug:MediaLightbox] Calling onToggleStar prop');
                        onToggleStar(media.id, newStarred);
                      } else {
                        console.log('[StarDebug:MediaLightbox] Calling toggleStarMutation');
                        toggleStarMutation.mutate({ id: media.id, starred: newStarred });
                      }
                    }}
                    disabled={toggleStarMutation.isPending}
                    className="transition-colors bg-black/50 hover:bg-black/70 text-white"
                  >
                    <Star className={`h-4 w-4 ${localStarred ? 'fill-current' : ''}`} />
                  </Button>

                  {/* Task Details Button */}
                  {showTaskDetails && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        console.log('[TaskDetails] Info button clicked, current state:', showTaskDetailsModal);
                        setShowTaskDetailsModal(!showTaskDetailsModal);
                      }}
                      className="transition-colors bg-black/50 hover:bg-black/70 text-white"
                      title="Show task details"
                    >
                      <Info className="h-4 w-4" />
                    </Button>
                  )}

                  {!isVideo && showMagicEdit && (
                    <MagicEditLauncher
                      imageUrl={displayUrl}
                      imageDimensions={imageDimensions}
                    />
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
                  {showNavigation && onPrevious && hasPrevious && (
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={onPrevious}
                      className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-10 h-12 w-12"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </Button>
                  )}
                  
                  {showNavigation && onNext && hasNext && (
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
                </div> {/* Close media content div */}
              </div>

              {/* Navigation Controls - Right Arrow (Desktop Only) */}
              {showNavigation && onNext && hasNext && (
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={onNext}
                  className="hidden sm:flex bg-black/50 hover:bg-black/70 text-white z-20 h-10 w-10 sm:h-12 sm:w-12 absolute right-2 top-1/2 -translate-y-1/2"
                >
                  <ChevronRight className="h-6 w-6 sm:h-8 sm:w-8" />
                </Button>
              )}

              {/* Task Details Panel - Positioned absolutely to ensure visibility */}
              {showTaskDetails && showTaskDetailsModal && (
                <div 
                  className="fixed bg-red-500/90 rounded-lg border-4 border-yellow-400 overflow-y-auto"
                  style={{
                    top: '10px',
                    right: '10px',
                    width: isMobile ? '90vw' : '400px',
                    maxHeight: isMobile ? '50vh' : '80vh',
                    minHeight: '200px',
                    zIndex: 10001
                  }}
                >
                  {console.log('[TaskDetails] Rendering TaskDetailsContent for generation:', media.id)}
                  <div className="p-4 text-white font-bold">
                    DEBUG: Task Details Panel Visible! Fixed Position!
                  </div>
                  <TaskDetailsContent
                    generationId={media.id}
                    onApplySettings={onApplySettings}
                    onApplySettingsFromTask={onApplySettingsFromTask}
                    onClose={() => setShowTaskDetailsModal(false)}
                  />
                </div>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Magic Edit Modal handled by MagicEditLauncher */}


    </TooltipProvider>
  );
};

export default MediaLightbox; 