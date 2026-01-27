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

// Button types that can appear in the control
type ButtonType = 'third' | 'fourth' | 'lock' | 'unlock' | 'open';

interface PaneControlTabProps {
  side: PaneSide;
  isLocked: boolean;
  isOpen: boolean;
  toggleLock: (force?: boolean) => void;
  openPane: () => void;
  paneDimension: number;
  bottomOffset?: number;
  horizontalOffset?: number;
  handlePaneEnter: () => void;
  handlePaneLeave: () => void;
  thirdButton?: {
    onClick: () => void;
    ariaLabel: string;
    content?: React.ReactNode;
    tooltip?: string;
  };
  fourthButton?: {
    onClick: () => void;
    ariaLabel: string;
    content?: React.ReactNode;
    tooltip?: string;
  };
  paneIcon?: PaneIconType;
  customIcon?: React.ReactNode;
  paneTooltip?: string;
  allowMobileLock?: boolean;
  customOpenAction?: () => void;
  dataTour?: string;
  dataTourLock?: string;
  dataTourFourthButton?: string;
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
  customOpenAction,
  dataTour,
  dataTourLock,
  dataTourFourthButton,
}) => {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const handleOpen = customOpenAction ?? openPane;
  const useDesktopBehavior = !isMobile || isTablet;
  const [selectionActive, setSelectionActive] = React.useState(false);
  const isBottom = side === 'bottom';
  const showTooltips = !isMobile;
  const tooltipSide = side === 'left' ? 'right' : side === 'right' ? 'left' : 'top';

  // Event handlers
  const handleButtonClick = React.useCallback((callback: () => void) => {
    return (e: React.PointerEvent | React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      e.preventDefault();
      callback();
    };
  }, []);

  const containerEventHandlers = {
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); },
    onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); e.preventDefault(); },
    onTouchStart: (e: React.TouchEvent) => { e.stopPropagation(); e.preventDefault(); },
    onTouchEnd: (e: React.TouchEvent) => { e.stopPropagation(); e.preventDefault(); },
  };

  // Listen for selection events to hide controls
  React.useEffect(() => {
    const handler = (e: CustomEvent<boolean>) => setSelectionActive(!!e.detail);
    window.addEventListener('mobileSelectionActive', handler as EventListener);
    return () => window.removeEventListener('mobileSelectionActive', handler as EventListener);
  }, []);

  // Position calculation
  const isVisible = isLocked || (isOpen && !isLocked);
  const position: PanePosition = {
    side,
    dimension: paneDimension,
    offsets: { bottom: bottomOffset, horizontal: horizontalOffset },
    isVisible,
  };
  const dynamicStyle = usePositionStrategy(position);

  // Icon helpers
  const iconSize = isMobile ? "h-5 w-5" : "h-4 w-4";
  const buttonSize = isMobile ? "h-9 w-9" : "h-8 w-8";

  const getIcon = () => {
    if (customIcon) return customIcon;
    if (paneIcon !== 'chevron') {
      switch (paneIcon) {
        case 'tools': return <LayoutGrid className={iconSize} />;
        case 'gallery': return <Images className={iconSize} />;
        case 'tasks': return <ListTodo className={iconSize} />;
      }
    }
    switch (side) {
      case 'left': return <ChevronRight className={iconSize} />;
      case 'right': return <ChevronLeft className={iconSize} />;
      case 'bottom': return <ChevronUp className={iconSize} />;
      default: return null;
    }
  };

  // ==========================================================================
  // BUTTON CONFIGURATION - Determines which buttons show based on state
  // ==========================================================================
  const getButtonsToShow = (): ButtonType[] => {
    // Mobile behavior
    if (!useDesktopBehavior) {
      // Left/Right panes on mobile: Only show thirdButton
      if (!isBottom) {
        return thirdButton ? ['third'] : [];
      }
      // Bottom pane on mobile with allowMobileLock
      if (allowMobileLock) {
        if (isLocked) return ['third', 'unlock', 'fourth'];
        if (isOpen) return ['third', 'lock', 'fourth'];
        return ['third', 'lock', 'open'];
      }
      // Bottom pane on mobile without allowMobileLock
      if (isOpen) return []; // Hide when open
      return ['third', 'open', 'fourth'];
    }

    // Desktop behavior
    if (isLocked) {
      return isBottom ? ['third', 'unlock', 'fourth'] : ['third', 'unlock'];
    }
    if (isOpen) {
      return isBottom ? ['third', 'lock', 'fourth'] : ['third', 'lock'];
    }
    // Closed
    return isBottom ? ['third', 'lock', 'open'] : ['third', 'lock'];
  };

  // ==========================================================================
  // RENDER HELPERS
  // ==========================================================================
  const renderButton = (type: ButtonType) => {
    const baseClass = `${buttonSize} text-zinc-300 hover:text-white hover:bg-zinc-700`;

    switch (type) {
      case 'third':
        if (!thirdButton) return null;
        return (
          <TooltipButton key="third" tooltip={thirdButton.tooltip} showTooltip={showTooltips} side={tooltipSide}>
            <Button
              variant="ghost"
              size="icon"
              onPointerUp={handleButtonClick(thirdButton.onClick)}
              onClick={(e) => e.stopPropagation()}
              className={baseClass}
              aria-label={thirdButton.ariaLabel}
            >
              {thirdButton.content || <Square className={iconSize} />}
            </Button>
          </TooltipButton>
        );

      case 'fourth':
        if (!fourthButton) return null;
        return (
          <TooltipButton key="fourth" tooltip={fourthButton.tooltip} showTooltip={showTooltips} side={tooltipSide}>
            <Button
              variant="ghost"
              size="icon"
              onPointerUp={handleButtonClick(fourthButton.onClick)}
              onClick={(e) => e.stopPropagation()}
              className={baseClass}
              aria-label={fourthButton.ariaLabel}
              data-tour={dataTourFourthButton}
            >
              {fourthButton.content || <Square className={iconSize} />}
            </Button>
          </TooltipButton>
        );

      case 'lock':
        return (
          <TooltipButton key="lock" tooltip="Lock pane open" showTooltip={showTooltips} side={tooltipSide}>
            <Button
              variant="ghost"
              size="icon"
              onPointerUp={handleButtonClick(() => toggleLock(true))}
              onClick={(e) => e.stopPropagation()}
              className={baseClass}
              aria-label="Lock pane"
              data-tour={dataTourLock}
            >
              <LockIcon className={iconSize} />
            </Button>
          </TooltipButton>
        );

      case 'unlock':
        return (
          <TooltipButton key="unlock" tooltip="Unlock pane" showTooltip={showTooltips} side={tooltipSide}>
            <Button
              variant="ghost"
              size="icon"
              onPointerUp={handleButtonClick(() => toggleLock(false))}
              onClick={(e) => e.stopPropagation()}
              className={baseClass}
              aria-label="Unlock pane"
            >
              <UnlockIcon className={iconSize} />
            </Button>
          </TooltipButton>
        );

      case 'open':
        return (
          <TooltipButton key="open" tooltip={paneTooltip} showTooltip={showTooltips} side={tooltipSide}>
            <Button
              variant="ghost"
              size="icon"
              onPointerUp={handleButtonClick(handleOpen)}
              onClick={(e) => e.stopPropagation()}
              className={baseClass}
              aria-label={paneTooltip || "Open pane"}
            >
              {getIcon()}
            </Button>
          </TooltipButton>
        );

      default:
        return null;
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  // Hide on mobile when selection is active
  if (!useDesktopBehavior && selectionActive) return null;

  const buttons = getButtonsToShow();

  // Nothing to show
  if (buttons.length === 0) return null;

  // Container styling
  // Only TasksPane (right side) should appear above MediaLightbox (z-[100000])
  // Other panes use normal z-index to stay behind the lightbox
  const isTasksPane = side === 'right';
  const aboveLightboxZIndex = 'z-[100001]';
  const normalLockedZIndex = PANE_CONFIG.zIndex.CONTROL_LOCKED;
  const normalUnlockedZIndex = PANE_CONFIG.zIndex.CONTROL_UNLOCKED;

  const zIndex = isTasksPane
    ? aboveLightboxZIndex  // TasksPane always above lightbox
    : (isLocked || (isOpen && !isLocked) ? normalLockedZIndex : normalUnlockedZIndex);

  const bgOpacity = isLocked || (isOpen && !isLocked) ? 'bg-zinc-800/90' : 'bg-zinc-800/80';
  const transition = isLocked || (isOpen && !isLocked)
    ? PANE_CONFIG.transition.PROPERTIES.TRANSFORM_ONLY
    : PANE_CONFIG.transition.PROPERTIES.TRANSFORM_OPACITY;

  const positionClasses = (() => {
    switch (side) {
      case 'left': return 'left-0 flex-col';
      case 'right': return 'right-0 flex-col';
      case 'bottom': return 'left-1/2 -translate-x-1/2 bottom-0 flex-row';
      default: return '';
    }
  })();

  // On mobile, left/right panes only show one button - make them taller for easier tapping
  const isMobileSidePane = !useDesktopBehavior && !isBottom && buttons.length === 1;

  // Add safe area margin for iOS home indicator - ONLY for bottom pane on mobile phones (not tablets)
  // iPad handles safe areas differently and doesn't need this adjustment
  const needsSafeAreaMargin = isMobile && !isTablet && isBottom;
  const mobileStyle = needsSafeAreaMargin ? {
    ...dynamicStyle,
    marginBottom: 'calc(env(safe-area-inset-bottom, 0px) * 0.5)',
  } : dynamicStyle;

  const content = (
    <div
      data-pane-control
      data-tour={dataTour}
      style={mobileStyle}
      className={cn(
        `fixed ${zIndex} flex items-center p-1 backdrop-blur-sm border border-zinc-700 rounded-md gap-1 duration-${PANE_CONFIG.timing.ANIMATION_DURATION} ${PANE_CONFIG.transition.EASING}`,
        bgOpacity,
        transition,
        positionClasses,
        'opacity-100 touch-none',
        // Taller touch target for mobile side panes with single button
        isMobileSidePane && 'min-h-[72px] justify-center'
      )}
      onMouseEnter={useDesktopBehavior && isOpen && !isLocked ? handlePaneEnter : undefined}
      onMouseLeave={useDesktopBehavior && isOpen && !isLocked ? handlePaneLeave : undefined}
      {...containerEventHandlers}
    >
      {buttons.map(renderButton)}
    </div>
  );

  // Wrap in TooltipProvider for desktop
  if (useDesktopBehavior) {
    return <TooltipProvider delayDuration={300}>{content}</TooltipProvider>;
  }

  return content;
};

export default PaneControlTab;
