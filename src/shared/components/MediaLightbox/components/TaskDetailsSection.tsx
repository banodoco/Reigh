import React from 'react';
import { Star } from 'lucide-react';
import { GenerationRow } from '@/types/shots';
import { toast } from 'sonner';

export interface TaskDetailsSectionProps {
  sourceGeneration?: GenerationRow;
  derivedGenerations?: GenerationRow[];
  derivedPage: number;
  derivedPerPage: number;
  derivedTotalPages: number;
  paginatedDerived: GenerationRow[];
  onSetDerivedPage: (page: number) => void;
  onNavigateToGeneration?: (generationId: string) => void;
}

/**
 * Task details section component
 * Renders "Based On" and "Derived Generations" sections
 */
export const TaskDetailsSection: React.FC<TaskDetailsSectionProps> = ({
  sourceGeneration,
  derivedGenerations,
  derivedPage,
  derivedPerPage,
  derivedTotalPages,
  paginatedDerived,
  onSetDerivedPage,
  onNavigateToGeneration,
}) => {
  const hasSource = !!sourceGeneration;
  const hasDerived = derivedGenerations && derivedGenerations.length > 0;

  if (!hasSource && !hasDerived) {
    return null;
  }

  return (
    <>
      {/* Based On Section */}
      {hasSource && (
        <div className="border-t border-border p-4">
          <button
            onClick={() => {
              if (onNavigateToGeneration) {
                onNavigateToGeneration(sourceGeneration.id);
              } else {
                toast.info('Navigation requires parent support');
              }
            }}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group"
          >
            <span>Based on:</span>
            <div className="relative w-10 h-10 rounded border border-border overflow-hidden group-hover:border-primary transition-colors">
              <img
                src={sourceGeneration.thumbUrl}
                alt="Source generation"
                className="w-full h-full object-cover"
              />
              {sourceGeneration.starred && (
                <div className="absolute top-1 right-1">
                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                </div>
              )}
            </div>
            <span className="group-hover:underline">Click to view</span>
          </button>
        </div>
      )}

      {/* Derived Generations Section */}
      {hasDerived && (
        <div className="space-y-3 mb-6">
          <div className="border-t border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-light">
                Based on this ({derivedGenerations.length})
              </h3>
              {derivedTotalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSetDerivedPage(Math.max(1, derivedPage - 1))}
                    disabled={derivedPage === 1}
                    className="h-7 w-7 p-0 disabled:opacity-50"
                  >
                    ←
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {derivedPage} / {derivedTotalPages}
                  </span>
                  <button
                    onClick={() => onSetDerivedPage(Math.min(derivedTotalPages, derivedPage + 1))}
                    disabled={derivedPage === derivedTotalPages}
                    className="h-7 w-7 p-0 disabled:opacity-50"
                  >
                    →
                  </button>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              {paginatedDerived.map((derived) => (
                <button
                  key={derived.id}
                  onClick={() => {
                    if (onNavigateToGeneration) {
                      onNavigateToGeneration(derived.id);
                    } else {
                      console.log('[DerivedGeneration] Clicked:', derived.id);
                      toast.info('Navigation requires parent support');
                    }
                  }}
                  className="relative aspect-square group overflow-hidden rounded border border-border hover:border-primary transition-colors"
                >
                  <img
                    src={derived.thumbUrl}
                    alt="Derived generation"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  {derived.starred && (
                    <div className="absolute top-1 right-1">
                      <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

