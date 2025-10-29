import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { GenerationRow } from '@/types/shots';
import { formatDistanceToNow } from 'date-fns';

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
            
            {/* Timestamp - top left */}
            {derived.createdAt && (
              <div className={`absolute ${isMobile ? 'top-0.5 left-0.5' : 'top-1 left-1'} z-10 pointer-events-none`}>
                <span className={`${isMobile ? 'text-[9px] px-1 py-0.5' : 'text-[10px] px-1.5 py-0.5'} bg-black/70 text-white rounded`}>
                  {formatDistanceToNow(new Date(derived.createdAt), { addSuffix: true })
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

