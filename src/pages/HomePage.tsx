import React, { useState, useEffect } from 'react';
import { ArrowRight, Sparkles, Image as ImageIcon, Video, UserPlus, Users, FileText, ChevronDown, ChevronUp, GitBranch } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/shared/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';

export default function HomePage() {
  const [isHovered, setIsHovered] = useState(false);
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [showCreativePartner, setShowCreativePartner] = useState(false);
  const [showPhilosophy, setShowPhilosophy] = useState(false);
  const navigate = useNavigate();

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
      navigate('/shots');
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

  const ImageTravelAnimation = () => {
    return (
      <div 
        className="flex items-center justify-center mb-12 cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="relative flex items-center space-x-2">
          {/* Single morphing rectangle */}
          <div 
            className={`w-20 h-12 rounded-lg border-2 shadow-lg transition-all duration-500 ease-in-out ${
              isHovered 
                ? 'bg-gradient-to-r from-wes-vintage-gold via-wes-coral to-wes-sage border-white/50 scale-110' 
                : 'bg-wes-vintage-gold border-wes-vintage-gold/30 scale-100'
            }`}
          >
            <div className="absolute inset-2 bg-white/20 rounded-md"></div>
          </div>
        </div>


      </div>
    );
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
    <div className="min-h-screen wes-texture relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 bg-gradient-to-br from-wes-cream via-white to-wes-mint/20 opacity-60"></div>
      <div className="absolute inset-0 wes-chevron-pattern opacity-30"></div>
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-wes-vintage-gold via-wes-coral to-wes-mint"></div>
      
      {/* Floating ornamental elements */}
      <div className="absolute top-20 left-10 w-32 h-32 bg-wes-pink/10 rounded-full blur-3xl animate-parallax-float"></div>
      <div className="absolute top-40 right-20 w-24 h-24 bg-wes-yellow/15 rounded-full blur-2xl animate-parallax-float" style={{ animationDelay: '2s' }}></div>
      <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-wes-lavender/10 rounded-full blur-3xl animate-parallax-float" style={{ animationDelay: '4s' }}></div>
      
      {/* Top Navigation Links */}
      <div className="fixed top-12 left-12 z-20 flex items-center space-x-6">
        {/* Philosophy Link */}
        <button
          onClick={() => setShowPhilosophy(true)}
          className="group flex items-center space-x-2 px-4 py-2 bg-white/80 backdrop-blur-sm rounded-full border-2 border-wes-vintage-gold/20 hover:border-wes-vintage-gold/40 transition-all duration-300 hover:shadow-wes-ornate"
        >
          <FileText className="w-4 h-4 text-wes-vintage-gold" />
          <span className="font-inter text-sm font-medium text-primary group-hover:text-primary/80">Philosophy</span>
        </button>
      </div>
        
      <div className="fixed top-12 right-12 z-20 flex items-center">
        {/* Creative Partner Programme */}
        <button
          onClick={() => setShowCreativePartner(true)}
          className="group flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-wes-coral/90 to-wes-pink/90 backdrop-blur-sm rounded-full border-2 border-wes-coral/30 hover:border-wes-coral/50 transition-all duration-300 hover:shadow-wes-ornate text-white hover:from-wes-coral hover:to-wes-pink"
        >
          <Users className="w-4 h-4 group-hover:scale-110 transition-transform" />
          <span className="font-inter text-sm font-medium">Open Creative Partner Programme</span>
        </button>
      </div>

      <div className="container mx-auto px-4 relative z-10 min-h-screen flex items-center justify-center">
        {/* Hero Section */}
        <div className="text-center w-full">
          <div className="max-w-4xl mx-auto">
            {/* Image Travel Animation */}
            <div className="mb-8">
              <ImageTravelAnimation />
            </div>

            {/* Main title */}
            <h1 className="font-playfair text-6xl md:text-8xl font-bold text-primary mb-8 text-shadow-vintage">
              Reigh
            </h1>
            
            {/* Decorative divider */}
            <div className="w-32 h-1.5 bg-gradient-to-r from-wes-pink to-wes-vintage-gold rounded-full mx-auto mb-8 shadow-inner-vintage"></div>
            
            {/* Subtitle */}
            <p className="font-inter text-xl md:text-2xl text-muted-foreground leading-relaxed tracking-wide mb-8">
              A tool for the found art of travelling between images
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
                  <TooltipContent>
                    <p>Reigh is an open tool — <a href="https://github.com/peteromalley/reigh" className="underline text-wes-vintage-gold hover:text-wes-coral transition-colors">view on GitHub</a></p>
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

        {/* Pop-ups */}
        <Dialog open={showCreativePartner} onOpenChange={setShowCreativePartner}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Creative Partner Programme</DialogTitle>
              <DialogDescription>
                Coming soon — join our wait-list to collaborate on experimental visual journeys.
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>

        <Dialog open={showPhilosophy} onOpenChange={setShowPhilosophy}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Our Philosophy</DialogTitle>
              <DialogDescription>
                Reigh celebrates the "found art of travelling between images": embracing randomness, transformation, and narrative to kindle creativity.
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      </div>


    </div>
  );
} 