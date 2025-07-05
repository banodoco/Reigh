import React, { useState, useEffect } from 'react';
import { ArrowRight, Sparkles, Image as ImageIcon, Video, UserPlus, Users, FileText, ChevronDown, ChevronUp, GitBranch, X, HandHeart, Brain } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { useNavigate, useLocation } from 'react-router-dom';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { toast } from '@/shared/components/ui/use-toast';
import { PageFadeIn } from '@/shared/components/transitions';

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
    // Redirect signed-in users straight to the app
    if (session) {
      navigate('/tools');
    }
    return () => {
      listener.subscription.unsubscribe();
    };
  }, [navigate, session]);

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

  return (
    <PageFadeIn className="min-h-screen wes-texture relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 bg-gradient-to-br from-wes-cream via-white to-wes-mint/20 opacity-60"></div>
      <div className="absolute inset-0 wes-chevron-pattern opacity-30"></div>
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-wes-vintage-gold via-wes-coral to-wes-mint"></div>
      
      {/* Floating ornamental elements */}
      <div className="absolute top-20 left-10 w-32 h-32 bg-wes-pink/10 rounded-full blur-3xl animate-parallax-float"></div>
      <div className="absolute top-40 right-20 w-24 h-24 bg-wes-yellow/15 rounded-full blur-2xl animate-parallax-float" style={{ animationDelay: '2s' }}></div>
      <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-wes-lavender/10 rounded-full blur-3xl animate-parallax-float" style={{ animationDelay: '4s' }}></div>
      
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
            }, 150);
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
            }, 150);
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
            
            {/* Ornamental elements */}
            <div className="flex justify-center items-center space-x-8 opacity-50">
              <div className="text-3xl text-wes-vintage-gold animate-rotate-slow">❋</div>
              <div className="text-2xl text-wes-coral animate-bounce-gentle">◆</div>
              <div className="text-3xl text-wes-mint animate-sway">✧</div>
        </div>

            {/* Sign-in button below hero */}
            {!session && (
              <button
                onClick={handleDiscordSignIn}
                className="group flex items-center space-x-2 px-6 py-4 bg-gradient-to-r from-wes-vintage-gold to-wes-coral rounded-full border-2 border-wes-vintage-gold/40 hover:border-wes-vintage-gold/60 transition-all duration-300 shadow-wes-vintage hover:shadow-wes-hover text-white text-lg font-medium mx-auto"
              >
                <UserPlus className="w-5 h-5" />
                <span>Sign in with Discord</span>
              </button>
            )}

            {/* Open Source Indicator - Same distance from content as top nav is from top */}
            <div className="mt-12 flex justify-center">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="group relative cursor-pointer">
                      {/* Floating particles */}
                      <div className="absolute -inset-4 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                        <div className="absolute top-0 left-0 w-1 h-1 bg-wes-vintage-gold rounded-full animate-ping" style={{ animationDelay: '0s' }}></div>
                        <div className="absolute top-2 right-1 w-0.5 h-0.5 bg-wes-coral rounded-full animate-ping" style={{ animationDelay: '0.3s' }}></div>
                        <div className="absolute bottom-1 left-2 w-0.5 h-0.5 bg-wes-mint rounded-full animate-ping" style={{ animationDelay: '0.6s' }}></div>
                      </div>
                      
                      {/* Spinning dashed ring */}
                      <div className="absolute -inset-3 rounded-full border-2 border-dashed border-wes-vintage-gold/20 opacity-0 group-hover:opacity-100 group-hover:animate-spin transition-all duration-500"></div>
                      
                      {/* Expanding glow */}
                      <div className="absolute -inset-2 bg-gradient-to-r from-wes-vintage-gold/10 to-wes-coral/10 rounded-full blur-md opacity-0 group-hover:opacity-100 group-hover:scale-150 transition-all duration-500"></div>
                      
                      {/* Main icon container */}
                      <div className="relative bg-white/80 backdrop-blur-sm rounded-full p-3 border-2 border-wes-vintage-gold/20 hover:border-wes-vintage-gold/40 transition-all duration-300 hover:shadow-wes-ornate">
                        <GitBranch className="w-5 h-5 text-wes-vintage-gold group-hover:rotate-12 transition-transform duration-300" />
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-md p-4">
                    <p className="text-sm leading-relaxed">
                      Reigh is an{' '}
                      <a 
                        href="https://github.com/peteromalley/reigh" 
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
                          setIsCreativePartnerButtonAnimating(true);
                          setShowPhilosophy(false);
                          setTimeout(() => {
                            setShowCreativePartner(true);
                            setTimeout(() => setIsCreativePartnerButtonAnimating(false), 300);
                          }, 150);
                        }}
                        className="underline text-wes-vintage-gold hover:text-wes-coral transition-colors font-medium"
                      >
                        for free
                      </button>
                      {' '}on your computer. You can also run it on the cloud for convenience. In addition to a tool, we're also creating{' '}
                      <button 
                        onClick={() => {
                          setIsPhilosophyButtonAnimating(true);
                          setShowCreativePartner(false);
                          setTimeout(() => {
                            setShowPhilosophy(true);
                            setTimeout(() => setIsPhilosophyButtonAnimating(false), 300);
                          }, 150);
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
        <div className={`fixed top-0 right-0 h-full w-4/5 max-w-sm sm:w-96 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
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
              <h2 className="font-playfair text-2xl sm:text-3xl font-bold text-primary mb-4">Creative Partner Programme</h2>
              <div className="w-16 h-1 bg-gradient-to-r from-wes-coral to-wes-pink rounded-full mb-6"></div>
            </div>
            
            <div className="space-y-6 text-muted-foreground">
              <p className="text-lg leading-relaxed">
                Coming soon — join our wait-list to collaborate on experimental visual journeys.
              </p>
              
              <div className="space-y-4">
                <h3 className="font-semibold text-primary text-lg">What to expect:</h3>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start space-x-3">
                    <div className="w-1.5 h-1.5 bg-wes-coral rounded-full mt-2 flex-shrink-0"></div>
                    <span>Early access to experimental features</span>
                  </li>
                  <li className="flex items-start space-x-3">
                    <div className="w-1.5 h-1.5 bg-wes-coral rounded-full mt-2 flex-shrink-0"></div>
                    <span>Collaborative art creation opportunities</span>
                  </li>
                  <li className="flex items-start space-x-3">
                    <div className="w-1.5 h-1.5 bg-wes-coral rounded-full mt-2 flex-shrink-0"></div>
                    <span>Community showcases and exhibitions</span>
                  </li>
                  <li className="flex items-start space-x-3">
                    <div className="w-1.5 h-1.5 bg-wes-coral rounded-full mt-2 flex-shrink-0"></div>
                    <span>Direct feedback channels with the development team</span>
                  </li>
                </ul>
              </div>
              
              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm text-muted-foreground/80">
                  Join our growing community of visual storytellers and help shape the future of image-guided video art.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Philosophy Side Pane */}
        <div className={`fixed top-0 left-0 h-full w-4/5 max-w-sm sm:w-96 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
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
              <p className="text-lg leading-relaxed font-medium text-primary">
                Reigh celebrates the "found art of travelling between images": embracing randomness, transformation, and narrative to kindle creativity.
              </p>
              
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-primary text-lg mb-3">The Journey Between</h3>
                  <p className="text-sm leading-relaxed">
                    Every image contains infinite possibilities. The magic happens not in the destination, but in the journey—the transformation, the unexpected turns, the serendipitous discoveries that emerge when we let go of control.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-primary text-lg mb-3">Embracing Randomness</h3>
                  <p className="text-sm leading-relaxed">
                    We believe that the most compelling art often emerges from the interplay between intention and accident, between what we plan and what we discover. Our tools are designed to be collaborators, not mere instruments.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-primary text-lg mb-3">Visual Storytelling</h3>
                  <p className="text-sm leading-relaxed">
                    Images are not static—they're moments in time that contain entire narratives. By traveling between them, we unlock those stories and create new ones, building bridges between different realities and perspectives.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-primary text-lg mb-3">Community & Creativity</h3>
                  <p className="text-sm leading-relaxed">
                    Art is a conversation. We're building tools that facilitate creative dialogue—between artist and AI, between different artistic visions, and between creators across the globe.
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