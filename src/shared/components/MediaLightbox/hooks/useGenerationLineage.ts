import { useState, useMemo } from 'react';
import { GenerationRow } from '@/types/shots';
import { 
  useDerivedItems, 
  useSourceGeneration,
  DerivedItem 
} from '@/shared/hooks/useGenerations';

export interface UseGenerationLineageProps {
  media: GenerationRow;
}

export interface UseGenerationLineageReturn {
  // Derived items (generations + variants based on this one) - NEW UNIFIED
  derivedItems: DerivedItem[] | undefined;
  isDerivedLoading: boolean;
  derivedPage: number;
  derivedPerPage: number;
  derivedTotalPages: number;
  paginatedDerived: DerivedItem[];
  setDerivedPage: React.Dispatch<React.SetStateAction<number>>;
  
  // Legacy: derivedGenerations for backwards compatibility (only generations, not variants)
  derivedGenerations: GenerationRow[] | undefined;
  
  // Source generation (this is based on another generation)
  basedOnId: string | null;
  sourceGeneration: GenerationRow | undefined;
  isSourceLoading: boolean;
}

/**
 * Hook for managing generation lineage (based on and derived from)
 * Fetches and paginates related generations AND variants (unified)
 */
export const useGenerationLineage = ({
  media,
}: UseGenerationLineageProps): UseGenerationLineageReturn => {
  // IMPORTANT: Use generation_id (actual generations.id) when available, falling back to id
  // For ShotImageManager/Timeline images, id is shot_generations.id but generation_id is the actual generation ID
  const actualGenerationId = (media as any).generation_id || media.id;
  
  // Fetch derived items (both generations AND variants) - NEW UNIFIED
  const { data: derivedItems, isLoading: isDerivedLoading } = useDerivedItems(actualGenerationId);
  const [derivedPage, setDerivedPage] = useState(1);
  const derivedPerPage = 6;
  const derivedTotalPages = derivedItems ? Math.ceil(derivedItems.length / derivedPerPage) : 0;
  
  const paginatedDerived = useMemo(() => {
    if (!derivedItems) {
      console.log('[DerivedItems] paginatedDerived: no derivedItems');
      return [];
    }
    const start = (derivedPage - 1) * derivedPerPage;
    const paginated = derivedItems.slice(start, start + derivedPerPage);
    console.log('[DerivedItems] paginatedDerived calculated', {
      derivedItemsCount: derivedItems.length,
      derivedPage,
      start,
      end: start + derivedPerPage,
      paginatedCount: paginated.length,
      paginatedItems: paginated.map(d => ({ 
        id: d.id, 
        itemType: d.itemType, 
        hasThumbUrl: !!d.thumbUrl 
      }))
    });
    return paginated;
  }, [derivedItems, derivedPage, derivedPerPage]);

  // Legacy: Filter to only generations for backwards compatibility
  const derivedGenerations = useMemo(() => {
    if (!derivedItems) return undefined;
    // Cast back to GenerationRow format for legacy consumers
    return derivedItems
      .filter(item => item.itemType === 'generation')
      .map(item => ({
        id: item.id,
        url: item.url,
        thumbUrl: item.thumbUrl,
        prompt: item.prompt || '',
        metadata: {},
        createdAt: item.createdAt,
        isVideo: false,
        starred: item.starred || false,
        position: null,
        timeline_frame: item.timeline_frame,
        derivedCount: item.derivedCount,
        based_on: item.basedOn,
        shot_id: item.shot_id,
        all_shot_associations: item.all_shot_associations,
      })) as GenerationRow[];
  }, [derivedItems]);

  // Fetch source generation if this is based on another generation
  // Check if media.metadata contains based_on field (from generation params)
  const basedOnId = (media as any).based_on || (media.metadata as any)?.based_on || null;
  const { data: sourceGeneration, isLoading: isSourceLoading } = useSourceGeneration(basedOnId);

  return {
    // New unified
    derivedItems,
    isDerivedLoading,
    derivedPage,
    derivedPerPage,
    derivedTotalPages,
    paginatedDerived,
    setDerivedPage,
    // Legacy
    derivedGenerations,
    // Source
    basedOnId,
    sourceGeneration,
    isSourceLoading,
  };
};

