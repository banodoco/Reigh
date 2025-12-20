import React, { useRef, useState } from "react";
import { GenerationRow } from "@/types/shots";
import { getDisplayUrl, cn } from "@/shared/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { Trash2, Copy, Check, Pencil } from "lucide-react";
import { useProgressiveImage } from "@/shared/hooks/useProgressiveImage";
import { isProgressiveLoadingEnabled } from "@/shared/settings/progressiveLoading";
import { useDoubleTapWithSelection } from "@/shared/hooks/useDoubleTapWithSelection";
import { framesToSeconds } from "./utils/time-utils";
import { TIMELINE_HORIZONTAL_PADDING, TIMELINE_IMAGE_HALF_WIDTH, TIMELINE_PADDING_OFFSET } from "./constants";

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
  onInpaintClick?: () => void;
  duplicatingImageId?: string;
  duplicateSuccessImageId?: string;
  projectAspectRatio?: string;
  // Read-only mode - hides all action buttons
  readOnly?: boolean;
  // Tap-to-move state (for tablets)
  isSelectedForMove?: boolean;
  onTapToMove?: () => void;
  // Just-dropped effect - shows temporary hover state
  isJustDropped?: boolean;
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
  onInpaintClick,
  duplicatingImageId,
  duplicateSuccessImageId,
  projectAspectRatio = undefined,
  readOnly = false,
  isSelectedForMove = false,
  onTapToMove,
  isJustDropped = false,
}) => {
  // [ShotNavPerf] Log when TimelineItem mounts/updates
  React.useEffect(() => {
    console.log('[ShotNavPerf] 🖼️ TimelineItem MOUNTED/UPDATED', {
      imageId: image.id?.substring(0, 8),
      framePosition,
      hasImageUrl: !!image.imageUrl,
      timestamp: Date.now()
    });
  }, [image.id, framePosition, image.imageUrl]);
  
  // Track hover state
  const [isHovered, setIsHovered] = useState(false);
  
  // Track "just dropped" visual effect - auto-clears after animation
  const [showDropEffect, setShowDropEffect] = useState(false);
  
  React.useEffect(() => {
    if (isJustDropped) {
      setShowDropEffect(true);
      // Clear the effect after 800ms (enough time for visual feedback)
      const timer = setTimeout(() => {
        setShowDropEffect(false);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isJustDropped]);
  
  // Combined "elevated" state: actual hover OR just-dropped effect (unless actually hovering takes over)
  const isElevated = isHovered || showDropEffect || isDragging || isSelectedForMove;
  
  // Track if we just clicked a button to prevent drag from starting
  const buttonClickedRef = useRef(false);
  
  // imageKey is the shot_generations.id - unique per entry in the shot
  // (Previously used shotImageEntryId fallback, but now id IS the shot entry ID)
  const imageKey = image.id;

  // ===== MOBILE TAP HANDLING =====
  // Use generalized double-tap hook for iPad/mobile interaction
  // Single tap → toggles selection, Double tap → opens lightbox
  const { handleTouchStart, handleTouchEnd } = useDoubleTapWithSelection({
    onSingleTap: () => {
      console.log('[DoubleTapFlow] 🎬 SINGLE TAP CALLBACK - TimelineItem:', {
        itemId: imageKey?.substring(0, 8),
        hasTapToMove: !!onTapToMove,
        hasMobileTap: !!onMobileTap,
        readOnly
      });
      
      // Prefer tap-to-move on tablets, fall back to lightbox on phones
      if (onTapToMove) {
        console.log('[DoubleTapFlow] 🎯 Calling onTapToMove (tablet selection)');
        onTapToMove();
      } else if (onMobileTap) {
        console.log('[DoubleTapFlow] 📱 Calling onMobileTap (phone lightbox)');
        // On phones without tap-to-move, single tap opens lightbox
        onMobileTap();
      } else {
        console.log('[DoubleTapFlow] ⚠️ No handlers available for single tap!');
      }
    },
    onDoubleTap: () => {
      console.log('[DoubleTapFlow] 🎬 DOUBLE TAP CALLBACK - TimelineItem:', {
        itemId: imageKey?.substring(0, 8),
        hasMobileTap: !!onMobileTap,
        readOnly
      });
      
      // Double-tap always opens lightbox if available
      if (onMobileTap) {
        console.log('[DoubleTapFlow] 🚀 Calling onMobileTap to open lightbox');
        onMobileTap();
      } else {
        console.log('[DoubleTapFlow] ⚠️ No onMobileTap handler for double-tap!');
      }
    },
    itemId: imageKey,
    disabled: readOnly,
  });

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

  // Action handlers
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    if (onDelete) {
      // Use id (shot_generations.id) - unique per entry
      onDelete(image.id);
    }
  };

  const handleDuplicateClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    if (onDuplicate) {
      console.log('[DUPLICATE_DEBUG] 🖱️ TIMELINE ITEM - DUPLICATE CLICK:', {
        id: image.id.substring(0, 8), // shot_generations.id
        generation_id: image.generation_id?.substring(0, 8),
        framePosition_from_timeline: framePosition,
        timeline_frame_from_image: (image as any).timeline_frame,
        mismatch: framePosition !== (image as any).timeline_frame ? 'POSITION_MISMATCH!' : 'positions_match'
      });
      // Use id (shot_generations.id) - unique per entry
      onDuplicate(image.id, framePosition);
    }
  };
  // Calculate position as pixel offset with padding adjustment
  // Use constants to ensure consistency across all timeline components
  const effectiveWidth = timelineWidth - (TIMELINE_PADDING_OFFSET * 2); // Subtract both left and right padding
  const pixelPosition = TIMELINE_PADDING_OFFSET + ((framePosition - fullMinFrames) / fullRange) * effectiveWidth;

  // [Position0Debug] Only log position 0 items to reduce noise
  if (framePosition === 0) {
    console.log(`[Position0Debug] 📍 POSITION 0 Item ${imageKey?.substring(0, 8)} position calculation:`, {
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
    const originalPixel = TIMELINE_PADDING_OFFSET + ((originalFramePos - fullMinFrames) / fullRange) * effectiveWidth;
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
      data-item-id={imageKey}
      style={{
        position: 'absolute',
        left: `${leftPercent}%`,
        top: '50%',
        transform: `translate(-50%, -50%) ${isElevated ? 'scale(1.15)' : 'scale(1)'}`,
        // Only transition transform/opacity/box-shadow, NOT position (left) - prevents visual jitter when coordinate system recalculates
        transition: isDragging ? 'none' : 'transform 0.2s ease-out, opacity 0.2s ease-out, box-shadow 0.2s ease-out',
        opacity: isDragging ? 0.8 : 1,
        zIndex: isElevated ? 20 : 1,
        cursor: isSelectedForMove ? 'pointer' : 'move',
        boxShadow: isSelectedForMove 
          ? '0 0 0 3px rgba(59, 130, 246, 0.5), 0 8px 25px rgba(59, 130, 246, 0.3)' 
          : (isElevated ? '0 8px 25px rgba(0, 0, 0, 0.15)' : 'none'),
        // Prevent clicks from reaching items underneath when not hovered
        pointerEvents: isElevated ? 'auto' : 'auto',
      }}
      onMouseDown={(e) => {
        // [NonDraggableDebug] Log that we reached the TimelineItem onMouseDown handler
        console.log('[NonDraggableDebug] 📍 TimelineItem onMouseDown FIRED:', {
          itemId: imageKey?.substring(0, 8),
          framePosition,
          eventType: e.type,
          buttons: e.buttons,
          button: e.button,
          timestamp: Date.now()
        });

        // If clicking on a button area while hovered, don't start drag
        const target = e.target as HTMLElement;
        const isClickingButton = target.closest('button') || target.closest('[data-click-blocker]');
        
        console.log('[TimelineItem] 🖱️ MOUSEDOWN on timeline item:', {
          imageId: imageKey?.substring(0, 8),
          framePosition,
          isHovered,
          isDragging,
          isClickingButton: !!isClickingButton,
          buttonClickedRecently: buttonClickedRef.current,
          timestamp: Date.now()
        });
        
        // Check both the DOM and the recent click flag
        if (isClickingButton || buttonClickedRef.current) {
          console.log('[TimelineItem] 🛑 BLOCKED by button/blocker:', {
            itemId: imageKey?.substring(0, 8),
            reason: isClickingButton ? 'DOM check' : 'Recent click flag'
          });
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        
        console.log('[TimelineItem] ✅ CALLING onMouseDown handler:', {
          itemId: imageKey?.substring(0, 8),
          hasHandler: typeof onMouseDown === 'function'
        });
        onMouseDown(e, imageKey);
      }}
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.();
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
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
            transform: isElevated ? 'scale(1.05)' : 'scale(1)',
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
            loading="lazy"
          />

          {/* Selected for move indicator (tablet tap-to-move) */}
          {isSelectedForMove && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <div className="bg-blue-500 text-white px-2 py-0.5 rounded text-[10px] font-medium shadow-md">
                Tap timeline to place
              </div>
            </div>
          )}

          {/* Hover action buttons */}
          {!isDragging && !readOnly && (
            <>
              {/* Click blocker for Edit Button to prevent timeline item clicks */}
              {onInpaintClick && (
                <div
                  data-click-blocker="edit-button"
                  className="absolute bottom-0 left-0 h-7 w-7 z-[19]"
                  onMouseDown={(e) => {
                    buttonClickedRef.current = true;
                    e.preventDefault();
                    e.stopPropagation();
                    setTimeout(() => {
                      buttonClickedRef.current = false;
                    }, 100);
                  }}
                  onPointerDown={(e) => {
                    buttonClickedRef.current = true;
                    e.preventDefault();
                    e.stopPropagation();
                    setTimeout(() => {
                      buttonClickedRef.current = false;
                    }, 100);
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                />
              )}
              {/* Edit Button - Opens lightbox in edit mode (matches ShotEditor pattern) */}
              {onInpaintClick && (
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute bottom-1 left-1 h-5 w-5 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                    onInpaintClick();
                  }}
                  onMouseDown={(e) => {
                    buttonClickedRef.current = true;
                    e.preventDefault();
                    e.stopPropagation();
                    setTimeout(() => {
                      buttonClickedRef.current = false;
                    }, 100);
                  }}
                  onPointerDown={(e) => {
                    buttonClickedRef.current = true;
                    e.preventDefault();
                    e.stopPropagation();
                    setTimeout(() => {
                      buttonClickedRef.current = false;
                    }, 100);
                  }}
                  onTouchStart={(e) => {
                    // Prevent touch events from bubbling to parent's double-tap handler
                    e.stopPropagation();
                  }}
                  onTouchEnd={(e) => {
                    // Prevent touch events from bubbling to parent's double-tap handler
                    e.stopPropagation();
                  }}
                  title="Edit image"
                >
                  <Pencil className="!h-3 !w-3" />
                </Button>
              )}

              {/* Duplicate Button */}
              {/* Variant Count - top left */}
              {(image as any).derivedCount && (image as any).derivedCount > 1 && (
                <div 
                  className="absolute top-1 left-1 h-5 w-5 rounded-full bg-black/60 text-white text-[9px] font-medium flex items-center justify-center backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none"
                  title={`${(image as any).derivedCount} variants`}
                >
                  {(image as any).derivedCount}
                </div>
              )}
              
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-1 right-[1.65rem] h-5 w-5 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20"
                onClick={handleDuplicateClick}
                onMouseDown={(e) => {
                  buttonClickedRef.current = true;
                  e.preventDefault();
                  e.stopPropagation();
                  setTimeout(() => {
                    buttonClickedRef.current = false;
                  }, 100);
                }}
                onPointerDown={(e) => {
                  buttonClickedRef.current = true;
                  e.preventDefault();
                  e.stopPropagation();
                  setTimeout(() => {
                    buttonClickedRef.current = false;
                  }, 100);
                }}
                onTouchStart={(e) => {
                  // Prevent touch events from bubbling to parent's double-tap handler
                  e.stopPropagation();
                }}
                onTouchEnd={(e) => {
                  // Prevent touch events from bubbling to parent's double-tap handler
                  e.stopPropagation();
                }}
                disabled={duplicatingImageId === imageKey}
                title="Duplicate image"
              >
                {duplicatingImageId === imageKey ? (
                  <div className="!h-3 !w-3 animate-spin rounded-full border-b-2 border-white"></div>
                ) : duplicateSuccessImageId === imageKey ? (
                  <Check className="!h-3 !w-3" />
                ) : (
                  <Copy className="!h-3 !w-3" />
                )}
              </Button>

              {/* Delete Button */}
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 h-5 w-5 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20"
                onClick={handleDeleteClick}
                onMouseDown={(e) => {
                  buttonClickedRef.current = true;
                  e.preventDefault();
                  e.stopPropagation();
                  setTimeout(() => {
                    buttonClickedRef.current = false;
                  }, 100);
                }}
                onPointerDown={(e) => {
                  buttonClickedRef.current = true;
                  e.preventDefault();
                  e.stopPropagation();
                  setTimeout(() => {
                    buttonClickedRef.current = false;
                  }, 100);
                }}
                onTouchStart={(e) => {
                  // Prevent touch events from bubbling to parent's double-tap handler
                  e.stopPropagation();
                }}
                onTouchEnd={(e) => {
                  // Prevent touch events from bubbling to parent's double-tap handler
                  e.stopPropagation();
                }}
                title="Remove from timeline"
              >
                <Trash2 className="!h-3 !w-3" />
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

// 🎯 PERF FIX: Wrap in React.memo to prevent re-renders when props haven't changed
// TimelineItem is rendered for each image, so memoization is important for performance
export default React.memo(TimelineItem); 