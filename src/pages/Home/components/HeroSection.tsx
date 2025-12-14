import React, { useState, useEffect, useRef } from 'react';
import { Github, MessageCircle, Plus, ChevronLeft, ChevronRight, Download, ExternalLink } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { usePlatformInstall } from '@/shared/hooks/usePlatformInstall';
import { InstallInstructionsModal } from './InstallInstructionsModal';
import type { Session } from '@supabase/supabase-js';

interface ExampleStyle {
  prompt: string;
  image1: string;
  image2: string;
  video: string;
}

interface HeroSectionProps {
  barTransitionCompleted: boolean;
  session: Session | null;
  handleDiscordSignIn: () => void;
  navigate: (path: string) => void;
  assetsLoaded: boolean;
  handleOpenToolActivate: () => void;
  handleEmergingActivate: () => void;
  currentExample: ExampleStyle;
}

type AnimationPhase = 'initial' | 'loading' | 'bar-complete' | 'content-revealing' | 'complete';

// Animated CTA button content that smoothly transitions between states
interface CTAContentProps {
  icon: 'download' | 'plus' | 'external' | 'discord' | null;
  text: string;
}

const CTAContent: React.FC<CTAContentProps> = ({ icon, text }) => {
  const [displayedIcon, setDisplayedIcon] = useState(icon);
  const [displayedText, setDisplayedText] = useState(text);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevIconRef = useRef(icon);
  const prevTextRef = useRef(text);

  useEffect(() => {
    // Only animate if the content actually changed
    if (icon !== prevIconRef.current || text !== prevTextRef.current) {
      setIsTransitioning(true);
      
      // After fade out, update content
      const updateTimer = setTimeout(() => {
        setDisplayedIcon(icon);
        setDisplayedText(text);
      }, 150);
      
      // After content update, fade back in
      const fadeInTimer = setTimeout(() => {
        setIsTransitioning(false);
      }, 180);
      
      prevIconRef.current = icon;
      prevTextRef.current = text;
      
      return () => {
        clearTimeout(updateTimer);
        clearTimeout(fadeInTimer);
      };
    }
  }, [icon, text]);

  return (
    <>
      <div 
        className={`transition-all duration-150 ${
          isTransitioning ? 'opacity-0 scale-75' : 'opacity-100 scale-100'
        }`}
      >
        {displayedIcon === 'download' && <Download className="w-5 h-5" />}
        {displayedIcon === 'plus' && <Plus className="w-5 h-5" />}
        {displayedIcon === 'external' && <ExternalLink className="w-5 h-5" />}
      </div>
      <span 
        className={`transition-all duration-150 ${
          isTransitioning ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'
        }`}
      >
        {displayedText}
      </span>
    </>
  );
};

// Force dark mode styles for retro button to prevent white flash during hydration/theme switch
// Using inline styles for colors to guarantee they're present during re-renders, Tailwind classes for layout/behavior
const retroButtonBaseStyles = "inline-flex items-center justify-center gap-2 whitespace-nowrap ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 h-14 px-8 sm:px-12 py-4 text-base sm:text-xl max-w-[90vw] sm:max-w-none font-heading rounded-sm border-2 tracking-wide transition-[transform,box-shadow] duration-200 shadow-[-3px_3px_0_0_rgba(20,30,30,0.4)] hover:shadow-[-1.5px_1.5px_0_0_rgba(20,30,30,0.4)] hover:translate-x-[-0.75px] hover:translate-y-[0.75px] active:shadow-none active:translate-x-[-1.5px] active:translate-y-[1.5px]";
const retroButtonInlineStyles = {
  backgroundColor: '#3a4a4a',
  borderColor: '#8a9a9a',
  color: '#d8d4cb',
} as const;

export const HeroSection: React.FC<HeroSectionProps> = ({
  barTransitionCompleted,
  session,
  handleDiscordSignIn,
  navigate,
  assetsLoaded,
  handleOpenToolActivate,
  handleEmergingActivate,
  currentExample,
}) => {
  const [phase, setPhase] = useState<AnimationPhase>('initial');
  const [banodocoState, setBanodocoState] = useState<'hidden' | 'animating' | 'visible'>('hidden');
  const [minLoadTimePassed, setMinLoadTimePassed] = useState(false);
  const [openTipOpen, setOpenTipOpen] = useState(false);
  const [emergingTipOpen, setEmergingTipOpen] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [barWidth, setBarWidth] = useState('0%');
  
  // Platform-aware PWA install detection
  const platformInstall = usePlatformInstall();

  // Close install modal if we're in standalone mode (PWA)
  // This handles the case where Chrome transfers page state when clicking "Open in app"
  useEffect(() => {
    if (platformInstall.isStandalone && showInstallModal) {
      setShowInstallModal(false);
    }
  }, [platformInstall.isStandalone, showInstallModal]);

  // Enforce minimum loading time
  useEffect(() => {
    const timer = setTimeout(() => setMinLoadTimePassed(true), 800);
    return () => clearTimeout(timer);
  }, []);

  // Loading bar animation - wait for assets AND CTA detection
  const ctaReady = !platformInstall.isWaitingForPrompt;
  useEffect(() => {
    if (assetsLoaded && ctaReady) {
      setBarWidth('100%');
    } else if (assetsLoaded) {
      setBarWidth('95%'); // Almost there, waiting for CTA
    } else {
      setBarWidth('92%');
    }
  }, [assetsLoaded, ctaReady]);

  // Master animation orchestrator
  useEffect(() => {
    if (phase === 'initial') {
      // Start after brief mount delay
      const timer = setTimeout(() => setPhase('loading'), 100);
      return () => clearTimeout(timer);
    }
    
    if (phase === 'loading' && assetsLoaded && barTransitionCompleted && minLoadTimePassed && ctaReady) {
      // Bar has reached 100%, wait for it to settle
      const timer = setTimeout(() => setPhase('bar-complete'), 300);
      return () => clearTimeout(timer);
    }
    
    if (phase === 'bar-complete') {
      // Start content reveal immediately
      setPhase('content-revealing');
      // Mark as complete after animations finish (1000ms content + buffer)
      const timer = setTimeout(() => setPhase('complete'), 1050);
      return () => clearTimeout(timer);
    }
    
    if (phase === 'content-revealing') {
      // Trigger Banodoco after second social icon + 500ms pause (950ms + 500ms = 1450ms)
      const banodocoTimer = setTimeout(() => {
        setBanodocoState('animating');
        setTimeout(() => setBanodocoState('visible'), 1800); // 1800ms animation duration
      }, 1450);
      
      return () => {
        clearTimeout(banodocoTimer);
      };
    }
  }, [phase, assetsLoaded, barTransitionCompleted, minLoadTimePassed]);

  // Helper for staggering animations based on animation phase
  // Calculated to match the grid-template-rows expansion (1000ms ease-out)
  const getFadeStyle = (delayIndex: number, distance: number = 0, forceWait: boolean = false) => {
    const duration = '1000ms';
    // Special case for subtitle (-60) and title (20) to make them slightly faster (0.8s)
    const actualDuration = (distance === -60 || distance === 20) ? '800ms' : duration;
    
    const delay = delayIndex * 0.1;
    const isRevealing = phase === 'content-revealing' || phase === 'complete';
    const isVisible = isRevealing && !forceWait;
    
    return {
      opacity: isVisible ? 1 : 0,
      transition: `opacity ${actualDuration} ease-out ${delay}s, transform ${actualDuration} cubic-bezier(0.2, 0, 0.2, 1) ${delay}s`,
      transform: isVisible ? 'translateY(0)' : `translateY(${distance}px)`, 
      willChange: 'transform, opacity'
    };
  };

  // Helper for pop-in animations (scale-based, independent of other animations)
  const getPopStyle = (absoluteDelay: number, forceWait: boolean = false) => {
    const duration = '400ms';
    // Use absolute delay in seconds (e.g., 1.5 = 1500ms after content-revealing starts)
    const isRevealing = phase === 'content-revealing' || phase === 'complete';
    const isVisible = isRevealing && !forceWait;
    
    return {
      opacity: isVisible ? 1 : 0,
      transition: `opacity ${duration} ease-out ${absoluteDelay}s, transform ${duration} cubic-bezier(0.34, 1.56, 0.64, 1) ${absoluteDelay}s`,
      transform: isVisible ? 'scale(1)' : 'scale(0)', 
      willChange: 'transform, opacity',
      transformOrigin: 'center center'
    };
  };

  return (
    <div className="container mx-auto px-4 relative flex items-center justify-center min-h-[calc(100svh-64px)] md:min-h-[calc(100vh-64px)] py-4 md:py-8">
      <div className="text-center w-full">
        <div className="max-w-4xl mx-auto">
          
          {/* Top Section: Icon + Title */}
          {/* Use grid-template-rows for height animation from 0 to auto */}
          <div 
            className="grid transition-[grid-template-rows] duration-1000 ease-out"
            style={{ gridTemplateRows: phase === 'content-revealing' || phase === 'complete' ? '1fr' : '0fr' }}
          >
            <div className={phase === 'complete' ? "overflow-visible" : "overflow-hidden"}>
              {/* Main title */}
              <div style={getFadeStyle(0.5, 20)}>
                <h1 className="text-7xl md:text-[10rem] text-[#ecede3] mb-0 leading-tight">
                  reigh
                </h1>
              </div>
            </div>
          </div>
          
          {/* Loading Bar - visible during loading phase */}
          <div 
            className={`w-32 h-1.5 mx-auto relative transition-opacity duration-500 ${
              phase === 'content-revealing' || phase === 'complete' ? 'opacity-0' : 'opacity-100'
            }`}
          >
            {/* Background track */}
            <div className="absolute inset-0 bg-amber-900/30 rounded-full"></div>
            {/* Animated progress bar - golden gradient */}
            <div 
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-400 rounded-full shadow-[0_0_8px_rgba(251,191,36,0.4)]"
              style={{ 
                width: barWidth, 
                transition: 'width 0.8s cubic-bezier(0.22, 1, 0.36, 1)' 
              }}
            ></div>
          </div>
          
          {/* Bottom Section: Subtitle + Buttons + Footer */}
          <div 
            className="grid transition-[grid-template-rows] duration-1000 ease-out"
            style={{ gridTemplateRows: phase === 'content-revealing' || phase === 'complete' ? '1fr' : '0fr' }}
          >
            <div className={phase === 'complete' ? "overflow-visible" : "overflow-hidden"}>
              {/* Subtitle */}
              <div className="-mt-4 flex justify-center" style={getFadeStyle(4.5, -60, false)}>
                <p className="font-theme text-2xl md:text-3xl font-theme-body text-[#ecede3]/90 leading-snug tracking-wide mb-8 md:mb-10">
                  an{' '}
                  <TooltipProvider>
                    <Tooltip open={openTipOpen} onOpenChange={setOpenTipOpen}>
                      <TooltipTrigger asChild>
                        <span
                          onClick={() => {
                            handleOpenToolActivate();
                            // Small delay to let close animation play
                            setTimeout(() => setOpenTipOpen(false), 50);
                          }}
                          className="underline decoration-[#ecede3]/40 hover:decoration-[#ecede3] cursor-pointer transition-all duration-200"
                        >
                          open source tool
                        </span>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        align="center"
                        onClick={() => {
                          handleOpenToolActivate();
                          setTimeout(() => setOpenTipOpen(false), 50);
                        }}
                        className="group flex items-center gap-2 text-left p-3 max-w-xs border-2 border-transparent bg-wes-cream/80 dark:bg-card/95 rounded-lg shadow-md cursor-pointer transition-all duration-300 hover:bg-gradient-to-r hover:from-wes-pink/10 hover:via-wes-coral/10 hover:to-wes-vintage-gold/10 dark:hover:from-primary/10 dark:hover:via-accent/10 dark:hover:to-secondary/10 hover:border-transparent hover:bg-origin-border hover:shadow-2xl hover:-translate-y-1"
                      >
                        <div className="flex-shrink-0">
                          <ChevronLeft className="hover-arrow w-6 h-6 text-wes-vintage-gold transition-transform transition-colors duration-700 ease-in-out group-hover:text-wes-coral group-hover:animate-sway-x" />
                        </div>
                        <p className="text-xs sm:text-sm leading-relaxed text-primary">
                          Reigh is open source and can be run for free on your computer, or in the cloud for convenience.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>{' '}
                  for<br />
                  <TooltipProvider>
                    <Tooltip open={emergingTipOpen} onOpenChange={setEmergingTipOpen}>
                      <TooltipTrigger asChild>
                        <span
                          onClick={() => {
                            handleEmergingActivate();
                            setTimeout(() => setEmergingTipOpen(false), 50);
                          }}
                          className="underline decoration-[#ecede3]/40 hover:decoration-[#ecede3] cursor-pointer transition-all duration-200"
                        >
                          traveling between images
                        </span>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        align="center"
                        onClick={() => {
                          handleEmergingActivate();
                          setTimeout(() => setEmergingTipOpen(false), 50);
                        }}
                        className="group flex items-center gap-2 text-left p-4 max-w-xs min-h-[80px] border-2 border-transparent bg-wes-cream/80 dark:bg-card/95 rounded-lg shadow-md cursor-pointer transition-all duration-300 hover:bg-gradient-to-r hover:from-wes-pink/10 hover:via-wes-coral/10 hover:to-wes-vintage-gold/10 dark:hover:from-primary/10 dark:hover:via-accent/10 dark:hover:to-secondary/10 hover:border-transparent hover:bg-origin-border hover:shadow-2xl hover:-translate-y-1"
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
              
            {/* CTA button */}                                                                
            <div style={getFadeStyle(2.5, -140, false)} className="pt-2 pb-4 md:pb-6 overflow-visible flex justify-center">
              {session ? (
                // User is logged in - show install CTA if available, otherwise go to tools
                <div className="flex flex-col items-center gap-2 md:gap-3">
                  <button
                    className={retroButtonBaseStyles}
                    style={retroButtonInlineStyles}
                    onClick={async () => {
                      if (platformInstall.showInstallCTA) {
                        if (platformInstall.canInstall) {
                          const installed = await platformInstall.triggerInstall();
                          if (!installed) {
                            setShowInstallModal(true);
                          }
                        } else {
                          setShowInstallModal(true);
                        }
                      } else {
                        navigate('/tools');
                      }
                    }}
                  >
                    <CTAContent
                      icon={platformInstall.showInstallCTA ? platformInstall.ctaIcon : null}
                      text={platformInstall.showInstallCTA ? platformInstall.ctaText : 'go to tools'}
                    />
                  </button>
                  {/* Show secondary browser option when install CTA is showing */}
                  <div 
                    className={`transition-all duration-300 ${
                      platformInstall.showInstallCTA 
                        ? 'opacity-100 translate-y-0' 
                        : 'opacity-0 -translate-y-2 pointer-events-none h-0'
                    }`}
                  >
                    <button
                      onClick={() => navigate('/tools')}
                      className="text-xs text-[#ecede3]/50 hover:text-[#ecede3] transition-colors"
                    >
                      or continue in browser
                    </button>
                  </div>
                </div>
              ) : (
                // Not logged in - show install CTA or Discord sign-in
                <div className="flex flex-col items-center gap-2 md:gap-3">
                  <button
                    className={retroButtonBaseStyles}
                    style={retroButtonInlineStyles}
                    onClick={async () => {
                      if (platformInstall.showInstallCTA) {
                        // If we can trigger the browser's install prompt, do it
                        if (platformInstall.canInstall) {
                          const installed = await platformInstall.triggerInstall();
                          if (!installed) {
                            setShowInstallModal(true);
                          }
                        } else {
                          // Manual install or waiting - show instructions modal
                          setShowInstallModal(true);
                        }
                      } else {
                        // No install CTA - do Discord sign-in
                        handleDiscordSignIn();
                      }
                    }}
                  >
                    <CTAContent
                      icon={platformInstall.showInstallCTA ? platformInstall.ctaIcon : null}
                      text={platformInstall.showInstallCTA ? platformInstall.ctaText : 'sign in with Discord'}
                    />
                  </button>
                  {/* Show secondary Discord option only when install CTA is showing */}
                  <div 
                    className={`transition-all duration-300 ${
                      platformInstall.showInstallCTA 
                        ? 'opacity-100 translate-y-0' 
                        : 'opacity-0 -translate-y-2 pointer-events-none h-0'
                    }`}
                  >
                    <button
                      onClick={handleDiscordSignIn}
                      className="text-xs text-[#ecede3]/50 hover:text-[#ecede3] transition-colors"
                    >
                      or sign in here instead
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            {/* Install Instructions Modal */}
            <InstallInstructionsModal
              open={showInstallModal}
              onOpenChange={setShowInstallModal}
              installMethod={platformInstall.installMethod}
              platform={platformInstall.platform}
              browser={platformInstall.browser}
              deviceType={platformInstall.deviceType}
              instructions={platformInstall.installInstructions}
              isAppInstalled={platformInstall.isAppInstalled}
              isSignedIn={!!session}
              onFallbackToDiscord={session ? () => navigate('/tools') : handleDiscordSignIn}
            />
            </div>
          </div>

          {/* Social Icons & Banodoco - Pop-in animation (completely independent) */}
          <div 
            className="grid transition-[grid-template-rows] duration-1000 ease-out"
            style={{ gridTemplateRows: phase === 'content-revealing' || phase === 'complete' ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden">
              <div className="mt-2 flex justify-center">
                <div className="flex flex-col items-center space-y-1">
                  {/* GitHub and Discord icons side by side */}
                  <div className="flex items-center space-x-3">
                    <div style={getPopStyle(0.8, false)}>
                      <a
                        href="http://github.com/peteromallet/reigh"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-2 bg-transparent rounded-full border border-[#ecede3]/30 hover:border-[#ecede3]/60 transition-all duration-300 hover:bg-[#ecede3]/10 group"
                      >
                        <Github className="w-4 h-4 text-[#ecede3]/70 group-hover:text-[#ecede3] transition-colors duration-300" strokeWidth={1.5} />
                      </a>
                    </div>
                    <div style={getPopStyle(0.95, false)}>
                      <a
                        href="https://discord.gg/D5K2c6kfhy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-2 bg-transparent rounded-full border border-[#ecede3]/30 hover:border-[#ecede3]/60 transition-all duration-300 hover:bg-[#ecede3]/10 group"
                      >
                        <MessageCircle className="w-4 h-4 text-[#ecede3]/70 group-hover:text-[#ecede3] transition-colors duration-300" strokeWidth={1.5} />
                      </a>
                    </div>
                  </div>

                  {/* Placeholder icon beneath them */}
                  <div style={getPopStyle(1.1, false)}>
                    <div className="p-1 opacity-0">
                      <Plus className="w-2 h-2 text-transparent" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Banodoco Logo */}
              <div className="flex justify-center mt-4">
                  <a
                    href="http://banodoco.ai/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block opacity-60 hover:opacity-100 transition-opacity duration-300"
                  >
                  <img 
                    src="/banodoco-gold.png" 
                    alt="Banodoco" 
                    className={`w-[40px] h-[40px] object-contain image-rendering-pixelated
                      ${banodocoState === 'hidden' ? 'opacity-0' : ''}
                      ${banodocoState === 'animating' ? 'animate-burst-and-flash' : ''}
                      ${banodocoState === 'visible' ? 'opacity-100' : ''}
                    `} 
                    style={{ imageRendering: 'auto' }}
                  />
                  </a>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
