import React, { useState, useEffect } from 'react';
import { ArrowRight, Image as ImageIcon, Video, Users, FileText, ChevronDown, ChevronUp, GitBranch, X, HandHeart, Brain } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { useNavigate, useLocation } from 'react-router-dom';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { toast } from '@/shared/components/ui/use-toast';
import { PageFadeIn } from '@/shared/components/transitions';
import { PaintParticles } from '@/shared/components/PaintParticles';

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
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);


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

  // Prevent scrolling on mobile
  useEffect(() => {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100vh';
    }
    
    return () => {
      document.body.style.overflow = '';
      document.body.style.height = '';
    };
  }, []);

  return (
    <PageFadeIn className="min-h-screen wes-texture relative overflow-hidden">
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
      </div>
      
      {/* Top Navigation Links */}
      <div className={`fixed top-6 left-6 sm:top-12 sm:left-12 flex items-center space-x-6 ${
        (showCreativePartner || showPhilosophy) ? 'z-10' : 'z-20'
      }`}>
        {/* Philosophy Link */}
        <button
          onClick={() => {
            setIsPhilosophyButtonAnimating(true);
            setShowCreativePartner(false);
            setTimeout(() => {
              setShowPhilosophy(true);
              // Reset animation state after pane is fully open
              setTimeout(() => setIsPhilosophyButtonAnimating(false), 300);
            }, 50);
          }}
          className={`group flex items-center sm:space-x-2 px-4 py-4 sm:px-4 sm:py-2 bg-white/80 backdrop-blur-sm rounded-full border-2 border-wes-vintage-gold/20 hover:border-wes-vintage-gold/40 transition-all duration-300 hover:shadow-wes-ornate ${
            isPhilosophyButtonAnimating ? 'animate-spin-left-fade' : ''
          } ${showPhilosophy || isPhilosophyPaneClosing || isPhilosophyButtonAnimating ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}
        >
          <Brain className="w-6 h-6 sm:w-4 sm:h-4 text-wes-vintage-gold" />
          <span className="font-inter text-sm font-medium text-primary group-hover:text-primary/80 hidden sm:inline">Philosophy</span>
        </button>
      </div>
        
      <div className={`fixed top-6 right-6 sm:top-12 sm:right-12 flex items-center ${
        (showCreativePartner || showPhilosophy) ? 'z-10' : 'z-20'
      }`}>
        {/* Creative Partner Programme */}
        <button
          onClick={() => {
            setIsCreativePartnerButtonAnimating(true);
            setShowPhilosophy(false);
            setTimeout(() => {
              setShowCreativePartner(true);
              // Reset animation state after pane is fully open
              setTimeout(() => setIsCreativePartnerButtonAnimating(false), 300);
            }, 50);
          }}
          className={`group flex items-center sm:space-x-2 px-4 py-4 sm:px-4 sm:py-2 bg-gradient-to-r from-wes-coral/90 to-wes-pink/90 backdrop-blur-sm rounded-full border-2 border-wes-coral/30 hover:border-wes-coral/50 transition-all duration-300 hover:shadow-wes-ornate text-white hover:from-wes-coral hover:to-wes-pink ${
            isCreativePartnerButtonAnimating ? 'animate-spin-right-fade' : ''
          } ${showCreativePartner || isCreativePartnerPaneClosing || isCreativePartnerButtonAnimating ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}
        >
          <HandHeart className="w-6 h-6 sm:w-4 sm:h-4 group-hover:scale-110 transition-transform" />
          <span className="font-inter text-sm font-medium hidden sm:inline">Open Creative Partner Programme</span>
        </button>
      </div>

      <div className="container mx-auto px-4 relative z-10 min-h-screen flex items-center justify-center">
        {/* Hero Section */}
        <div className="text-center w-full">
          <div className="max-w-4xl mx-auto">


            {/* Main title */}
            <h1 className="font-playfair text-6xl md:text-8xl font-bold text-primary mb-8 text-shadow-vintage">
              Reigh
            </h1>
            
            {/* Decorative divider */}
            <div className="w-32 h-1.5 bg-gradient-to-r from-wes-pink to-wes-vintage-gold rounded-full mx-auto mb-8 shadow-inner-vintage"></div>
            
            {/* Subtitle */}
            <p className="font-inter text-xl md:text-2xl text-muted-foreground leading-relaxed tracking-wide mb-8">
            A tool and community for exploring the emerging artform of image-guided video
            </p>
            
            {/* Sign-in button below hero */}
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
                  onClick={() => navigate('/tools')}
                  className="flex items-center space-x-2 px-6 py-4 bg-gradient-to-r from-wes-mint to-wes-vintage-gold rounded-full border-2 border-wes-mint/40 hover:border-wes-mint/60 transition-all duration-300 shadow-wes-vintage hover:shadow-wes-hover text-white text-lg font-medium mx-auto relative overflow-hidden"
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

            {/* Open Source Indicator - Same distance from content as top nav is from top */}
            <div className="mt-12 flex justify-center">
              <TooltipProvider>
                <Tooltip open={isTooltipOpen} onOpenChange={setIsTooltipOpen}>
                  <TooltipTrigger asChild>
                    <div 
                      className="group relative cursor-pointer"
                      onClick={() => setIsTooltipOpen(!isTooltipOpen)}
                    >
                      {/* Floating particles */}
                      <div className="absolute -inset-4 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity duration-500">
                        <div className="absolute top-0 left-0 w-1 h-1 bg-wes-vintage-gold rounded-full animate-ping" style={{ animationDelay: '0s' }}></div>
                        <div className="absolute top-2 right-1 w-0.5 h-0.5 bg-wes-coral rounded-full animate-ping" style={{ animationDelay: '0.3s' }}></div>
                        <div className="absolute bottom-1 left-2 w-0.5 h-0.5 bg-wes-mint rounded-full animate-ping" style={{ animationDelay: '0.6s' }}></div>
                      </div>
                      
                      {/* Spinning dashed ring */}
                      <div className="absolute -inset-3 rounded-full border-2 border-dashed border-wes-vintage-gold/20 opacity-0 group-hover:opacity-100 group-active:opacity-100 group-hover:animate-spin group-active:animate-spin transition-all duration-500"></div>
                      
                      {/* Expanding glow */}
                      <div className="absolute -inset-2 bg-gradient-to-r from-wes-vintage-gold/10 to-wes-coral/10 rounded-full blur-md opacity-0 group-hover:opacity-100 group-active:opacity-100 group-hover:scale-150 group-active:scale-150 transition-all duration-500"></div>
                      
                      {/* Main icon container */}
                      <div className="relative bg-white/80 backdrop-blur-sm rounded-full p-3 border-2 border-wes-vintage-gold/20 hover:border-wes-vintage-gold/40 active:border-wes-vintage-gold/40 transition-all duration-300 hover:shadow-wes-ornate active:shadow-wes-ornate group-hover:scale-110 group-active:scale-110">
                        <GitBranch className="w-5 h-5 text-wes-vintage-gold group-hover:animate-pulse group-active:animate-pulse transition-all duration-300" />
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs sm:max-w-md p-3 sm:p-4 mx-2 sm:mx-0">
                    <p className="text-sm leading-relaxed">
                      Reigh is an{' '}
                      <a 
                        href="https://github.com/peteromallet/reigh" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="underline text-wes-vintage-gold hover:text-wes-coral transition-colors font-medium"
                      >
                        open tool
                      </a>
                      . Because it's built on{' '}
                      <a 
                        href="https://github.com/Wan-Video/Wan2.1" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="underline text-wes-vintage-gold hover:text-wes-coral transition-colors font-medium"
                      >
                        open models
                      </a>
                      , you can run it{' '}
                      <button 
                        onClick={() => {
                          setIsTooltipOpen(false);
                          setIsCreativePartnerButtonAnimating(true);
                          setShowPhilosophy(false);
                          setTimeout(() => {
                            setShowCreativePartner(true);
                            setTimeout(() => setIsCreativePartnerButtonAnimating(false), 300);
                          }, 50);
                        }}
                        className="underline text-wes-vintage-gold hover:text-wes-coral transition-colors font-medium"
                      >
                        for free
                      </button>
                      {' '}on your computer. You can also run it on the cloud for convenience. In addition to a tool, we're also creating{' '}
                      <button 
                        onClick={() => {
                          setIsTooltipOpen(false);
                          setIsPhilosophyButtonAnimating(true);
                          setShowCreativePartner(false);
                          setTimeout(() => {
                            setShowPhilosophy(true);
                            setTimeout(() => setIsPhilosophyButtonAnimating(false), 300);
                          }, 50);
                        }}
                        className="underline text-wes-vintage-gold hover:text-wes-coral transition-colors font-medium"
                      >
                        a community
                      </button>
                      {' '}for artists who wish to explore this new artform.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>



          </div>
        </div>

        {/*
          Additional landing content (examples, community art, philosophy/FAQ, and decorative film strips)
          has been commented out for a simplified hero-only layout.
        */}

        {/* Side Panes */}
        {/* Overlay */}
        {(showCreativePartner || showPhilosophy) && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-all duration-300"
            onClick={() => {
              if (showPhilosophy) {
                setIsPhilosophyPaneClosing(true);
                setTimeout(() => setIsPhilosophyPaneClosing(false), 300);
              }
              if (showCreativePartner) {
                setIsCreativePartnerPaneClosing(true);
                setTimeout(() => setIsCreativePartnerPaneClosing(false), 300);
              }
              setShowCreativePartner(false);
              setShowPhilosophy(false);
              setIsPhilosophyButtonAnimating(false);
              setIsCreativePartnerButtonAnimating(false);
            }}
          />
        )}

        {/* Creative Partner Programme Side Pane */}
        <div className={`fixed top-0 right-0 h-full w-5/6 max-w-[30rem] sm:w-[30rem] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          showCreativePartner ? 'translate-x-0' : 'translate-x-full'
        }`}>
          <div className="p-4 sm:p-8 h-full overflow-y-auto">
            {/* Close Button */}
            <button
              onClick={() => {
                setIsCreativePartnerPaneClosing(true);
                setTimeout(() => setIsCreativePartnerPaneClosing(false), 300);
                setShowCreativePartner(false);
                setIsCreativePartnerButtonAnimating(false);
              }}
              className="absolute top-2 right-2 sm:top-4 sm:right-4 p-2 sm:p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors duration-200 z-10"
            >
              <X className="w-5 h-5 sm:w-4 sm:h-4 text-gray-600" />
            </button>
            
            <div className="mb-6 pr-12 sm:pr-0">
              <h2 className="font-playfair text-2xl sm:text-3xl font-bold text-primary mb-4">Open Creative Partner Programme</h2>
              <div className="w-16 h-1 bg-gradient-to-r from-wes-coral to-wes-pink rounded-full mb-6"></div>
            </div>
            
            <div className="space-y-6 text-muted-foreground">
              <p className="text-sm font-medium text-primary leading-relaxed">
                We want to make it as easy as possible to use Reigh for free!
              </p>
              
              <p className="text-sm leading-relaxed">
                When you sign up to Reigh, you'll notice that - in addition to being able to purchase credits - you can run the app for free!
              </p>
              
              <p className="text-sm leading-relaxed">
                If you have a decent computer, you'll just need to run a command in your terminal and it'll process your AI tasks for you in the background!
              </p>
              
              <div className="rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                <img 
                  src="https://wczysqzxlwdndgxitrvc.supabase.co/storage/v1/object/public/image_uploads//easy.png"
                  alt="Screenshot showing how easy it is to run Reigh locally"
                  className="w-full h-auto rounded-lg"
                />
              </div>
              
              <p className="text-sm leading-relaxed">
                This isn't just possible, but we make it exceedingly easy - you can use the web app in any browser while the tasks process at home.
              </p>
              
              <p className="text-sm leading-relaxed">
                You don't have to fill out an application or network your way in - or wait for some product marketing manager to approve of you and your art.
              </p>
              
              <p className="text-sm leading-relaxed">
                While we'll be glad if you pay for credits, we want to make this as easy as possible for you to use Reigh for free!
              </p>
              
              <div className="space-y-4">
                <h3 className="font-semibold text-primary text-lg">But...why make it free?</h3>
                
                <p className="text-sm leading-relaxed">
                  Today, venture-backed companies are investing tens of millions in 'Creative Partner Programs'
                </p>
                
                <p className="text-sm leading-relaxed">
                  The reason they do this is simple: it's valuable to have people make art with your tool. They give it for free so you'll in effect create marketing materials for them.
                </p>
                
                <p className="text-sm leading-relaxed">
                  But it's not free - like everything in life, the cost ultimately has to be borne by someone. In this case, it's paid by the people you attract for them. On aggregate, they pay a higher price to cover the cost of your credits.
                </p>
                
                <p className="text-sm leading-relaxed">
                  Not just this, but they're often running closed models on expensive hardware - these are typically not optimised like open models, meaning they cost up to 5 times as much as open models for comparable quality.
                </p>
              </div>
              
              <div className="space-y-4">
                <h3 className="font-semibold text-primary text-lg">A better way for <u>all</u> artists</h3>
                
                <p className="text-sm leading-relaxed">
                  While this status quo is good for artists who are given free credits, we believe that there's a better way for all artists.
                </p>
                
                <p className="text-sm leading-relaxed">
                  We call this an <strong className="text-primary">Open Creative Partner Programme</strong>.
                </p>
                
                <p className="text-sm leading-relaxed">
                  In short, we open source our tool, capabilities, models and then make it as easy as possible for people to run them for free.
                </p>
                
                <p className="text-sm leading-relaxed">
                  We hope that artists will then use them to create and that this in turns attracts people to use it - meaning we can offer the cheapest possible credits to end-users.
                </p>
                
                <p className="text-sm leading-relaxed">
                  We believe that a world in which more companies operate in this way will be a better future for artists, and the world in general.
                </p>
              </div>
              
              <div className="pt-4 border-t border-gray-200 space-y-4">
                <p className="text-sm leading-relaxed">
                  If you choose to create with Reigh and participate in our Open Creative Partner Programme, you'll be honouring the age-old truth in the sentiment expressed by Picasso:
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
        <div className={`fixed top-0 left-0 h-full w-5/6 max-w-[30rem] sm:w-[30rem] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          showPhilosophy ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <div className="p-4 sm:p-8 h-full overflow-y-auto">
            {/* Close Button */}
            <button
              onClick={() => {
                setIsPhilosophyPaneClosing(true);
                setTimeout(() => setIsPhilosophyPaneClosing(false), 300);
                setShowPhilosophy(false);
                setIsPhilosophyButtonAnimating(false);
              }}
              className="absolute top-2 right-2 sm:top-4 sm:right-4 p-2 sm:p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors duration-200 z-10"
            >
              <X className="w-5 h-5 sm:w-4 sm:h-4 text-gray-600" />
            </button>
            
            <div className="mb-6 pr-12 sm:pr-0">
              <h2 className="font-playfair text-2xl sm:text-3xl font-bold text-primary mb-4">Our Philosophy</h2>
              <div className="w-16 h-1 bg-gradient-to-r from-wes-vintage-gold to-wes-mint rounded-full mb-6"></div>
            </div>
            
            <div className="space-y-6 text-muted-foreground">
              <p className="text-sm leading-relaxed">
                Everyday on Twitter, you'll see people gushing over the latest model or capability. While new capabilities are objectively amazing, I believe two things:
              </p>
              
              <div className="bg-gray-50 p-4 rounded-lg border-l-4 border-wes-vintage-gold">
                <ol className="space-y-3 text-sm">
                  <li className="flex items-start space-x-3">
                    <span className="font-semibold text-wes-vintage-gold">1)</span>
                    <span>The most important aspect for artistic creation isn't how high resolution a generation is or how long a video you can produce from a single prompt - but that you have enough control over the output that it feels like it was made <strong className="text-primary"><em>by you</em></strong>, <strong className="text-primary">not</strong> <strong className="text-primary"><em>for you</em></strong>.</span>
                  </li>
                  <li className="flex items-start space-x-3">
                    <span className="font-semibold text-wes-vintage-gold">2)</span>
                    <span><strong className="text-primary">AI video is a new medium</strong> - and, as such, while attempts to merely use it to replicate other mediums are understandable and will be widespread, they also capture very little of its potential.</span>
                  </li>
                </ol>
              </div>
              
                             <p className="text-sm leading-relaxed">
                 These two beliefs are why I built Reigh.
               </p>
              
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-primary text-lg mb-3">Reigh is a tool for travelling between images</h3>
                  <p className="text-sm leading-relaxed mb-3">
                    Reigh focuses exclusively on the art that we have yet to unlock in travelling between images using AI.
                  </p>
                  <p className="text-sm leading-relaxed">
                    While focusing on a single technique may seem limited, Reigh is founded on the belief that:
                  </p>
                  <div className="mt-3 space-y-3 pl-4">
                    <div className="flex items-start space-x-2">
                      <span className="text-wes-vintage-gold font-medium">(i)</span>
                                             <p className="text-sm leading-relaxed">
                         This approach <strong className="text-primary">offers a huge amount of control and flexibility</strong>: not only can you place image anchor points wherever you wish to control how the video looks at different points, but you can also use LoRAs and structural control to guide how it moves. Thanks to developments in image generation and image editing, you can also generate guidance images to drive the video with increased precision.
                       </p>
                    </div>
                    <div className="flex items-start space-x-2">
                      <span className="text-wes-vintage-gold font-medium">(ii)</span>
                                             <p className="text-sm leading-relaxed">
                         Because using images to drive generations is <strong className="text-primary">unbounded by what makes logical sense or what can even be prompted</strong> from its training material, it nudges people towards exploring entirely new ways to use AI video - not just replicating existing mediums.
                       </p>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-semibold text-primary text-lg mb-3">Exploring this new artform properly requires a focused tool and community</h3>
                  <p className="text-sm leading-relaxed mb-3">
                    We believe that by just focusing on this, we can build a tool that unlocks the artistic potential of this approach.
                  </p>
                  <p className="text-sm leading-relaxed mb-3">
                    If the community who uses this also gathers and shares their learnings and techniques, we can also accelerate our collective artistic development.
                  </p>
                  <p className="text-sm leading-relaxed mb-3">
                    This is why we build Reigh, alongside a Discord community that's deeply embedded with the tool.
                  </p>
                  <p className="text-sm leading-relaxed">
                    As we've seen from Deforum and Warpfusion, a community empowered by a great tool can discover and invent an entirely new artform.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-primary text-lg mb-3">Reigh is free to use but you can pay for convenience</h3>
                  <p className="text-sm leading-relaxed mb-3">
                    Reigh is free to use - you can run the AI processing on your computer, while those who wish to avoid the complication of local usage, can use it in the cloud for very cheap.
                  </p>
                  <p className="text-sm leading-relaxed">
                    We want to make it as accessible as possible, in order to unlock the potential of this artform.
                  </p>
                </div>
                
                <div className="pt-4 border-t border-gray-200">
                  <h3 className="font-semibold text-primary text-lg mb-3">We hope that you join us, and use it to discover an approach and artistic technique that is truly your own</h3>
                  <p className="text-sm leading-relaxed mb-3">
                    There are endless potential aesthetic and motion styles.
                  </p>
                  <p className="text-sm leading-relaxed mb-4">
                    By struggling to figure out your own approach, and helping us make the tool as good as it can be, you can discover an approach that is truly your own.
                  </p>
                  <p className="text-sm leading-relaxed mb-4 font-medium">
                    I hope that you'll join us.
                  </p>
                  
                  <p className="text-left mb-6 font-serif text-lg italic transform -rotate-1" style={{ fontFamily: 'cursive' }}>
                    POM
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>


    </PageFadeIn>
  );
} 