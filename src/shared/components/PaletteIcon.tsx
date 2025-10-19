import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Palette } from 'lucide-react';

interface PaletteIconProps {
  className?: string;
}

// Animation state type for better type safety
type QuoteState = 'closed' | 'opening' | 'open' | 'closing';

// Configuration constants
const ANIMATION_CONFIG = {
  DEHOVERING_TIMEOUT: 1000,
  QUOTE_CLOSE_DURATION: 250,
  TOOLTIP_HEIGHT_THRESHOLD: 200,
} as const;

export const PaletteIcon: React.FC<PaletteIconProps> = ({ className = "" }) => {
  // Consolidated state management
  const [isHovering, setIsHovering] = useState(false);
  const [isDehovering, setIsDehovering] = useState(false);
  const [quoteState, setQuoteState] = useState<QuoteState>('closed');
  const [tooltipBelow, setTooltipBelow] = useState(false);
  const paletteRef = useRef<HTMLElement>(null);

  // Computed state based on quote state
  const showQuote = quoteState !== 'closed';
  const isQuoteOpening = quoteState === 'opening';
  const isQuoteClosing = quoteState === 'closing';

  // Event handlers with useCallback for performance
  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
    setIsDehovering(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    setIsDehovering(false);
  }, []);

  const handlePaletteClick = useCallback(() => {
    // Prevent action if already opening or open
    if (quoteState === 'opening' || quoteState === 'open') return;
    
    // Determine tooltip position based on available space
    if (paletteRef.current) {
      const iconRect = paletteRef.current.getBoundingClientRect();
      const spaceAbove = iconRect.top;
      setTooltipBelow(spaceAbove < ANIMATION_CONFIG.TOOLTIP_HEIGHT_THRESHOLD);
    }

    // Start opening animation sequence
    setQuoteState('opening');
    
    // Complete opening on next frame to ensure DOM update
    requestAnimationFrame(() => {
      setQuoteState('open');
    });
  }, [quoteState]);

  const handleQuoteMouseLeave = useCallback(() => {
    // Prevent duplicate closing actions
    if (quoteState === 'closing') return;
    
    // Start closing animation
    setQuoteState('closing');
    
    // End hovering state when quote starts closing to allow border animation to complete naturally
    setIsHovering(false);
    
    // Complete closing after animation duration
    setTimeout(() => {
      setQuoteState('closed');
    }, ANIMATION_CONFIG.QUOTE_CLOSE_DURATION);
  }, [quoteState]);

  const handlePaletteMouseLeave = useCallback((e: React.MouseEvent) => {
    handleMouseLeave();
    
    // Only hide quote if not moving to the tooltip
    const relatedTarget = e.relatedTarget as Element;
    if (!relatedTarget?.closest('[data-quote-tooltip]')) {
      handleQuoteMouseLeave();
    }
  }, [handleMouseLeave, handleQuoteMouseLeave]);

  // Memoized class compositions for better performance and readability
  const paletteWrapperClasses = useMemo(() => {
    const baseClasses = [
      'palette-wrapper',
      'flex items-center justify-center',
      'w-12 h-12 md:w-[4.2rem] md:h-[4.2rem]',
      'bg-gradient-to-br from-wes-coral/60 via-wes-salmon/60 to-wes-vintage-gold/60',
      'rounded-lg border border-wes-vintage-gold/20',
      'shadow-sm opacity-90',
      'group group-hover:opacity-100',
      'cursor-pointer',
      'transition-opacity duration-300 transition-transform duration-300'
    ];

    const conditionalClasses = [
      isDehovering && 'dehovering',
      isHovering && 'is-hovering',
      showQuote && 'ring-2 ring-wes-vintage-gold/40 shadow-lg'
    ].filter(Boolean);

    return [...baseClasses, ...conditionalClasses].join(' ');
  }, [isDehovering, isHovering, showQuote]);

  const paletteIconClasses = useMemo(() => {
    const baseClasses = [
      'palette-icon',
      'h-6 w-6 md:h-[2.1rem] md:w-[2.1rem]',
      'text-white/90',
      'transition-transform duration-300',
      'group-hover:rotate-3 group-hover:scale-105'
    ];

    const conditionalClasses = [
      showQuote && 'scale-110 rotate-6'
    ].filter(Boolean);

    return [...baseClasses, ...conditionalClasses].join(' ');
  }, [showQuote]);

  return (
    <div className={`flex justify-center ${className}`}>
      <div className="relative">
        <div 
          className={paletteWrapperClasses}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handlePaletteMouseLeave}
          onClick={handlePaletteClick}
        >
          <Palette ref={paletteRef} className={paletteIconClasses} />
        </div>
        
        {/* Quote Modal */}
        {showQuote && <QuoteModal 
          tooltipBelow={tooltipBelow}
          isQuoteOpening={isQuoteOpening}
          isQuoteClosing={isQuoteClosing}
          isHovering={isHovering}
          onMouseLeave={handleQuoteMouseLeave}
        />}
        

      </div>
    </div>
  );
};

// Extracted QuoteModal component for better separation of concerns
interface QuoteModalProps {
  tooltipBelow: boolean;
  isQuoteOpening: boolean;
  isQuoteClosing: boolean;
  isHovering: boolean;
  onMouseLeave: () => void;
}

const QuoteModal: React.FC<QuoteModalProps> = ({
  tooltipBelow,
  isQuoteOpening,
  isQuoteClosing,
  isHovering,
  onMouseLeave
}) => {
  // Memoized class compositions for quote modal
  const quoteModalClasses = useMemo(() => {
    const baseClasses = [
      'absolute left-1/2 z-[70]',
      'w-screen max-w-2xl px-4',
      'transition-all duration-300 ease-out'
    ];

    const positionClasses = tooltipBelow 
      ? ['top-full mt-3 origin-top']
      : ['bottom-full mb-3 origin-bottom'];

    const animationClasses = (isQuoteOpening || isQuoteClosing)
      ? ['opacity-0 scale-90 -translate-x-1/2']
      : ['opacity-100 scale-100 -translate-x-1/2'];

    return [...baseClasses, ...positionClasses, ...animationClasses].join(' ');
  }, [tooltipBelow, isQuoteOpening, isQuoteClosing]);

  const connectingLineClasses = useMemo(() => {
    const baseClasses = [
      'absolute left-1/2 transform -translate-x-1/2',
      'w-0.5 h-6 rounded-full shadow-sm',
      'transition-all duration-1000 ease-out'
    ];

    const positionClasses = tooltipBelow
      ? ['-top-3 origin-top bg-gradient-to-b from-wes-vintage-gold/80 to-wes-cream']
      : ['-bottom-3 origin-bottom bg-gradient-to-t from-wes-vintage-gold/80 to-wes-cream'];

    const scaleClasses = [
      !isQuoteClosing ? 'scale-y-100' : 'scale-y-0'
    ];

    const animationClasses = [
      isHovering && 'animate-connecting-line-hover'
    ].filter(Boolean);

    return [...baseClasses, ...positionClasses, ...scaleClasses, ...animationClasses].join(' ');
  }, [tooltipBelow, isQuoteClosing, isHovering]);

  const connectingDotClasses = useMemo(() => {
    const baseClasses = [
      'absolute left-1/2 transform -translate-x-1/2',
      'w-2 h-2 rounded-full bg-wes-vintage-gold/80 shadow-sm',
      'transition-all duration-1000 ease-out'
    ];

    const positionClasses = tooltipBelow ? ['-top-1'] : ['-bottom-1'];

    const visibilityClasses = !isQuoteClosing
      ? ['opacity-100 scale-100 delay-500']
      : ['opacity-0 scale-50'];

    return [...baseClasses, ...positionClasses, ...visibilityClasses].join(' ');
  }, [tooltipBelow, isQuoteClosing]);

  const quoteBoxClasses = useMemo(() => {
    const baseClasses = [
      'group flex flex-col items-center gap-2',
      'text-center p-6 w-full border-2',
      'bg-wes-cream rounded-lg shadow-md cursor-pointer',
      'transition-all duration-300',
      'hover:bg-gradient-to-r hover:from-wes-pink/10 hover:via-wes-coral/10 hover:to-wes-vintage-gold/10',
      'hover:bg-origin-border hover:shadow-2xl hover:-translate-y-1',
      'relative'
    ];

    const conditionalClasses = [
      isHovering && 'quote-box-hover'
    ].filter(Boolean);

    return [...baseClasses, ...conditionalClasses].join(' ');
  }, [isHovering]);

  const quoteBoxStyle = useMemo(() => ({
    borderColor: isHovering ? 'rgba(253, 226, 228, 0.6)' : 'transparent',
    animation: isHovering ? 'quote-border-color-cycle 32s ease-in-out 1s infinite' : 'none'
  }), [isHovering]);

  return (
    <div 
      className={quoteModalClasses}
      style={{
        transformOrigin: tooltipBelow ? 'center top' : 'center bottom'
      }}
      data-quote-tooltip
      onMouseLeave={onMouseLeave}
    >
      {/* Connecting Line with synchronized color animation */}
      <div className={connectingLineClasses} />
      
      {/* Connecting Dot at Icon */}
      <div className={connectingDotClasses} />
      
      <div 
        className={quoteBoxClasses}
        style={quoteBoxStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Quote */}
        <blockquote className="text-xs sm:text-sm leading-relaxed text-primary italic font-light">
          <span className="underline decoration-wes-pink decoration-2 underline-offset-2 font-light">
            Practice any art
          </span>
          —music, singing, dancing, acting, drawing, painting, sculpting, poetry, fiction, essays, reportage—
          <span className="not-italic font-light text-wes-forest">
            no matter how well or badly
          </span>
          , not to get money and fame, but to{' '}
          <span className="font-bold text-wes-coral">experience becoming</span>
          , to find out{' '}
          <span className="font-bold text-wes-vintage-gold">what's inside you</span>
          , to{' '}
          <span className="animated-soul-grow">make your soul grow</span>
          .
        </blockquote>
        
        {/* Attribution */}
        <p className="text-xs text-muted-foreground font-light opacity-70">
          — Kurt Vonnegut —
        </p>
      </div>
    </div>
  );
}; 