import React, { useRef, useCallback, useState } from "react";
import { useUnifiedDrop } from "@/tools/travel-between-images/components/Timeline/hooks/useUnifiedDrop";
import { calculateGridDropPosition } from "@/tools/travel-between-images/components/Timeline/utils/grid-position-utils";
import DropSlotIndicator from "./DropSlotIndicator";

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
 * Drop zone wrapper for batch mode grid layouts
 * Handles both file drops and generation drops with visual feedback
 * Reuses the unified drop logic from Timeline
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
  const gridRef = useRef<HTMLDivElement>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  // Wrapper functions that convert grid index to position parameter
  const handleImageDropWithPosition = useCallback(
    async (files: File[], _targetFrame?: number) => {
      if (!onImageDrop) return;
      
      // Use the dropTargetIndex captured during drag over
      const targetPosition = dropTargetIndex ?? undefined;
      
      // Calculate frame position based on surrounding images
      const framePosition = dropTargetIndex !== null && getFramePositionForIndex 
        ? getFramePositionForIndex(dropTargetIndex) 
        : undefined;
      
      });
      
      await onImageDrop(files, targetPosition, framePosition);
    },
    [onImageDrop, dropTargetIndex, getFramePositionForIndex]
  );

  const handleGenerationDropWithPosition = useCallback(
    async (generationId: string, imageUrl: string, thumbUrl: string | undefined, _targetFrame?: number) => {
      if (!onGenerationDrop) return;
      
      // Use the dropTargetIndex captured during drag over
      const targetPosition = dropTargetIndex ?? undefined;
      
      // Calculate frame position based on surrounding images
      const framePosition = dropTargetIndex !== null && getFramePositionForIndex 
        ? getFramePositionForIndex(dropTargetIndex) 
        : undefined;
      
      ,
        targetPosition,
        framePosition,
        dropTargetIndex,
        hasFrameCalculator: !!getFramePositionForIndex,
        timestamp: Date.now()
      });
      
      await onGenerationDrop(generationId, imageUrl, thumbUrl, targetPosition, framePosition);
    },
    [onGenerationDrop, dropTargetIndex, getFramePositionForIndex]
  );

  // Custom drag over handler that calculates grid position
  const handleDragOverCustom = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      if (disabled || !containerRef.current) {
        setDropTargetIndex(null);
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const targetIndex = calculateGridDropPosition(
        e.clientX,
        e.clientY,
        rect,
        columns,
        itemCount
      );

      setDropTargetIndex(targetIndex);
      e.dataTransfer.dropEffect = 'copy';
    },
    [columns, itemCount, disabled]
  );

  const handleDragLeaveCustom = useCallback(() => {
    setDropTargetIndex(null);
  }, []);

  const handleDropCustom = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Let the unified drop hook handle the actual drop
    // but reset our visual state
    setDropTargetIndex(null);
  }, []);

  // Use unified drop hook for detection and handling
  const {
    isFileOver,
    dragType,
    handleDragEnter,
    handleDrop,
  } = useUnifiedDrop({
    onImageDrop: handleImageDropWithPosition,
    onGenerationDrop: handleGenerationDropWithPosition,
    fullMin: 0,
    fullRange: itemCount || 1, // Dummy values since we're not using frame-based positioning
  });

  if (disabled) {
    return <>{children}</>;
  }

  // Calculate actual item dimensions from grid
  const getItemDimensions = useCallback(() => {
    if (!gridRef.current) return { width: 200, height: 200, gap: 12 };
    
    const gridElement = gridRef.current;
    const firstItem = gridElement.querySelector('[data-sortable-item]') as HTMLElement;
    
    if (firstItem) {
      const rect = firstItem.getBoundingClientRect();
      const style = window.getComputedStyle(gridElement);
      const gap = parseInt(style.gap) || 12;
      
      return {
        width: rect.width,
        height: rect.height,
        gap
      };
    }
    
    // Fallback dimensions
    return { width: 200, height: 200, gap: 12 };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOverCustom}
      onDragLeave={handleDragLeaveCustom}
      onDrop={(e) => {
        handleDropCustom(e);
        handleDrop(e);
      }}
    >
      {/* Clone children to inject grid ref and indicator */}
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          // Clone the DndContext and pass through to find the grid
          const clonedChild = React.cloneElement(child as React.ReactElement<any>, {
            children: React.Children.map((child as React.ReactElement<any>).props.children, (grandChild: React.ReactNode) => {
              // Find the SortableContext
              if (React.isValidElement(grandChild)) {
                return React.cloneElement(grandChild as React.ReactElement<any>, {
                  children: React.Children.map((grandChild as React.ReactElement<any>).props.children, (ggChild: React.ReactNode) => {
                    // Find the actual grid div
                    if (React.isValidElement(ggChild) && (ggChild as any).type === 'div') {
                      return React.cloneElement(ggChild as React.ReactElement<any>, {
                        ref: gridRef
                      });
                    }
                    return ggChild;
                  })
                });
              }
              return grandChild;
            })
          });
          
          return (
            <>
              {clonedChild}
              {/* Insertion line indicator - shows between images */}
              {isFileOver && dropTargetIndex !== null && (() => {
                const dims = getItemDimensions();
                const row = Math.floor(dropTargetIndex / columns);
                const col = dropTargetIndex % columns;
                
                // Calculate position for insertion line
                // Show line on the left edge of where the new item will be inserted
                const leftPosition = col * ((dims.width + dims.gap));
                const topPosition = row * (dims.height + dims.gap);
                
                // Adjust to be in the middle of the gap
                const finalLeft = leftPosition - (dims.gap / 2) - 2; // 2px is half of indicator width
                
                // Don't show indicator outside the grid on the left
                if (col === 0 && finalLeft < 0) {
                  // Adjust for first column if needed
                }

                return (
                  <div 
                    className="absolute pointer-events-none"
                    style={{
                      left: `${finalLeft}px`,
                      top: `${topPosition}px`,
                      width: '4px',
                      height: `${dims.height}px`,
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

