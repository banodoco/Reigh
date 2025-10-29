import React from 'react';
import { GenerationRow } from '@/types/shots';
import { formatDistanceToNow } from 'date-fns';
import { Star } from 'lucide-react';

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
        
        {/* Timestamp - top left */}
        {sourceGeneration.createdAt && (
          <div className="absolute top-0.5 left-0.5 z-10 pointer-events-none">
            <span className="text-[8px] px-0.5 py-0.5 bg-black/70 text-white rounded">
              {formatDistanceToNow(new Date(sourceGeneration.createdAt), { addSuffix: true })
                .replace('about ', '')
                .replace(' minutes', 'm')
                .replace(' minute', 'm')
                .replace(' hours', 'h')
                .replace(' hour', 'h')
                .replace(' days', 'd')
                .replace(' day', 'd')
                .replace(' months', 'mo')
                .replace(' month', 'mo')
                .replace(' ago', '')
                .replace('less than a ', '<1')
              }
            </span>
          </div>
        )}
        
        {/* Star - top right */}
        {sourceGeneration.starred && (
          <div className="absolute top-0.5 right-0.5 z-10 pointer-events-none">
            <Star className="h-2 w-2 fill-yellow-500 text-yellow-500" />
          </div>
        )}
      </div>
      <span className="group-hover:underline">Click to view</span>
    </button>
  );
};

export default SourceGenerationDisplay;

