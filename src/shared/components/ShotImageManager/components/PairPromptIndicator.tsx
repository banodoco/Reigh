import React from 'react';
import { MessageSquare, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';

interface PairPromptIndicatorProps {
  pairIndex: number;
  frames: number;
  startFrame: number;
  endFrame: number;
  onPairClick: () => void;
  pairPrompt?: string;
  pairNegativePrompt?: string;
  enhancedPrompt?: string;
  defaultPrompt?: string;
  defaultNegativePrompt?: string;
  className?: string;
  isMobile?: boolean;
  onClearEnhancedPrompt?: (pairIndex: number) => void;
}

/**
 * PairPromptIndicator - Shows a visual indicator between consecutive images in batch/mobile views
 * Displays pair information and can be clicked to open the PairPromptModal
 */
export const PairPromptIndicator: React.FC<PairPromptIndicatorProps> = ({
  pairIndex,
  frames,
  startFrame,
  endFrame,
  onPairClick,
  pairPrompt,
  pairNegativePrompt,
  enhancedPrompt,
  defaultPrompt,
  defaultNegativePrompt,
  className,
  isMobile = false,
  onClearEnhancedPrompt,
}) => {
  console.log('[PairIndicatorDebug] PairPromptIndicator render:', {
    pairIndex,
    frames,
    startFrame,
    endFrame,
    hasPairPrompt: !!pairPrompt,
    hasPairNegativePrompt: !!pairNegativePrompt,
    hasEnhancedPrompt: !!enhancedPrompt,
    pairPrompt: pairPrompt?.substring(0, 30),
    pairNegativePrompt: pairNegativePrompt?.substring(0, 30),
    isMobile,
  });

  // Color schemes matching timeline PairRegion
  const pairColorSchemes = [
    { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700' },
    { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-700' },
    { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-700' },
    { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700' },
    { bg: 'bg-rose-50', border: 'border-rose-300', text: 'text-rose-700' },
    { bg: 'bg-teal-50', border: 'border-teal-300', text: 'text-teal-700' },
  ];
  const colorScheme = pairColorSchemes[pairIndex % pairColorSchemes.length];

  // Check if there's a custom prompt OR enhanced prompt for this pair
  const hasCustomPrompt = (pairPrompt && pairPrompt.trim()) || (pairNegativePrompt && pairNegativePrompt.trim()) || (enhancedPrompt && enhancedPrompt.trim());

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPairClick();
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all duration-200",
              "shadow-sm hover:shadow-md hover:scale-105",
              "bg-white/90 hover:bg-white",
              colorScheme.border,
              colorScheme.text,
              "text-xs font-light cursor-pointer"
            )}
          >
            <span className="whitespace-nowrap">
              Pair {pairIndex + 1}
            </span>
            {!isMobile && (
              <MessageSquare 
                className={cn(
                  "h-3 w-3",
                  hasCustomPrompt ? colorScheme.text : 'text-gray-400',
                  hasCustomPrompt ? 'opacity-100' : 'opacity-60'
                )}
              />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <div 
            className="max-w-xs cursor-pointer hover:bg-accent/50 p-2 -m-2 rounded transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onPairClick();
            }}
          >
            <div className="space-y-2">
              <div>
                <span className="font-medium">Prompt:</span>
                <p className="text-sm">
                  {pairPrompt && pairPrompt.trim() ? pairPrompt.trim() : '[default]'}
                </p>
              </div>
              <div>
                <span className="font-medium">Negative:</span>
                <p className="text-sm">
                  {pairNegativePrompt && pairNegativePrompt.trim() ? pairNegativePrompt.trim() : '[default]'}
                </p>
              </div>
              {enhancedPrompt && enhancedPrompt.trim() && (
                <div className="pt-1 border-t border-border/50">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">Enhanced Prompt:</span>
                    {onClearEnhancedPrompt && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          console.log('[PairPromptIndicator] ❌ X button clicked!', { pairIndex, hasHandler: !!onClearEnhancedPrompt });
                          e.stopPropagation();
                          e.preventDefault();
                          onClearEnhancedPrompt(pairIndex);
                        }}
                        className="h-5 w-5 p-0 hover:bg-destructive/10 hover:text-destructive"
                        title="Clear enhanced prompt"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <p className="text-sm">
                    {enhancedPrompt.trim()}
                  </p>
                </div>
              )}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};

