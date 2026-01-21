import React from 'react';
import { MessageSquare, X, Clapperboard, Palette, Settings2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';
import type { PhaseConfig } from '@/tools/travel-between-images/settings';
import type { PairLoraConfig, PairMotionSettings } from '@/types/shots';

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
  // NEW: Per-pair parameter override indicators
  pairPhaseConfig?: PhaseConfig;
  pairLoras?: PairLoraConfig[];
  pairMotionSettings?: PairMotionSettings;
}

/**
 * PairPromptIndicator - Shows a visual indicator between consecutive images in batch/mobile views
 * Displays pair information and can be clicked to open the SegmentSettingsModal
 */
const PairPromptIndicatorComponent: React.FC<PairPromptIndicatorProps> = ({
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
  // NEW: Per-pair parameter override indicators
  pairPhaseConfig,
  pairLoras,
  pairMotionSettings,
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
    // NEW: Log override status
    hasMotionOverride: !!pairMotionSettings,
    hasLoraOverride: !!(pairLoras && pairLoras.length > 0),
    hasPhaseConfigOverride: !!pairPhaseConfig,
  });

  // Color schemes matching timeline PairRegion
  const pairColorSchemes = [
    { bg: 'bg-blue-50 dark:bg-blue-950/40', border: 'border-blue-300 dark:border-blue-700', text: 'text-blue-700 dark:text-gray-300' },
    { bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-300 dark:border-emerald-700', text: 'text-emerald-700 dark:text-gray-300' },
    { bg: 'bg-purple-50 dark:bg-purple-950/40', border: 'border-purple-300 dark:border-purple-700', text: 'text-purple-700 dark:text-gray-300' },
    { bg: 'bg-orange-50 dark:bg-orange-950/40', border: 'border-orange-300 dark:border-orange-700', text: 'text-orange-700 dark:text-gray-300' },
    { bg: 'bg-rose-50 dark:bg-rose-950/40', border: 'border-rose-300 dark:border-rose-700', text: 'text-rose-700 dark:text-gray-300' },
    { bg: 'bg-teal-50 dark:bg-teal-950/40', border: 'border-teal-300 dark:border-teal-700', text: 'text-teal-700 dark:text-gray-300' },
  ];
  const colorScheme = pairColorSchemes[pairIndex % pairColorSchemes.length];

  // Check if there's a custom prompt OR enhanced prompt for this pair
  const hasCustomPrompt = (pairPrompt && pairPrompt.trim()) || (pairNegativePrompt && pairNegativePrompt.trim()) || (enhancedPrompt && enhancedPrompt.trim());

  // NEW: Check for per-pair parameter overrides
  const hasMotionOverride = !!pairMotionSettings;
  const hasLoraOverride = !!(pairLoras && pairLoras.length > 0);
  const hasAdvancedOverride = !!pairPhaseConfig;

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
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all duration-200",
              "shadow-sm hover:shadow-md hover:scale-105",
              "bg-card/90 dark:bg-gray-800/90 hover:bg-card dark:hover:bg-gray-800",
              colorScheme.border,
              colorScheme.text,
              "text-[11px] font-light cursor-pointer"
            )}
          >
            <span className="whitespace-nowrap">
              Pair {pairIndex + 1}
            </span>
            {!isMobile && (
              <div className="flex items-center gap-0.5">
                <MessageSquare
                  className={cn(
                    "h-2.5 w-2.5",
                    hasCustomPrompt ? 'opacity-100' : 'text-gray-400 dark:text-gray-500 opacity-60'
                  )}
                />
                {/* NEW: Override indicator icons */}
                {hasMotionOverride && (
                  <Clapperboard
                    className="h-2.5 w-2.5 text-amber-500 dark:text-amber-400"
                    title="Motion override"
                  />
                )}
                {hasLoraOverride && (
                  <Palette
                    className="h-2.5 w-2.5 text-violet-500 dark:text-violet-400"
                    title="LoRA override"
                  />
                )}
                {hasAdvancedOverride && (
                  <Settings2
                    className="h-2.5 w-2.5 text-cyan-500 dark:text-cyan-400"
                    title="Advanced override"
                  />
                )}
              </div>
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

// Memoize to prevent re-renders when only callbacks change (which are inline in parent)
export const PairPromptIndicator = React.memo(
  PairPromptIndicatorComponent,
  (prevProps, nextProps) => {
    // Only compare value props, not callbacks (which are unstable inline functions)
    // For override objects/arrays, use truthiness check (re-render if presence changes)
    return (
      prevProps.pairIndex === nextProps.pairIndex &&
      prevProps.frames === nextProps.frames &&
      prevProps.startFrame === nextProps.startFrame &&
      prevProps.endFrame === nextProps.endFrame &&
      prevProps.pairPrompt === nextProps.pairPrompt &&
      prevProps.pairNegativePrompt === nextProps.pairNegativePrompt &&
      prevProps.enhancedPrompt === nextProps.enhancedPrompt &&
      prevProps.defaultPrompt === nextProps.defaultPrompt &&
      prevProps.defaultNegativePrompt === nextProps.defaultNegativePrompt &&
      prevProps.isMobile === nextProps.isMobile &&
      prevProps.className === nextProps.className &&
      // NEW: Check override presence (truthiness comparison is sufficient for icons)
      !!prevProps.pairPhaseConfig === !!nextProps.pairPhaseConfig &&
      !!(prevProps.pairLoras?.length) === !!(nextProps.pairLoras?.length) &&
      !!prevProps.pairMotionSettings === !!nextProps.pairMotionSettings
    );
  }
);

