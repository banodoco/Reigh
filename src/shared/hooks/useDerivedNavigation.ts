import { useCallback } from 'react';
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
 * instead of all images in the view.
 * 
 * @example
 * const { wrappedGoNext, wrappedGoPrev } = useDerivedNavigation({
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
      
      console.log(`${logPrefix} ➡️ Next in derived context`, {
        currentId: currentId?.substring(0, 8),
        currentDerivedIndex,
        totalDerived: derivedNavContext.derivedGenerationIds.length
      });
      
      if (currentDerivedIndex !== -1 && currentDerivedIndex < derivedNavContext.derivedGenerationIds.length - 1) {
        const nextId = derivedNavContext.derivedGenerationIds[currentDerivedIndex + 1];
        console.log(`${logPrefix} 🎯 Navigating to next derived generation`, {
          nextId: nextId.substring(0, 8)
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
      
      console.log(`${logPrefix} ⬅️ Previous in derived context`, {
        currentId: currentId?.substring(0, 8),
        currentDerivedIndex,
        totalDerived: derivedNavContext.derivedGenerationIds.length
      });
      
      if (currentDerivedIndex !== -1 && currentDerivedIndex > 0) {
        const prevId = derivedNavContext.derivedGenerationIds[currentDerivedIndex - 1];
        console.log(`${logPrefix} 🎯 Navigating to previous derived generation`, {
          prevId: prevId.substring(0, 8)
        });
        handleOpenExternalGeneration(prevId, derivedNavContext.derivedGenerationIds);
      }
    } else {
      goPrev();
    }
  }, [derivedNavContext, lightboxIndex, currentImages, handleOpenExternalGeneration, goPrev, logPrefix]);
  
  return {
    wrappedGoNext,
    wrappedGoPrev
  };
}

