import React from 'react';
import { WesAndersonBackground } from './WesAndersonBackground';

interface ReighLoadingProps {
  text?: string;
}

export const ReighLoading: React.FC<ReighLoadingProps> = ({ text }) => {
  return (
    <div className="min-h-screen wes-texture relative overflow-hidden flex items-center justify-center">
      <WesAndersonBackground />
      <div className="text-center relative z-10">
        <div className="w-32 h-1.5 bg-gradient-to-r from-wes-pink to-wes-vintage-gold rounded-full mx-auto shadow-inner-vintage animate-pulse-glow"></div>
        {text && (
          <p className="font-cocogoose text-sm text-muted-foreground mt-6 opacity-70">
            {text}
          </p>
        )}
      </div>
    </div>
  );
}; 