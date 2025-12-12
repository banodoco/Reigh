import React, { useState, useEffect, useRef } from 'react';
import { PaletteIcon } from '@/shared/components/PaletteIcon';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { ChevronLeft, ChevronRight, Github, MessageCircle, Plus, Download, ExternalLink } from 'lucide-react';
import { PaintParticles } from '@/shared/components/PaintParticles';
import { usePlatformInstall } from '@/shared/hooks/usePlatformInstall';
import { InstallInstructionsModal } from './InstallInstructionsModal';
import type { Session } from '@supabase/supabase-js';

// Animated CTA button content that smoothly transitions between states
interface CTAContentProps {
  icon: 'download' | 'plus' | 'external' | 'discord' | 'paintbrush';
  text: string;
  isWaiting?: boolean;
}

const CTAContent: React.FC<CTAContentProps> = ({ icon, text, isWaiting }) => {
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

  const renderIcon = () => {
    switch (displayedIcon) {
      case 'download':
        return <Download className={`w-full h-full text-white ${isWaiting ? 'animate-subtle-bob' : ''}`} />;
      case 'plus':
        return <Plus className="w-full h-full text-white" />;
      case 'external':
        return <ExternalLink className="w-full h-full text-white" />;
      case 'paintbrush':
        return (
          <div className="paintbrush-anim w-full h-full origin-[50%_90%]">
            <img src="/brush-paintbrush-icon.webp" alt="Paintbrush" className="w-full h-full brightness-0 invert" />
          </div>
        );
      default:
        return (
          <div className="paintbrush-anim w-full h-full origin-[50%_90%]">
            <img src="/brush-paintbrush-icon.webp" alt="Paintbrush" className="w-full h-full brightness-0 invert" />
          </div>
        );
    }
  };

  return (
    <>
      <div className="relative">
        {icon === 'paintbrush' && <PaintParticles />}
        <div 
          className={`w-5 h-5 relative z-10 transition-all duration-150 ${
            isTransitioning ? 'opacity-0 scale-75' : 'opacity-100 scale-100'
          }`}
        >
          {renderIcon()}
        </div>
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
  handleDiscordSignIn: () => void;
  navigate: (path: string) => void;
  assetsLoaded: boolean;
}

type AnimationPhase = 'initial' | 'loading' | 'bar-complete' | 'content-revealing' | 'complete';

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
  handleDiscordSignIn,
  navigate,
  assetsLoaded,
}) => {
  const [phase, setPhase] = useState<AnimationPhase>('initial');
  const [barWidth, setBarWidth] = useState('0%');
  const [banodocoState, setBanodocoState] = useState<'hidden' | 'animating' | 'visible'>('hidden');
  const [showUnderlineWave, setShowUnderlineWave] = useState(false);
  const [minLoadTimePassed, setMinLoadTimePassed] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  
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

  // Master animation orchestrator
  useEffect(() => {
    if (phase === 'initial') {
      // Start after brief mount delay
      const timer = setTimeout(() => setPhase('loading'), 100);
      return () => clearTimeout(timer);
    }
    
    if (phase === 'loading' && assetsLoaded && barTransitionCompleted && minLoadTimePassed) {
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
      // Trigger underline wave when content animations finish (1000ms after content starts)
      const waveTimer = setTimeout(() => {
        setShowUnderlineWave(true);
      }, 1000);
      
      // Trigger Banodoco after second social icon + 500ms pause (950ms + 500ms = 1450ms)
      const banodocoTimer = setTimeout(() => {
        setBanodocoState('animating');
        setTimeout(() => setBanodocoState('visible'), 1800); // 1800ms animation duration
      }, 1450);
      
      return () => {
        clearTimeout(waveTimer);
        clearTimeout(banodocoTimer);
      };
    }
  }, [phase, assetsLoaded, barTransitionCompleted, minLoadTimePassed]);

  // Bar width management
  useEffect(() => {
    setBarWidth(assetsLoaded ? '100%' : '92%');
  }, [assetsLoaded]);

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
    <div className="container mx-auto px-4 relative flex items-center justify-center min-h-screen py-8">
      <div className="text-center w-full">
        <div className="max-w-4xl mx-auto">
          
          {/* Top Section: Icon + Title */}
          {/* Use grid-template-rows for height animation from 0 to auto */}
          <div 
            className="grid transition-[grid-template-rows] duration-1000 ease-out"
            style={{ gridTemplateRows: phase === 'content-revealing' || phase === 'complete' ? '1fr' : '0fr' }}
          >
            <div className={phase === 'complete' ? "overflow-visible" : "overflow-hidden"}>
              {/* Icon above title - wait for assets */}
              <div style={getFadeStyle(0, 20, !assetsLoaded)} className="relative z-30">
                <PaletteIcon className="mb-6 mt-0" />
              </div>
              
              {/* Main title */}
              <div style={getFadeStyle(0.5, 20)}>
                <h1 className="font-theme text-6xl md:text-8xl font-theme-heading text-primary dark:text-wes-vintage-gold mb-8 text-shadow-vintage dark:text-shadow-none">
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
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-wes-pink to-wes-vintage-gold dark:from-wes-vintage-gold/60 dark:to-wes-vintage-gold/40 rounded-full shadow-inner-vintage dark:shadow-none ease-out"
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
              {/* Subtitle - Start -60px (UP) to simulate coming from bar */}
              <div className="mt-6 md:mt-8" style={getFadeStyle(4.5, -60, false)}>
                <p className="font-theme text-xl md:text-2xl font-theme-body text-muted-foreground leading-relaxed tracking-wide mb-6 md:mb-8">
                  An{' '}
                  <TooltipProvider>
                    <Tooltip open={openTipOpen} onOpenChange={(o)=>{ if(!openTipDisabled) setOpenTipOpen(o); }}>
                      <TooltipTrigger asChild>
                        <span
                          onClick={handleOpenToolActivate}
                          onMouseLeave={() => { if(openTipDisabled) setOpenTipDisabled(false);} }
                          className={`sparkle-underline cursor-pointer transition-colors duration-200 ${openTipOpen ? 'tooltip-open' : ''} ${openTipDisabled ? 'pointer-events-none' : ''} ${showUnderlineWave ? 'underline-wave-first' : ''} ${
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
                          className={`sparkle-underline cursor-pointer transition-colors duration-200 whitespace-nowrap ${emergingTipOpen ? 'tooltip-open' : ''} ${emergingTipDisabled ? 'pointer-events-none' : ''} ${showUnderlineWave ? 'underline-wave-second' : ''} ${
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
              
            {/* CTA button below hero - Start -140px (UP) to simulate coming from bar */}                                                                
            <div style={getFadeStyle(2.5, -140, false)} className="pt-2 pb-4 md:pb-6 overflow-visible">
              {session ? (
                // User is logged in - show install CTA if available, otherwise go to tools
                <div className="flex flex-col items-center gap-2 md:gap-3">
                  <div className="group">
                    <button
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
                      className={`flex items-center space-x-2 px-6 py-4 bg-primary hover:bg-primary/90 dark:bg-transparent dark:hover:bg-wes-vintage-gold/10 rounded-full border-2 border-primary/40 hover:border-primary/60 dark:border-wes-vintage-gold/50 dark:hover:border-wes-vintage-gold shadow-wes-vintage hover:shadow-wes-hover dark:shadow-none dark:hover:shadow-[0_0_20px_rgba(196,164,106,0.3)] text-primary-foreground dark:text-wes-vintage-gold text-lg font-light mx-auto relative overflow-hidden ${
                        platformInstall.isWaitingForPrompt ? 'animate-pulse' : ''
                      }`}
                      style={{ transition: 'transform 0.3s ease-in-out, border-color 0.3s ease-in-out, box-shadow 0.5s ease-in-out' }}
                    >
                      <div className="absolute -bottom-1/2 -left-1/2 w-1/2 h-[200%] group-hover:animate-pulse-sweep bg-gradient-to-r from-transparent via-primary/40 dark:via-wes-vintage-gold/20 to-transparent pointer-events-none -rotate-45" />
                      <CTAContent 
                        icon={platformInstall.showInstallCTA ? platformInstall.ctaIcon : 'paintbrush'}
                        text={platformInstall.showInstallCTA ? platformInstall.ctaText : 'Go to Tools'}
                        isWaiting={platformInstall.isWaitingForPrompt}
                      />
                    </button>
                  </div>
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
                      className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                    >
                      or continue in browser
                    </button>
                  </div>
                </div>
              ) : (
                // Not logged in - show install CTA or Discord sign-in with smooth transitions
                <div className="flex flex-col items-center gap-2 md:gap-3">
                  <div className="group">
                    <button
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
                      className={`flex items-center space-x-2 px-6 py-4 bg-primary hover:bg-primary/90 dark:bg-transparent dark:hover:bg-wes-vintage-gold/10 rounded-full border-2 border-primary/40 hover:border-primary/60 dark:border-wes-vintage-gold/50 dark:hover:border-wes-vintage-gold shadow-wes-vintage hover:shadow-wes-hover dark:shadow-none dark:hover:shadow-[0_0_20px_rgba(196,164,106,0.3)] text-primary-foreground dark:text-wes-vintage-gold text-lg font-light mx-auto relative overflow-hidden ${
                        platformInstall.isWaitingForPrompt ? 'animate-pulse' : ''
                      }`}
                      style={{ transition: 'transform 0.3s ease-in-out, border-color 0.3s ease-in-out, box-shadow 0.5s ease-in-out' }}
                    >
                      <div className="absolute -bottom-1/2 -left-1/2 w-1/2 h-[200%] group-hover:animate-pulse-sweep bg-gradient-to-r from-transparent via-primary/40 dark:via-wes-vintage-gold/20 to-transparent pointer-events-none -rotate-45" />
                      <CTAContent 
                        icon={platformInstall.showInstallCTA ? platformInstall.ctaIcon : 'paintbrush'}
                        text={platformInstall.showInstallCTA ? platformInstall.ctaText : 'Sign in with Discord'}
                        isWaiting={platformInstall.isWaitingForPrompt}
                      />
                    </button>
                  </div>
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
                      className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
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
              <div className="mt-4 md:mt-8 flex justify-center pt-2 pb-4">
                <div className="flex flex-col items-center space-y-2 md:space-y-3">
                  {/* GitHub and Discord icons side by side */}
                  <div className="flex items-center space-x-3">
                    <div style={getPopStyle(0.8, false)}>
                      <a
                        href="http://github.com/peteromallet/reigh"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-2 bg-card/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-full border border-wes-vintage-gold/20 hover:border-wes-vintage-gold/40 transition-all duration-300 hover:bg-card/70 dark:hover:bg-gray-800/70 group opacity-80 hover:opacity-100 shadow-md"
                      >
                        <Github className="w-4 h-4 text-wes-vintage-gold/80 group-hover:text-wes-vintage-gold transition-colors duration-300" />
                      </a>
                    </div>
                    <div style={getPopStyle(0.95, false)}>
                      <a
                        href="https://discord.gg/D5K2c6kfhy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-2 bg-card/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-full border border-wes-vintage-gold/20 hover:border-wes-vintage-gold/40 transition-all duration-300 hover:bg-card/70 dark:hover:bg-gray-800/70 group opacity-80 hover:opacity-100 shadow-md"
                      >
                        <MessageCircle className="w-4 h-4 text-wes-vintage-gold/80 group-hover:text-wes-vintage-gold transition-colors duration-300" />
                      </a>
                    </div>
              </div>

                  {/* Placeholder icon beneath them */}
                  <div style={getPopStyle(1.1, false)}>
                    <div className="p-1.5 bg-card/20 dark:bg-gray-800/20 backdrop-blur-sm rounded-full border border-wes-vintage-gold/5 opacity-30">
                      <Plus className="w-2.5 h-2.5 text-wes-vintage-gold/40" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Banodoco Logo */}
              <div className="flex justify-center">
                <div className="mt-2">
                  <a
                    href="http://banodoco.ai/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                  <img 
                    src="/banodoco-gold.png" 
                    alt="Banodoco" 
                    className={`w-[34px] h-[34px] object-contain image-rendering-pixelated
                      ${banodocoState === 'hidden' ? 'opacity-0' : ''}
                      ${banodocoState === 'animating' ? 'animate-burst-and-flash' : ''}
                      ${banodocoState === 'visible' ? 'opacity-100 brightness-[0.75] hue-rotate-[-30deg] saturate-150 hover:brightness-100 hover:saturate-150 hover:hue-rotate-[-15deg] transition-all duration-700 ease-in-out' : ''}
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
    </div>
  );
};
