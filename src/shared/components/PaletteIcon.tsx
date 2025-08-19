import React, { useState, useRef } from 'react';
import { Palette } from 'lucide-react';

interface PaletteIconProps {
  className?: string;
}

export const PaletteIcon: React.FC<PaletteIconProps> = ({ className = "" }) => {
  const [isDehovering, setIsDehovering] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  const [isQuoteOpening, setIsQuoteOpening] = useState(false);
  const [isQuoteClosing, setIsQuoteClosing] = useState(false);
  const [tooltipBelow, setTooltipBelow] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const paletteRef = useRef(null);

  const handleMouseEnter = () => {
    setIsHovering(true);
    setIsDehovering(false);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    setIsDehovering(true);
    setTimeout(() => setIsDehovering(false), 10000); // match 10s transition
  };

  const handlePaletteClick = () => {
    // Don't open if already opening or open
    if (isQuoteOpening || showQuote) return;
    
    // Check if there's enough space above for the tooltip
    if (paletteRef.current) {
      const iconRect = paletteRef.current.getBoundingClientRect();
      const tooltipHeight = 200; // Approximate tooltip height
      const spaceAbove = iconRect.top;
      
      if (spaceAbove < tooltipHeight) {
        setTooltipBelow(true);
      } else {
        setTooltipBelow(false);
      }
    }

    // Show quote first, then trigger animation on next frame
    setShowQuote(true);
    setIsQuoteOpening(true);
    
    // Use requestAnimationFrame to ensure the opening state triggers after DOM update
    requestAnimationFrame(() => {
      setIsQuoteOpening(false);
    });
  };

  const handleQuoteMouseLeave = () => {
    // Don't close if already closing
    if (isQuoteClosing) return;
    
    // Start closing animation
    setIsQuoteClosing(true);
    
    // Complete closing animation and hide after duration
    setTimeout(() => {
      setShowQuote(false);
      setIsQuoteClosing(false);
    }, 250);
  };

  return (
    <div className={`flex justify-center ${className}`}>
      <div className="relative">
        <div 
          className={`palette-wrapper flex items-center justify-center w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-wes-coral/60 via-wes-salmon/60 to-wes-vintage-gold/60 rounded-lg border border-wes-vintage-gold/20 shadow-sm opacity-70 group group-hover:opacity-100 cursor-pointer transition-all duration-300 ${isDehovering ? 'dehovering' : ''} ${showQuote ? 'ring-2 ring-wes-vintage-gold/40 shadow-lg' : ''}`} 
          onMouseEnter={handleMouseEnter}
          onMouseLeave={(e) => {
            handleMouseLeave();
            // Only hide quote if not moving to the tooltip
            const relatedTarget = e.relatedTarget as Element;
            if (!relatedTarget?.closest('[data-quote-tooltip]')) {
              handleQuoteMouseLeave();
            }
          }}
          onClick={handlePaletteClick}
        >
          <Palette ref={paletteRef} className={`palette-icon h-6 w-6 md:h-7 md:w-7 text-white/90 transition-transform duration-300 group-hover:rotate-3 group-hover:scale-105 ${showQuote ? 'scale-110 rotate-6' : ''}`} />
        </div>
        
        {/* Quote Modal */}
        {showQuote && (
          <div 
            className={`absolute left-1/2 z-[70] w-screen max-w-2xl px-4 transition-all duration-300 ease-out ${
              tooltipBelow 
                ? 'top-full mt-3 origin-top' 
                : 'bottom-full mb-3 origin-bottom'
            } ${
              isQuoteOpening 
                ? 'opacity-0 scale-90 -translate-x-1/2' 
                : isQuoteClosing 
                  ? 'opacity-0 scale-90 -translate-x-1/2' 
                  : 'opacity-100 scale-100 -translate-x-1/2'
            }`}
            style={{
              transformOrigin: tooltipBelow ? 'center top' : 'center bottom'
            }}
            data-quote-tooltip
            onMouseLeave={handleQuoteMouseLeave}
          >
            {/* Connecting Line with synchronized color animation */}
            <div 
              className={`absolute left-1/2 transform -translate-x-1/2 w-0.5 h-6 rounded-full shadow-sm transition-all duration-1000 ease-out ${
                tooltipBelow 
                  ? '-top-3 origin-top bg-gradient-to-b from-wes-vintage-gold/80 to-wes-cream' 
                  : '-bottom-3 origin-bottom bg-gradient-to-t from-wes-vintage-gold/80 to-wes-cream'
              } ${
                showQuote && !isQuoteClosing
                  ? 'scale-y-100' 
                  : 'scale-y-0'
              } ${
                isHovering ? 'animate-connecting-line-hover' : ''
              }`}
            />
            
            {/* Connecting Dot at Icon */}
            <div className={`absolute left-1/2 transform -translate-x-1/2 w-2 h-2 rounded-full bg-wes-vintage-gold/80 shadow-sm transition-all duration-1000 ease-out ${
              tooltipBelow 
                ? '-top-1' 
                : '-bottom-1'
            } ${
              showQuote && !isQuoteClosing
                ? 'opacity-100 scale-100 delay-500' 
                : 'opacity-0 scale-50'
            }`} />
            
            <div 
              className={`group flex flex-col items-center gap-2 text-center p-6 w-full border-2 bg-wes-cream rounded-lg shadow-md cursor-pointer transition-all duration-300 hover:bg-gradient-to-r hover:from-wes-pink/10 hover:via-wes-coral/10 hover:to-wes-vintage-gold/10 hover:bg-origin-border hover:shadow-2xl hover:-translate-y-1 relative ${
                isHovering ? 'quote-box-hover' : ''
              }`}
              style={{
                borderColor: isHovering ? 'rgba(253, 226, 228, 0.6)' : 'transparent',
                animation: isHovering ? 'quote-border-color-cycle 32s ease-in-out 1s infinite' : 'none'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              
              {/* Quote */}
              <blockquote className="text-xs sm:text-sm leading-relaxed text-primary italic font-light">
                <span className="underline decoration-wes-pink decoration-2 underline-offset-2 font-light">Practice any art</span>—music, singing, dancing, acting, drawing, painting, sculpting, poetry, fiction, essays, reportage—<span className="not-italic font-light text-wes-forest">no matter how well or badly</span>, not to get money and fame, but to <span className="font-bold text-wes-coral">experience becoming</span>, to find out <span className="font-bold text-wes-vintage-gold">what's inside you</span>, to <span className="animated-soul-grow">make your soul grow</span>.
              </blockquote>
              
              {/* Attribution */}
              <p className="text-xs text-muted-foreground font-light opacity-70">— Kurt Vonnegut —</p>
            </div>
          </div>
        )}
        

      </div>
    </div>
  );
}; 