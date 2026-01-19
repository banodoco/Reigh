/**
 * ModeSelector Component
 *
 * A responsive mode selector that automatically switches to icon-only mode
 * when there isn't enough space to display text labels without truncation.
 */

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { cn } from '@/shared/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';

export interface ModeSelectorItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

interface ModeSelectorProps {
  items: ModeSelectorItem[];
  activeId: string;
  className?: string;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  items,
  activeId,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [showIconsOnly, setShowIconsOnly] = useState(false);

  // Calculate minimum width needed for text mode
  // Each button needs: icon (14px) + gap (6px) + text width + padding (24px horizontal)
  // Plus gaps between buttons
  const checkIfTextFits = () => {
    const container = containerRef.current;
    const measureDiv = measureRef.current;
    if (!container || !measureDiv) return;

    // Get the available width (container width minus padding and gaps)
    const containerWidth = container.clientWidth;
    const padding = 8; // p-1 = 4px each side
    const gaps = (items.length - 1) * 4; // gap-1 = 4px between items
    const availableWidth = containerWidth - padding - gaps;

    // Measure the hidden text spans to get required width
    const spans = measureDiv.querySelectorAll('span');
    let totalRequiredWidth = 0;

    spans.forEach((span) => {
      // Each button needs: padding (24px) + icon (14px) + gap (6px) + text width
      const textWidth = span.scrollWidth;
      const buttonWidth = 24 + 14 + 6 + textWidth;
      totalRequiredWidth += buttonWidth;
    });

    // If we need more width than available, show icons only
    const needsIconsOnly = totalRequiredWidth > availableWidth;
    setShowIconsOnly(needsIconsOnly);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Initial check
    checkIfTextFits();

    // Set up ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      checkIfTextFits();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [items.length]);

  return (
    <>
      {/* Hidden measurement div - always renders text to measure */}
      <div
        ref={measureRef}
        className="absolute opacity-0 pointer-events-none whitespace-nowrap text-sm"
        aria-hidden="true"
      >
        {items.map((item) => (
          <span key={item.id} className="inline-block px-1">
            {item.label}
          </span>
        ))}
      </div>

      {/* Visible selector */}
      <div
        ref={containerRef}
        className={cn(
          "flex gap-1 border border-border rounded-lg overflow-hidden bg-muted/30 p-1",
          className
        )}
      >
        {items.map((item) => {
          const button = (
            <button
              key={item.id}
              onClick={item.onClick}
              className={cn(
                "flex-1 min-w-0 flex items-center justify-center transition-all rounded overflow-hidden",
                showIconsOnly ? "p-2" : "gap-1.5 px-3 py-1.5 text-sm",
                activeId === item.id
                  ? "bg-background text-foreground font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <span className={cn("flex-shrink-0", showIconsOnly ? "[&>svg]:h-4 [&>svg]:w-4" : "[&>svg]:h-3.5 [&>svg]:w-3.5")}>
                {item.icon}
              </span>
              {!showIconsOnly && (
                <span className="truncate">
                  {item.label}
                </span>
              )}
            </button>
          );

          // Wrap in tooltip when showing icons only
          if (showIconsOnly) {
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  {button}
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          }

          return button;
        })}
      </div>
    </>
  );
};

export default ModeSelector;
