import React, { useRef, useState } from "react";
import { GenerationRow } from "@/types/shots";
import { getDisplayUrl, cn } from "@/shared/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { Trash2, Copy, Sparkles, Check } from "lucide-react";
import { useProgressiveImage } from "@/shared/hooks/useProgressiveImage";
import { isProgressiveLoadingEnabled } from "@/shared/settings/progressiveLoading";
import { framesToSeconds } from "./utils/time-utils";
// import { TIMELINE_HORIZONTAL_PADDING } from "./constants";
const TIMELINE_HORIZONTAL_PADDING = 20; // Fallback constant

// Props for individual timeline items
interface TimelineItemProps {
  image: GenerationRow;
  framePosition: number;
  isDragging: boolean;
  isSwapTarget: boolean;
  dragOffset: { x: number; y: number } | null;
  onMouseDown: (e: React.MouseEvent, imageId: string) => void;
  onDoubleClick?: () => void;
  onMobileTap?: () => void;
  zoomLevel: number;
  timelineWidth: number;
  fullMinFrames: number;
  fullRange: number;
  currentDragFrame: number | null;
  dragDistances: { distanceToPrev?: number; distanceToNext?: number } | null;
  maxAllowedGap: number;
  originalFramePos: number;
  /** When provided, image src will only be set once this is true */
  shouldLoad?: boolean;
  
  // Action handlers
  onDelete: (imageId: string) => void;
  onDuplicate: (imageId: string, timeline_frame: number) => void;
  onMagicEdit?: (imageUrl: string, shotGenerationId: string) => void;
  duplicatingImageId?: string;
  duplicateSuccessImageId?: string;
  projectAspectRatio?: string;
}

// TimelineItem component - simplified without dnd-kit
const TimelineItem: React.FC<TimelineItemProps> = ({
  image,
  framePosition,
  isDragging,
  isSwapTarget,
  dragOffset,
  onMouseDown,
  onDoubleClick,
  onMobileTap,
  zoomLevel,
  timelineWidth,
  fullMinFrames,
  fullRange,
  currentDragFrame,
  dragDistances,
  maxAllowedGap,
  originalFramePos,
  shouldLoad = true,
  onDelete,
  onDuplicate,
  onMagicEdit,
  duplicatingImageId,
  duplicateSuccessImageId,
  projectAspectRatio = undefined,
}) => {
  // Track touch position to detect scrolling vs tapping
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Track hover state
  const [isHovered, setIsHovered] = useState(false);
  
  // Track if we just clicked a button to prevent drag from starting
  const buttonClickedRef = useRef(false);

  // Calculate aspect ratio for consistent sizing
  const getAspectRatioStyle = () => {
    // Try to get dimensions from image metadata first
    let width = (image as any).metadata?.width;
    let height = (image as any).metadata?.height;

    // If not found, try to extract from resolution string
    if (!width || !height) {
      const resolution = (image as any).metadata?.originalParams?.orchestrator_details?.resolution;
      if (resolution && typeof resolution === 'string' && resolution.includes('x')) {
        const [w, h] = resolution.split('x').map(Number);
        if (!isNaN(w) && !isNaN(h)) {
          width = w;
          height = h;
        }
      }
    }

    // If we have image dimensions, use them
    if (width && height) {
      const aspectRatio = width / height;
      return { aspectRatio: `${aspectRatio}` };
    }

    // Fall back to project aspect ratio if available
    if (projectAspectRatio) {
      const [w, h] = projectAspectRatio.split(':').map(Number);
      if (!isNaN(w) && !isNaN(h)) {
        const aspectRatio = w / h;
        return { aspectRatio: `${aspectRatio}` };
      }
    }

    // Default to square aspect ratio
    return { aspectRatio: '1' };
  };

  const aspectRatioStyle = getAspectRatioStyle();

  // Progressive loading for timeline images
  const progressiveEnabled = isProgressiveLoadingEnabled();
  const { src: progressiveSrc, phase, isThumbShowing, isFullLoaded, ref: progressiveRef } = useProgressiveImage(
    progressiveEnabled ? image.thumbUrl : null,
    image.imageUrl,
    {
      priority: false, // Timeline images load progressively
      lazy: true,
      enabled: progressiveEnabled && shouldLoad,
      crossfadeMs: 180
    }
  );

  // Use progressive src if available, otherwise fallback to display URL
  const displayImageUrl = progressiveEnabled && progressiveSrc ? progressiveSrc : getDisplayUrl(image.thumbUrl || image.imageUrl);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!onMobileTap || !touchStartRef.current) return;

    const touch = e.changedTouches[0];
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
    
    // Only trigger tap if movement is minimal (< 10px in any direction)
    // This prevents accidental selection during scrolling
    if (deltaX < 10 && deltaY < 10) {
      e.preventDefault();
      onMobileTap();
    }
    
    touchStartRef.current = null;
  };
  
  // Action handlers
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    if (onDelete) {
      onDelete(image.shotImageEntryId);
    }
  };

  const handleDuplicateClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    if (onDuplicate) {
      console.log('[DUPLICATE_DEBUG] 🖱️ TIMELINE ITEM - DUPLICATE CLICK:', {
        shotImageEntryId: image.shotImageEntryId.substring(0, 8),
        framePosition_from_timeline: framePosition,
        timeline_frame_from_image: (image as any).timeline_frame,
        image_id: image.id.substring(0, 8),
        mismatch: framePosition !== (image as any).timeline_frame ? 'POSITION_MISMATCH!' : 'positions_match'
      });
      onDuplicate(image.shotImageEntryId, framePosition);
    }
  };
  
  const handleMagicEditClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[MagicEditClickIssue] ⭐ BUTTON CLICKED - calling magic edit callback:', {
      imageId: image.id.substring(0, 8),
      shotImageEntryId: image.shotImageEntryId.substring(0, 8),
      framePosition,
      imageUrl: image.imageUrl?.substring(0, 50) + '...'
    });
    
    // Call the lifted callback to handle magic edit at a higher level
    if (onMagicEdit) {
      onMagicEdit(getDisplayUrl(image.imageUrl), image.shotImageEntryId);
    }
  };
  // Calculate position as pixel offset with padding adjustment
  const imageHalfWidth = 48; // Half of 96px image width for centering
  const paddingOffset = TIMELINE_HORIZONTAL_PADDING + imageHalfWidth; // Left padding from container + half image width
  const effectiveWidth = timelineWidth - (paddingOffset * 2); // Subtract both left and right padding
  const pixelPosition = paddingOffset + ((framePosition - fullMinFrames) / fullRange) * effectiveWidth;

  // [Position0Debug] Only log position 0 items to reduce noise
  if (framePosition === 0) {
    console.log(`[Position0Debug] 📍 POSITION 0 Item ${image.shotImageEntryId.substring(0, 8)} position calculation:`, {
      framePosition,
      fullMinFrames,
      fullRange,
      finalPixelPosition: pixelPosition,
      leftPercent: (pixelPosition / timelineWidth) * 100,
      shouldBeAtStart: framePosition === 0 && fullMinFrames === 0
    });
  }

  // Apply drag offset if dragging
  // To avoid double-counting we translate by the difference between the desired cursor offset
  // and the shift already implied by the updated framePosition.
  let finalX = pixelPosition;
  if (isDragging && dragOffset) {
    const originalPixel = paddingOffset + ((originalFramePos - fullMinFrames) / fullRange) * effectiveWidth;
    const desiredPixel = originalPixel + dragOffset.x;
    finalX = desiredPixel; // cursor-aligned
  }
  const finalY = isDragging && dragOffset ? dragOffset.y : 0;

  // Use current drag frame for display if dragging, otherwise use original position
  const displayFrame = isDragging && currentDragFrame !== null ? currentDragFrame : framePosition;

  // Calculate position in percentage of the full range
  const leftPercent = (finalX / timelineWidth) * 100;

  return (
    <div
      data-item-id={image.shotImageEntryId}
      style={{
        position: 'absolute',
        left: `${leftPercent}%`,
        top: '50%',
        transform: `translate(-50%, -50%) ${isHovered || isDragging ? 'scale(1.15)' : 'scale(1)'}`,
        transition: isDragging ? 'none' : 'all 0.2s ease-out',
        opacity: isDragging ? 0.8 : 1,
        zIndex: isHovered || isDragging ? 20 : 1,
        cursor: 'move',
        boxShadow: isHovered || isDragging ? '0 8px 25px rgba(0, 0, 0, 0.15)' : 'none',
        // Prevent clicks from reaching items underneath when not hovered
        pointerEvents: isHovered || isDragging ? 'auto' : 'auto',
      }}
      onMouseDown={(e) => {
        // [NonDraggableDebug] Log that we reached the TimelineItem onMouseDown handler
        console.log('[NonDraggableDebug] 📍 TimelineItem onMouseDown FIRED:', {
          itemId: image.shotImageEntryId.substring(0, 8),
          framePosition,
          eventType: e.type,
          buttons: e.buttons,
          button: e.button,
          timestamp: Date.now()
        });

        // If clicking on a button area while hovered, don't start drag
        const target = e.target as HTMLElement;
        const isClickingButton = target.closest('button') || target.closest('[data-click-blocker]');
        
        console.log('[MagicEditClickIssue] 🖱️ MOUSEDOWN on timeline item:', {
          imageId: image.shotImageEntryId.substring(0, 8),
          framePosition,
          isHovered,
          isDragging,
          isClickingButton: !!isClickingButton,
          buttonClickedRecently: buttonClickedRef.current,
          targetTag: (e.target as HTMLElement).tagName,
          targetClass: (e.target as HTMLElement).className,
          currentTarget: e.currentTarget.getAttribute('data-item-id')?.substring(0, 8),
          timestamp: Date.now()
        });
        
        // Check both the DOM and the recent click flag
        if (isClickingButton || buttonClickedRef.current) {
          console.log('[NonDraggableDebug] 🛑 BLOCKED by button/blocker:', {
            itemId: image.shotImageEntryId.substring(0, 8),
            reason: isClickingButton ? 'DOM check' : 'Recent click flag'
          });
          console.log('[MagicEditClickIssue] ✋ BLOCKED - clicking button/blocker, preventing drag', {
            reason: isClickingButton ? 'DOM check' : 'Recent click flag'
          });
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        
        console.log('[NonDraggableDebug] ✅ CALLING onMouseDown handler:', {
          itemId: image.shotImageEntryId.substring(0, 8),
          hasHandler: typeof onMouseDown === 'function'
        });
        console.log('[MagicEditClickIssue] ✅ ALLOWING - calling onMouseDown for drag');
        onMouseDown(e, image.shotImageEntryId);
      }}
      onMouseEnter={() => {
        console.log('[MagicEditClickIssue] 🎯 MOUSE ENTER - hovering timeline item:', {
          imageId: image.shotImageEntryId.substring(0, 8),
          framePosition,
          timestamp: Date.now()
        });
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        console.log('[MagicEditClickIssue] 👋 MOUSE LEAVE - leaving timeline item:', {
          imageId: image.shotImageEntryId.substring(0, 8),
          framePosition,
          timestamp: Date.now()
        });
        setIsHovered(false);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.();
      }}
      className={isSwapTarget ? "ring-4 ring-primary/60" : ""}
    >
      <div className="flex flex-col items-center relative group">
        {/* Distance indicators on left/right */}
        {isDragging && dragDistances && (
          <>
            {dragDistances.distanceToPrev !== undefined && (
              <div
                className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full text-xs font-light px-1 py-0.5 rounded mr-1 ${
                  dragDistances.distanceToPrev > maxAllowedGap
                    ? 'bg-red-500/90 text-white'
                    : 'bg-primary/90 text-primary-foreground'
                }`}
    >
                {framesToSeconds(dragDistances.distanceToPrev)}
              </div>
            )}
            {dragDistances.distanceToNext !== undefined && (
              <div
                className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-full text-xs font-light px-1 py-0.5 rounded ml-1 ${
                  dragDistances.distanceToNext > maxAllowedGap
                    ? 'bg-red-500/90 text-white'
                    : 'bg-primary/90 text-primary-foreground'
                }`}
              >
                {framesToSeconds(dragDistances.distanceToNext)}
              </div>
            )}
          </>
        )}

        <div
          className={`relative border-2 ${isDragging ? "border-primary/50" : "border-primary"} rounded-lg overflow-hidden group`}
          style={{
            width: '120px', // Fixed width for consistent button positioning
            maxHeight: '120px', // Prevent tall portrait images from overflowing
            // Height controlled by aspectRatio for proper display
            transform: isHovered || isDragging ? 'scale(1.05)' : 'scale(1)',
            transition: isDragging ? 'none' : 'all 0.2s ease-out',
            ...aspectRatioStyle, // Apply aspect ratio to control height
          }}
        >
          <img
            ref={progressiveRef}
            src={shouldLoad ? displayImageUrl : '/placeholder.svg'}
            alt={`Time ${framesToSeconds(displayFrame)}`}
            className={cn(
              "w-full h-full object-cover transition-all duration-200",
              // Progressive loading visual states
              progressiveEnabled && isThumbShowing && "opacity-95",
              progressiveEnabled && isFullLoaded && "opacity-100"
            )}
            draggable={false}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            loading="lazy"
          />

          {/* Hover action buttons */}
          {!isDragging && (
            <>
              {/* Click blocker for Magic Edit Button to prevent timeline item clicks */}
              <div
                data-click-blocker="magic-edit"
                className="absolute bottom-0 left-0 h-12 w-12 z-[19]"
                onMouseDown={(e) => {
                  console.log('[MagicEditClickIssue] 🛡️ BLOCKER MOUSEDOWN triggered:', {
                    imageId: image.shotImageEntryId.substring(0, 8),
                    framePosition,
                    timestamp: Date.now()
                  });
                  buttonClickedRef.current = true;
                  e.preventDefault();
                  e.stopPropagation();
                  // REMOVED: e.nativeEvent.stopImmediatePropagation() - blocking modal overlay listeners
                  setTimeout(() => {
                    buttonClickedRef.current = false;
                  }, 100);
                }}
                onPointerDown={(e) => {
                  console.log('[MagicEditClickIssue] 🛡️ BLOCKER POINTERDOWN triggered:', {
                    imageId: image.shotImageEntryId.substring(0, 8),
                    framePosition,
                    timestamp: Date.now()
                  });
                  buttonClickedRef.current = true;
                  e.preventDefault();
                  e.stopPropagation();
                  // REMOVED: e.nativeEvent.stopImmediatePropagation() - blocking modal overlay listeners
                  setTimeout(() => {
                    buttonClickedRef.current = false;
                  }, 100);
                }}
                onClick={(e) => {
                  console.log('[MagicEditClickIssue] 🛡️ BLOCKER CLICK triggered:', {
                    imageId: image.shotImageEntryId.substring(0, 8),
                    framePosition,
                    timestamp: Date.now()
                  });
                  e.preventDefault();
                  e.stopPropagation();
                  // REMOVED: e.nativeEvent.stopImmediatePropagation() - blocking modal overlay listeners
                }}
              />
              {/* Magic Edit Button */}
              <Button
                variant="secondary"
                size="icon"
                className="absolute bottom-1 left-1 h-6 w-6 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20"
                onClick={handleMagicEditClick}
                onMouseDown={(e) => {
                  console.log('[MagicEditClickIssue] 🔘 BUTTON MOUSEDOWN:', {
                    imageId: image.shotImageEntryId.substring(0, 8),
                    framePosition,
                    timestamp: Date.now()
                  });
                  buttonClickedRef.current = true;
                  e.preventDefault();
                  e.stopPropagation();
                  // REMOVED: e.nativeEvent.stopImmediatePropagation() - blocking modal overlay listeners
                  setTimeout(() => {
                    buttonClickedRef.current = false;
                  }, 100);
                }}
                onPointerDown={(e) => {
                  console.log('[MagicEditClickIssue] 🔘 BUTTON POINTERDOWN:', {
                    imageId: image.shotImageEntryId.substring(0, 8),
                    framePosition,
                    timestamp: Date.now()
                  });
                  buttonClickedRef.current = true;
                  e.preventDefault();
                  e.stopPropagation();
                  // REMOVED: e.nativeEvent.stopImmediatePropagation() - blocking modal overlay listeners
                  setTimeout(() => {
                    buttonClickedRef.current = false;
                  }, 100);
                }}
                title="Magic Edit"
              >
                <Sparkles className="h-3 w-3" />
              </Button>

              {/* Duplicate Button */}
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-1 right-7 h-6 w-6 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20"
                onClick={handleDuplicateClick}
                onMouseDown={(e) => {
                  buttonClickedRef.current = true;
                  e.preventDefault();
                  e.stopPropagation();
                  // REMOVED: e.nativeEvent.stopImmediatePropagation() - can interfere with other event listeners
                  setTimeout(() => {
                    buttonClickedRef.current = false;
                  }, 100);
                }}
                onPointerDown={(e) => {
                  buttonClickedRef.current = true;
                  e.preventDefault();
                  e.stopPropagation();
                  // REMOVED: e.nativeEvent.stopImmediatePropagation() - can interfere with other event listeners
                  setTimeout(() => {
                    buttonClickedRef.current = false;
                  }, 100);
                }}
                disabled={duplicatingImageId === image.shotImageEntryId}
                title="Duplicate image"
              >
                {duplicatingImageId === image.shotImageEntryId ? (
                  <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-white"></div>
                ) : duplicateSuccessImageId === image.shotImageEntryId ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>

              {/* Delete Button */}
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 h-6 w-6 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20"
                onClick={handleDeleteClick}
                onMouseDown={(e) => {
                  buttonClickedRef.current = true;
                  e.preventDefault();
                  e.stopPropagation();
                  // REMOVED: e.nativeEvent.stopImmediatePropagation() - can interfere with other event listeners
                  setTimeout(() => {
                    buttonClickedRef.current = false;
                  }, 100);
                }}
                onPointerDown={(e) => {
                  buttonClickedRef.current = true;
                  e.preventDefault();
                  e.stopPropagation();
                  // REMOVED: e.nativeEvent.stopImmediatePropagation() - can interfere with other event listeners
                  setTimeout(() => {
                    buttonClickedRef.current = false;
                  }, 100);
                }}
                title="Remove from timeline"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}

          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] leading-none text-center py-0.5 pointer-events-none whitespace-nowrap overflow-hidden">
            <span className="inline-block">{framesToSeconds(displayFrame)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimelineItem; 