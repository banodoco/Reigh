import React, { useRef } from "react";

export interface ToolTypeFilterProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  toolTypeName: string;
  whiteText?: boolean;
  isMobile?: boolean;
}

export const ToolTypeFilter: React.FC<ToolTypeFilterProps> = ({
  enabled,
  onToggle,
  toolTypeName,
  whiteText = false,
  isMobile = false,
}) => {
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    isDragging.current = false;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragStartPos.current) {
      const deltaX = Math.abs(e.clientX - dragStartPos.current.x);
      const deltaY = Math.abs(e.clientY - dragStartPos.current.y);
      // Consider it a drag if moved more than 5px in any direction
      if (deltaX > 5 || deltaY > 5) {
        isDragging.current = true;
      }
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    dragStartPos.current = { x: touch.clientX, y: touch.clientY };
    isDragging.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragStartPos.current && e.touches.length > 0) {
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - dragStartPos.current.x);
      const deltaY = Math.abs(touch.clientY - dragStartPos.current.y);
      // Consider it a drag if moved more than 5px in any direction
      if (deltaX > 5 || deltaY > 5) {
        isDragging.current = true;
      }
    }
  };

  const handleClick = (value: boolean) => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    // Only trigger if it wasn't a drag
    if (!isDragging.current) {
      onToggle(value);
    }
    // Reset for next interaction
    dragStartPos.current = null;
    isDragging.current = false;
  };
  return (
    <div className={`flex items-center ${isMobile ? 'flex-1' : ''}`}>
      <div className={`relative inline-flex items-center rounded-md border h-8 ${
        isMobile ? 'w-full' : 'w-[220px]'
      } ${
        whiteText ? 'bg-zinc-800 border-zinc-700' : 'bg-background border-border'
      }`}>
        {/* Toggle track */}
        <div className="flex w-full">
          {/* Show specific tool button */}
          <button
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onClick={handleClick(true)}
            className={`flex-1 px-3 h-full font-light rounded-l-md transition-all duration-200 text-xs border-r ${
              isMobile ? 'text-center' : 'whitespace-nowrap'
            } ${
              whiteText 
                ? enabled
                  ? 'bg-zinc-600 text-white border-zinc-600'
                  : 'text-zinc-300 hover:text-white hover:bg-zinc-700 border-zinc-600'
                : enabled
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent border-border'
            }`}
          >
            Generated here
          </button>
          
          {/* Show all button */}
          <button
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onClick={handleClick(false)}
            className={`flex-1 px-3 h-full font-light rounded-r-md transition-all duration-200 text-xs ${
              isMobile ? 'text-center' : 'whitespace-nowrap'
            } ${
              whiteText 
                ? !enabled
                  ? 'bg-zinc-600 text-white'
                  : 'text-zinc-300 hover:text-white hover:bg-zinc-700'
                : !enabled
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            All media
          </button>
        </div>
      </div>
    </div>
  );
};
