import React from 'react';
import { DecorativeBackground } from './DecorativeBackground';

interface ReighLoadingProps {
  text?: string;
}

export const ReighLoading: React.FC<ReighLoadingProps> = ({ text }) => {
  return (
    <div className="min-h-screen wes-texture relative overflow-hidden flex items-center justify-center">
      <DecorativeBackground />
      <div className="text-center relative z-10">
        <div className="relative w-32 h-1.5 mx-auto">
          {/* Background track */}
          <div className="absolute inset-0 bg-muted/20 rounded-full"></div>
          {/* Loading bar that fills from left to right */}
          <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-wes-pink to-wes-vintage-gold rounded-full shadow-inner-vintage w-0 animate-[fill-bar_1s_ease-out_forwards]"></div>
        </div>
        {text && (
          <p className="font-cocogoose text-sm text-muted-foreground mt-6 opacity-70">
            {text}
          </p>
        )}
      </div>
    </div>
  );
};

