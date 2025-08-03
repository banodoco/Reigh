import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { LockIcon, UnlockIcon, ChevronLeft, ChevronRight, ChevronUp, Square } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { PANE_CONFIG, PaneSide, PanePosition } from '@/shared/config/panes';
import { usePositionStrategy } from '@/shared/hooks/pane-positioning/usePositionStrategy';

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
  };
}

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
  horizontalOffset = 0,
}) => {
  const isMobile = useIsMobile();
  const [selectionActive, setSelectionActive] = React.useState(false);

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
    switch (side) {
        case 'left': return <ChevronRight className="h-4 w-4" />;
        case 'right': return <ChevronLeft className="h-4 w-4" />;
        case 'bottom': return <ChevronUp className="h-4 w-4" />;
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

  // Mobile: Only show button when pane is closed
  if (isMobile) {
    if (selectionActive) return null; // hide when selection active
    // Don't show control when pane is open on mobile
    if (isOpen) return null;

    return (
      <div
        data-pane-control
        style={dynamicStyle}
        className={cn(
          `fixed z-[${PANE_CONFIG.zIndex.CONTROL_UNLOCKED}] flex flex-col items-center p-1 bg-zinc-800/80 backdrop-blur-sm border border-zinc-700 rounded-md gap-1 ${PANE_CONFIG.transition.PROPERTIES.TRANSFORM_OPACITY} duration-${PANE_CONFIG.timing.ANIMATION_DURATION} ${PANE_CONFIG.transition.EASING}`,
          getPositionClasses(),
          'opacity-100'
        )}
      >
        {thirdButton && (
          <Button
            variant="ghost"
            size="icon"
            onPointerUp={thirdButton.onClick}
            className={cn(
              'text-zinc-300 hover:text-white hover:bg-zinc-700',
              side === 'bottom' ? 'h-8 w-16' : 'h-16 w-8'
            )}
            aria-label={thirdButton.ariaLabel}
          >
            {thirdButton.content || <Square className="h-4 w-4" />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onPointerUp={() => openPane()}
          className={cn(
            'text-zinc-300 hover:text-white hover:bg-zinc-700',
            side === 'bottom' ? 'h-8 w-16' : 'h-16 w-8'
          )}
          aria-label="Open pane"
        >
          {getIcon()}
        </Button>
      </div>
    );
  }

  // Desktop behavior (original)
  // Show lock button at edge when pane is open but not locked
  if (isOpen && !isLocked) {
    return (
      <div
        data-pane-control
        style={dynamicStyle}
        className={cn(
          `fixed z-[${PANE_CONFIG.zIndex.CONTROL_LOCKED}] flex items-center p-1 bg-zinc-800/90 backdrop-blur-sm border border-zinc-700 rounded-md ${PANE_CONFIG.transition.PROPERTIES.TRANSFORM_ONLY} duration-${PANE_CONFIG.timing.ANIMATION_DURATION} ${PANE_CONFIG.transition.EASING}`,
          getFlexDirection()
        )}
        onMouseEnter={handlePaneEnter}
        onMouseLeave={handlePaneLeave}
      >
        <Button
          variant="ghost"
          size="icon"
          onPointerUp={() => toggleLock(true)}
          className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
          aria-label="Lock pane"
        >
          <LockIcon className="h-4 w-4" />
        </Button>
        {thirdButton && (
          <Button
            variant="ghost"
            size="icon"
            onPointerUp={thirdButton.onClick}
            className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
            aria-label={thirdButton.ariaLabel}
          >
            {thirdButton.content || <Square className="h-4 w-4" />}
          </Button>
        )}
      </div>
    );
  }

  if (isLocked) {
    return (
      <div
        data-pane-control
        style={dynamicStyle}
        className={cn(
          `fixed z-[${PANE_CONFIG.zIndex.CONTROL_LOCKED}] flex items-center p-1 bg-zinc-800/90 backdrop-blur-sm border border-zinc-700 rounded-md ${PANE_CONFIG.transition.PROPERTIES.TRANSFORM_ONLY} duration-${PANE_CONFIG.timing.ANIMATION_DURATION} ${PANE_CONFIG.transition.EASING}`,
          getFlexDirection()
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          onPointerUp={() => toggleLock(false)}
          className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
          aria-label="Unlock pane"
        >
          <UnlockIcon className="h-4 w-4" />
        </Button>
        {thirdButton && (
          <Button
            variant="ghost"
            size="icon"
            onPointerUp={thirdButton.onClick}
            className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
            aria-label={thirdButton.ariaLabel}
          >
            {thirdButton.content || <Square className="h-4 w-4" />}
          </Button>
        )}
      </div>
    );
  }

  // Pane is closed (desktop)
  return (
    <div
      data-pane-control
      style={dynamicStyle}
      className={cn(
        `fixed z-[${PANE_CONFIG.zIndex.CONTROL_UNLOCKED}] flex items-center p-1 bg-zinc-800/80 backdrop-blur-sm border border-zinc-700 rounded-md gap-1 ${PANE_CONFIG.transition.PROPERTIES.TRANSFORM_OPACITY} duration-${PANE_CONFIG.timing.ANIMATION_DURATION} ${PANE_CONFIG.transition.EASING}`,
        getPositionClasses(),
        isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        onPointerUp={() => toggleLock(true)}
        className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
        aria-label="Lock pane"
      >
        <LockIcon className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onPointerUp={() => openPane()}
        className={cn(
          'text-zinc-300 hover:text-white hover:bg-zinc-700 h-8 w-8'
        )}
        aria-label="Open pane"
      >
        {getIcon()}
      </Button>
      {thirdButton && (
        <Button
          variant="ghost"
          size="icon"
          onPointerUp={thirdButton.onClick}
          className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
          aria-label={thirdButton.ariaLabel}
        >
          {thirdButton.content || <Square className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );
};

export default PaneControlTab;
