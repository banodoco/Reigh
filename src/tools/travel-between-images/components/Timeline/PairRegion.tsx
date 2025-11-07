import React from "react";
import { MessageSquare, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { Button } from "@/shared/components/ui/button";
import { framesToSeconds } from "./utils/time-utils";

interface PairRegionProps {
  index: number;
  startPercent: number;
  endPercent: number;
  contextStartPercent: number;
  generationStartPercent: number;
  actualFrames: number;
  visibleContextFrames: number;
  isDragging: boolean;
  contextFrames: number;
  numPairs: number;
  startFrame: number;
  endFrame: number;
  onPairClick?: (pairIndex: number, pairData: {
    index: number;
    frames: number;
    startFrame: number;
    endFrame: number;
  }) => void;
  pairPrompt?: string;
  pairNegativePrompt?: string;
  enhancedPrompt?: string;
  defaultPrompt?: string;
  defaultNegativePrompt?: string;
  showLabel: boolean;
  autoCreateIndividualPrompts?: boolean;
  onClearEnhancedPrompt?: (pairIndex: number) => void;
}

const PairRegion: React.FC<PairRegionProps> = ({
  index,
  startPercent,
  endPercent,
  contextStartPercent,
  generationStartPercent,
  actualFrames,
  visibleContextFrames,
  isDragging,
  contextFrames,
  numPairs,
  startFrame,
  endFrame,
  onPairClick,
  pairPrompt,
  pairNegativePrompt,
  enhancedPrompt,
  defaultPrompt,
  defaultNegativePrompt,
  showLabel,
  autoCreateIndividualPrompts,
  onClearEnhancedPrompt,
}) => {
  // TOP-LEVEL DEBUG: What prompts does this pair region receive?
  console.error('[PairRegion] PROMPT DATA - pairIndex:', index);
  console.error('[PairRegion] PROMPT DATA - pairPrompt:', pairPrompt);
  console.error('[PairRegion] PROMPT DATA - pairNegativePrompt:', pairNegativePrompt);
  console.error('[PairRegion] PROMPT DATA - enhancedPrompt:', enhancedPrompt);
  console.error('[PairRegion] PROMPT DATA - defaultPrompt:', defaultPrompt);
  console.error('[PairRegion] PROMPT DATA - defaultNegativePrompt:', defaultNegativePrompt);
  
  const pairColorSchemes = [
    { bg: 'bg-blue-50', border: 'border-blue-300', context: 'bg-blue-200/60', text: 'text-blue-700', line: 'bg-blue-400' },
    { bg: 'bg-emerald-50', border: 'border-emerald-300', context: 'bg-emerald-200/60', text: 'text-emerald-700', line: 'bg-emerald-400' },
    { bg: 'bg-purple-50', border: 'border-purple-300', context: 'bg-purple-200/60', text: 'text-purple-700', line: 'bg-purple-400' },
    { bg: 'bg-orange-50', border: 'border-orange-300', context: 'bg-orange-200/60', text: 'text-orange-700', line: 'bg-orange-400' },
    { bg: 'bg-rose-50', border: 'border-rose-300', context: 'bg-rose-200/60', text: 'text-rose-700', line: 'bg-rose-400' },
    { bg: 'bg-teal-50', border: 'border-teal-300', context: 'bg-teal-200/60', text: 'text-teal-700', line: 'bg-teal-400' },
  ];
  const colorScheme = pairColorSchemes[index % pairColorSchemes.length];

  // Check if there's a custom prompt OR enhanced prompt for this pair
  const hasCustomPrompt = (pairPrompt && pairPrompt.trim()) || (pairNegativePrompt && pairNegativePrompt.trim()) || (enhancedPrompt && enhancedPrompt.trim());

  return (
    <React.Fragment key={`pair-${index}`}>
      {/* Main pair region */}
      <div
        className={`absolute top-0 bottom-0 ${colorScheme.bg} ${colorScheme.border} border-l-2 border-r-2 border-solid pointer-events-none`}
        style={{
          left: `${startPercent}%`,
          width: `${endPercent - startPercent}%`,
          transition: isDragging ? 'none' : 'left 0.2s ease-out, width 0.2s ease-out',
        }}
      />

      {/* Context frames region - COMMENTED OUT */}
      {/* {contextFrames > 0 && visibleContextFrames > 0 && index < numPairs - 1 && (
        <div
          className={`absolute top-0 bottom-0 ${colorScheme.context} border-r border-dashed ${colorScheme.border.replace('border-', 'border-r-').replace('-300', '-400')} pointer-events-none`}
          style={{
            left: `${contextStartPercent}%`,
            width: `${endPercent - contextStartPercent}%`,
            transition: isDragging ? 'none' : 'left 0.2s ease-out, width 0.2s ease-out',
          }}
        >
          <div className={`absolute bottom-2 left-1/2 transform -translate-x-1/2 text-xs font-light ${colorScheme.text} bg-white/80 px-2 py-0.5 rounded`}>
            Context ({visibleContextFrames}f)
          </div>
        </div>
      )} */}

      {/* Connecting lines from pill to timeline items */}
      {/* Left connecting line - from left timeline item to pill */}
      <div
        className={`absolute top-1/2 h-[2px] ${colorScheme.line} pointer-events-none z-5`}
        style={{
          left: `${startPercent}%`,
          width: `${((startPercent + endPercent) / 2) - startPercent}%`,
          transform: 'translateY(-50%)',
          transition: isDragging ? 'none' : 'left 0.2s ease-out, width 0.2s ease-out',
        }}
      />

      {/* Right connecting line - from pill to right timeline item */}
      <div
        className={`absolute top-1/2 h-[2px] ${colorScheme.line} pointer-events-none z-5`}
        style={{
          left: `${(startPercent + endPercent) / 2}%`,
          width: `${endPercent - ((startPercent + endPercent) / 2)}%`,
          transform: 'translateY(-50%)',
          transition: isDragging ? 'none' : 'left 0.2s ease-out, width 0.2s ease-out',
        }}
      />

      {/* Pair label - only show if there's enough space */}
      {showLabel && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`absolute top-1/2 text-sm font-light ${colorScheme.text} bg-white/90 px-3 py-1 rounded-full border ${colorScheme.border} z-20 shadow-sm cursor-pointer hover:bg-white hover:shadow-md transition-all duration-200`}
              style={{
                left: `${(startPercent + endPercent) / 2}%`,
                transform: 'translate(-50%, -50%)',
                transition: isDragging ? 'none' : 'left 0.2s ease-out',
              }}
              onClick={(e) => {
                e.stopPropagation();
                onPairClick?.(index, {
                  index,
                  frames: actualFrames,
                  startFrame: startFrame,
                  endFrame: endFrame,
                });
              }}
            >
              <div className="flex items-center gap-1.5">
                <span className={`whitespace-nowrap ${hasCustomPrompt ? colorScheme.text : ''}`}>Pair {index + 1} • {framesToSeconds(actualFrames)}</span>
                <MessageSquare 
                  className={`h-3 w-3 ${hasCustomPrompt ? colorScheme.text : 'text-gray-400'} ${hasCustomPrompt ? 'opacity-100' : 'opacity-60'}`}
                />
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div 
              className="max-w-xs cursor-pointer hover:bg-accent/50 p-2 -m-2 rounded transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onPairClick?.(index, {
                  index,
                  frames: actualFrames,
                  startFrame: startFrame,
                  endFrame: endFrame,
                });
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
                            e.stopPropagation();
                            onClearEnhancedPrompt(index);
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
      )}

      {/* Generation boundary lines - COMMENTED OUT */}
      {/* <div
        className={`absolute top-0 bottom-0 w-[2px] ${colorScheme.line} pointer-events-none z-5`}
        style={{
          left: `${generationStartPercent}%`,
          transform: 'translateX(-50%)',
          transition: isDragging ? 'none' : 'left 0.2s ease-out',
        }}
      />
      <div
        className={`absolute top-0 bottom-0 w-[2px] ${colorScheme.line} pointer-events-none z-5`}
        style={{
          left: `${endPercent}%`,
          transform: 'translateX(-50%)',
          transition: isDragging ? 'none' : 'left 0.2s ease-out',
        }}
      /> */}
    </React.Fragment>
  );
};

export default PairRegion; 