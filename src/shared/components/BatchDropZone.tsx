import React, { useRef, useCallback, useState, useEffect } from "react";
import { toast } from "sonner";
import { ImagePlus, FileUp, Loader2 } from "lucide-react";
import { getDragType, getGenerationDropData, type DragType } from "@/shared/lib/dragDrop";

// Skeleton component for pending drop items
const GridSkeletonItem: React.FC<{
  containerRef: React.RefObject<HTMLDivElement>;
  targetIndex: number;
  columns: number;
  projectAspectRatio?: string;
}> = ({ containerRef, targetIndex, columns, projectAspectRatio }) => {
  const [position, setPosition] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const items = containerRef.current.querySelectorAll('[data-sortable-item]');
    if (items.length === 0) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const firstItemRect = items[0].getBoundingClientRect();
    
    const gridOffsetX = firstItemRect.left - containerRect.left;
    const gridOffsetY = firstItemRect.top - containerRect.top;
    
    const itemWidth = firstItemRect.width;
    const itemHeight = firstItemRect.height;
    
    // Use the exact gap calculation logic from calculateDropIndex
    let gap = 12;
    if (items.length > 1) {
      const secondItemRect = items[1].getBoundingClientRect();
      // Check if on same row
      if (Math.abs(firstItemRect.top - secondItemRect.top) < 10) {
        gap = secondItemRect.left - firstItemRect.right;
      } else {
        gap = secondItemRect.top - firstItemRect.bottom;
      }
    }
    
    const row = Math.floor(targetIndex / columns);
    const col = targetIndex % columns;
    
    // Position based on grid layout logic
    const left = gridOffsetX + col * (itemWidth + gap);
    const top = gridOffsetY + row * (itemHeight + gap);

    setPosition({
      left,
      top,
      width: itemWidth,
      height: itemHeight,
    });
    
    console.log('[BatchDropZone] 🦴 Skeleton positioned at:', {
      targetIndex,
      row,
      col,
      left: gridOffsetX + col * (itemWidth + gap),
      top: gridOffsetY + row * (itemHeight + gap),
      width: itemWidth,
      height: itemHeight,
      firstItemRect: { width: firstItemRect.width, height: firstItemRect.height, top: firstItemRect.top, left: firstItemRect.left },
      containerRect: { top: containerRect.top, left: containerRect.left }
    });
  }, [containerRef, targetIndex, columns]);

  if (!position) return null;

  // Calculate aspect ratio
  let aspectRatioStyle: React.CSSProperties = { aspectRatio: '1' };
  if (projectAspectRatio) {
    const [w, h] = projectAspectRatio.split(':').map(Number);
    if (!isNaN(w) && !isNaN(h)) {
      aspectRatioStyle = { aspectRatio: `${w / h}` };
    }
  }

  return (
    <div
      className="absolute pointer-events-none z-[100]"
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`,
        width: `${position.width}px`,
        height: `${position.height}px`,
      }}
    >
      <div 
        className="w-full h-full border-2 border-primary/50 rounded-lg overflow-hidden bg-muted/80 backdrop-blur-sm flex items-center justify-center shadow-lg"
        style={aspectRatioStyle}
      >
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    </div>
  );
};


interface BatchDropZoneProps {
  children: React.ReactNode | ((isDragging: boolean, dropTargetIndex: number | null) => React.ReactNode);
  onImageDrop?: (files: File[], targetPosition?: number, framePosition?: number) => Promise<void>;
  onGenerationDrop?: (generationId: string, imageUrl: string, thumbUrl: string | undefined, targetPosition?: number, framePosition?: number) => Promise<void>;
  columns: number;
  itemCount: number;
  className?: string;
  disabled?: boolean;
  // Function to calculate frame position for a given index based on surrounding images
  getFramePositionForIndex?: (index: number) => number | undefined;
  // Project aspect ratio for skeleton sizing
  projectAspectRatio?: string;
}

/**
 * Calculate grid drop position from mouse coordinates
 * Returns the index where the item should be inserted
 */
function calculateDropIndex(
  e: React.DragEvent,
  containerRef: React.RefObject<HTMLDivElement>,
  columns: number,
  itemCount: number
): number | null {
  if (!containerRef.current) return null;
  
  // Find actual grid items to get accurate positioning
  const items = containerRef.current.querySelectorAll('[data-sortable-item]');
  
  if (items.length === 0) return 0;
  
  const firstItemRect = items[0].getBoundingClientRect();
  const containerRect = containerRef.current.getBoundingClientRect();
  
  // Calculate the offset of the grid from the container
  const gridOffsetX = firstItemRect.left - containerRect.left;
  const gridOffsetY = firstItemRect.top - containerRect.top;
  
  // Get item dimensions
  const itemWidth = firstItemRect.width;
  const itemHeight = firstItemRect.height;
  
  // Calculate gap by looking at second item if available
  let gap = 12; // default
  if (items.length > 1) {
    const secondItemRect = items[1].getBoundingClientRect();
    // Check if on same row
    if (Math.abs(firstItemRect.top - secondItemRect.top) < 10) {
      gap = secondItemRect.left - firstItemRect.right;
    } else {
      gap = secondItemRect.top - firstItemRect.bottom;
    }
  }
  
  // Calculate mouse position relative to grid start
  const relativeX = e.clientX - containerRect.left - gridOffsetX;
  const relativeY = e.clientY - containerRect.top - gridOffsetY;
  
  // Calculate column and row using round for nearest vertical gap
  const totalItemWidth = itemWidth + gap;
  const totalItemHeight = itemHeight + gap;
  
  const column = Math.max(0, Math.min(Math.round(relativeX / totalItemWidth), columns));
  const row = Math.max(0, Math.floor(relativeY / totalItemHeight));
  
  // Calculate target index
  let targetIndex = row * columns + column;
  
  // Clamp to valid range (can insert at end, which is itemCount)
  return Math.max(0, Math.min(targetIndex, itemCount));
}

/**
 * Drop zone wrapper for batch mode grid layouts
 * Handles both file drops and generation drops with visual feedback
 * Calculates position at DROP TIME to avoid stale state issues
 */
const BatchDropZone: React.FC<BatchDropZoneProps> = ({
  children,
  onImageDrop,
  onGenerationDrop,
  columns,
  itemCount,
  className = "",
  disabled = false,
  getFramePositionForIndex,
  projectAspectRatio,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [dragType, setDragType] = useState<DragType>('none');
  
  // Pending drop state for optimistic skeleton
  const [pendingDropIndex, setPendingDropIndex] = useState<number | null>(null);
  const [isProcessingDrop, setIsProcessingDrop] = useState(false);
  const prevItemCountRef = useRef(itemCount);
  
  // Clear pending skeleton when item count increases (new item appeared)
  useEffect(() => {
    if (pendingDropIndex !== null && itemCount > prevItemCountRef.current) {
      console.log('[BatchDropZone] ✨ Item count increased, clearing skeleton');
      // Clear immediately to prevent overlaying the new item
      setPendingDropIndex(null);
    }
    prevItemCountRef.current = itemCount;
  }, [itemCount, pendingDropIndex]);
  
  // Safety timeout for pending skeleton
  useEffect(() => {
    if (pendingDropIndex !== null) {
      const timer = setTimeout(() => {
        setPendingDropIndex(null);
        setIsProcessingDrop(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [pendingDropIndex]);

  // Handle drag enter
  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('[BatchDropZone] 🚀 handleDragEnter:', {
      disabled,
      hasOnImageDrop: !!onImageDrop,
      hasOnGenerationDrop: !!onGenerationDrop,
      timestamp: Date.now()
    });
    
    if (disabled) {
      console.log('[BatchDropZone] ⛔ Disabled - returning early');
      return;
    }
    
    const type = getDragType(e);
    console.log('[BatchDropZone] 🔍 getDragType result:', type);
    
    if ((type === 'file' && onImageDrop) || (type === 'generation' && onGenerationDrop)) {
      setDragType(type);
    }
  }, [disabled, onImageDrop, onGenerationDrop]);

  // Handle drag over - update indicator position
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }

    const type = getDragType(e);
    if ((type === 'file' && onImageDrop) || (type === 'generation' && onGenerationDrop)) {
      const targetIndex = calculateDropIndex(e, containerRef, columns, itemCount);
      setDropTargetIndex(targetIndex);
      setDragType(type);
      e.dataTransfer.dropEffect = 'copy';
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
  }, [columns, itemCount, disabled, onImageDrop, onGenerationDrop]);

  // Handle drag leave
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only clear state if we're actually leaving the container
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    
    setDropTargetIndex(null);
    setDragType('none');
  }, []);

  // Handle drop - CALCULATE POSITION AT DROP TIME, not from state
  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('[BatchDropZone] 💥 handleDrop CALLED:', {
      disabled,
      hasOnImageDrop: !!onImageDrop,
      hasOnGenerationDrop: !!onGenerationDrop,
      timestamp: Date.now()
    });
    
    if (disabled) {
      console.log('[BatchDropZone] ⛔ Disabled - returning early from drop');
      return;
    }
    
    const type = getDragType(e);
    console.log('[BatchDropZone] 🔍 Drop type:', type);
    
    // CRITICAL: Calculate position at drop time, not from stale state
    const targetPosition = calculateDropIndex(e, containerRef, columns, itemCount);
    
    // Calculate frame position based on surrounding images
    const framePosition = targetPosition !== null && getFramePositionForIndex 
      ? getFramePositionForIndex(targetPosition) 
      : undefined;
    
    // Clear visual drop indicator state
    setDropTargetIndex(null);
    setDragType('none');
    
    // Show optimistic skeleton at drop position
    if (targetPosition !== null) {
      console.log('[BatchDropZone] 🦴 Setting pending drop skeleton at index:', targetPosition);
      setPendingDropIndex(targetPosition);
      setIsProcessingDrop(true);
    }
    
    // Handle file drops
    if (type === 'file' && onImageDrop) {
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) {
        setPendingDropIndex(null);
        setIsProcessingDrop(false);
        return;
      }
      
      const validImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      const validFiles = files.filter(file => {
        if (validImageTypes.includes(file.type)) {
          return true;
        }
        toast.error(`Invalid file type for ${file.name}. Only JPEG, PNG, and WebP are supported.`);
        return false;
      });

      if (validFiles.length === 0) {
        setPendingDropIndex(null);
        setIsProcessingDrop(false);
        return;
      }

      try {
        await onImageDrop(validFiles, targetPosition ?? undefined, framePosition);
      } catch (error) {
        console.error('[BatchDropZone] File drop error:', error);
        toast.error(`Failed to add images: ${(error as Error).message}`);
        setPendingDropIndex(null);
      } finally {
        setIsProcessingDrop(false);
      }
    }
    
    // Handle generation drops
    else if (type === 'generation' && onGenerationDrop) {
      const data = getGenerationDropData(e);
      if (!data) {
        setPendingDropIndex(null);
        setIsProcessingDrop(false);
        return;
      }
      
      try {
        await onGenerationDrop(data.generationId, data.imageUrl, data.thumbUrl, targetPosition ?? undefined, framePosition);
      } catch (error) {
        console.error('[BatchDropZone] Generation drop error:', error);
        toast.error(`Failed to add generation: ${(error as Error).message}`);
        setPendingDropIndex(null);
      } finally {
        setIsProcessingDrop(false);
      }
    } else {
      // No handler matched, clear pending state
      setPendingDropIndex(null);
      setIsProcessingDrop(false);
    }
  }, [columns, itemCount, disabled, onImageDrop, onGenerationDrop, getFramePositionForIndex]);

  if (disabled) {
    // Handle function children even when disabled
    return <>{typeof children === 'function' ? children(false, null) : children}</>;
  }

  const isOver = dragType !== 'none';

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Render children (support function for render prop pattern) */}
      {typeof children === 'function' ? children(isOver, dropTargetIndex) : children}

      {/* Optimistic skeleton for pending drop - Rendered AFTER children to ensure visibility */}
      {pendingDropIndex !== null && (
        <GridSkeletonItem
          containerRef={containerRef}
          targetIndex={pendingDropIndex}
          columns={columns}
          projectAspectRatio={projectAspectRatio}
        />
      )}

      {/* Insertion line indicator - shows between images */}
      {isOver && dropTargetIndex !== null && (() => {
        const containerElement = containerRef.current;
        if (!containerElement) return null;
        
        // Get all sortable items directly from container
        const items = containerElement.querySelectorAll('[data-sortable-item]');
        if (items.length === 0) return null;
        
        const containerRect = containerElement.getBoundingClientRect();
        const firstItemRect = items[0].getBoundingClientRect();
        const itemHeight = firstItemRect.height;
        
        // Calculate grid offset
        const gridOffsetX = firstItemRect.left - containerRect.left;
        const gridOffsetY = firstItemRect.top - containerRect.top;
        
        // Calculate gap
        let gap = 12;
        if (items.length > 1) {
          const secondItemRect = items[1].getBoundingClientRect();
          if (Math.abs(firstItemRect.top - secondItemRect.top) < 10) {
            gap = secondItemRect.left - firstItemRect.right;
          }
        }
        
        const itemWidth = firstItemRect.width;
        const row = Math.floor(dropTargetIndex / columns);
        const col = dropTargetIndex % columns;
        
        // Calculate position for insertion line relative to grid
        const leftPosition = col * (itemWidth + gap);
        const topPosition = row * (itemHeight + gap);
        
        // Adjust to be in the middle of the gap (or at left edge for col 0)
        let finalLeft: number;
        if (col === 0) {
          finalLeft = gridOffsetX - 2; // At left edge of first item
        } else {
          finalLeft = gridOffsetX + leftPosition - (gap / 2) - 2;
        }

        return (
          <div 
            className="absolute pointer-events-none"
            style={{
              left: `${finalLeft}px`,
              top: `${gridOffsetY + topPosition}px`,
              width: '4px',
              height: `${itemHeight}px`,
              zIndex: 100,
            }}
          >
            {/* Vertical insertion line */}
            <div className="w-full h-full bg-primary shadow-lg rounded-full flex flex-col items-center justify-center">
              {/* Top dot */}
              <div className="w-3 h-3 bg-primary rounded-full border-2 border-primary-foreground mb-auto" />
              {/* Middle indicator with icon badge */}
              <div className="flex items-center gap-1.5 bg-background border-2 border-primary text-foreground text-xs px-2 py-1 rounded-md shadow-[-2px_2px_0_0_rgba(0,0,0,0.1)] font-medium whitespace-nowrap" style={{ zIndex: 10 }}>
                <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                  {dragType === 'file' ? (
                    <FileUp className="h-3 w-3 text-primary-foreground" />
                  ) : (
                    <ImagePlus className="h-3 w-3 text-primary-foreground" />
                  )}
                </div>
              </div>
              {/* Bottom dot */}
              <div className="w-3 h-3 bg-primary rounded-full border-2 border-primary-foreground mt-auto" />
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default BatchDropZone;
