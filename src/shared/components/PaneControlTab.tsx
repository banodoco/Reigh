import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { LockIcon, UnlockIcon, ChevronLeft, ChevronRight, ChevronUp, Square, LayoutGrid, Images, ListTodo } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useIsMobile, useIsTablet } from '@/shared/hooks/use-mobile';
import { PANE_CONFIG, PaneSide, PanePosition } from '@/shared/config/panes';
import { usePositionStrategy } from '@/shared/hooks/pane-positioning/usePositionStrategy';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';

// Icon type for pane controls
export type PaneIconType = 'chevron' | 'tools' | 'gallery' | 'tasks';

interface PaneControlTabProps {
  side: PaneSide;
  isLocked: boolean;
  isOpen: boolean;
  toggleLock: (force?: boolean) => void;
  openPane: () => void;
  paneDimension: number;
  bottomOffset?: number;
  /**
   * Horizontal offset applied when side === 'bottom'.
   * This represents the difference between the space taken on the left and right
   * (e.g. shots pane width minus tasks pane width). The control will shift by
   * half of this value so that it remains centred within the visible area of
   * the bottom pane.
   */
  horizontalOffset?: number;
  handlePaneEnter: () => void;
  handlePaneLeave: () => void;
  thirdButton?: {
    onClick: () => void;
    ariaLabel: string;
    content?: React.ReactNode; // Optional custom content, defaults to Square icon
    tooltip?: string; // Tooltip text for this button
  };
  /**
   * Optional fourth button that appears AFTER the lock button (to the right/bottom of lock)
   */
  fourthButton?: {
    onClick: () => void;
    ariaLabel: string;
    content?: React.ReactNode;
    tooltip?: string;
  };
  /**
   * Icon to show on the pane control tab instead of chevron.
   * Defaults to 'chevron' for backward compatibility.
   */
  paneIcon?: PaneIconType;
  /**
   * Custom icon element to display. Takes precedence over paneIcon.
   */
  customIcon?: React.ReactNode;
  /**
   * Tooltip for the main pane open button.
   */
  paneTooltip?: string;
  /**
   * Whether to show lock/unlock buttons on mobile. Defaults to false.
   * When false, mobile uses simplified open/close behavior without locking.
   */
  allowMobileLock?: boolean;
}

// Helper component to wrap buttons in tooltips (desktop only)
const TooltipButton: React.FC<{
  tooltip?: string;
  children: React.ReactNode;
  showTooltip: boolean;
  side?: 'top' | 'bottom' | 'left' | 'right';
}> = ({ tooltip, children, showTooltip, side = 'right' }) => {
  if (!tooltip || !showTooltip) {
    return <>{children}</>;
  }
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
};

const PaneControlTab: React.FC<PaneControlTabProps> = ({ 
  side, 
  isLocked, 
  isOpen, 
  toggleLock, 
  openPane, 
  paneDimension, 
  bottomOffset = 0, 
  handlePaneEnter, 
  handlePaneLeave, 
  thirdButton,
  fourthButton,
  horizontalOffset = 0,
  paneIcon = 'chevron',
  customIcon,
  paneTooltip,
  allowMobileLock = false,
}) => {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  // On tablets, use desktop-like behavior with lock icons
  // On phones (small mobile), use simplified mobile behavior
  const useDesktopBehavior = !isMobile || isTablet;
  const [selectionActive, setSelectionActive] = React.useState(false);
  
  // Prevent clicks from passing through to elements behind the control
  const handleButtonClick = React.useCallback((callback: () => void) => {
    return (e: React.PointerEvent | React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      callback();
    };
  }, []);
  
  // Tooltips only show on desktop, not mobile/tablet (touch devices)
  const showTooltips = !isMobile;
  
  // Determine tooltip side based on pane side
  const tooltipSide = side === 'left' ? 'right' : side === 'right' ? 'left' : 'top';

  // Listen for selection events to hide controls
  React.useEffect(() => {
    const handler = (e: CustomEvent<boolean>) => {
      setSelectionActive(!!e.detail);
    };
    window.addEventListener('mobileSelectionActive', handler as EventListener);
    return () => window.removeEventListener('mobileSelectionActive', handler as EventListener);
  }, []);
  
  // Determine whether the pane is currently visible (same logic as useSlidingPane)
  const isVisible = isLocked || (isOpen && !isLocked);

  // Create position object for strategy
  const position: PanePosition = {
    side,
    dimension: paneDimension,
    offsets: {
      bottom: bottomOffset,
      horizontal: horizontalOffset,
    },
    isVisible,
  };

  // Get dynamic style using position strategy
  const dynamicStyle = usePositionStrategy(position);

  const getPositionClasses = () => {
    switch (side) {
      case 'left':
        return 'left-0 flex-col';
      case 'right':
        return 'right-0 flex-col';
      case 'bottom':
        return 'left-1/2 -translate-x-1/2 bottom-0 flex-row';
      default:
        return '';
    }
  };

  const getIcon = () => {
    // Larger icons on mobile for better touch targets
    const iconSize = isMobile ? "h-5 w-5" : "h-4 w-4";
    
    // If a custom icon element is provided, use it
    if (customIcon) {
      return customIcon;
    }
    
    // If a custom pane icon type is specified, use it instead of chevrons
    if (paneIcon !== 'chevron') {
      switch (paneIcon) {
        case 'tools': return <LayoutGrid className={iconSize} />;
        case 'gallery': return <Images className={iconSize} />;
        case 'tasks': return <ListTodo className={iconSize} />;
      }
    }
    
    // Default chevron behavior
    switch (side) {
        case 'left': return <ChevronRight className={iconSize} />;
        case 'right': return <ChevronLeft className={iconSize} />;
        case 'bottom': return <ChevronUp className={iconSize} />;
        default: return null;
    }
  };

  const getFlexDirection = () => {
    switch (side) {
        case 'left':
        case 'right':
            return 'flex-col';
        case 'bottom':
            return 'flex-row';
        default:
            return '';
    }
  };

  // Small phones (not tablets): Show simplified mobile controls
  // Tablets use desktop behavior with lock/unlock icons
  if (!useDesktopBehavior) {
    if (selectionActive) return null; // hide when selection active

    // On mobile, bottom pane control should be BEHIND side panes (which are z-60)
    // Use z-[50] for bottom pane controls so they don't overlap open Task/Shot panes
    const mobileZIndex = side === 'bottom' ? 'z-[50]' : PANE_CONFIG.zIndex.CONTROL_UNLOCKED;

    // Only show lock/unlock buttons if allowMobileLock is true
    if (allowMobileLock) {
      // Pane is locked on mobile - show unlock button
      if (isLocked) {
        // Bottom pane: horizontal layout (Lock, Open, Third, Fourth)
        // Left/Right panes: vertical layout (Open, Third, Lock)
        const isBottom = side === 'bottom';
        return (
          <div
            data-pane-control
            style={dynamicStyle}
            className={cn(
              `fixed ${PANE_CONFIG.zIndex.CONTROL_LOCKED} flex items-center p-1 bg-zinc-800/90 backdrop-blur-sm border border-zinc-700 rounded-md gap-1 ${PANE_CONFIG.transition.PROPERTIES.TRANSFORM_OPACITY} duration-${PANE_CONFIG.timing.ANIMATION_DURATION} ${PANE_CONFIG.transition.EASING}`,
              getPositionClasses(),
              'opacity-100'
            )}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {isBottom ? (
              <>
                {/* Bottom (mobile locked): Third, Unlock, Fourth */}
                {thirdButton && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onPointerUp={handleButtonClick(thirdButton.onClick)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-9 w-9 text-zinc-300 hover:text-white hover:bg-zinc-700"
                    aria-label={thirdButton.ariaLabel}
                  >
                    {thirdButton.content || <Square className="h-5 w-5" />}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onPointerUp={handleButtonClick(() => toggleLock(false))}
                  onClick={(e) => e.stopPropagation()}
                  className="h-9 w-9 text-zinc-300 hover:text-white hover:bg-zinc-700"
                  aria-label="Unlock pane"
                >
                  <UnlockIcon className="h-5 w-5" />
                </Button>
                {fourthButton && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onPointerUp={handleButtonClick(fourthButton.onClick)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-9 w-9 text-zinc-300 hover:text-white hover:bg-zinc-700"
                    aria-label={fourthButton.ariaLabel}
                  >
                    {fourthButton.content || <Square className="h-5 w-5" />}
                  </Button>
                )}
              </>
            ) : (
              <>
                {/* Left/Right: Third, Lock (Open pane button hidden when locked) */}
                {thirdButton && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onPointerUp={handleButtonClick(thirdButton.onClick)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-9 w-9 text-zinc-300 hover:text-white hover:bg-zinc-700"
                    aria-label={thirdButton.ariaLabel}
                  >
                    {thirdButton.content || <Square className="h-5 w-5" />}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onPointerUp={handleButtonClick(() => toggleLock(false))}
                  onClick={(e) => e.stopPropagation()}
                  className="h-9 w-9 text-zinc-300 hover:text-white hover:bg-zinc-700"
                  aria-label="Unlock pane"
                >
                  <UnlockIcon className="h-5 w-5" />
                </Button>
              </>
            )}
          </div>
        );
      }

      // Pane is closed on mobile with lock enabled - show open button AND lock button
      // Bottom pane: horizontal layout (Lock, Open, Third, Fourth)
      // Left/Right panes: vertical layout (Open, Third, Lock)
      const isBottom = side === 'bottom';
      return (
        <div
          data-pane-control
          style={dynamicStyle}
          className={cn(
            `fixed ${mobileZIndex} flex items-center p-1 bg-zinc-800/80 backdrop-blur-sm border border-zinc-700 rounded-md gap-1 ${PANE_CONFIG.transition.PROPERTIES.TRANSFORM_OPACITY} duration-${PANE_CONFIG.timing.ANIMATION_DURATION} ${PANE_CONFIG.transition.EASING}`,
            getPositionClasses(),
            'opacity-100'
          )}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {isBottom ? (
            <>
              {/* Bottom (mobile unlocked): Third, Lock, then Open (if closed) or Fourth (if open) */}
              {thirdButton && (
                <Button
                  variant="ghost"
                  size="icon"
                  onPointerUp={handleButtonClick(thirdButton.onClick)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-9 w-9 text-zinc-300 hover:text-white hover:bg-zinc-700"
                  aria-label={thirdButton.ariaLabel}
                >
                  {thirdButton.content || <Square className="h-5 w-5" />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onPointerUp={handleButtonClick(() => toggleLock(true))}
                onClick={(e) => e.stopPropagation()}
                className="h-9 w-9 text-zinc-300 hover:text-white hover:bg-zinc-700"
                aria-label="Lock pane open"
              >
                <LockIcon className="h-5 w-5" />
              </Button>
              {/* Show Open button when closed, Fourth button when open */}
              {isOpen ? (
                fourthButton && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onPointerUp={handleButtonClick(fourthButton.onClick)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-9 w-9 text-zinc-300 hover:text-white hover:bg-zinc-700"
                    aria-label={fourthButton.ariaLabel}
                  >
                    {fourthButton.content || <Square className="h-5 w-5" />}
                  </Button>
                )
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  onPointerUp={handleButtonClick(() => openPane())}
                  onClick={(e) => e.stopPropagation()}
                  className="h-9 w-9 text-zinc-300 hover:text-white hover:bg-zinc-700"
                  aria-label={paneTooltip || "Open pane"}
                >
                  {getIcon()}
                </Button>
              )}
            </>
          ) : (
            <>
              {/* Left/Right: Open, Third, Lock */}
              <Button
                variant="ghost"
                size="icon"
                onPointerUp={handleButtonClick(() => openPane())}
                onClick={(e) => e.stopPropagation()}
                className="h-9 w-9 text-zinc-300 hover:text-white hover:bg-zinc-700"
                aria-label={paneTooltip || "Open pane"}
              >
                {getIcon()}
              </Button>
              {thirdButton && (
                <Button
                  variant="ghost"
                  size="icon"
                  onPointerUp={handleButtonClick(thirdButton.onClick)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-9 w-9 text-zinc-300 hover:text-white hover:bg-zinc-700"
                  aria-label={thirdButton.ariaLabel}
                >
                  {thirdButton.content || <Square className="h-5 w-5" />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onPointerUp={handleButtonClick(() => toggleLock(true))}
                onClick={(e) => e.stopPropagation()}
                className="h-9 w-9 text-zinc-300 hover:text-white hover:bg-zinc-700"
                aria-label="Lock pane open"
              >
                <LockIcon className="h-5 w-5" />
              </Button>
            </>
          )}
        </div>
      );
    }

    // Original simplified mobile behavior (no lock buttons)
    // Pane is open - no control shown (pane handles its own close via tap outside)
    if (isOpen) {
      return null;
    }

    // Pane is closed on mobile - show open button only
    // Left/Right panes: vertical layout (Open on top, Third below)
    return (
      <div
        data-pane-control
        style={dynamicStyle}
        className={cn(
          `fixed ${mobileZIndex} flex flex-col items-center p-1 bg-zinc-800/80 backdrop-blur-sm border border-zinc-700 rounded-md gap-1 ${PANE_CONFIG.transition.PROPERTIES.TRANSFORM_OPACITY} duration-${PANE_CONFIG.timing.ANIMATION_DURATION} ${PANE_CONFIG.transition.EASING}`,
          getPositionClasses(),
          'opacity-100'
        )}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Left/Right: Open pane at top, then thirdButton (current tool) */}
        <Button
          variant="ghost"
          size="icon"
          onPointerUp={handleButtonClick(() => openPane())}
          onClick={(e) => e.stopPropagation()}
          className="h-9 w-9 text-zinc-300 hover:text-white hover:bg-zinc-700"
          aria-label={paneTooltip || "Open pane"}
        >
          {getIcon()}
        </Button>
        {thirdButton && (
          <Button
            variant="ghost"
            size="icon"
            onPointerUp={handleButtonClick(thirdButton.onClick)}
            onClick={(e) => e.stopPropagation()}
            className="h-9 w-9 text-zinc-300 hover:text-white hover:bg-zinc-700"
            aria-label={thirdButton.ariaLabel}
          >
            {thirdButton.content || <Square className="h-5 w-5" />}
          </Button>
        )}
      </div>
    );
  }

  // Desktop behavior (original)
  // Show lock button at edge when pane is open but not locked
  // Bottom pane: horizontal (Lock, Third, Fourth)
  // Left/Right panes: vertical (Third, Lock)
  const isBottom = side === 'bottom';
  
  if (isOpen && !isLocked) {
    return (
      <TooltipProvider delayDuration={300}>
        <div
          data-pane-control
          style={dynamicStyle}
          className={cn(
            `fixed ${PANE_CONFIG.zIndex.CONTROL_LOCKED} flex items-center p-1 bg-zinc-800/90 backdrop-blur-sm border border-zinc-700 rounded-md gap-1 ${PANE_CONFIG.transition.PROPERTIES.TRANSFORM_ONLY} duration-${PANE_CONFIG.timing.ANIMATION_DURATION} ${PANE_CONFIG.transition.EASING}`,
            getFlexDirection()
          )}
          onMouseEnter={handlePaneEnter}
          onMouseLeave={handlePaneLeave}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {isBottom ? (
            <>
              {/* Bottom (open not locked): Third, Lock, Fourth (if provided) */}
              {thirdButton && (
                <TooltipButton tooltip={thirdButton.tooltip} showTooltip={showTooltips} side={tooltipSide}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onPointerUp={handleButtonClick(thirdButton.onClick)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
                    aria-label={thirdButton.ariaLabel}
                  >
                    {thirdButton.content || <Square className="h-4 w-4" />}
                  </Button>
                </TooltipButton>
              )}
              <TooltipButton tooltip="Lock pane open" showTooltip={showTooltips} side={tooltipSide}>
                <Button
                  variant="ghost"
                  size="icon"
                  onPointerUp={handleButtonClick(() => toggleLock(true))}
                  onClick={(e) => e.stopPropagation()}
                  className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
                  aria-label="Lock pane"
                >
                  <LockIcon className="h-4 w-4" />
                </Button>
              </TooltipButton>
              {fourthButton && (
                <TooltipButton tooltip={fourthButton.tooltip} showTooltip={showTooltips} side={tooltipSide}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onPointerUp={handleButtonClick(fourthButton.onClick)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
                    aria-label={fourthButton.ariaLabel}
                  >
                    {fourthButton.content || <Square className="h-4 w-4" />}
                  </Button>
                </TooltipButton>
              )}
            </>
          ) : (
            <>
              {/* Left/Right: Third, Lock */}
              {thirdButton && (
                <TooltipButton tooltip={thirdButton.tooltip} showTooltip={showTooltips} side={tooltipSide}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onPointerUp={handleButtonClick(thirdButton.onClick)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
                    aria-label={thirdButton.ariaLabel}
                  >
                    {thirdButton.content || <Square className="h-4 w-4" />}
                  </Button>
                </TooltipButton>
              )}
              <TooltipButton tooltip="Lock pane open" showTooltip={showTooltips} side={tooltipSide}>
                <Button
                  variant="ghost"
                  size="icon"
                  onPointerUp={handleButtonClick(() => toggleLock(true))}
                  onClick={(e) => e.stopPropagation()}
                  className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
                  aria-label="Lock pane"
                >
                  <LockIcon className="h-4 w-4" />
                </Button>
              </TooltipButton>
            </>
          )}
        </div>
      </TooltipProvider>
    );
  }

  if (isLocked) {
    return (
      <TooltipProvider delayDuration={300}>
        <div
          data-pane-control
          style={dynamicStyle}
          className={cn(
            `fixed ${PANE_CONFIG.zIndex.CONTROL_LOCKED} flex items-center p-1 bg-zinc-800/90 backdrop-blur-sm border border-zinc-700 rounded-md gap-1 ${PANE_CONFIG.transition.PROPERTIES.TRANSFORM_ONLY} duration-${PANE_CONFIG.timing.ANIMATION_DURATION} ${PANE_CONFIG.transition.EASING}`,
            getFlexDirection()
          )}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {isBottom ? (
            <>
              {/* Bottom (locked): Third, Unlock, Fourth */}
              {thirdButton && (
                <TooltipButton tooltip={thirdButton.tooltip} showTooltip={showTooltips} side={tooltipSide}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onPointerUp={handleButtonClick(thirdButton.onClick)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
                    aria-label={thirdButton.ariaLabel}
                  >
                    {thirdButton.content || <Square className="h-4 w-4" />}
                  </Button>
                </TooltipButton>
              )}
              <TooltipButton tooltip="Unlock pane" showTooltip={showTooltips} side={tooltipSide}>
                <Button
                  variant="ghost"
                  size="icon"
                  onPointerUp={handleButtonClick(() => toggleLock(false))}
                  onClick={(e) => e.stopPropagation()}
                  className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
                  aria-label="Unlock pane"
                >
                  <UnlockIcon className="h-4 w-4" />
                </Button>
              </TooltipButton>
              {fourthButton && (
                <TooltipButton tooltip={fourthButton.tooltip} showTooltip={showTooltips} side={tooltipSide}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onPointerUp={handleButtonClick(fourthButton.onClick)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
                    aria-label={fourthButton.ariaLabel}
                  >
                    {fourthButton.content || <Square className="h-4 w-4" />}
                  </Button>
                </TooltipButton>
              )}
            </>
          ) : (
            <>
              {/* Left/Right: Third, Unlock */}
              {thirdButton && (
                <TooltipButton tooltip={thirdButton.tooltip} showTooltip={showTooltips} side={tooltipSide}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onPointerUp={handleButtonClick(thirdButton.onClick)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
                    aria-label={thirdButton.ariaLabel}
                  >
                    {thirdButton.content || <Square className="h-4 w-4" />}
                  </Button>
                </TooltipButton>
              )}
              <TooltipButton tooltip="Unlock pane" showTooltip={showTooltips} side={tooltipSide}>
                <Button
                  variant="ghost"
                  size="icon"
                  onPointerUp={handleButtonClick(() => toggleLock(false))}
                  onClick={(e) => e.stopPropagation()}
                  className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
                  aria-label="Unlock pane"
                >
                  <UnlockIcon className="h-4 w-4" />
                </Button>
              </TooltipButton>
            </>
          )}
        </div>
      </TooltipProvider>
    );
  }

  // Pane is closed (desktop)
  // Bottom pane: horizontal (Lock, Open, Third, Fourth)
  // Left/Right panes: vertical (Open, Third, Lock)
  return (
    <TooltipProvider delayDuration={300}>
      <div
        data-pane-control
        style={dynamicStyle}
        className={cn(
          `fixed ${PANE_CONFIG.zIndex.CONTROL_UNLOCKED} flex items-center p-1 bg-zinc-800/80 backdrop-blur-sm border border-zinc-700 rounded-md gap-1 ${PANE_CONFIG.transition.PROPERTIES.TRANSFORM_OPACITY} duration-${PANE_CONFIG.timing.ANIMATION_DURATION} ${PANE_CONFIG.transition.EASING}`,
          getPositionClasses(),
          isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
        )}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {isBottom ? (
          <>
            {/* Bottom (closed): Third, Lock, Open - Third always on left */}
            {thirdButton && (
              <TooltipButton tooltip={thirdButton.tooltip} showTooltip={showTooltips} side={tooltipSide}>
                <Button
                  variant="ghost"
                  size="icon"
                  onPointerUp={handleButtonClick(thirdButton.onClick)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
                  aria-label={thirdButton.ariaLabel}
                >
                  {thirdButton.content || <Square className="h-4 w-4" />}
                </Button>
              </TooltipButton>
            )}
            <TooltipButton tooltip="Lock pane open" showTooltip={showTooltips} side={tooltipSide}>
              <Button
                variant="ghost"
                size="icon"
                onPointerUp={handleButtonClick(() => toggleLock(true))}
                onClick={(e) => e.stopPropagation()}
                className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
                aria-label="Lock pane"
              >
                <LockIcon className="h-4 w-4" />
              </Button>
            </TooltipButton>
            <TooltipButton tooltip={paneTooltip} showTooltip={showTooltips} side={tooltipSide}>
              <Button
                variant="ghost"
                size="icon"
                onPointerUp={handleButtonClick(() => openPane())}
                onClick={(e) => e.stopPropagation()}
                className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
                aria-label={paneTooltip || "Open pane"}
              >
                {getIcon()}
              </Button>
            </TooltipButton>
          </>
        ) : (
          <>
            {/* Left/Right: Open, Third, Lock */}
            <TooltipButton tooltip={paneTooltip} showTooltip={showTooltips} side={tooltipSide}>
              <Button
                variant="ghost"
                size="icon"
                onPointerUp={handleButtonClick(() => openPane())}
                onClick={(e) => e.stopPropagation()}
                className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
                aria-label={paneTooltip || "Open pane"}
              >
                {getIcon()}
              </Button>
            </TooltipButton>
            {thirdButton && (
              <TooltipButton tooltip={thirdButton.tooltip} showTooltip={showTooltips} side={tooltipSide}>
                <Button
                  variant="ghost"
                  size="icon"
                  onPointerUp={handleButtonClick(thirdButton.onClick)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
                  aria-label={thirdButton.ariaLabel}
                >
                  {thirdButton.content || <Square className="h-4 w-4" />}
                </Button>
              </TooltipButton>
            )}
            <TooltipButton tooltip="Lock pane open" showTooltip={showTooltips} side={tooltipSide}>
              <Button
                variant="ghost"
                size="icon"
                onPointerUp={handleButtonClick(() => toggleLock(true))}
                onClick={(e) => e.stopPropagation()}
                className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
                aria-label="Lock pane"
              >
                <LockIcon className="h-4 w-4" />
              </Button>
            </TooltipButton>
          </>
        )}
      </div>
    </TooltipProvider>
  );
};

export default PaneControlTab;
