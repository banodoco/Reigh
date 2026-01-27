/**
 * VariantBadge - Shared component for displaying variant count and "new" indicators
 *
 * Used across multiple components:
 * - MobileImageItem (batch view mobile)
 * - SortableImageItem (batch view desktop)
 * - TimelineItem (timeline view)
 * - ImageGalleryItem (generations gallery)
 * - VideoItem (video gallery)
 * - ChildGenerationsView (segment cards)
 */

import React, { useState, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/components/ui/tooltip';

export interface VariantBadgeProps {
  /** Number of total variants (including primary) */
  derivedCount?: number;
  /** Number of variants that haven't been viewed yet */
  unviewedVariantCount?: number;
  /** Whether there are any unviewed variants */
  hasUnviewedVariants?: boolean;
  /**
   * Display variant:
   * - "overlay": Absolute positioned badge for image overlays (uses title attr)
   * - "inline": Inline badge with Tooltip wrappers
   */
  variant?: 'overlay' | 'inline';
  /**
   * Size variant:
   * - "sm": Smaller badge (h-5 w-5)
   * - "md": Medium badge (h-6 w-6)
   * - "lg": Larger badge (h-6 w-6 sm:h-7 sm:w-7)
   */
  size?: 'sm' | 'md' | 'lg';
  /** Z-index for overlay variant */
  zIndex?: number;
  /** Position classes for overlay variant (default: "top-1 left-1") */
  position?: string;
  /** Whether to show the "new" badge (default: true) */
  showNewBadge?: boolean;
  /** Show NEW badge even when derivedCount <= 1 (won't show count badge, just NEW) */
  alwaysShowNew?: boolean;
  /** Tooltip side for inline variant */
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  /** Additional class names */
  className?: string;
  /** Callback to mark all variants as viewed (enables hover-to-dismiss) */
  onMarkAllViewed?: () => void;
  /** Hover delay in ms before showing dismiss button (default: 1500) */
  dismissHoverDelay?: number;
}

/**
 * Displays variant count badge and optional "X new" indicator
 * Only renders when derivedCount > 1, or when alwaysShowNew is set and there's unviewed content
 */
export const VariantBadge: React.FC<VariantBadgeProps> = ({
  derivedCount,
  unviewedVariantCount,
  hasUnviewedVariants,
  variant = 'overlay',
  size = 'sm',
  zIndex = 10,
  position = 'top-1 left-1',
  showNewBadge = true,
  alwaysShowNew = false,
  tooltipSide = 'left',
  className,
  onMarkAllViewed,
  dismissHoverDelay = 1500,
}) => {
  const [showDismiss, setShowDismiss] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasNew = showNewBadge && hasUnviewedVariants && unviewedVariantCount && unviewedVariantCount > 0;
  const showCountBadge = derivedCount && derivedCount > 1;
  const canDismiss = hasNew && onMarkAllViewed;

  const handleMouseEnter = useCallback(() => {
    if (!canDismiss) return;
    hoverTimerRef.current = setTimeout(() => {
      setShowDismiss(true);
    }, dismissHoverDelay);
  }, [canDismiss, dismissHoverDelay]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setShowDismiss(false);
  }, []);

  const handleDismissClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onMarkAllViewed?.();
    setShowDismiss(false);
  }, [onMarkAllViewed]);

  // Don't render if no variants/only 1, unless alwaysShowNew is set and there's something new
  if (!showCountBadge && !(alwaysShowNew && hasNew)) {
    return null;
  }

  // Size classes for the count badge
  const sizeClasses = {
    sm: 'h-5 w-5 text-[9px]',
    md: 'h-6 w-6 text-[9px]',
    lg: 'h-6 w-6 sm:h-7 sm:w-7 text-[10px]',
  }[size];

  // "New" badge component (shared between variants)
  const NewBadge = hasNew ? (
    <div
      className={cn(
        'bg-yellow-500 text-black text-[7px] font-bold px-1 py-0.5 rounded flex items-center gap-0.5 transition-all',
        canDismiss && 'cursor-pointer hover:bg-yellow-400'
      )}
      title={variant === 'overlay' && !showDismiss ? `${unviewedVariantCount} unviewed variant${unviewedVariantCount !== 1 ? 's' : ''}` : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={showDismiss ? handleDismissClick : undefined}
    >
      {showDismiss ? (
        <>
          <X className="h-2.5 w-2.5" strokeWidth={3} />
          <span>clear</span>
        </>
      ) : (
        <>{unviewedVariantCount} new</>
      )}
    </div>
  ) : null;

  // Count badge component (shared between variants)
  const CountBadge = (
    <div
      className={cn(
        'rounded-full bg-black/60 text-white font-medium flex items-center justify-center backdrop-blur-sm',
        sizeClasses
      )}
      title={variant === 'overlay' ? `${derivedCount} variants` : undefined}
    >
      {derivedCount}
    </div>
  );

  // Overlay variant: absolute positioned, with Tooltip wrappers
  if (variant === 'overlay') {
    return (
      <div
        className={cn(
          'absolute flex items-center gap-0.5',
          position,
          className
        )}
        style={{ zIndex }}
      >
        {hasNew && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="bg-yellow-500 text-black text-[7px] font-bold px-1 py-0.5 rounded cursor-help"
                >
                  {unviewedVariantCount} new
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="flex flex-col gap-1">
                <p>{unviewedVariantCount} unviewed variant{unviewedVariantCount !== 1 ? 's' : ''}</p>
                {onMarkAllViewed && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onMarkAllViewed();
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Mark all as viewed
                  </button>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {showCountBadge && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'rounded-full bg-black/60 text-white font-medium flex items-center justify-center backdrop-blur-sm cursor-help',
                    sizeClasses
                  )}
                >
                  {derivedCount}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{derivedCount} variant{derivedCount !== 1 ? 's' : ''}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    );
  }

  // Inline variant: uses Tooltip wrappers
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {hasNew && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'bg-yellow-500 text-black text-[8px] font-bold px-1 py-0.5 rounded flex items-center gap-0.5 transition-all',
                  canDismiss ? 'cursor-pointer hover:bg-yellow-400' : 'cursor-help'
                )}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onClick={showDismiss ? handleDismissClick : undefined}
              >
                {showDismiss ? (
                  <>
                    <X className="h-2.5 w-2.5" strokeWidth={3} />
                    <span>clear</span>
                  </>
                ) : (
                  <>{unviewedVariantCount} new</>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side={tooltipSide}>
              <p>
                {showDismiss
                  ? 'Click to mark all as viewed'
                  : `${unviewedVariantCount} unviewed variant${unviewedVariantCount !== 1 ? 's' : ''}`}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {showCountBadge && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'rounded-full bg-black/50 text-white font-medium flex items-center justify-center backdrop-blur-sm cursor-help',
                  sizeClasses
                )}
              >
                {derivedCount}
              </div>
            </TooltipTrigger>
            <TooltipContent side={tooltipSide}>
              <p>{derivedCount} variant{derivedCount !== 1 ? 's' : ''}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
};

export default VariantBadge;



