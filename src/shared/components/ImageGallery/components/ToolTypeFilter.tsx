import React, { useRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

const toolTypeFilterVariants = cva(
  "relative inline-flex items-center",
  {
    variants: {
      variant: {
        default: "rounded-md border bg-background border-border",
        // Retro style
        retro: "rounded-sm border-2 border-[#6a8a8a] dark:border-[#6a7a7a] bg-[#f5f3ed] dark:bg-[#3a4a4a] shadow-[-2px_2px_0_0_rgba(106,138,138,0.15)] dark:shadow-[-2px_2px_0_0_rgba(20,30,30,0.4)]",
        "retro-dark": "rounded-sm border-2 border-[#6a7a7a] bg-[#3a4a4a] shadow-[-2px_2px_0_0_rgba(20,30,30,0.3)]",
        // Zinc - for dark panes (whiteText mode)
        zinc: "rounded-sm border border-zinc-700 bg-zinc-800",
      },
      size: {
        default: "h-7 w-[240px]",
        mobile: "h-12 w-[120px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const toolTypeFilterButtonVariants = cva(
  "flex-1 px-2 h-full font-light transition-all duration-200 text-xs relative flex items-center justify-center",
  {
    variants: {
      variant: {
        default: "",
        retro: "font-heading tracking-wide",
        "retro-dark": "font-heading tracking-wide",
        zinc: "",
      },
      position: {
        left: "rounded-l-md border-r",
        right: "rounded-r-md",
      },
    },
    defaultVariants: {
      variant: "default",
      position: "left",
    },
  }
);

export interface ToolTypeFilterProps extends VariantProps<typeof toolTypeFilterVariants> {
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
  variant: variantProp,
}) => {
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);

  // Auto-select variant based on whiteText if not explicitly set
  const variant = variantProp ?? (whiteText ? "zinc" : "default");
  const size = isMobile ? "mobile" : "default";

  const handleMouseDown = (e: React.MouseEvent) => {
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    isDragging.current = false;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragStartPos.current) {
      const deltaX = Math.abs(e.clientX - dragStartPos.current.x);
      const deltaY = Math.abs(e.clientY - dragStartPos.current.y);
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
      if (deltaX > 5 || deltaY > 5) {
        isDragging.current = true;
      }
    }
  };

  const handleClick = (value: boolean) => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDragging.current) {
      onToggle(value);
    }
    dragStartPos.current = null;
    isDragging.current = false;
  };

  // Get button styles based on variant and state
  const getButtonStyles = (isActive: boolean, position: "left" | "right") => {
    const baseClasses = toolTypeFilterButtonVariants({ variant, position });
    
    if (variant === "zinc") {
      return cn(
        baseClasses,
        isActive
          ? "text-white"
          : "text-zinc-300 hover:text-white hover:bg-zinc-700",
        position === "left" && "border-zinc-600"
      );
    }
    
    if (variant === "retro" || variant === "retro-dark") {
      return cn(
        baseClasses,
        isActive
          ? "text-[#4a6a6a] dark:text-[#e8e4db]"
          : "text-[#7a9a9a] dark:text-[#8a9a9a] hover:text-[#5a7a7a] dark:hover:text-[#c8c4bb] hover:bg-[#e8e4db] dark:hover:bg-[#4a5a5a]",
        position === "left" && "border-[#6a8a8a] dark:border-[#6a7a7a]"
      );
    }
    
    // Default variant
    return cn(
      baseClasses,
      isActive
        ? "text-primary"
        : "text-muted-foreground hover:text-foreground hover:bg-accent",
      position === "left" && "border-border"
    );
  };

  // Get indicator styles based on variant
  const getIndicatorStyles = (position: "left" | "right") => {
    if (variant === "zinc") {
      return position === "left"
        ? "absolute top-0.5 bottom-0.5 left-0.5 right-[1px] bg-zinc-600 rounded-l-sm -z-10"
        : "absolute top-0.5 bottom-0.5 right-0.5 left-[1px] bg-zinc-600 rounded-r-sm -z-10";
    }
    
    if (variant === "retro" || variant === "retro-dark") {
      return position === "left"
        ? "absolute top-0.5 bottom-0.5 left-0.5 right-[1px] bg-[#d8d4cb] dark:bg-[#4a5a5a] rounded-l-sm -z-10"
        : "absolute top-0.5 bottom-0.5 right-0.5 left-[1px] bg-[#d8d4cb] dark:bg-[#4a5a5a] rounded-r-sm -z-10";
    }
    
    // Default
    return position === "left"
      ? "absolute top-0.5 bottom-0.5 left-0.5 right-[1px] bg-primary rounded-l-sm -z-10"
      : "absolute top-0.5 bottom-0.5 right-0.5 left-[1px] bg-primary rounded-r-sm -z-10";
  };

  return (
    <div className={`flex items-center ${isMobile ? 'flex-none' : ''}`}>
      <div className={cn(toolTypeFilterVariants({ variant, size }))}>
        <div className="flex w-full">
          {/* Show specific tool button */}
          <button
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onClick={handleClick(true)}
            className={cn(
              getButtonStyles(enabled, "left"),
              isMobile && "py-1"
            )}
          >
            {enabled && <div className={getIndicatorStyles("left")} />}
            {isMobile ? (
              <span className="text-center leading-tight">
                Generated<br />here
              </span>
            ) : (
              'Generated here'
            )}
          </button>
          
          {/* Show all button */}
          <button
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onClick={handleClick(false)}
            className={cn(
              getButtonStyles(!enabled, "right"),
              isMobile && "py-1"
            )}
          >
            {!enabled && <div className={getIndicatorStyles("right")} />}
            {isMobile ? (
              <span className="text-center leading-tight">
                All<br />tools
              </span>
            ) : (
              'All tools'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
