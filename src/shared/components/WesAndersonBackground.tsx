import React from 'react';

export const WesAndersonBackground: React.FC = () => {
  return (
    <>
      {/* Animated Background - Base Layer */}
      <div className="absolute inset-0 bg-gradient-to-br from-wes-cream via-white to-wes-mint/20 opacity-60 animate-gradient-shift"></div>
      
      {/* Secondary Dynamic Gradient - Subtle Color Breathing */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-wes-mint/15 opacity-50 animate-gradient-breathe"></div>
      
      {/* Tertiary Gentle Movement Layer */}
      <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-wes-lavender/8 opacity-40 animate-gradient-drift"></div>
      
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
    </>
  );
}; 