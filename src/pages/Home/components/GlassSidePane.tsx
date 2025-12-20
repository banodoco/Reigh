import React from 'react';
import { X } from 'lucide-react';
import { useScrollFade } from '@/shared/hooks/useScrollFade';
import { useIsMobile } from '@/shared/hooks/use-mobile';

interface GlassSidePaneProps {
  isOpen: boolean;
  onClose: () => void;
  side: 'left' | 'right';
  children: React.ReactNode;
  zIndex?: number;
}

export const GlassSidePane: React.FC<GlassSidePaneProps> = ({
  isOpen,
  onClose,
  side,
  children,
  zIndex = 60,
}) => {
  const isMobile = useIsMobile();
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  const scrollFade = useScrollFade({ 
    isOpen,
    debug: false,
    preloadFade: isMobile
  });

  const setRefs = (element: HTMLDivElement | null) => {
    contentRef.current = element;
    if (scrollFade.scrollRef) {
      // @ts-ignore - handling multiple refs
      scrollFade.scrollRef.current = element;
    }
  };

  const isLeft = side === 'left';
  
  const positionClasses = isLeft
    ? 'left-0 border-r translate-x-0 -translate-x-full'
    : 'right-0 border-l translate-x-0 translate-x-full';
  
  const gradientDirection = isLeft ? 'bg-gradient-to-r' : 'bg-gradient-to-l';
  const translateOpen = isLeft ? 'translate-x-0' : 'translate-x-0';
  const translateClosed = isLeft ? '-translate-x-full' : 'translate-x-full';

  return (
    <div 
      className={`fixed top-0 ${isLeft ? 'left-0 border-r' : 'right-0 border-l'} h-full w-5/6 max-w-[30rem] sm:w-[30rem] ${gradientDirection} from-background/25 via-background/15 to-background/10 backdrop-blur-xl backdrop-saturate-150 border-border/15 shadow-2xl transform transition-transform duration-300 ease-in-out overflow-visible flex flex-col ${
        isOpen ? translateOpen : translateClosed
      }`}
      style={{ zIndex }}
    >
      <div 
        ref={setRefs} 
        className="px-4 sm:px-8 pb-4 sm:pb-8 flex-1 overflow-y-auto overflow-x-visible min-h-0 relative z-20 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-foreground/30 [scrollbar-width:thin] [scrollbar-color:rgb(255_255_255_/_0.2)_transparent]"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 sm:top-3 sm:right-3 p-1.5 rounded-full bg-background/40 backdrop-blur-sm border border-foreground/30 hover:bg-background/60 hover:border-foreground/50 transition-colors duration-200 z-10"
        >
          <X className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-foreground/60" />
        </button>
        
        {children}
      </div>
      
      {/* Bottom fade */}
      {scrollFade.showFade && (
        <div 
          className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none z-30"
        >
          <div className="h-full bg-gradient-to-t from-background/40 via-background/20 to-transparent backdrop-blur-sm" />
        </div>
      )}
    </div>
  );
};
