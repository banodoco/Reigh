import { useCallback, useMemo } from 'react';
import { GenerationRow } from '@/types/shots';
import { DerivedNavContext } from '@/shared/components/ShotImageManager/types';

interface UseDerivedNavigationProps {
  derivedNavContext: DerivedNavContext | null;
  lightboxIndex: number | null;
  currentImages: GenerationRow[];
  handleOpenExternalGeneration: (generationId: string, derivedContext?: string[]) => Promise<void>;
  goNext: () => void;
  goPrev: () => void;
  logPrefix?: string;
}

/**
 * Hook to add derived navigation mode support to any lightbox navigation
 * 
 * When derivedNavContext is set (user clicked "Based on this" thumbnail),
 * navigation will only cycle through those specific derived generations
 * instead of all images in the view. Also calculates hasNext/hasPrevious
 * correctly based on the context mode.
 * 
 * @example
 * const { wrappedGoNext, wrappedGoPrev, hasNext, hasPrevious } = useDerivedNavigation({
 *   derivedNavContext: externalGens.derivedNavContext,
 *   lightboxIndex,
 *   currentImages,
 *   handleOpenExternalGeneration: externalGens.handleOpenExternalGeneration,
 *   goNext: originalGoNext,
 *   goPrev: originalGoPrev,
 *   logPrefix: '[Timeline:DerivedNav]'
 * });
 */
export function useDerivedNavigation({
  derivedNavContext,
  lightboxIndex,
  currentImages,
  handleOpenExternalGeneration,
  goNext,
  goPrev,
  logPrefix = '[DerivedNav]'
}: UseDerivedNavigationProps) {
  
  const wrappedGoNext = useCallback(() => {
    if (derivedNavContext && lightboxIndex !== null) {
      const currentId = currentImages[lightboxIndex]?.id;
      const currentDerivedIndex = derivedNavContext.derivedGenerationIds.indexOf(currentId);
      
      ,
        currentDerivedIndex,
        totalDerived: derivedNavContext.derivedGenerationIds.length
      });
      
      if (currentDerivedIndex !== -1 && currentDerivedIndex < derivedNavContext.derivedGenerationIds.length - 1) {
        const nextId = derivedNavContext.derivedGenerationIds[currentDerivedIndex + 1];
        });
        handleOpenExternalGeneration(nextId, derivedNavContext.derivedGenerationIds);
      }
    } else {
      goNext();
    }
  }, [derivedNavContext, lightboxIndex, currentImages, handleOpenExternalGeneration, goNext, logPrefix]);
  
  const wrappedGoPrev = useCallback(() => {
    if (derivedNavContext && lightboxIndex !== null) {
      const currentId = currentImages[lightboxIndex]?.id;
      const currentDerivedIndex = derivedNavContext.derivedGenerationIds.indexOf(currentId);
      
      ,
        currentDerivedIndex,
        totalDerived: derivedNavContext.derivedGenerationIds.length
      });
      
      if (currentDerivedIndex !== -1 && currentDerivedIndex > 0) {
        const prevId = derivedNavContext.derivedGenerationIds[currentDerivedIndex - 1];
        });
        handleOpenExternalGeneration(prevId, derivedNavContext.derivedGenerationIds);
      }
    } else {
      goPrev();
    }
  }, [derivedNavContext, lightboxIndex, currentImages, handleOpenExternalGeneration, goPrev, logPrefix]);
  
  // Calculate hasNext/hasPrevious based on whether we're in derived navigation mode
  const { hasNext, hasPrevious } = useMemo(() => {
    if (lightboxIndex === null) {
      return { hasNext: false, hasPrevious: false };
    }
    
    if (derivedNavContext) {
      // In derived navigation mode, check against derived generation IDs
      const currentId = currentImages[lightboxIndex]?.id;
      const currentDerivedIndex = derivedNavContext.derivedGenerationIds.indexOf(currentId);
      
      return {
        hasNext: currentDerivedIndex !== -1 && currentDerivedIndex < derivedNavContext.derivedGenerationIds.length - 1,
        hasPrevious: currentDerivedIndex !== -1 && currentDerivedIndex > 0
      };
    } else {
      // Normal mode, check against all current images
      return {
        hasNext: lightboxIndex < currentImages.length - 1,
        hasPrevious: lightboxIndex > 0
      };
    }
  }, [derivedNavContext, lightboxIndex, currentImages]);
  
  return {
    wrappedGoNext,
    wrappedGoPrev,
    hasNext,
    hasPrevious
  };
}

