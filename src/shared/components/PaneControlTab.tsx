import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { LockIcon, UnlockIcon, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';

interface PaneControlTabProps {
  side: 'left' | 'right' | 'bottom';
  isLocked: boolean;
  isOpen: boolean;
  toggleLock: (force?: boolean) => void;
  openPane: () => void;
  paneDimension: number;
  bottomOffset?: number;
  handlePaneEnter: () => void;
  handlePaneLeave: () => void;
}

const PaneControlTab: React.FC<PaneControlTabProps> = ({ side, isLocked, isOpen, toggleLock, openPane, paneDimension, bottomOffset = 0, handlePaneEnter, handlePaneLeave }) => {
  const isMobile = useIsMobile();
  
  const getDynamicStyle = (): React.CSSProperties => {
    const style: React.CSSProperties = {};
    if (side === 'left' || side === 'right') {
        style.top = `calc(50% - ${bottomOffset / 2}px)`;
        if(isLocked || (isOpen && !isLocked)) {
            style.transform = side === 'left' ? 'translate(-50%, -50%)' : 'translate(50%, -50%)';
            if(side === 'left') style.left = `${paneDimension}px`;
            else style.right = `${paneDimension}px`;
        } else {
            style.transform = 'translateY(-50%)';
        }
    } else if (side === 'bottom' && (isLocked || (isOpen && !isLocked))) {
        style.bottom = `${paneDimension}px`;
        style.left = '50%';
        style.transform = 'translate(-50%, 50%)';
    }
    return style;
  };

  // Mobile: Only show button when pane is closed
  if (isMobile) {
    // Don't show control when pane is open on mobile
    if (isOpen) return null;
    
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

    return (
      <div
        data-pane-control
        style={getDynamicStyle()}
        className={cn(
          'fixed z-[102] flex items-center p-1 bg-zinc-800/80 backdrop-blur-sm border border-zinc-700 rounded-md gap-1 transition-opacity duration-200',
          getPositionClasses(),
          'opacity-100'
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => openPane()}
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
    let positionClass = '';
    switch (side) {
        case 'left':
        case 'right':
            positionClass = 'flex-col';
            break;
        case 'bottom':
            positionClass = 'flex-row';
            break;
    }

    return (
      <div
        data-pane-control
        style={getDynamicStyle()}
        className={cn(
          'fixed z-[101] flex items-center p-1 bg-zinc-800/90 backdrop-blur-sm border border-zinc-700 rounded-md transition-all duration-200',
          positionClass
        )}
        onMouseEnter={handlePaneEnter}
        onMouseLeave={handlePaneLeave}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => toggleLock(true)}
          className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
          aria-label="Lock pane"
        >
          <LockIcon className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (isLocked) {
    let positionClass = '';
    switch (side) {
        case 'left':
        case 'right':
            positionClass = 'flex-col';
            break;
        case 'bottom':
            positionClass = 'flex-row';
            break;
    }

    return (
      <div
        data-pane-control
        style={getDynamicStyle()}
        className={cn(
          'fixed z-[101] flex items-center p-1 bg-zinc-800/90 backdrop-blur-sm border border-zinc-700 rounded-md transition-all duration-200',
          positionClass
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => toggleLock(false)}
          className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
          aria-label="Unlock pane"
        >
          <UnlockIcon className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Pane is closed (desktop)
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

  return (
    <div
      data-pane-control
      style={getDynamicStyle()}
      className={cn(
        'fixed z-[102] flex items-center p-1 bg-zinc-800/80 backdrop-blur-sm border border-zinc-700 rounded-md gap-1 transition-opacity duration-200',
        getPositionClasses(),
        isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={() => openPane()}
        className={cn(
          'text-zinc-300 hover:text-white hover:bg-zinc-700',
          side === 'bottom' ? 'h-8 w-16' : 'h-16 w-8'
        )}
        aria-label="Open pane"
      >
        {getIcon()}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => toggleLock(true)}
        className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
        aria-label="Lock pane"
      >
        <LockIcon className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default PaneControlTab;
