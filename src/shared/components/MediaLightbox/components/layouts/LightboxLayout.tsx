/**
 * LightboxLayout Component
 *
 * Handles the three main layout modes for the MediaLightbox:
 * 1. Desktop side-by-side: 60% media | 40% controls panel
 * 2. Mobile stacked: 50% media | 50% controls panel
 * 3. Mobile fullscreen: Full media with floating overlays (no panel)
 *
 * Uses render props to receive media content and controls panel,
 * allowing the parent to handle the complex conditional rendering.
 */

import React from 'react';
import { cn } from '@/shared/lib/utils';

export type LayoutMode = 'desktop-sidepanel' | 'mobile-stacked' | 'mobile-fullscreen';

export interface LightboxLayoutProps {
  /** Which layout mode to render */
  layoutMode: LayoutMode;

  /** Handler for closing the lightbox (used for double-click to close) */
  onClose: () => void;

  /** Media section content - rendered in the media area */
  mediaContent: React.ReactNode;

  /** Controls panel content - only rendered for desktop/mobile-stacked modes */
  controlsPanel?: React.ReactNode;

  /** Optional swipe handlers for mobile navigation */
  swipeHandlers?: {
    onTouchStart?: React.TouchEventHandler;
    onTouchMove?: React.TouchEventHandler;
    onTouchEnd?: React.TouchEventHandler;
    onMouseDown?: React.MouseEventHandler;
    onMouseMove?: React.MouseEventHandler;
    onMouseUp?: React.MouseEventHandler;
    onMouseLeave?: React.MouseEventHandler;
  };

  /** Swipe state for transform animation */
  swipeState?: {
    isSwiping: boolean;
    swipeOffset: number;
  };

  /** Additional className for the outer container */
  className?: string;
}

/**
 * Common double-click handler that closes only when clicking on the container itself
 */
const createDoubleClickHandler = (onClose: () => void) => (e: React.MouseEvent) => {
  e.stopPropagation();
  if (e.target === e.currentTarget) {
    onClose();
  }
};

/**
 * Single click handler that prevents propagation
 */
const handleSingleClick = (e: React.MouseEvent) => {
  e.stopPropagation();
};

export const LightboxLayout: React.FC<LightboxLayoutProps> = ({
  layoutMode,
  onClose,
  mediaContent,
  controlsPanel,
  swipeHandlers,
  swipeState,
  className,
}) => {
  const handleDoubleClick = createDoubleClickHandler(onClose);

  // Desktop side-by-side layout: 60% media | 40% controls
  if (layoutMode === 'desktop-sidepanel') {
    return (
      <div
        className={cn("w-full h-full flex bg-black/90", className)}
        onClick={handleSingleClick}
        onDoubleClick={handleDoubleClick}
      >
        {/* Media section - Left side (60% width) */}
        <div
          className="flex-1 flex items-center justify-center relative"
          style={{ width: '60%' }}
          onClick={handleSingleClick}
          onDoubleClick={handleDoubleClick}
        >
          {mediaContent}
        </div>

        {/* Controls panel - Right side (40% width) */}
        <div
          data-task-details-panel
          className="bg-background border-l border-border h-full overflow-hidden relative z-[60]"
          style={{ width: '40%' }}
        >
          {controlsPanel}
        </div>
      </div>
    );
  }

  // Mobile stacked layout: 50% media | 50% controls
  if (layoutMode === 'mobile-stacked') {
    const swipeStyle = swipeState?.isSwiping
      ? {
          transform: `translateX(${swipeState.swipeOffset}px)`,
          transition: 'none',
        }
      : {
          transition: 'transform 0.2s ease-out',
        };

    return (
      <div className={cn("w-full h-full flex flex-col bg-black/90", className)}>
        {/* Media section - Top (50% height) with swipe navigation */}
        <div
          className="flex-1 flex items-center justify-center relative touch-pan-y"
          style={{ height: '50%', ...swipeStyle }}
          onClick={handleSingleClick}
          onDoubleClick={handleDoubleClick}
          {...swipeHandlers}
        >
          {mediaContent}
        </div>

        {/* Controls panel - Bottom (50% height) */}
        <div
          data-task-details-panel
          className="bg-background border-t border-border overflow-y-auto relative z-[60]"
          style={{ height: '50%' }}
        >
          {controlsPanel}
        </div>
      </div>
    );
  }

  // Mobile fullscreen layout: Full media with floating overlays
  // This layout doesn't use controlsPanel - all controls are overlays on the media
  return (
    <div
      className={cn(
        "relative flex flex-col items-center gap-3 sm:gap-4 md:gap-6",
        "px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8",
        "w-full h-full",
        className
      )}
      onClick={handleSingleClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* Media wrapper with swipe navigation */}
      <div
        className="relative flex items-center justify-center max-w-full my-auto touch-pan-y"
        style={{
          maxHeight: 'calc(100vh - 220px)',
          ...(swipeState?.isSwiping
            ? {
                transform: `translateX(${swipeState.swipeOffset}px)`,
                transition: 'none',
              }
            : {
                transition: 'transform 0.2s ease-out',
              }),
        }}
        onClick={handleSingleClick}
        {...swipeHandlers}
      >
        {mediaContent}
      </div>
    </div>
  );
};

export default LightboxLayout;
