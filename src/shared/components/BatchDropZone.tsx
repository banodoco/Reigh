import React, { useRef, useCallback, useState } from "react";
import { toast } from "sonner";

export type DragType = 'file' | 'generation' | 'none';


interface BatchDropZoneProps {
  children: React.ReactNode;
  onImageDrop?: (files: File[], targetPosition?: number, framePosition?: number) => Promise<void>;
  onGenerationDrop?: (generationId: string, imageUrl: string, thumbUrl: string | undefined, targetPosition?: number, framePosition?: number) => Promise<void>;
  columns: number;
  itemCount: number;
  className?: string;
  disabled?: boolean;
  // Function to calculate frame position for a given index based on surrounding images
  getFramePositionForIndex?: (index: number) => number | undefined;
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
 * Detect the type of item being dragged
 */
function getDragType(e: React.DragEvent): DragType {
  const types = Array.from(e.dataTransfer.types);
  
  // Check for generation data first (more specific)
  if (types.includes('application/x-generation')) {
    return 'generation';
  }
  
  // Check for files
  if (types.includes('Files')) {
    return 'file';
  }
  
  return 'none';
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [dragType, setDragType] = useState<DragType>('none');

  // Handle drag enter
  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (disabled) return;
    
    const type = getDragType(e);
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
    
    if (disabled) return;
    
    const type = getDragType(e);
    
    // CRITICAL: Calculate position at drop time, not from stale state
    const targetPosition = calculateDropIndex(e, containerRef, columns, itemCount);
    
    // Calculate frame position based on surrounding images
    const framePosition = targetPosition !== null && getFramePositionForIndex 
      ? getFramePositionForIndex(targetPosition) 
      : undefined;
    
    // Clear visual state
    setDropTargetIndex(null);
    setDragType('none');
    
    // Handle file drops
    if (type === 'file' && onImageDrop) {
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;
      
      const validImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      const validFiles = files.filter(file => {
        if (validImageTypes.includes(file.type)) {
          return true;
        }
        toast.error(`Invalid file type for ${file.name}. Only JPEG, PNG, and WebP are supported.`);
        return false;
      });

      if (validFiles.length === 0) return;

      try {
        await onImageDrop(validFiles, targetPosition ?? undefined, framePosition);
      } catch (error) {
        console.error('[BatchDropZone] File drop error:', error);
        toast.error(`Failed to add images: ${(error as Error).message}`);
      }
    }
    
    // Handle generation drops
    else if (type === 'generation' && onGenerationDrop) {
      try {
        const dataString = e.dataTransfer.getData('application/x-generation');
        if (!dataString) return;
        
        const data = JSON.parse(dataString);
        await onGenerationDrop(data.generationId, data.imageUrl, data.thumbUrl, targetPosition ?? undefined, framePosition);
      } catch (error) {
        console.error('[BatchDropZone] Generation drop error:', error);
        toast.error(`Failed to add generation: ${(error as Error).message}`);
      }
    }
  }, [columns, itemCount, disabled, onImageDrop, onGenerationDrop, getFramePositionForIndex]);

  if (disabled) {
    return <>{children}</>;
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
      {/* Render children with drop indicator */}
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return (
            <>
              {child}
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
                      {/* Middle indicator */}
                      <div className="bg-primary text-primary-foreground text-xs px-2 py-1 rounded-md shadow-lg font-medium whitespace-nowrap" style={{ marginLeft: '12px' }}>
                        {dragType === 'file' ? '📁' : '🖼️'}
                      </div>
                      {/* Bottom dot */}
                      <div className="w-3 h-3 bg-primary rounded-full border-2 border-primary-foreground mt-auto" />
                    </div>
                  </div>
                );
              })()}
            </>
          );
        }
        return child;
      })}
    </div>
  );
};

export default BatchDropZone;
