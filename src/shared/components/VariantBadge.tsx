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

import React from 'react';
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
  /** Tooltip side for inline variant */
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  /** Additional class names */
  className?: string;
}

/**
 * Displays variant count badge and optional "X new" indicator
 * Only renders when derivedCount > 1
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
  tooltipSide = 'left',
  className,
}) => {
  // Don't render if no variants or only 1
  if (!derivedCount || derivedCount <= 1) {
    return null;
  }

  const hasNew = showNewBadge && hasUnviewedVariants && unviewedVariantCount && unviewedVariantCount > 0;

  // Size classes for the count badge
  const sizeClasses = {
    sm: 'h-5 w-5 text-[9px]',
    md: 'h-6 w-6 text-[9px]',
    lg: 'h-6 w-6 sm:h-7 sm:w-7 text-[10px]',
  }[size];

  // "New" badge component (shared between variants)
  const NewBadge = hasNew ? (
    <div
      className="bg-yellow-500 text-black text-[7px] font-bold px-1 py-0.5 rounded"
      title={variant === 'overlay' ? `${unviewedVariantCount} unviewed variant${unviewedVariantCount !== 1 ? 's' : ''}` : undefined}
    >
      {unviewedVariantCount} new
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

  // Overlay variant: absolute positioned, uses title attributes
  if (variant === 'overlay') {
    return (
      <div 
        className={cn(
          'absolute flex items-center gap-0.5 pointer-events-none',
          position,
          className
        )}
        style={{ zIndex }}
      >
        {NewBadge}
        {CountBadge}
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
              <div className="bg-yellow-500 text-black text-[8px] font-bold px-1 py-0.5 rounded cursor-help">
                {unviewedVariantCount} new
              </div>
            </TooltipTrigger>
            <TooltipContent side={tooltipSide}>
              <p>{unviewedVariantCount} unviewed variant{unviewedVariantCount !== 1 ? 's' : ''}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
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
    </div>
  );
};

export default VariantBadge;


