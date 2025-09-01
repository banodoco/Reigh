/* eslint-disable no-sequences */
import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, Video, Users, FileText, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, GitBranch, X, HandHeart, Brain, Infinity, Github, MessageCircle, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { useNavigate, useLocation } from 'react-router-dom';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { toast } from '@/shared/components/ui/use-toast';
import { PageFadeIn } from '@/shared/components/transitions';
import { useReferralTracking } from '@/shared/hooks/useReferralTracking';
import { FadeInSection } from '@/shared/components/transitions/FadeInSection';
import { PaintParticles } from '@/shared/components/PaintParticles';
import { PaletteIcon } from '@/shared/components/PaletteIcon';
import { WesAndersonBackground } from '@/shared/components/WesAndersonBackground';
import { ReighLoading } from '@/shared/components/ReighLoading';
import { ProfitSplitBar } from '@/shared/components/ProfitSplitBar';



export default function HomePage() {
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [showCreativePartner, setShowCreativePartner] = useState(false);
  const [showPhilosophy, setShowPhilosophy] = useState(false);
  const [isPhilosophyButtonAnimating, setIsPhilosophyButtonAnimating] = useState(false);
  const [isCreativePartnerButtonAnimating, setIsCreativePartnerButtonAnimating] = useState(false);
  const [isPhilosophyPaneClosing, setIsPhilosophyPaneClosing] = useState(false);
  const [isCreativePartnerPaneClosing, setIsCreativePartnerPaneClosing] = useState(false);
  const [isPhilosophyPaneOpening, setIsPhilosophyPaneOpening] = useState(false);
  const [isCreativePartnerPaneOpening, setIsCreativePartnerPaneOpening] = useState(false);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  // Examples pane state
  const [showExamples, setShowExamples] = useState(false);
  const [isExamplesButtonAnimating, setIsExamplesButtonAnimating] = useState(false);
  const [isExamplesPaneOpening, setIsExamplesPaneOpening] = useState(false);
  const [isExamplesPaneClosing, setIsExamplesPaneClosing] = useState(false);
  const [openTipOpen, setOpenTipOpen] = useState(false);
  const [openTipDisabled, setOpenTipDisabled] = useState(false);
  const isMobile = useIsMobile();
  // Track referrals from URL (?from=...)
  useReferralTracking();

  // Tooltip state: "for exploring"
  const [exploringTipOpen, setExploringTipOpen] = useState(false);
  const [exploringTipDisabled, setExploringTipDisabled] = useState(false);

  // Tooltip state: "emerging artform"
  const [emergingTipOpen, setEmergingTipOpen] = useState(false);
  const [emergingTipDisabled, setEmergingTipDisabled] = useState(false);

  // Tooltip state: Ecosystem preview
  const [ecosystemTipOpen, setEcosystemTipOpen] = useState(false);
  const [ecosystemTipDisabled, setEcosystemTipDisabled] = useState(false);

  // Debug ecosystem tooltip state
  useEffect(() => {
    console.log('[EcosystemTooltip] State change - open:', ecosystemTipOpen, 'disabled:', ecosystemTipDisabled);
  }, [ecosystemTipOpen, ecosystemTipDisabled]);

  // Close tooltip on mobile scroll
  useEffect(() => {
    if (!isMobile || !ecosystemTipOpen) return;

    const handleScroll = () => {
      console.log('[EcosystemTooltip] Mobile scroll detected, closing tooltip');
      setEcosystemTipOpen(false);
      setEcosystemTipDisabled(false);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('touchmove', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('touchmove', handleScroll);
    };
  }, [isMobile, ecosystemTipOpen]);

  // New handler for activating the open tool feature and closing the tooltip
  const handleOpenToolActivate = () => {
    // Open the side pane
    setIsCreativePartnerButtonAnimating(true);
    setIsCreativePartnerPaneOpening(true);
    setShowPhilosophy(false);
    setShowExamples(false);
    setShowCreativePartner(true);
    setTimeout(() => {
      setIsCreativePartnerButtonAnimating(false);
      setIsCreativePartnerPaneOpening(false);
    }, 350);

    // Close the tooltip and prevent it from reopening immediately
    setOpenTipDisabled(true);
    setOpenTipOpen(false);
    setTimeout(() => setOpenTipDisabled(false), 500); // Reset after a short delay
  };

  // Handler for "for exploring" tooltip – now opens the bottom Examples pane
  const handleExploringActivate = () => {
    // Open the bottom Examples pane
    setIsExamplesButtonAnimating(true);
    setIsExamplesPaneOpening(true);
    setShowCreativePartner(false);
    setShowPhilosophy(false);
    setShowExamples(true);
    setTimeout(() => {
      setIsExamplesButtonAnimating(false);
      setIsExamplesPaneOpening(false);
    }, 350);

    // Close tooltip and prevent immediate reopen
    setExploringTipDisabled(true);
    setExploringTipOpen(false);
    setTimeout(() => setExploringTipDisabled(false), 500);
  };

  // Handler for "emerging artform" tooltip – opens bottom examples pane
  const handleEmergingActivate = () => {
    // Open the right Philosophy side pane
    setIsPhilosophyButtonAnimating(true);
    setIsPhilosophyPaneOpening(true);
    setShowCreativePartner(false);
    setShowExamples(false);
    setShowPhilosophy(true);
    setTimeout(() => {
      setIsPhilosophyButtonAnimating(false);
      setIsPhilosophyPaneOpening(false);
    }, 350);

    // Close tooltip and prevent immediate reopen
    setEmergingTipDisabled(true);
    setEmergingTipOpen(false);
    setTimeout(() => setEmergingTipDisabled(false), 500);
  };

  // Refs for pane contents to reset scroll on close
  const examplesContentRef = useRef<HTMLDivElement | null>(null);
  const creativeContentRef = useRef<HTMLDivElement | null>(null);
  const philosophyContentRef = useRef<HTMLDivElement | null>(null);

  // Helper to reset pane scroll after close animation (300ms)
  const resetPaneScroll = (ref: React.RefObject<HTMLDivElement>) => {
    setTimeout(() => {
      if (ref.current) ref.current.scrollTop = 0;
    }, 300);
  };



  // Preload assets
  useEffect(() => {
    const img = new Image();
    img.src = '/brush-paintbrush-icon.webp';
    img.onload = () => {
      setAssetsLoaded(true);
    };
    img.onerror = () => {
      // If image fails to load, we'll still show the content
      setAssetsLoaded(true);
    };
  }, []);

  // Show toast if redirected from protected page
  useEffect(() => {
    if ((location.state as any)?.fromProtected) {
      toast({ description: 'You need to be logged in to view that page.' });
      // Clear state to avoid duplicate toast on back/forward navigation
      navigate(location.pathname, { replace: true });
    }
  }, [location, navigate]);

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Prevent scrolling on this page
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  useEffect(() => {
    // Initialize auth session tracking
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[AuthDebug] Initial session check:', !!session?.user?.id);
      setSession(session);
    });
    
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AuthDebug] Auth state change:', event, !!session?.user?.id);
      setSession(session);
      
      // If we get a successful sign-in, navigate to tools – but avoid auto-redirect
      // on initial session restoration when the user is just viewing /home.
      if (event === 'SIGNED_IN' && session) {
        const isHomePath = location.pathname === '/home' || location.pathname === '/';
        const oauthInProgress = localStorage.getItem('oauthInProgress') === 'true';
        if (oauthInProgress) {
          // Attempt referral conversion before navigating
          try {
            const referralCode = localStorage.getItem('referralCode');
            const referralSessionId = localStorage.getItem('referralSessionId');
            const referralFingerprint = localStorage.getItem('referralFingerprint');
            if (referralCode) {
              (async () => {
                try {
                  await supabase.rpc('create_referral_from_session', {
                    p_session_id: referralSessionId,
                    p_fingerprint: referralFingerprint,
                  });
                } catch (err) {
                  console.warn('[Referral] RPC error creating referral', err);
                } finally {
                  try {
                    localStorage.removeItem('referralCode');
                    localStorage.removeItem('referralSessionId');
                    localStorage.removeItem('referralFingerprint');
                    localStorage.removeItem('referralTimestamp');
                  } catch {}
                }
              })();
            }
          } catch (e) {
            console.warn('[Referral] Failed to create referral on SIGNED_IN', e);
          }
          // Clear flag and proceed to tools
          localStorage.removeItem('oauthInProgress');
          console.log('[AuthDebug] OAuth flow completed, navigating to /tools');
          navigate('/tools');
        } else if (!isHomePath) {
          console.log('[AuthDebug] SIGNED_IN outside home, navigating to /tools');
          navigate('/tools');
        } else {
          console.log('[AuthDebug] SIGNED_IN on home without oauth flag; staying on home');
        }
      }
    });
    
    return () => {
      listener.subscription.unsubscribe();
    };
  }, [navigate]);

  const handleDiscordSignIn = async () => {
    try {
      console.log('[AuthDebug] Starting Discord OAuth flow');
      // Mark that OAuth was user-initiated so we can safely redirect post-login
      try { localStorage.setItem('oauthInProgress', 'true'); } catch {}
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          redirectTo: window.location.origin,
        },
      });
      
      if (error) {
        console.error('[AuthDebug] OAuth error:', error);
        toast({ description: 'Failed to start Discord sign-in. Please try again.' });
        return;
      }
      
      console.log('[AuthDebug] OAuth initiated successfully');
    } catch (err) {
      console.error('[AuthDebug] Unexpected error during OAuth:', err);
      toast({ description: 'An unexpected error occurred. Please try again.' });
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };



  const examples = [
    {
      id: 1,
      inputTitle: "Serene Lake at Dawn",
      inputDesc: "A misty morning scene with still waters",
      outputTitle: "Turbulent Storm",
      outputDesc: "The same lake transformed into dramatic waves",
      transition: "calm → storm"
    },
    {
      id: 2,
      inputTitle: "Vintage Portrait",
      inputDesc: "A classic black and white photograph",
      outputTitle: "Modern Digital Art",
      outputDesc: "Reimagined with contemporary artistic style",
      transition: "classic → modern"
    },
    {
      id: 3,
      inputTitle: "Urban Street Scene",
      inputDesc: "Busy city intersection in daylight",
      outputTitle: "Neon-lit Night",
      outputDesc: "The same street bathed in electric colors",
      transition: "day → night"
    }
  ];

  const imagePairIndices = [1, 2];
  const multiSquareIndices = [1, 2, 3, 4];
  const motionExamples = [
    { id: 1, label: 'Vortex Motion' },
    { id: 2, label: 'Pulsing Effect' },
    { id: 3, label: 'Melting Transition' },
    { id: 4, label: 'Particle Explosion' },
  ];

  // Remove aggressive mobile scroll prevention - let content flow naturally
  // The side panes handle their own overflow, and the main content should be scrollable

  // Only render content when assets are loaded
  if (!assetsLoaded) {
    return <ReighLoading />;
  }

    return (
    <PageFadeIn className="wes-texture relative">
      <WesAndersonBackground />
      
      {/* Top Navigation Links */}
      {/* <div className={`fixed top-6 left-6 sm:top-12 sm:left-12 flex items-center space-x-6 ${
        showCreativePartner || isCreativePartnerPaneClosing || showPhilosophy || isPhilosophyPaneClosing || showExamples || isExamplesPaneClosing || isCreativePartnerPaneOpening || isPhilosophyPaneOpening || isExamplesPaneOpening ? 'z-0' : 'z-50'
      }`}>
        <button
          onClick={() => {
            setIsCreativePartnerButtonAnimating(true);
            setIsCreativePartnerPaneOpening(true);
            setShowPhilosophy(false);
            setShowCreativePartner(true);
            setTimeout(() => setIsCreativePartnerButtonAnimating(false), 350);
            setTimeout(() => setIsCreativePartnerPaneOpening(false), 300);
          }}
          className={`group flex items-center sm:space-x-2 px-4 py-4 sm:px-4 sm:py-2 bg-gradient-to-r from-wes-mint to-wes-vintage-gold backdrop-blur-sm rounded-full border-2 border-wes-mint/40 hover:border-wes-mint/60 transition-all duration-300 shadow-wes-vintage hover:shadow-wes-hover text-white ${
            isCreativePartnerButtonAnimating ? 'animate-spin-left-fade' : ''
                     } ${isCreativePartnerPaneClosing ? 'animate-spin-left-fade-reverse' : ''} ${
             showCreativePartner || isCreativePartnerButtonAnimating
               ? 'opacity-0 pointer-events-none'
               : showPhilosophy || isPhilosophyButtonAnimating || showExamples || isExamplesButtonAnimating
                 ? 'opacity-40 pointer-events-none brightness-50 transition-all duration-100'
                 : 'opacity-100 pointer-events-auto transition-all duration-300'
           }`}
        >
          <HandHeart className="w-6 h-6 sm:w-4 sm:h-4 animate-gifting-motion" />
          <span className="font-cocogoose text-sm font-light hidden sm:inline">Open Creative Partner Programme</span>
        </button>
      </div> */}
        
      {/* <div className={`fixed top-6 right-6 sm:top-12 sm:right-12 flex items-center ${
        showCreativePartner || isCreativePartnerPaneClosing || showPhilosophy || isPhilosophyPaneClosing || showExamples || isExamplesPaneClosing || isPhilosophyPaneOpening || isCreativePartnerPaneOpening || isExamplesPaneOpening ? 'z-0' : 'z-50'
      }`}>
        <button
          onClick={() => {
            setIsPhilosophyButtonAnimating(true);
            setIsPhilosophyPaneOpening(true);
            setShowCreativePartner(false);
            setShowPhilosophy(true);
            setTimeout(() => setIsPhilosophyButtonAnimating(false), 350);
            setTimeout(() => setIsPhilosophyPaneOpening(false), 300);
          }}
          className={`group flex items-center sm:space-x-2 px-4 py-4 sm:px-4 sm:py-2 bg-white/80 backdrop-blur-sm rounded-full border-2 border-wes-vintage-gold/20 hover:border-wes-vintage-gold/40 transition-all duration-300 hover:shadow-wes-ornate ${
            isPhilosophyButtonAnimating ? 'animate-spin-right-fade' : ''
                     } ${isPhilosophyPaneClosing ? 'animate-spin-right-fade-reverse' : ''} ${
             showPhilosophy || isPhilosophyButtonAnimating
               ? 'opacity-0 pointer-events-none'
               : showCreativePartner || isCreativePartnerButtonAnimating || showExamples || isExamplesButtonAnimating
                 ? 'opacity-40 pointer-events-none brightness-50 transition-all duration-100'
                 : 'opacity-100 pointer-events-auto transition-all duration-300'
           }`}
        >
          <Brain className="w-6 h-6 sm:w-4 sm:h-4 text-wes-vintage-gold animate-brain-pulse" />
          <span className="font-cocogoose text-sm font-light text-primary group-hover:text-primary/80 hidden sm:inline">Philosophy</span>
        </button>
      </div> */}

      <div className="container mx-auto px-4 relative z-10 flex items-center justify-center min-h-screen py-16">
        {/* Hero Section */}
        <div className="text-center w-full">
          <div className="max-w-4xl mx-auto">


            {/* Icon above title */}
            <FadeInSection delayMs={25}>
              <PaletteIcon className="mb-6 mt-6" />
            </FadeInSection>
            
            {/* Main title */}
            <FadeInSection delayMs={50}>
              <h1 className="font-theme text-6xl md:text-8xl font-theme-heading text-primary mb-8 text-shadow-vintage">
                Reigh
              </h1>
            </FadeInSection>
            
            {/* Decorative divider */}
            <FadeInSection delayMs={100}>
              <div className="w-32 h-1.5 bg-gradient-to-r from-wes-pink to-wes-vintage-gold rounded-full mx-auto mb-8 shadow-inner-vintage animate-pulse-glow"></div>
            </FadeInSection>
            
            {/* Subtitle */}
            <FadeInSection delayMs={200}>
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
                  open tool
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
          </TooltipProvider>{' '}made{' '}
          {/* Exploring tooltip temporarily disabled */}
          {/*
          <TooltipProvider>
            <Tooltip
              open={exploringTipOpen}
              onOpenChange={(o) => {
                if (!exploringTipDisabled) setExploringTipOpen(o);
              }}
            >
              <TooltipTrigger asChild>
                <span
                  onClick={handleExploringActivate}
                  onMouseLeave={() => {
                    if (exploringTipDisabled) setExploringTipDisabled(false);
                  }}
                  className={`sparkle-underline cursor-pointer transition-colors duration-200 ${exploringTipDisabled ? 'pointer-events-none' : ''} ${
                    showCreativePartner
                      ? 'pointer-events-none opacity-60'
                      : showPhilosophy || showExamples
                      ? 'opacity-40 pointer-events-none brightness-50 transition-all duration-100'
                      : 'opacity-100 pointer-events-auto transition-all duration-300'
                  }`}
                >
                  for exploring
                </span>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="center"
                onClick={handleExploringActivate}
                className="group flex flex-col items-center gap-2 text-center p-3 max-w-xs border-2 border-transparent bg-wes-cream/80 rounded-lg shadow-md cursor-pointer transition-all duration-300 hover:bg-gradient-to-r hover:from-wes-pink/10 hover:via-wes-coral/10 hover:to-wes-vintage-gold/10 hover:border-transparent hover:bg-origin-border hover:shadow-2xl hover:-translate-y-1"
              >
                <p className="text-xs sm:text-sm leading-relaxed text-primary">
                  Dummy text for exploring tooltip. This is some longer dummy text to demonstrate how the tooltip handles more content while maintaining its layout and style.
                </p>
                <div className="flex-shrink-0">
                  <ChevronDown className="hover-arrow w-6 h-6 text-wes-vintage-gold transition-transform transition-colors duration-700 ease-in-out group-hover:text-wes-coral group-hover:animate-sway-y" />
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          */}
          for exploring an{' '}
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
                    className={`sparkle-underline cursor-pointer transition-colors duration-200 ${emergingTipOpen ? 'tooltip-open' : ''} ${emergingTipDisabled ? 'pointer-events-none' : ''} ${
                      showExamples
                        ? 'pointer-events-none opacity-60'
                        : showCreativePartner || showPhilosophy
                        ? 'opacity-40 pointer-events-none brightness-50 transition-all duration-100'
                        : 'opacity-100 pointer-events-auto transition-all duration-300'
                    }`}
                  >
                    emerging artform
                  </span>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  align="center"
                  onClick={handleEmergingActivate}
                  className="group flex items-center gap-2 text-left p-3 max-w-xs border-2 border-transparent bg-wes-cream/80 rounded-lg shadow-md cursor-pointer transition-all duration-300 hover:bg-gradient-to-r hover:from-wes-pink/10 hover:via-wes-coral/10 hover:to-wes-vintage-gold/10 hover:border-transparent hover:bg-origin-border hover:shadow-2xl hover:-translate-y-1"
                >
                  <div className="flex items-center gap-1 text-primary">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-muted/20 border rounded" />
                    <span className="text-xs sm:text-sm font-light">+</span>
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-muted/20 border rounded" />
                    <span className="text-xs sm:text-sm font-light">=</span>
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-muted/20 border rounded" />
                  </div>
                  <div className="flex-shrink-0">
                    <ChevronRight className="hover-arrow w-6 h-6 text-wes-vintage-gold transition-transform transition-colors duration-700 ease-in-out group-hover:text-wes-coral group-hover:animate-sway-x" />
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>.
              </p>
            </FadeInSection>
            
            {/* Sign-in button below hero */}
            <FadeInSection delayMs={250}>
              {!session ? (
                <div className="group">
                  <button
                    onClick={handleDiscordSignIn}
                    className="flex items-center space-x-2 px-6 py-4 bg-gradient-to-r from-wes-vintage-gold to-wes-coral rounded-full border-2 border-wes-vintage-gold/40 hover:border-wes-vintage-gold/60 transition-all duration-300 shadow-wes-vintage hover:shadow-wes-hover text-white text-lg font-light mx-auto relative overflow-hidden"
                  >
                    {/* Pulsing effect on hover */}
                    <div className="absolute -bottom-1/2 -left-1/2 w-1/2 h-[200%] group-hover:animate-pulse-sweep bg-gradient-to-r from-transparent via-wes-vintage-gold/40 to-transparent pointer-events-none -rotate-45" />
                    
                    <div className="relative">
                      {/* Paint particles - behind the brush - arranged in clockwise circle */}
                      <PaintParticles />
                      
                      {/* Paintbrush Icon - in front */}
                      <div className="w-5 h-5 transform scale-x-[-1] transition-transform duration-300 relative z-10">
                        <div className="w-full h-full group-hover:animate-paintbrush-stroke origin-[50%_90%]">
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
                <div className="group">
                  <button
                    onPointerUp={() => navigate('/tools')}
                    className="flex items-center space-x-2 px-6 py-4 bg-gradient-to-r from-wes-vintage-gold to-wes-coral rounded-full border-2 border-wes-vintage-gold/40 hover:border-wes-vintage-gold/60 transition-all duration-300 shadow-wes-vintage hover:shadow-wes-hover text-white text-lg font-light mx-auto relative overflow-hidden"
                  >
                    {/* Pulsing effect on hover */}
                    <div className="absolute -bottom-1/2 -left-1/2 w-1/2 h-[200%] group-hover:animate-pulse-sweep bg-gradient-to-r from-transparent via-wes-vintage-gold/40 to-transparent pointer-events-none -rotate-45" />
                    
                    <div className="relative">
                      {/* Paint particles - behind the brush - arranged in clockwise circle */}
                      <PaintParticles />
                      
                      {/* Paintbrush Icon - in front */}
                      <div className="w-5 h-5 transform scale-x-[-1] transition-transform duration-300 relative z-10">
                        <div className="w-full h-full group-hover:animate-paintbrush-stroke origin-[50%_90%]">
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
            </FadeInSection>

            {/* See Examples Trigger */}
            <FadeInSection delayMs={350}>
              <div className="mt-8 mb-6 flex justify-center">
                {/* Placeholder icon to balance the design */}
                <Infinity className="w-9 h-9 text-wes-vintage-gold/80" />
                {/*
                // Temporarily removed interactive "See examples" button
                // <button
                //   onClick={() => {
                //     setIsExamplesButtonAnimating(true);
                //     setIsExamplesPaneOpening(true);
                //     setShowExamples(true);
                //     // Reset animation state after pane is fully open
                //     setTimeout(() => setIsExamplesButtonAnimating(false), 350);
                //     setTimeout(() => setIsExamplesPaneOpening(false), 300);
                //   }}
                //   className={`group text-sm font-light text-muted-foreground hover:text-primary underline underline-offset-2 transition-colors duration-200 ${
                //     isExamplesButtonAnimating ? 'animate-pulse' : ''
                //   } ${
                //     showExamples || isExamplesButtonAnimating
                //       ? 'opacity-0 pointer-events-none'
                //       : showCreativePartner || isCreativePartnerButtonAnimating || showPhilosophy || isPhilosophyButtonAnimating
                //         ? 'opacity-40 pointer-events-none brightness-50 transition-all duration-100'
                //         : 'opacity-100 pointer-events-auto transition-all duration-300'
                //   }`}
                // >
                //   See examples
                // </button>
                */}
              </div>
            </FadeInSection>



          </div>
        </div>

        {/* Social Icons */}
        <FadeInSection delayMs={400}>
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-30">
            <div className="flex flex-col items-center space-y-2">
              {/* GitHub and Discord icons side by side */}
              <div className="flex items-center space-x-3">
                <a
                  href="https://github.com/your-repo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 bg-white/40 backdrop-blur-sm rounded-full border border-wes-vintage-gold/10 hover:border-wes-vintage-gold/20 transition-all duration-300 hover:bg-white/60 group opacity-70 hover:opacity-100"
                >
                  <Github className="w-3 h-3 text-wes-vintage-gold/70 group-hover:text-wes-vintage-gold transition-colors duration-300" />
                </a>
                <a
                  href="https://discord.gg/D5K2c6kfhy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 bg-white/40 backdrop-blur-sm rounded-full border border-wes-vintage-gold/10 hover:border-wes-vintage-gold/20 transition-all duration-300 hover:bg-white/60 group opacity-70 hover:opacity-100"
                >
                  <MessageCircle className="w-3 h-3 text-wes-vintage-gold/70 group-hover:text-wes-vintage-gold transition-colors duration-300" />
                </a>
              </div>
              
              {/* Placeholder icon beneath them */}
              <div className="p-1.5 bg-white/20 backdrop-blur-sm rounded-full border border-wes-vintage-gold/5 opacity-30">
                <Plus className="w-2.5 h-2.5 text-wes-vintage-gold/40" />
              </div>
            </div>
          </div>
        </FadeInSection>

        {/*
          Additional landing content (examples, community art, philosophy/FAQ, and decorative film strips)
          has been commented out for a simplified hero-only layout.
        */}

        {/* Side & Bottom Panes */}
        {/* Overlay */}
        {(showCreativePartner || showPhilosophy || showExamples) && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-all duration-300"
            onClick={() => {
              if (showPhilosophy) {
                setIsPhilosophyPaneClosing(true);
                resetPaneScroll(philosophyContentRef);
                setTimeout(() => setIsPhilosophyPaneClosing(false), 300);
              }
              if (showCreativePartner) {
                setIsCreativePartnerPaneClosing(true);
                resetPaneScroll(creativeContentRef);
                setTimeout(() => setIsCreativePartnerPaneClosing(false), 300);
              }
              if (showExamples) {
                setIsExamplesPaneClosing(true);
                resetPaneScroll(examplesContentRef);
                setTimeout(() => setIsExamplesPaneClosing(false), 300);
              }
              // Reset opening states if needed
              setIsPhilosophyPaneOpening(false);
              setIsCreativePartnerPaneOpening(false);
              setIsExamplesPaneOpening(false);
              // Show buttons immediately when starting to close
              setShowCreativePartner(false);
              setShowPhilosophy(false);
              setShowExamples(false);
              setIsPhilosophyButtonAnimating(false);
              setIsCreativePartnerButtonAnimating(false);
              setIsExamplesButtonAnimating(false);
            }}
          />
        )}

        {/* Creative Partner Programme Side Pane */}
        <div className={`fixed top-0 left-0 h-full w-5/6 max-w-[30rem] sm:w-[30rem] bg-white shadow-2xl z-[70] transform transition-transform duration-300 ease-in-out overflow-visible ${
          showCreativePartner ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <div ref={creativeContentRef} className="px-4 sm:px-8 pt-2 sm:pt-4 pb-4 sm:pb-8 h-full overflow-y-auto overflow-x-visible">
            {/* Close Button */}
            <button
              onClick={() => {
                setIsCreativePartnerPaneClosing(true);
                resetPaneScroll(creativeContentRef);
                setTimeout(() => setIsCreativePartnerPaneClosing(false), 300);
                setIsCreativePartnerPaneOpening(false);
                // Show buttons immediately when starting to close
                setShowCreativePartner(false);
                setIsCreativePartnerButtonAnimating(false);
              }}
              className="absolute top-2 right-2 sm:top-4 sm:right-4 p-2 sm:p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors duration-200 z-10"
            >
              <X className="w-5 h-5 sm:w-4 sm:h-4 text-gray-600" />
            </button>
            
            <div className="mb-8 pr-12 sm:pr-0 space-y-3">
              <h2 className="font-theme text-2xl sm:text-3xl font-theme-heading text-primary">Reigh is an open source tool built on top of open models</h2>
              <div className="w-16 h-1 bg-gradient-to-r from-wes-coral to-wes-pink rounded-full animate-pulse-breathe"></div>
            </div>
            
            <div className="space-y-6 text-muted-foreground">
              <p className="text-sm leading-relaxed">
                Practically for you, <strong>this means three things</strong>:
              </p>

              <div className="space-y-6">
                <div className="space-y-3">
                  <h3 className="font-theme-light text-primary text-lg">1) You can run Reigh for free on your computer</h3>
                  
                  <p className="text-sm leading-relaxed">
                    When you sign up to Reigh, you'll notice something strange: if you have a decent computer, you can run it for free! <strong>We make this very easy</strong>—you can use the app in any browser while the tasks process at home.
                  </p>
                  
                  <p className="text-sm leading-relaxed">
                    This isn't just possible, but <strong>we make it very easy</strong>. To run it for free, you just need to run this command:
                  </p>
                  
                  <div className="rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                    <img 
                      src="https://wczysqzxlwdndgxitrvc.supabase.co/storage/v1/object/public/image_uploads//easy.png"
                      alt="Screenshot showing how easy it is to run Reigh locally"
                      className="w-full h-auto rounded-lg"
                    />
                  </div>
                  
                  <p className="text-sm leading-relaxed">
                    We call our approach an <strong className="text-primary">Open Creative Partner Programme</strong>. In short, we open source our tool, capabilities, and models, then make it as easy as possible for people to run them for free. We hope that artists will use the free tool to create, and this in turn attracts others—many of whom won't have powerful computers or will want to pay for convenience.
                  </p>
                </div>

                <div className="space-y-3">
                  <h3 className="font-theme-light text-primary text-lg">2) Reigh is very convenient and cheap to run on the cloud</h3>
                  
                  <p className="text-sm leading-relaxed">
                    Some open source tools can be difficult to run - you often need to go through a complicated local setup process to even start creating.
                  </p>
                  
                  <p className="text-sm leading-relaxed">
                    While we make it as easy as possible to run Reigh for free if you have a good computer, you can also run it conveniently and cheaply in the cloud. Because we use open models and run on consumer-grade hardware, <strong>our costs are a fraction of what big platforms charge.</strong>
                  </p>
                  
                  <p className="text-sm leading-relaxed">
                    Threfore, if you choose to create with Reigh, you'll be honouring the age-old truth in the sentiment expressed by Picasso:
                  </p>
                  
                  <blockquote className="bg-wes-coral/10 border-l-4 border-wes-coral p-3 rounded-r-lg">
                    <p className="text-sm italic text-primary font-theme-light">
                      "...when artists get together they talk about where you can buy cheap turpentine."
                    </p>
                  </blockquote>
                </div>

                <div className="space-y-3">
                  <h3 className="font-theme-light text-primary text-lg">3) We're part of the open source ecosystem, and will systematically support this & the people within it</h3>
                  
                  <p className="text-sm leading-relaxed">
                    We're part of the{' '}
                    <TooltipProvider>
                      <Tooltip
                        open={ecosystemTipOpen}
                        onOpenChange={(o) => {
                          console.log('[EcosystemTooltip] onOpenChange:', o, 'disabled:', ecosystemTipDisabled);
                          if (!ecosystemTipDisabled) setEcosystemTipOpen(o);
                        }}
                      >
                        <TooltipTrigger asChild>
                          <span
                            onMouseEnter={() => {
                              console.log('[EcosystemTooltip] Mouse enter, disabled:', ecosystemTipDisabled);
                            }}
                            onMouseLeave={() => {
                              console.log('[EcosystemTooltip] Mouse leave, disabled:', ecosystemTipDisabled);
                              if (ecosystemTipDisabled) setEcosystemTipDisabled(false);
                            }}
                            onClick={() => {
                              console.log('[EcosystemTooltip] Click/Touch, current state:', ecosystemTipOpen, 'disabled:', ecosystemTipDisabled);
                              if (isMobile) {
                                // On mobile, toggle the tooltip on click
                                if (ecosystemTipOpen) {
                                  setEcosystemTipOpen(false);
                                  setEcosystemTipDisabled(false);
                                } else {
                                  setEcosystemTipOpen(true);
                                  setEcosystemTipDisabled(true);
                                }
                              }
                            }}
                            className={`sparkle-underline cursor-pointer transition-colors duration-200 ${ecosystemTipOpen ? 'tooltip-open' : ''} ${ecosystemTipDisabled ? 'pointer-events-none' : ''}`}
                          >
                            open source ecosystem
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          align="center"
                          className="group p-2 sm:p-3 bg-wes-cream/90 border-2 border-transparent rounded-lg shadow-md"
                          onPointerEnter={() => {
                            console.log('[EcosystemTooltip] Pointer entered content – holding open');
                            if (!isMobile) {
                              setEcosystemTipDisabled(true);
                              setEcosystemTipOpen(true);
                            }
                          }}
                          onPointerLeave={() => {
                            console.log('[EcosystemTooltip] Pointer left content – releasing hold');
                            if (!isMobile) {
                              setEcosystemTipDisabled(false);
                              setEcosystemTipOpen(false);
                            }
                          }}
                        >
                          <div className="w-[360px] h-[270px] overflow-hidden rounded border relative bg-white">
                            <iframe
                              title="Open Source Ecosystem"
                              style={{ width: '360px', height: '270px', border: 0 }}
                              onLoad={() => console.log('[EcosystemTooltip] Iframe loaded')}
                              onError={() => console.log('[EcosystemTooltip] Iframe error')}
                              src={`/ecosystem-embed.html?scale=1.1`}
                            />
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    , meaning we have a responsibility to help this ecosystem flourish.
                  </p>

                  <p className="text-sm leading-relaxed">
                    To do this, we will share our profits with projects and people whose contributions enabled Reigh to exist:
                  </p>
                  
                  <ProfitSplitBar className="space-y-2" />
                  <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
                    <p>
                      Practically, we will charge roughly twice our inference costs — because we're running on consumer hardware, we'll still be over 50 times cheaper than Veo3, for example.
                    </p>
                    <p>After other costs like hosting, we'll <strong>split the profit three ways</strong>:</p>
                    <div className="space-y-2">
                      <div>
                        <p className="text-primary font-theme-light">A) Artists — 1/3:</p>
                        <p className="mt-1 text-sm text-muted-foreground">We'll share 1/3 with artists, of which half will go to those who refer others to Reigh, while half will go towards art competitions and support for arts.</p>
                      </div>
                      <div>
                        <p className="text-primary font-theme-light">B) Engineers — 1/3:</p>
                        <p className="mt-1 text-sm text-muted-foreground">We'll share 1/3 with engineers, of which half will go to developers whose LoRAs/workflows are used in Reigh, while half will fund open source projects (model training, extensions, etc.).</p>
                      </div>
                      <div>
                        <p className="text-primary font-theme-light">C) Banodoco — 1/3:</p>
                        <p className="mt-1 text-sm text-muted-foreground">A further third will go towards our company, to fund this and further projects.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Divider */}
              <div className="w-full h-px bg-muted/30"></div>

              <div className="space-y-4">
                <p className="text-sm leading-relaxed">
                  We believe that the open source art ecosystem can be a beautiful place that helps humanity's relationship with AI flourish. We would like Reigh to support this as much as possible, and show a model for how others can build successful tools that support this ecosystem. 
                  <br />
                  <br />
                  We hugely appreciate your support.
                </p>
              </div>
              
              {/* Divider */}
              <div className="w-12 h-px bg-muted/30"></div>

              {/* CTA */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => navigate('/tools')}
                  className="text-muted-foreground hover:text-primary text-xs underline transition-colors duration-200"
                >
                  Start creating for free
                </button>
                <span className="text-muted-foreground/50">|</span>
                <a
                  href="https://discord.gg/D5K2c6kfhy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary text-xs underline transition-colors duration-200"
                >
                  Join the community
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Philosophy Side Pane */}
        <div className={`fixed top-0 right-0 h-full w-5/6 max-w-[30rem] sm:w-[30rem] bg-white shadow-2xl z-[60] transform transition-transform duration-300 ease-in-out overflow-visible ${
          showPhilosophy ? 'translate-x-0' : 'translate-x-full'
        }`}>
          <div ref={philosophyContentRef} className="px-4 sm:px-8 pt-2 sm:pt-4 pb-4 sm:pb-8 h-full overflow-y-auto overflow-x-visible">
            {/* Close Button */}
            <button
              onClick={() => {
                setIsPhilosophyPaneClosing(true);
                resetPaneScroll(philosophyContentRef);
                setTimeout(() => setIsPhilosophyPaneClosing(false), 300);
                setIsPhilosophyPaneOpening(false);
                // Show buttons immediately when starting to close
                setShowPhilosophy(false);
                setIsPhilosophyButtonAnimating(false);
              }}
              className="absolute top-2 right-2 sm:top-4 sm:right-4 p-2 sm:p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors duration-200 z-10"
            >
              <X className="w-5 h-5 sm:w-4 sm:h-4 text-gray-600" />
            </button>

            {/* Examples content moved from the Bottom Pane */}
            <div className="mb-8 space-y-3">
              <h2 className="font-theme text-2xl sm:text-3xl font-theme-heading text-primary">Reigh is a tool made just for travelling between images</h2>
              <div className="w-16 h-1 bg-gradient-to-r from-wes-vintage-gold to-wes-coral rounded-full animate-pulse-breathe"></div>
            </div>

            <div className="space-y-3 pb-4 text-left text-muted-foreground">
              {/* New intro paragraphs */}
              <p className="text-sm leading-relaxed">
                There are many tools that aim to be a 'one-stop-shop' for creating with AI - a kind of 'Amazon for art'. 
              </p>
              <p className="text-sm leading-relaxed">
              Reigh is not one of them.
              </p>
              <p className="text-sm leading-relaxed">
              It's a tool <em>just</em> for travelling between images:
              </p>
              {/* Section 1 */}
              <div className="space-y-2 mt-4 mb-4">
                {/* Inputs row */}
                <div className="flex gap-4">
                  {imagePairIndices.map(i => (
                    <div key={i} className="bg-muted/20 border rounded-lg w-40 sm:w-52 aspect-video flex items-center justify-center text-xs text-muted-foreground">
                      16:9 Image {i}
                    </div>
                  ))}
                </div>
                {/* Spacer between inputs and output */}
                <div className="h-0.5" />
                {/* Output row */}
                <div className="bg-muted/20 border rounded-lg w-full aspect-video flex items-center justify-center text-xs text-muted-foreground">
                  16:9 Output
                </div>
              </div>

              {/* Section 2 */}
              <div className="space-y-3 mt-4 mb-4">
                <p className="text-sm leading-relaxed">
                  Just as a songwriter who sticks to only guitar might uncover infinite nuance to be found in six strings, we believe an entire artform lies waiting in the AI-driven journey between images:
                </p>
                <div className="grid grid-cols-2 items-stretch gap-4">
                  {/* Left part: 4 inputs in 2x2 grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {multiSquareIndices.map(i => (
                      <div key={i} className="bg-muted/20 border rounded-lg aspect-square flex items-center justify-center text-xs text-muted-foreground">
                        Square {i}
                      </div>
                    ))}
                  </div>
                  {/* Right part: Output square, stretched to match height */}
                  <div className="bg-muted/20 border rounded-lg aspect-square flex items-center justify-center text-xs text-muted-foreground">
                    Square Output
                  </div>
                </div>
              </div>

              {/* Section 3 - Structural Control */}
              <div className="space-y-3 mt-4 mb-4">
                <p className="text-sm leading-relaxed">
                  Using images to steer video in combination with structural control can allow for deep control and intentionality:
                </p>
                <div className="flex items-center gap-3 w-full">
                  {/* 2 images stacked */}
                  <div className="flex flex-col gap-1 flex-1">
                    <div className="bg-muted/20 border rounded-lg w-full aspect-video flex items-center justify-center text-xs text-muted-foreground">
                      Image 1
                    </div>
                    <div className="bg-muted/20 border rounded-lg w-full aspect-video flex items-center justify-center text-xs text-muted-foreground">
                      Image 2
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground flex-shrink-0">+</span>
                  {/* Structural guide video placeholder */}
                  <div className="bg-muted/20 border rounded-lg flex-1 aspect-video flex items-center justify-center text-xs text-muted-foreground">
                    Guide Video
                  </div>
                  <span className="text-sm text-muted-foreground flex-shrink-0">=</span>
                  {/* Output */}
                  <div className="bg-muted/20 border rounded-lg flex-1 aspect-video flex items-center justify-center text-xs text-muted-foreground">
                    Output
                  </div>
                </div>
              </div>

              {/* Section 4 - LoRAs */}
              <div className="space-y-3 mt-4 mb-4">
                <p className="text-sm leading-relaxed">
                  Combining those with LoRAs can allow for artists to discover a style that's truly their own:
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {motionExamples.map(example => (
                    <div key={example.id} className="relative">
                      {/* Label attached across the bottom */}
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-muted/60 backdrop-blur-sm px-4 py-0.5 text-xs font-light text-muted-foreground rounded-full border border-muted whitespace-nowrap text-center">
                        {example.label}
                      </div>
                      {/* Thumbnail */}
                      <div className="bg-muted/20 border rounded-lg aspect-video flex items-center justify-center text-xs text-muted-foreground">
                        16:9 Example {example.id}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Closing message & CTA */}
              <div className="space-y-3 mb-8">
                <div className="space-y-3">
                  <p className="text-sm leading-relaxed mt-6">
                    Reigh is a tool <strong>just</strong> for exploring this artform. By creating with it and endlessly refining every element, I want to make it extremely good, and build a community of people who want to explore it with me.
                  </p>
                  <p className="text-sm leading-relaxed">
                    If you're interested in joining, you're very welcome! If we're successful, I hope that we can inspire a whole ecosystem of similar tools and communities focusing on discovering and creating their own artforms.
                  </p>
                  <p className="font-serif text-lg italic transform -rotate-1">POM</p>
                </div>

                {/* Divider */}
                <div className="w-12 h-px bg-muted/30"></div>

                {/* CTA */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => navigate('/tools')}
                    className="text-muted-foreground hover:text-primary text-xs underline transition-colors duration-200"
                  >
                    Try the tool
                  </button>
                  <span className="text-muted-foreground/50">|</span>
                  <a
                    href="https://discord.gg/D5K2c6kfhy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary text-xs underline transition-colors duration-200"
                  >
                    Join the community
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Examples Bottom Pane */}
        <div
          className={`fixed left-0 bottom-0 w-full h-1/2 max-h-[50vh] bg-white shadow-2xl z-[60] transform transition-transform duration-300 ease-in-out ${
            showExamples ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          <div ref={examplesContentRef} className="p-4 sm:p-8 h-full overflow-y-auto">
            {/* Close Button */}
            <button
              onClick={() => {
                setIsExamplesPaneClosing(true);
                resetPaneScroll(examplesContentRef);
                setTimeout(() => setIsExamplesPaneClosing(false), 300);
                setIsExamplesPaneOpening(false);
                setShowExamples(false);
                setIsExamplesButtonAnimating(false);
              }}
              className="absolute top-2 right-2 sm:top-4 sm:right-4 p-2 sm:p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors duration-200 z-10"
            >
              <X className="w-5 h-5 sm:w-4 sm:h-4 text-gray-600" />
            </button>

            <div className="mb-8 text-center space-y-3">
              <h2 className="font-theme text-2xl sm:text-3xl font-theme-heading text-primary">Reigh is a tool made just for travelling between images</h2>
              <div className="w-16 h-1 bg-gradient-to-r from-wes-vintage-gold to-wes-coral rounded-full mx-auto animate-pulse-breathe"></div>
            </div>

      <div className="space-y-12 pb-4">
              {/* Section 1 */}
              <div className="space-y-4">
                <div className="flex flex-wrap justify-center items-center gap-4">
                  {/* Two 16:9 input placeholders */}
                  {imagePairIndices.map(i => (
                    <div key={i} className="bg-muted/20 border rounded-lg w-40 sm:w-56 aspect-video flex items-center justify-center text-xs text-muted-foreground">
                      16:9 Image {i}
                    </div>
                  ))}
                  <ArrowRight className="w-6 h-6 text-wes-vintage-gold" />
                  {/* 16:9 output placeholder */}
                  <div className="bg-muted/20 border rounded-lg w-40 sm:w-56 aspect-video flex items-center justify-center text-xs text-muted-foreground">
                    16:9 Output
                  </div>
                </div>
              </div>

              {/* Section 2 */}
              <div className="space-y-4">
                <h3 className="font-theme-light text-primary text-lg text-center">You can travel between batches of images of any size – with seamless transitions</h3>
                <div className="flex flex-wrap justify-center items-center gap-3">
                  {/* Four square inputs */}
                  {multiSquareIndices.map(i => (
                    <div key={i} className="bg-muted/20 border rounded-lg w-24 sm:w-28 aspect-square flex items-center justify-center text-xs text-muted-foreground">
                      Square {i}
                    </div>
                  ))}
                  <ArrowRight className="w-5 h-5 text-wes-vintage-gold" />
                  {/* Square output */}
                  <div className="bg-muted/20 border rounded-lg w-24 sm:w-28 aspect-square flex items-center justify-center text-xs text-muted-foreground">
                    Square Output
                  </div>
                </div>
              </div>

              {/* Section 3 */}
              <div className="space-y-4">
                <h3 className="font-theme-light text-primary text-lg text-center">You can use LoRAs to achieve all kinds of weird and interesting motion</h3>
                <div className="flex flex-wrap justify-center items-center gap-4">
            {motionExamples.map(example => (
              <div key={example.id} className="relative w-40 sm:w-56">
                {/* Label attached across the bottom */}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-muted/60 backdrop-blur-sm px-4 py-0.5 text-xs font-theme-light text-muted-foreground rounded-full border border-muted whitespace-nowrap text-center">
                  {example.label}
                </div>
                {/* Thumbnail */}
                <div className="bg-muted/20 border rounded-lg aspect-video flex items-center justify-center text-xs text-muted-foreground">
                  16:9 Example {example.id}
                </div>
                    </div>
                  ))}
                </div>
              </div>

        {/* Closing line + Join Us Button */}
        <div className="text-center space-y-8 mb-6">
          <p className="text-base md:text-lg font-theme-light text-primary m-0 max-w-2xl mx-auto">We believe that there's endless potential in this approach waiting to be unlocked&nbsp;&mdash; and that a tool and community focusing exclusively on it can unleash its promise.</p>
          
          {/* Divider */}
          <div className="w-12 h-px bg-muted/30 mx-auto"></div>
          
          <div className="flex items-center space-x-2 justify-center">
            <button
              onClick={() => navigate('/tools')}
              className="text-muted-foreground hover:text-primary text-xs underline transition-colors duration-200"
            >
              Try the tool
            </button>
            <span className="text-muted-foreground/50">|</span>
            <a
              href="https://discord.gg/D5K2c6kfhy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary text-xs underline transition-colors duration-200"
            >
              Join the community
            </a>
          </div>
        </div>
            </div>
          </div>
        </div>
      </div>


    </PageFadeIn>
  );
} 