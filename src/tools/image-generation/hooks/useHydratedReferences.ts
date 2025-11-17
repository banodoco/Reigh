import { useMemo } from 'react';
import { useListResources, useListPublicResources, StyleReferenceMetadata, Resource } from '@/shared/hooks/useResources';
import { ReferenceImage, HydratedReferenceImage } from '../components/ImageGenerationForm/types';

/**
 * Hook to hydrate reference pointers with full data from resources table
 * Converts lightweight ReferenceImage pointers to full HydratedReferenceImage objects
 * Searches both user's own resources and public resources
 */
export const useHydratedReferences = (
  referencePointers: ReferenceImage[] | undefined
): {
  hydratedReferences: HydratedReferenceImage[];
  isLoading: boolean;
  hasLegacyReferences: boolean;
} => {
  const myResources = useListResources('style-reference');
  const publicResources = useListPublicResources('style-reference');
  
  const isLoading = myResources.isLoading || publicResources.isLoading;
  
  // Combine all available resources (user's + public) for lookup
  const allResources = useMemo(() => {
    const myRefs = (myResources.data || []) as Resource[];
    const publicRefs = (publicResources.data || []) as Resource[];
    
    // Combine and deduplicate by ID
    const combined = [...myRefs];
    const myIds = new Set(myRefs.map(r => r.id));
    
    publicRefs.forEach(ref => {
      if (!myIds.has(ref.id)) {
        combined.push(ref);
      }
    });
    
    return combined;
  }, [myResources.data, publicResources.data]);
  
  const result = useMemo(() => {
    console.log('[RefLoadingDebug] 🔄 useHydratedReferences computing:', {
      hasPointers: !!referencePointers,
      pointersLength: referencePointers?.length ?? 0,
      isLoading,
      myResourcesCount: myResources.data?.length ?? 0,
      publicResourcesCount: publicResources.data?.length ?? 0,
      allResourcesCount: allResources.length,
      timestamp: Date.now()
    });
    
    if (!referencePointers || referencePointers.length === 0) {
      console.log('[RefLoadingDebug] 🔄 No pointers, returning empty');
      return {
        hydratedReferences: [],
        isLoading,
        hasLegacyReferences: false
      };
    }
    
    let hasLegacyReferences = false;
    
    const hydrated: HydratedReferenceImage[] = referencePointers
      .map(pointer => {
        // Check if this is a legacy reference (has data inline)
        const isLegacy = !pointer.resourceId && pointer.styleReferenceImage;
        
        if (isLegacy) {
          hasLegacyReferences = true;
          // Return legacy data as-is for now (migration will handle)
          return {
            id: pointer.id,
            resourceId: '', // Will be set during migration
            name: pointer.name || 'Reference',
            styleReferenceImage: pointer.styleReferenceImage || '',
            styleReferenceImageOriginal: pointer.styleReferenceImageOriginal || '',
            thumbnailUrl: pointer.thumbnailUrl || null,
            styleReferenceStrength: pointer.styleReferenceStrength ?? 1.1,
            subjectStrength: pointer.subjectStrength ?? 0.0,
            subjectDescription: pointer.subjectDescription || '',
            inThisScene: pointer.inThisScene ?? false,
            inThisSceneStrength: pointer.inThisSceneStrength ?? 1.0,
            referenceMode: pointer.referenceMode || 'style',
            styleBoostTerms: pointer.styleBoostTerms || '',
            createdAt: pointer.createdAt || new Date().toISOString(),
            updatedAt: pointer.updatedAt || new Date().toISOString(),
          } as HydratedReferenceImage;
        }
        
        // Find the resource for this pointer in ALL available resources
        const resource = allResources.find(r => r.id === pointer.resourceId);
        
        if (!resource) {
          console.warn('[useHydratedReferences] Resource not found for pointer:', pointer.id, pointer.resourceId);
          return null;
        }
        
        const metadata = resource.metadata as StyleReferenceMetadata;
        
        return {
          id: pointer.id,
          resourceId: resource.id,
          name: metadata.name,
          styleReferenceImage: metadata.styleReferenceImage,
          styleReferenceImageOriginal: metadata.styleReferenceImageOriginal,
          thumbnailUrl: metadata.thumbnailUrl || null,
          styleReferenceStrength: metadata.styleReferenceStrength,
          subjectStrength: metadata.subjectStrength,
          subjectDescription: metadata.subjectDescription,
          inThisScene: metadata.inThisScene,
          inThisSceneStrength: metadata.inThisSceneStrength,
          referenceMode: metadata.referenceMode,
          styleBoostTerms: metadata.styleBoostTerms || '',
          createdAt: resource.created_at,
          updatedAt: metadata.updatedAt,
        } as HydratedReferenceImage;
      })
      .filter((ref): ref is HydratedReferenceImage => ref !== null);
    
    console.log('[RefLoadingDebug] 🔄 useHydratedReferences result:', {
      hydratedCount: hydrated.length,
      pointersCount: referencePointers.length,
      hasLegacyReferences,
      isLoading,
      timestamp: Date.now()
    });
    
    return {
      hydratedReferences: hydrated,
      isLoading,
      hasLegacyReferences
    };
  }, [referencePointers, allResources, isLoading]);
  
  return result;
};

