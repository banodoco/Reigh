import React, { useState, useRef } from 'react';
import { Palette } from 'lucide-react';

interface PaletteIconProps {
  className?: string;
}

export const PaletteIcon: React.FC<PaletteIconProps> = ({ className = "" }) => {
  const [isDehovering, setIsDehovering] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  const [tooltipBelow, setTooltipBelow] = useState(false);
  const paletteRef = useRef(null);

  const handleMouseLeave = () => {
    setIsDehovering(true);
    setTimeout(() => setIsDehovering(false), 10000); // match 10s transition
  };

  const handlePaletteClick = () => {
    setShowQuote(true);
    
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
  };

  const handleQuoteMouseLeave = () => {
    setShowQuote(false);
  };

  return (
    <div className={`flex justify-center ${className}`}>
      <div className="relative">
        <div 
          className={`palette-wrapper flex items-center justify-center w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-wes-coral/60 via-wes-salmon/60 to-wes-vintage-gold/60 rounded-lg border border-wes-vintage-gold/20 shadow-sm opacity-70 group group-hover:opacity-100 cursor-pointer ${isDehovering ? 'dehovering' : ''}`} 
          onMouseLeave={(e) => {
            handleMouseLeave();
            // Only hide quote if not moving to the tooltip
            const relatedTarget = e.relatedTarget as Element;
            if (!relatedTarget?.closest('[data-quote-tooltip]')) {
              setShowQuote(false);
            }
          }}
          onClick={handlePaletteClick}
        >
          <Palette ref={paletteRef} className="palette-icon h-6 w-6 md:h-7 md:w-7 text-white/90 transition-transform duration-300 group-hover:rotate-3 group-hover:scale-105" />
        </div>
        
        {/* Quote Modal */}
        {showQuote && (
          <div 
            className={`absolute left-1/2 transform -translate-x-1/2 z-[70] w-screen max-w-2xl px-4 ${
              tooltipBelow 
                ? 'top-full mt-2' 
                : 'bottom-full mb-2'
            }`}
            data-quote-tooltip
            onMouseLeave={handleQuoteMouseLeave}
          >
            <div 
              className="group flex flex-col items-center gap-2 text-center p-6 w-full border-2 border-transparent bg-wes-cream/95 rounded-lg shadow-md cursor-pointer transition-all duration-300 hover:bg-gradient-to-r hover:from-wes-pink/10 hover:via-wes-coral/10 hover:to-wes-vintage-gold/10 hover:border-transparent hover:bg-origin-border hover:shadow-2xl hover:-translate-y-1 relative"
              onClick={(e) => e.stopPropagation()}
            >
              
              {/* Quote */}
              <blockquote className="text-xs sm:text-sm leading-relaxed text-primary italic font-medium">
                <span className="underline decoration-wes-pink decoration-2 underline-offset-2 font-semibold">Practice any art</span>—music, singing, dancing, acting, drawing, painting, sculpting, poetry, fiction, essays, reportage—<span className="not-italic font-medium px-1 py-0.5 rounded text-wes-forest">no matter how well or badly</span>, not to get money and fame, but to <span className="font-bold text-wes-coral">experience becoming</span>, to find out <span className="font-bold text-wes-vintage-gold">what's inside you</span>, to <span className="animated-soul-grow">make your soul grow</span>.
              </blockquote>
              
              {/* Attribution */}
              <p className="text-xs text-muted-foreground font-medium opacity-70">— Kurt Vonnegut —</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 