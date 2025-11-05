import { useState, useCallback, useMemo, useEffect } from 'react';
import { GenerationRow } from '@/types/shots';
import { DerivedNavContext } from '../types';

interface UseLightboxProps {
  images: GenerationRow[];
  externalGenerations: GenerationRow[];
  tempDerivedGenerations: GenerationRow[];
  derivedNavContext: DerivedNavContext | null;
  handleOpenExternalGeneration: (generationId: string, derivedContext?: string[]) => Promise<void>;
}

export function useLightbox({
  images,
  externalGenerations,
  tempDerivedGenerations,
  derivedNavContext,
  handleOpenExternalGeneration
}: UseLightboxProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [shouldAutoEnterInpaint, setShouldAutoEnterInpaint] = useState(false);
  
  // Combine all images for lightbox navigation
  const currentImages = useMemo(() => {
    const baseImages = (images && images.length > 0) ? images : [];
    return [...baseImages, ...externalGenerations, ...tempDerivedGenerations];
  }, [images, externalGenerations, tempDerivedGenerations]);
  
  // Get current lightbox image
  const currentLightboxImage = lightboxIndex !== null ? currentImages[lightboxIndex] : null;
  
  // Close lightbox if current image no longer exists (e.g., deleted)
  useEffect(() => {
    ,
        derivedCount: derivedNavContext.derivedGenerationIds.length
      } : null
    });
    
    if (lightboxIndex !== null && lightboxIndex >= currentImages.length) {
      .stack
      });
      setLightboxIndex(null);
      setShouldAutoEnterInpaint(false);
    } else if (lightboxIndex !== null) {
      }
  }, [lightboxIndex, currentImages.length, images.length, externalGenerations.length, tempDerivedGenerations.length, derivedNavContext]);
  
  // Handle next navigation
  const handleNext = useCallback(() => {
    if (lightboxIndex === null) return;
    
    if (derivedNavContext) {
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
      if (lightboxIndex < currentImages.length - 1) {
        setLightboxIndex(lightboxIndex + 1);
      }
    }
  }, [lightboxIndex, currentImages, derivedNavContext, handleOpenExternalGeneration]);
  
  // Handle previous navigation
  const handlePrevious = useCallback(() => {
    if (lightboxIndex === null) return;
    
    if (derivedNavContext) {
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
      if (lightboxIndex > 0) {
        setLightboxIndex(lightboxIndex - 1);
      }
    }
  }, [lightboxIndex, currentImages, derivedNavContext, handleOpenExternalGeneration]);
  
  return {
    lightboxIndex,
    setLightboxIndex,
    shouldAutoEnterInpaint,
    setShouldAutoEnterInpaint,
    currentImages,
    currentLightboxImage,
    handleNext,
    handlePrevious
  };
}

