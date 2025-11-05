import { useState, useMemo } from 'react';
import { GenerationRow } from '@/types/shots';
import { useDerivedGenerations, useSourceGeneration } from '@/shared/hooks/useGenerations';

export interface UseGenerationLineageProps {
  media: GenerationRow;
}

export interface UseGenerationLineageReturn {
  // Derived generations (generations based on this one)
  derivedGenerations: GenerationRow[] | undefined;
  isDerivedLoading: boolean;
  derivedPage: number;
  derivedPerPage: number;
  derivedTotalPages: number;
  paginatedDerived: GenerationRow[];
  setDerivedPage: React.Dispatch<React.SetStateAction<number>>;
  
  // Source generation (this is based on another generation)
  basedOnId: string | null;
  sourceGeneration: GenerationRow | undefined;
  isSourceLoading: boolean;
}

/**
 * Hook for managing generation lineage (based on and derived from)
 * Fetches and paginates related generations
 */
export const useGenerationLineage = ({
  media,
}: UseGenerationLineageProps): UseGenerationLineageReturn => {
  // Fetch derived generations (generations based on this one)
  const { data: derivedGenerations, isLoading: isDerivedLoading } = useDerivedGenerations(media.id);
  const [derivedPage, setDerivedPage] = useState(1);
  const derivedPerPage = 6;
  const derivedTotalPages = derivedGenerations ? Math.ceil(derivedGenerations.length / derivedPerPage) : 0;
  
  const paginatedDerived = useMemo(() => {
    if (!derivedGenerations) {
      return [];
    }
    const start = (derivedPage - 1) * derivedPerPage;
    const paginated = derivedGenerations.slice(start, start + derivedPerPage);
    )
    });
    return paginated;
  }, [derivedGenerations, derivedPage, derivedPerPage]);

  // Fetch source generation if this is based on another generation
  // Check if media.metadata contains based_on field (from generation params)
  const basedOnId = (media as any).based_on || (media.metadata as any)?.based_on || null;
  const { data: sourceGeneration, isLoading: isSourceLoading } = useSourceGeneration(basedOnId);

  return {
    derivedGenerations,
    isDerivedLoading,
    derivedPage,
    derivedPerPage,
    derivedTotalPages,
    paginatedDerived,
    setDerivedPage,
    basedOnId,
    sourceGeneration,
    isSourceLoading,
  };
};

