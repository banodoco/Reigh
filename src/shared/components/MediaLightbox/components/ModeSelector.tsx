/**
 * ModeSelector Component
 *
 * A responsive mode selector that automatically switches to icon-only mode
 * when there isn't enough space to display text labels without truncation.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
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
  const textRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [showIconsOnly, setShowIconsOnly] = useState(false);

  const checkTruncation = useCallback(() => {
    // Check if any text span is truncated
    const isTruncated = textRefs.current.some((span) => {
      if (!span) return false;
      // Text is truncated if scrollWidth > clientWidth
      return span.scrollWidth > span.clientWidth + 2; // +2 for small rounding errors
    });
    setShowIconsOnly(isTruncated);
  }, []);

  useEffect(() => {
    // Initial check
    checkTruncation();

    // Set up ResizeObserver to detect size changes
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      // Temporarily show text to measure
      setShowIconsOnly(false);
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        checkTruncation();
      });
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [checkTruncation, items.length]);

  // Re-check when showIconsOnly changes to false (to re-measure)
  useEffect(() => {
    if (!showIconsOnly) {
      requestAnimationFrame(() => {
        checkTruncation();
      });
    }
  }, [showIconsOnly, checkTruncation]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex gap-0.5 border border-border rounded-lg overflow-hidden bg-muted/30 p-0.5",
        !showIconsOnly && "gap-1 p-1",
        className
      )}
    >
      {items.map((item, index) => {
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
              <span
                ref={(el) => { textRefs.current[index] = el; }}
                className="truncate"
              >
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
  );
};

export default ModeSelector;
