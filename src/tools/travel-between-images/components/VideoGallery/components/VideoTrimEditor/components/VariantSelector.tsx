/**
 * VariantSelector Component
 * 
 * Displays a grid of clickable variant thumbnails to switch between variants.
 * Shows which variant is primary and which is currently active.
 * Allows making the current variant primary.
 */

import React, { useState } from 'react';
import { Check, Scissors, Sparkles, Film, Star, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/shared/components/ui/tooltip';
import type { VariantSelectorProps, GenerationVariant } from '../types';

// Get icon for variant type
const getVariantIcon = (variantType: string | null) => {
  switch (variantType) {
    case 'trimmed':
      return Scissors;
    case 'upscaled':
      return Sparkles;
    case 'original':
    default:
      return Film;
  }
};

// Get label for variant type
const getVariantLabel = (variant: GenerationVariant): string => {
  if (variant.variant_type === 'trimmed') {
    const params = variant.params as any;
    if (params?.trimmed_duration) {
      return `Trimmed (${params.trimmed_duration.toFixed(1)}s)`;
    }
    return 'Trimmed';
  }
  if (variant.variant_type === 'upscaled') {
    return 'Upscaled';
  }
  if (variant.variant_type === 'original') {
    return 'Original';
  }
  return variant.variant_type || 'Variant';
};

export const VariantSelector: React.FC<VariantSelectorProps> = ({
  variants,
  activeVariantId,
  onVariantSelect,
  onMakePrimary,
  isLoading = false,
}) => {
  const [isMakingPrimary, setIsMakingPrimary] = useState(false);

  // Don't show if only one variant
  if (!isLoading && variants.length <= 1) {
    return null;
  }

  // Check if current active variant is NOT the primary
  const activeVariant = variants.find(v => v.id === activeVariantId);
  const isViewingNonPrimary = activeVariant && !activeVariant.is_primary;

  const handleMakePrimary = async () => {
    if (!activeVariantId || !onMakePrimary) return;
    setIsMakingPrimary(true);
    try {
      await onMakePrimary(activeVariantId);
    } finally {
      setIsMakingPrimary(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-2 p-2 bg-background/80 backdrop-blur-sm rounded-lg">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="w-16 h-10 rounded" />
        ))}
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col gap-2 p-2 bg-background/90 backdrop-blur-sm rounded-lg border border-border/50 shadow-lg">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Versions:</span>
          {isViewingNonPrimary && onMakePrimary && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleMakePrimary}
              disabled={isMakingPrimary}
              className="h-6 text-xs px-2 gap-1"
            >
              {isMakingPrimary ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Star className="w-3 h-3" />
              )}
              Make primary
            </Button>
          )}
        </div>

        {/* Variants grid - wraps to multiple rows, full width */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(60px,1fr))] gap-2 w-full">
          {variants.map((variant) => {
            const isActive = variant.id === activeVariantId;
            const isPrimary = variant.is_primary;
            const Icon = getVariantIcon(variant.variant_type);
            const label = getVariantLabel(variant);

            return (
              <Tooltip key={variant.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onVariantSelect(variant.id)}
                    className={cn(
                      'relative flex flex-col items-center gap-0.5 p-1.5 rounded transition-all w-full',
                      'hover:bg-muted/80',
                      isActive 
                        ? 'ring-2 ring-primary bg-primary/10' 
                        : 'opacity-70 hover:opacity-100'
                    )}
                  >
                    {/* Thumbnail */}
                    <div className="relative w-full aspect-video rounded overflow-hidden bg-muted">
                      {variant.thumbnail_url ? (
                        <img
                          src={variant.thumbnail_url}
                          alt={label}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}

                      {/* Primary badge */}
                      {isPrimary && (
                        <div className="absolute top-0.5 right-0.5 bg-green-500 rounded-full p-0.5">
                          <Check className="w-2 h-2 text-white" />
                        </div>
                      )}
                    </div>

                    {/* Type icon */}
                    <div className="flex items-center gap-0.5">
                      <Icon className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground truncate max-w-12">
                        {variant.variant_type || 'v'}
                      </span>
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="z-[100001]">
                  <p className="font-medium">{label}</p>
                  {isPrimary && <p className="text-xs text-green-400">Primary version</p>}
                  {isActive && !isPrimary && <p className="text-xs text-muted-foreground">Currently viewing</p>}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
};

export default VariantSelector;

