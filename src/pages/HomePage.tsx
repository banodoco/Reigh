/* eslint-disable no-sequences */
import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, Video, Users, FileText, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, GitBranch, X, HandHeart, Brain, Palette, Infinity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { useNavigate, useLocation } from 'react-router-dom';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { toast } from '@/shared/components/ui/use-toast';
import { PageFadeIn } from '@/shared/components/transitions';
import { FadeInSection } from '@/shared/components/transitions/FadeInSection';
import { PaintParticles } from '@/shared/components/PaintParticles';

// Memoized Paper Planes component for performance
const PaperPlanes = React.memo(() => {
  // Generate planes once on mount
  const planes = React.useMemo(() => {
    return Array.from({ length: 1000 }).map((_, index) => {
      // Random properties for each plane
      const colors = ['wes-vintage-gold', 'wes-coral', 'wes-mint', 'wes-lavender', 'wes-pink', 'wes-yellow', 'wes-dusty-blue', 'wes-sage'];
      const color = colors[Math.floor(Math.random() * colors.length)];
      const size = Math.random() * 8 + 6; // 6-14px (smaller for performance)
      const opacity = Math.random() * 0.08 + 0.02; // 0.02-0.10 opacity (more subtle)
      const duration = Math.random() * 50 + 30; // 30-80s duration (slower for less CPU)
      const delay = Math.random() * 80; // 0-80s delay (more spread out)
      
      // Random starting position
      const startSide = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
      const startPos = Math.random() * 100;
      
      // Random animation type
      const animationTypes = [
        'paper-plane-diagonal-tl-br',
        'paper-plane-diagonal-tr-bl',
        'paper-plane-diagonal-bl-tr',
        'paper-plane-diagonal-br-tl',
        'paper-plane-horizontal-lr',
        'paper-plane-horizontal-rl',
        'paper-plane-vertical-tb',
        'paper-plane-vertical-bt',
        'paper-plane-spiral-cw',
        'paper-plane-spiral-ccw',
        'paper-plane-zigzag-h',
        'paper-plane-zigzag-v',
      ];
      const animationType = animationTypes[Math.floor(Math.random() * animationTypes.length)];
      
      // Set initial position based on start side
      let initialStyle: React.CSSProperties = {
        borderLeft: `${size * 0.6}px solid transparent`,
        borderRight: `${size * 0.6}px solid transparent`,
        borderBottom: `${size}px solid`,
        borderBottomColor: `rgb(var(--${color}) / 0.3)`,
        transformOrigin: 'center bottom',
        filter: 'drop-shadow(0 0.5px 1px rgba(0,0,0,0.05))',
        opacity,
        animation: `${animationType} ${duration}s linear infinite`,
        animationDelay: `${delay}s`,
        willChange: 'transform',
        // Optimize rendering
        contain: 'layout style paint',
        pointerEvents: 'none' as const,
      };
      
      // Set starting position
      switch (startSide) {
        case 0: // top
          initialStyle.top = '-30px';
          initialStyle.left = `${startPos}%`;
          break;
        case 1: // right
          initialStyle.right = '-30px';
          initialStyle.top = `${startPos}%`;
          break;
        case 2: // bottom
          initialStyle.bottom = '-30px';
          initialStyle.left = `${startPos}%`;
          break;
        case 3: // left
          initialStyle.left = '-30px';
          initialStyle.top = `${startPos}%`;
          break;
      }
      
      return { id: index, style: initialStyle };
    });
  }, []);
  
  return (
    <>
      {planes.map(plane => (
        <div
          key={plane.id}
          className="absolute w-0 h-0"
          style={plane.style}
          aria-hidden="true"
        />
      ))}
    </>
  );
});

PaperPlanes.displayName = 'PaperPlanes';

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

  // Tooltip state: "for exploring"
  const [exploringTipOpen, setExploringTipOpen] = useState(false);
  const [exploringTipDisabled, setExploringTipDisabled] = useState(false);

  // Tooltip state: "emerging artform"
  const [emergingTipOpen, setEmergingTipOpen] = useState(false);
  const [emergingTipDisabled, setEmergingTipDisabled] = useState(false);

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
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleDiscordSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: window.location.origin,
      },
    });
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
    return (
      <div className="min-h-screen wes-texture relative overflow-hidden flex items-center justify-center">
        <div className="w-32 h-1.5 bg-gradient-to-r from-wes-pink to-wes-vintage-gold rounded-full mx-auto shadow-inner-vintage animate-pulse"></div>
      </div>
    );
  }

  return (
    <PageFadeIn className="h-screen wes-texture relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-wes-cream via-white to-wes-mint/20 opacity-60 animate-gradient-shift"></div>
      <div className="absolute inset-0 wes-chevron-pattern opacity-30 animate-pulse-subtle"></div>
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-wes-vintage-gold via-wes-coral to-wes-mint animate-shimmer"></div>
      
      {/* Floating Background Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Large floating orbs */}
        <div className="absolute top-20 left-10 w-32 h-32 bg-wes-pink/10 rounded-full blur-3xl animate-float-slow"></div>
        <div className="absolute top-40 right-20 w-24 h-24 bg-wes-yellow/15 rounded-full blur-2xl animate-float-slow" style={{ animationDelay: '2s' }}></div>
        <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-wes-lavender/10 rounded-full blur-3xl animate-float-slow" style={{ animationDelay: '4s' }}></div>
        
        {/* Small floating particles */}
        <div className="absolute top-1/4 left-1/3 w-2 h-2 bg-wes-vintage-gold/20 rounded-full animate-float-gentle" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/3 right-1/4 w-1.5 h-1.5 bg-wes-coral/25 rounded-full animate-float-gentle" style={{ animationDelay: '3s' }}></div>
        <div className="absolute top-2/3 left-1/6 w-1 h-1 bg-wes-mint/30 rounded-full animate-float-gentle" style={{ animationDelay: '5s' }}></div>
        <div className="absolute bottom-1/3 right-1/3 w-2.5 h-2.5 bg-wes-pink/15 rounded-full animate-float-gentle" style={{ animationDelay: '7s' }}></div>
        <div className="absolute top-1/2 left-2/3 w-1.5 h-1.5 bg-wes-lavender/20 rounded-full animate-float-gentle" style={{ animationDelay: '9s' }}></div>
        
        {/* Subtle geometric shapes */}
        <div className="absolute top-1/6 right-1/6 w-3 h-3 border border-wes-vintage-gold/15 rotate-45 animate-rotate-gentle" style={{ animationDelay: '2s' }}></div>
        <div className="absolute bottom-1/4 left-1/5 w-2 h-2 border border-wes-coral/20 rotate-12 animate-rotate-gentle" style={{ animationDelay: '6s' }}></div>
        <div className="absolute top-3/4 right-2/5 w-2.5 h-2.5 border border-wes-mint/18 -rotate-12 animate-rotate-gentle" style={{ animationDelay: '4s' }}></div>
        
        {/* Paper Planes - 1000 of them! */}
        <PaperPlanes />
      </div>
      
      {/* Top Navigation Links */}
      <div className={`fixed top-6 left-6 sm:top-12 sm:left-12 flex items-center space-x-6 ${
        showCreativePartner || isCreativePartnerPaneClosing || showPhilosophy || isPhilosophyPaneClosing || showExamples || isExamplesPaneClosing || isCreativePartnerPaneOpening || isPhilosophyPaneOpening || isExamplesPaneOpening ? 'z-0' : 'z-50'
      }`}>
        {/* Creative Partner Programme */}
        <button
          onClick={() => {
            setIsCreativePartnerButtonAnimating(true);
            setIsCreativePartnerPaneOpening(true);
            setShowPhilosophy(false);
            setShowCreativePartner(true);
            // Reset animation state after pane is fully open
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
          <span className="font-inter text-sm font-medium hidden sm:inline">Open Creative Partner Programme</span>
        </button>
      </div>
        
      <div className={`fixed top-6 right-6 sm:top-12 sm:right-12 flex items-center ${
        showCreativePartner || isCreativePartnerPaneClosing || showPhilosophy || isPhilosophyPaneClosing || showExamples || isExamplesPaneClosing || isPhilosophyPaneOpening || isCreativePartnerPaneOpening || isExamplesPaneOpening ? 'z-0' : 'z-50'
      }`}>
        {/* Philosophy Link */}
        <button
          onClick={() => {
            setIsPhilosophyButtonAnimating(true);
            setIsPhilosophyPaneOpening(true);
            setShowCreativePartner(false);
            setShowPhilosophy(true);
            // Reset animation state after pane is fully open
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
          <span className="font-inter text-sm font-medium text-primary group-hover:text-primary/80 hidden sm:inline">Philosophy</span>
        </button>
      </div>

      <div className="container mx-auto px-4 relative z-10 h-screen flex items-center justify-center">
        {/* Hero Section */}
        <div className="text-center w-full -mt-16">
          <div className="max-w-4xl mx-auto">


            {/* Icon above title */}
            <FadeInSection delayMs={25}>
              <div className="flex justify-center mb-6 mt-6">
                <div className="relative">
                  <div className="flex items-center justify-center w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-wes-pink/60 via-wes-lavender/60 to-wes-dusty-blue/60 rounded-lg border border-wes-vintage-gold/20 shadow-sm transition-all duration-300 opacity-70 group group-hover:opacity-100">
                    <Palette className="h-6 w-6 md:h-7 md:w-7 text-white/90 transition-transform duration-300 group-hover:rotate-3 group-hover:scale-105" />
                  </div>
                </div>
              </div>
            </FadeInSection>
            
            {/* Main title */}
            <FadeInSection delayMs={50}>
              <h1 className="font-playfair text-6xl md:text-8xl font-bold text-primary mb-8 text-shadow-vintage">
                Reigh
              </h1>
            </FadeInSection>
            
            {/* Decorative divider */}
            <FadeInSection delayMs={100}>
              <div className="w-32 h-1.5 bg-gradient-to-r from-wes-pink to-wes-vintage-gold rounded-full mx-auto mb-8 shadow-inner-vintage animate-pulse-glow"></div>
            </FadeInSection>
            
            {/* Subtitle */}
            <FadeInSection delayMs={200}>
              <p className="font-inter text-xl md:text-2xl text-muted-foreground leading-relaxed tracking-wide mb-8">
                An{' '}
                <TooltipProvider>
                  <Tooltip open={openTipOpen} onOpenChange={(o)=>{ if(!openTipDisabled) setOpenTipOpen(o); }}>
                    <TooltipTrigger asChild>
                <span
                  onClick={handleOpenToolActivate}
                  onMouseLeave={() => { if(openTipDisabled) setOpenTipDisabled(false);} }
                  className={`sparkle-underline cursor-pointer transition-colors duration-200 ${openTipDisabled ? 'pointer-events-none' : ''} ${
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
                    className={`sparkle-underline cursor-pointer transition-colors duration-200 ${emergingTipDisabled ? 'pointer-events-none' : ''} ${
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
                    <span className="text-xs sm:text-sm font-medium">+</span>
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-muted/20 border rounded" />
                    <span className="text-xs sm:text-sm font-medium">=</span>
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
                    className="flex items-center space-x-2 px-6 py-4 bg-gradient-to-r from-wes-vintage-gold to-wes-coral rounded-full border-2 border-wes-vintage-gold/40 hover:border-wes-vintage-gold/60 transition-all duration-300 shadow-wes-vintage hover:shadow-wes-hover text-white text-lg font-medium mx-auto relative overflow-hidden"
                  >
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
                    className="flex items-center space-x-2 px-6 py-4 bg-gradient-to-r from-wes-vintage-gold to-wes-coral rounded-full border-2 border-wes-vintage-gold/40 hover:border-wes-vintage-gold/60 transition-all duration-300 shadow-wes-vintage hover:shadow-wes-hover text-white text-lg font-medium mx-auto relative overflow-hidden"
                  >
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
              <div className="mt-12 flex justify-center">
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
                //   className={`group text-sm font-medium text-muted-foreground hover:text-primary underline underline-offset-2 transition-colors duration-200 ${
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
        <div className={`fixed top-0 left-0 h-full w-5/6 max-w-[30rem] sm:w-[30rem] bg-white shadow-2xl z-[60] transform transition-transform duration-300 ease-in-out ${
          showCreativePartner ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <div ref={creativeContentRef} className="p-4 sm:p-8 h-full overflow-y-auto">
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
            
            <div className="mb-6 pr-12 sm:pr-0">
              <h2 className="font-playfair text-2xl sm:text-3xl font-bold text-primary mb-4">Anyone can run Reigh for free</h2>
              <div className="w-16 h-1 bg-gradient-to-r from-wes-coral to-wes-pink rounded-full mb-6 animate-pulse-breathe"></div>
            </div>
            
            <div className="space-y-6 text-muted-foreground">
              <p className="text-sm leading-relaxed">
                When you sign up to Reigh, you'll notice something strange:&nbsp; if you have a decent computer, you can run it for free!
              </p>
              

              
              <div className="rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                <img 
                  src="https://wczysqzxlwdndgxitrvc.supabase.co/storage/v1/object/public/image_uploads//easy.png"
                  alt="Screenshot showing how easy it is to run Reigh locally"
                  className="w-full h-auto rounded-lg"
                />
              </div>
              
              <p className="text-sm leading-relaxed">
                This isn't just possible, but we make it exceedingly easy&nbsp;&mdash;&nbsp;you can use the app in any browser while the tasks process at home.
              </p>
              
              <div className="space-y-4">
                <h3 className="font-semibold text-primary text-lg">But...why make it free?</h3>
                
                <p className="text-sm leading-relaxed">
                  Today, venture-backed startups invest tens of millions in 'Creative Partner Programs'.
                </p>
                
                <p className="text-sm leading-relaxed">
                  The reason they do this is simple: it's valuable to have people make art with your tool - every piece you make is marketing for them.
                </p>
                
                <p className="text-sm leading-relaxed">
                  But it's not free - the cost is ultimately paid by the people you attract for them. On aggregate, they pay a higher price to cover the cost of your credits.
                </p>
    
              </div>
              
              <div className="space-y-4">
                <h3 className="font-semibold text-primary text-lg">A better way for <u>all</u> artists</h3>
                
                <p className="text-sm leading-relaxed">
                  While this status quo is good for artists who are given free credits, we believe that there's a better way.
                </p>
                
                <p className="text-sm leading-relaxed">
                  We call this an <strong className="text-primary">Open Creative Partner Programme</strong>.
                </p>
                
                <p className="text-sm leading-relaxed">
                  In short, we open source our tool, capabilities, models and then make it as easy as possible for people to run them for free.
                </p>
                
                <p className="text-sm leading-relaxed">
                  We hope that artists will then use the free tool to create and that this in turns attracts others&nbsp;&mdash;&nbsp;many of whom won't have powerful computers or will want to pay for convenience.
                </p>

                <p className="text-sm leading-relaxed">
                  We believe that this is a better approach that will make creation affordable to more people. If you agree and choose to create with Reigh, you'll be honouring the age-old truth in the sentiment expressed by Picasso:
                </p>
                
                <blockquote className="bg-wes-coral/10 border-l-4 border-wes-coral p-3 rounded-r-lg">
                  <p className="text-sm italic text-primary font-medium">
                    "...when artists get together they talk about where you can buy cheap turpentine."
                  </p>
                </blockquote>
                
                <p className="text-sm leading-relaxed">
                  Accessible, cheap/free capabilities delivered through great tools = a flourishing ecosystem for all artists.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Philosophy Side Pane */}
        <div className={`fixed top-0 right-0 h-full w-5/6 max-w-[30rem] sm:w-[30rem] bg-white shadow-2xl z-[60] transform transition-transform duration-300 ease-in-out ${
          showPhilosophy ? 'translate-x-0' : 'translate-x-full'
        }`}>
          <div ref={philosophyContentRef} className="p-4 sm:p-8 h-full overflow-y-auto">
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
              <h2 className="font-playfair text-2xl sm:text-3xl font-bold text-primary">Reigh is a tool for travelling between images</h2>
              <div className="w-16 h-1 bg-gradient-to-r from-wes-vintage-gold to-wes-coral rounded-full animate-pulse-breathe"></div>
            </div>

            <div className="space-y-12 pb-4 text-left">
              {/* Section 1 */}
              <div className="space-y-3">
                {/* Inputs row */}
                <div className="flex gap-4">
                  {imagePairIndices.map(i => (
                    <div key={i} className="bg-muted/20 border rounded-lg w-40 sm:w-52 aspect-video flex items-center justify-center text-xs text-muted-foreground">
                      16:9 Image {i}
                    </div>
                  ))}
                </div>
                {/* Spacer between inputs and output */}
                <div className="h-2" />
                {/* Output row */}
                <div className="bg-muted/20 border rounded-lg w-full aspect-video flex items-center justify-center text-xs text-muted-foreground">
                  16:9 Output
                </div>
              </div>

              {/* Section 2 */}
              <div className="space-y-3">
                <h3 className="font-semibold text-primary text-lg">You can travel between batches of images of any size – with seamless transitions</h3>
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

              {/* Section 3 */}
              <div className="space-y-4">
                <h3 className="font-semibold text-primary text-lg">You can use LoRAs to achieve all kinds of weird and interesting motion</h3>
                <div className="grid grid-cols-2 gap-4">
                  {motionExamples.map(example => (
                    <div key={example.id} className="relative">
                      {/* Label attached across the bottom */}
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-muted/60 backdrop-blur-sm px-4 py-0.5 text-xs font-medium text-muted-foreground rounded-full border border-muted whitespace-nowrap text-center">
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
              <div className="space-y-8 mb-8">
                {/* Message */}
                <div className="space-y-6">
                  <p className="text-sm leading-relaxed">
                    We believe that there's endless potential in this approach waiting to be unlocked.
                  </p>
                  <p className="text-sm leading-relaxed">
                    However, reaching it requires two things:
                  </p>
                  <ol className="list-decimal pl-4 md:pl-6 space-y-2 text-sm leading-relaxed">
                    <li><span className="font-medium">A powerful tool</span> that's cheap or free to use</li>
                    <li><span className="font-medium">A community</span> and scene that pushes one another artistically</li>
                  </ol>
                  <p className="text-sm leading-relaxed">
                    On top of the open source community's work, I've built the tool&nbsp;&mdash;&nbsp;you can run it for free on your computer, or for very cheap on our service&nbsp;&mdash;&nbsp;and am now building the community.
                  </p>
                  <p className="text-sm leading-relaxed">
                    If you're interested in exploring with us, you're very welcome&nbsp;to join.
                  </p>
                  <p className="font-serif text-lg italic transform -rotate-1">POM</p>
                </div>

                {/* CTA */}
                <div>
                  <button
                    onClick={handleDiscordSignIn}
                    className="inline-flex items-center px-5 py-2 bg-white/80 backdrop-blur-sm text-primary rounded-full border-2 border-wes-vintage-gold/60 hover:border-wes-vintage-gold/80 hover:bg-white/90 transition-colors duration-200 shadow-sm"
                  >
                    Join us
                  </button>
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
              <h2 className="font-playfair text-2xl sm:text-3xl font-bold text-primary">Reigh is a tool for travelling between images</h2>
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
                <h3 className="font-semibold text-primary text-lg text-center">You can travel between batches of images of any size – with seamless transitions</h3>
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
                <h3 className="font-semibold text-primary text-lg text-center">You can use LoRAs to achieve all kinds of weird and interesting motion</h3>
                <div className="flex flex-wrap justify-center items-center gap-4">
            {motionExamples.map(example => (
              <div key={example.id} className="relative w-40 sm:w-56">
                {/* Label attached across the bottom */}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-muted/60 backdrop-blur-sm px-4 py-0.5 text-xs font-medium text-muted-foreground rounded-full border border-muted whitespace-nowrap text-center">
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
          <p className="text-base md:text-lg font-medium text-primary m-0 max-w-2xl mx-auto">We believe that there's endless potential in this approach waiting to be unlocked&nbsp;&mdash; and that a tool and community focusing exclusively on it can unleash its promise.</p>
          <button
            onClick={handleDiscordSignIn}
            className="inline-flex items-center px-5 py-2 bg-white/80 backdrop-blur-sm text-primary rounded-full border-2 border-wes-vintage-gold/60 hover:border-wes-vintage-gold/80 hover:bg-white/90 transition-colors duration-200 shadow-sm"
          >
            Join us
          </button>
        </div>
            </div>
          </div>
        </div>
      </div>


    </PageFadeIn>
  );
} 