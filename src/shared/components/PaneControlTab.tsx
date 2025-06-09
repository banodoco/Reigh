import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { LockIcon, UnlockIcon, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface PaneControlTabProps {
  side: 'left' | 'right' | 'bottom';
  isLocked: boolean;
  isOpen: boolean;
  toggleLock: (force?: boolean) => void;
  openPane: () => void;
  paneDimension: number;
  bottomOffset?: number;
}

const PaneControlTab: React.FC<PaneControlTabProps> = ({ side, isLocked, isOpen, toggleLock, openPane, paneDimension, bottomOffset = 0 }) => {
  if (isOpen && !isLocked) { // Pane is in "peek" state (hovered but not locked)
    return null;
  }

  const getDynamicStyle = (): React.CSSProperties => {
    const style: React.CSSProperties = {};
    if (side === 'left' || side === 'right') {
        style.top = `calc(50% - ${bottomOffset / 2}px)`;
        if(isLocked) {
            style.transform = side === 'left' ? 'translate(-50%, -50%)' : 'translate(50%, -50%)';
            if(side === 'left') style.left = `${paneDimension}px`;
            else style.right = `${paneDimension}px`;
        } else {
            style.transform = 'translateY(-50%)';
        }
    } else if (side === 'bottom' && isLocked) {
        style.bottom = `${paneDimension}px`;
        style.left = '50%';
        style.transform = 'translate(-50%, 50%)';
    }
    return style;
  };

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

  // Pane is closed
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
        className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
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
