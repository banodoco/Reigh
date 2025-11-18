import React, { useState, useEffect } from 'react';
import { PaletteIcon } from '@/shared/components/PaletteIcon';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PaintParticles } from '@/shared/components/PaintParticles';
import { SocialIcons } from '@/shared/components/SocialIcons';
import type { Session } from '@supabase/supabase-js';

interface ExampleStyle {
  prompt: string;
  image1: string;
  image2: string;
  video: string;
}

interface HeroSectionProps {
  barTransitionCompleted: boolean;
  openTipOpen: boolean;
  setOpenTipOpen: (open: boolean) => void;
  openTipDisabled: boolean;
  setOpenTipDisabled: (disabled: boolean) => void;
  handleOpenToolActivate: () => void;
  showCreativePartner: boolean;
  showPhilosophy: boolean;
  showExamples: boolean;
  emergingTipOpen: boolean;
  setEmergingTipOpen: (open: boolean) => void;
  emergingTipDisabled: boolean;
  setEmergingTipDisabled: (disabled: boolean) => void;
  handleEmergingActivate: () => void;
  currentExample: ExampleStyle;
  session: Session | null;
  isBrushActive: boolean;
  setIsBrushActive: (active: boolean) => void;
  handleDiscordSignIn: () => void;
  navigate: (path: string) => void;
  assetsLoaded: boolean;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  barTransitionCompleted,
  openTipOpen,
  setOpenTipOpen,
  openTipDisabled,
  setOpenTipDisabled,
  handleOpenToolActivate,
  showCreativePartner,
  showPhilosophy,
  showExamples,
  emergingTipOpen,
  setEmergingTipOpen,
  emergingTipDisabled,
  setEmergingTipDisabled,
  handleEmergingActivate,
  currentExample,
  session,
  isBrushActive,
  setIsBrushActive,
  handleDiscordSignIn,
  navigate,
  assetsLoaded,
}) => {
  const [mounted, setMounted] = useState(false);
  const [barWidth, setBarWidth] = useState('100%');
  const [isAnimationComplete, setIsAnimationComplete] = useState(false);

  useEffect(() => {
    // Trigger expansion shortly after mount
    const timer = setTimeout(() => {
      setMounted(true);
      // Enable overflow after animation completes (1s duration + small buffer)
      setTimeout(() => setIsAnimationComplete(true), 1050);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Helper for staggering animations based on mount state
  const getFadeStyle = (delayIndex: number, forceWait: boolean = false) => ({
    opacity: mounted && !forceWait ? 1 : 0,
    transition: `opacity 0.8s ease-out ${delayIndex * 0.1}s`,
    transform: mounted && !forceWait ? 'translateY(0)' : 'translateY(10px)',
    transitionProperty: 'opacity, transform'
  });

  return (
    <div className="container mx-auto px-4 relative flex items-center justify-center min-h-screen py-8">
      <div className="text-center w-full">
        <div className="max-w-4xl mx-auto">
          
          {/* Top Section: Icon + Title */}
          {/* Use grid-template-rows for height animation from 0 to auto */}
          <div 
            className="grid transition-[grid-template-rows] duration-1000 ease-out"
            style={{ gridTemplateRows: mounted ? '1fr' : '0fr' }}
          >
            <div className={isAnimationComplete ? "overflow-visible" : "overflow-hidden"}>
              {/* Icon above title - wait for assets */}
              <div style={getFadeStyle(0, !assetsLoaded)} className="relative z-50">
                <PaletteIcon className="mb-6 mt-0" />
              </div>
              
              {/* Main title */}
              <div style={getFadeStyle(1)}>
                <h1 className="font-theme text-6xl md:text-8xl font-theme-heading text-primary mb-8 text-shadow-vintage">
                  Reigh
                </h1>
              </div>
            </div>
          </div>
          
          {/* Decorative divider - THE BAR */}
          {/* This element is always visible and dictates the center point when other sections are collapsed */}
          <div 
            className="w-32 h-1.5 mx-auto relative"
          >
            {/* Background track */}
            <div className="absolute inset-0 bg-muted/20 rounded-full"></div>
            {/* Loaded bar - always full width now */}
            <div 
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-wes-pink to-wes-vintage-gold rounded-full shadow-inner-vintage ease-out"
              style={{ 
                width: barWidth, 
                transition: 'width 0s' 
              }}
            ></div>
          </div>
          
          {/* Bottom Section: Subtitle + Buttons + Footer */}
          <div 
            className="grid transition-[grid-template-rows] duration-1000 ease-out"
            style={{ gridTemplateRows: mounted ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden">
              {/* Subtitle */}
              <div className="mt-8" style={getFadeStyle(2)}>
                <p className="font-theme text-xl md:text-2xl font-theme-body text-muted-foreground leading-relaxed tracking-wide mb-8">
                  An{' '}
                  <TooltipProvider>
                    <Tooltip open={openTipOpen} onOpenChange={(o)=>{ if(!openTipDisabled) setOpenTipOpen(o); }}>
                      <TooltipTrigger asChild>
                        <span
                          onClick={handleOpenToolActivate}
                          onMouseLeave={() => { if(openTipDisabled) setOpenTipDisabled(false);} }
                          className={`sparkle-underline cursor-pointer transition-colors duration-200 ${openTipOpen ? 'tooltip-open' : ''} ${openTipDisabled ? 'pointer-events-none' : ''} ${
                            showCreativePartner ? 'pointer-events-none opacity-60' : showPhilosophy || showExamples ? 'opacity-40 pointer-events-none brightness-50 transition-all duration-100' : 'opacity-100 pointer-events-auto transition-all duration-300'
                          }`}
                        >
                          open source tool
                        </span>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        align="center"
                        onClick={handleOpenToolActivate}
                        className="group flex items-center gap-2 text-left p-3 max-w-xs border-2 border-transparent bg-wes-cream/80 rounded-lg shadow-md cursor-pointer transition-all duration-300 hover:bg-gradient-to-r hover:from-wes-pink/10 hover:via-wes-coral/10 hover:to-wes-vintage-gold/10 hover:border-transparent hover:bg-origin-border hover:shadow-2xl hover:-translate-y-1"
                      >
                        <div className="flex-shrink-0">
                          <ChevronLeft className="hover-arrow w-6 h-6 text-wes-vintage-gold transition-transform transition-colors duration-700 ease-in-out group-hover:text-wes-coral group-hover:animate-sway-x" />
                        </div>
                        <p className="text-xs sm:text-sm leading-relaxed text-primary">
                          Reigh is open source and can be run for free on your computer, or in the cloud for convenience.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>{' '}for{' '}
                  <TooltipProvider>
                    <Tooltip
                      open={emergingTipOpen}
                      onOpenChange={(o) => {
                        if (!emergingTipDisabled) setEmergingTipOpen(o);
                      }}
                    >
                      <TooltipTrigger asChild>
                        <span
                          onClick={handleEmergingActivate}
                          onMouseLeave={() => {
                            if (emergingTipDisabled) setEmergingTipDisabled(false);
                          }}
                          className={`sparkle-underline cursor-pointer transition-colors duration-200 whitespace-nowrap ${emergingTipOpen ? 'tooltip-open' : ''} ${emergingTipDisabled ? 'pointer-events-none' : ''} ${
                            showExamples
                              ? 'pointer-events-none opacity-60'
                              : showCreativePartner || showPhilosophy
                              ? 'opacity-40 pointer-events-none brightness-50 transition-all duration-100'
                              : 'opacity-100 pointer-events-auto transition-all duration-300'
                          }`}
                        >
                          travelling between images
                        </span>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        align="center"
                        onClick={handleEmergingActivate}
                        className="group flex items-center gap-2 text-left p-4 max-w-xs min-h-[80px] border-2 border-transparent bg-wes-cream/80 rounded-lg shadow-md cursor-pointer transition-all duration-300 hover:bg-gradient-to-r hover:from-wes-pink/10 hover:via-wes-coral/10 hover:to-wes-vintage-gold/10 hover:border-transparent hover:bg-origin-border hover:shadow-2xl hover:-translate-y-1"
                      >
                        <div className="flex items-center gap-1 text-primary">
                          <img 
                            src={currentExample.image1} 
                            alt="Input image 1"
                            className="w-16 h-16 sm:w-20 sm:h-20 object-cover border rounded ml-2"
                          />
                          <span className="text-lg sm:text-xl font-light px-3">+</span>
                          <img 
                            src={currentExample.image2} 
                            alt="Input image 2"
                            className="w-16 h-16 sm:w-20 sm:h-20 object-cover border rounded"
                          />
                          <span className="text-lg sm:text-xl font-light pl-4">=</span>
                        </div>
                        <div className="flex-shrink-0 flex items-center">
                          <ChevronRight className="hover-arrow w-6 h-6 text-primary transition-transform transition-colors duration-700 ease-in-out group-hover:text-primary group-hover:animate-sway-x" strokeWidth={1.5} />
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </p>
              </div>
              
              {/* Sign-in button below hero */}
              <div style={getFadeStyle(3)}>
                {!session ? (
                  <div
                    className="group"
                    onMouseEnter={() => setIsBrushActive(true)}
                    onMouseLeave={() => setIsBrushActive(false)}
                  >
                    <button
                      onClick={handleDiscordSignIn}
                      className="flex items-center space-x-2 px-6 py-4 bg-gradient-to-r from-wes-vintage-gold to-wes-coral rounded-full border-2 border-wes-vintage-gold/40 hover:border-wes-vintage-gold/60 shadow-wes-vintage hover:shadow-wes-hover text-white text-lg font-light mx-auto relative overflow-hidden"
                      style={{ transition: 'transform 0.3s ease-in-out, border-color 0.3s ease-in-out, box-shadow 0.5s ease-in-out' }}
                    >
                      {/* Pulsing effect on hover */}
                      <div className="absolute -bottom-1/2 -left-1/2 w-1/2 h-[200%] group-hover:animate-pulse-sweep bg-gradient-to-r from-transparent via-wes-vintage-gold/40 to-transparent pointer-events-none -rotate-45" />
                      
                      <div className="relative">
                        {/* Paint particles - behind the brush */}
                        <PaintParticles />
                        
                        {/* Paintbrush Icon - in front */}
                        <div className="w-5 h-5 relative z-10">
                          <div 
                            className={`paintbrush-anim w-full h-full origin-[50%_90%] ${isBrushActive ? 'is-running' : ''}`}
                          >
                            <img 
                              src="/brush-paintbrush-icon.webp"
                              alt="Paintbrush"
                              className="w-full h-full brightness-0 invert" 
                            />
                          </div>
                        </div>
                      </div>
                      <span>Sign in with Discord</span>
                    </button>
                  </div>
                ) : (
                  <div
                    className="group"
                    onMouseEnter={() => setIsBrushActive(true)}
                    onMouseLeave={() => setIsBrushActive(false)}
                  >
                    <button
                      onPointerUp={() => navigate('/tools')}
                      className="flex items-center space-x-2 px-6 py-4 bg-gradient-to-r from-wes-vintage-gold to-wes-coral rounded-full border-2 border-wes-vintage-gold/40 hover:border-wes-vintage-gold/60 shadow-wes-vintage hover:shadow-wes-hover text-white text-lg font-light mx-auto relative overflow-hidden"
                      style={{ transition: 'transform 0.3s ease-in-out, border-color 0.3s ease-in-out, box-shadow 0.5s ease-in-out' }}
                    >
                      {/* Pulsing effect on hover */}
                      <div className="absolute -bottom-1/2 -left-1/2 w-1/2 h-[200%] group-hover:animate-pulse-sweep bg-gradient-to-r from-transparent via-wes-vintage-gold/40 to-transparent pointer-events-none -rotate-45" />
                      
                      <div className="relative">
                        {/* Paint particles - behind the brush */}
                        <PaintParticles />
                        
                        {/* Paintbrush Icon - in front */}
                        <div className="w-5 h-5 relative z-10">
                          <div 
                            className={`paintbrush-anim w-full h-full origin-[50%_90%] ${isBrushActive ? 'is-running' : ''}`}
                          >
                            <img 
                              src="/brush-paintbrush-icon.webp"
                              alt="Paintbrush"
                              className="w-full h-full brightness-0 invert" 
                            />
                          </div>
                        </div>
                      </div>
                      <span>Go to Tools</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Social Icons */}
              <div style={getFadeStyle(4)}>
                <div className="mt-8">
                  <SocialIcons />
                </div>
              </div>

              {/* Banodoco Logo */}
              <div style={getFadeStyle(3, !assetsLoaded)}>
                <div className="flex justify-center">
                  <div className="mt-2">
                    <a
                      href="http://banodoco.ai/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block transition-all duration-700 ease-in-out"
                    >
                      <img 
                        src="/banodoco-gold.png" 
                        alt="Banodoco" 
                        className="w-[34px] h-[34px] object-contain opacity-100 brightness-[0.75] hue-rotate-[-30deg] saturate-150 hover:brightness-100 transition-all duration-700 ease-in-out hover:saturate-150 hover:hue-rotate-[-15deg]" 
                      />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

