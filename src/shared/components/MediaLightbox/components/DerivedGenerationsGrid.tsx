import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { GenerationRow } from '@/types/shots';

export interface DerivedGenerationsGridProps {
  derivedGenerations: GenerationRow[];
  paginatedDerived: GenerationRow[];
  derivedPage: number;
  derivedTotalPages: number;
  onSetDerivedPage: (page: number | ((prev: number) => number)) => void;
  onNavigate: (derivedId: string, derivedContext: string[]) => Promise<void>;
  currentMediaId: string;
  variant?: 'desktop' | 'mobile';
  title?: string;
}

/**
 * DerivedGenerationsGrid Component
 * Displays a paginated grid of generations derived from the current media
 */
export const DerivedGenerationsGrid: React.FC<DerivedGenerationsGridProps> = ({
  derivedGenerations,
  paginatedDerived,
  derivedPage,
  derivedTotalPages,
  onSetDerivedPage,
  onNavigate,
  currentMediaId,
  variant = 'desktop',
  title,
}) => {
  const isMobile = variant === 'mobile';
  const gridCols = 'grid-cols-3';
  const gap = isMobile ? 'gap-1.5' : 'gap-2';
  const starSize = isMobile ? 'h-2.5 w-2.5' : 'h-3 w-3';
  const starPosition = isMobile ? 'top-0.5 right-0.5' : 'top-1 right-1';
  const buttonSize = isMobile ? 'h-6 w-6' : 'h-7 w-7';
  const iconSize = isMobile ? 'h-3 w-3' : 'h-4 w-4';
  const textSize = isMobile ? 'text-sm' : 'text-lg';

  return (
    <div className="border-t border-border pt-4 mt-4">
      <div className={`mb-${isMobile ? '2' : '3'} flex items-${isMobile ? 'center' : 'start'} justify-between`}>
        <div>
          <h3 className={`${textSize} font-${isMobile ? 'medium' : 'light'}`}>
            {title || `Edits of this image (${derivedGenerations.length})`}
          </h3>
        </div>
        
        {/* Pagination controls */}
        {derivedTotalPages > 1 && (
          <div className={`flex items-center gap-${isMobile ? '1' : '2'}`}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSetDerivedPage(p => Math.max(1, p - 1))}
              disabled={derivedPage === 1}
              className={`${buttonSize} p-0`}
            >
              <ChevronLeft className={iconSize} />
            </Button>
            <span className="text-xs text-muted-foreground">
              {derivedPage}{isMobile ? '/' : ' / '}{derivedTotalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSetDerivedPage(p => Math.min(derivedTotalPages, p + 1))}
              disabled={derivedPage === derivedTotalPages}
              className={`${buttonSize} p-0`}
            >
              <ChevronRight className={iconSize} />
            </Button>
          </div>
        )}
      </div>
      
      <div className={`grid ${gridCols} ${gap}`}>
        {paginatedDerived.map((derived) => (
          <div
            key={derived.id}
            className="relative aspect-square group overflow-hidden rounded border border-border hover:border-primary transition-colors cursor-pointer"
            onClick={async () => {
              console.log('[DerivedNav] 🖼️ Thumbnail clicked', {
                derivedId: derived.id.substring(0, 8),
                currentMediaId: currentMediaId.substring(0, 8),
                timestamp: Date.now()
              });
              
              await onNavigate(
                derived.id,
                derivedGenerations?.map(d => d.id) || []
              );
            }}
          >
            <img
              src={derived.thumbUrl}
              alt="Derived generation"
              className="w-full h-full object-contain bg-black/20"
            />
            
            {/* Simple hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors pointer-events-none" />
            
            {derived.starred && (
              <div className={`absolute ${starPosition} z-10 pointer-events-none`}>
                <Star className={`${starSize} fill-yellow-500 text-yellow-500`} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

