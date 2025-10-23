import React from 'react';
import { GenerationRow } from '@/types/shots';

interface SourceGenerationDisplayProps {
  sourceGeneration: GenerationRow;
  onNavigate: (generationId: string) => Promise<void>;
  variant?: 'compact' | 'full';
  className?: string;
}

export const SourceGenerationDisplay: React.FC<SourceGenerationDisplayProps> = ({
  sourceGeneration,
  onNavigate,
  variant = 'full',
  className = ''
}) => {
  const handleClick = async () => {
    console.log('[BasedOn] 🖼️ Navigating to source generation', {
      sourceId: sourceGeneration.id.substring(0, 8),
      clearingDerivedContext: true
    });
    // Clear derived context by not passing it - exits derived nav mode
    await onNavigate(sourceGeneration.id);
  };

  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group ${className}`}
    >
      <span>Based on:</span>
      <div className={`relative ${variant === 'compact' ? 'w-8 h-8' : 'w-10 h-10'} rounded border border-border overflow-hidden group-hover:border-primary transition-colors`}>
        <img
          src={(sourceGeneration as any).thumbUrl || sourceGeneration.location}
          alt="Source generation"
          className="w-full h-full object-cover"
        />
      </div>
      <span className="group-hover:underline">Click to view</span>
    </button>
  );
};

export default SourceGenerationDisplay;

