import { useMemo, useState, useEffect } from 'react';
import { useSpecificResources } from '@/shared/hooks/useSpecificResources';
import { useListResources, useListPublicResources, StyleReferenceMetadata, Resource } from '@/shared/hooks/useResources';
import { ReferenceImage, HydratedReferenceImage } from '../components/ImageGenerationForm/types';
import { supabase } from '@/integrations/supabase/client';

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
  // Get current user ID for ownership check
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setCurrentUserId(session?.user?.id || null);
    };
    getUser();
  }, []);
  
  // Extract resource IDs we need to fetch
  const resourceIdsToFetch = useMemo(() => {
    if (!referencePointers) return [];
    return referencePointers
      .map(p => p.resourceId)
      .filter(id => !!id); // Only valid IDs
  }, [referencePointers]);

  // Use optimized fetch for specific resources
  const specificResources = useSpecificResources(resourceIdsToFetch);
  
  // Fallback to searching all resources if we're not using the optimized path yet
  // or if we need to search public resources that might not be in the specific list (though specific list should handle both)
  // keeping these hooks for now to ensure we don't break other parts, but relying on specificResources for data
  
  const isLoading = specificResources.isLoading;
  
  // Combine all available resources
  const allResources = useMemo(() => {
    return specificResources.data || [];
  }, [specificResources.data]);
  
  const result = useMemo(() => {
    // ... existing logging ...
    
    if (!referencePointers || referencePointers.length === 0) {
      // ... existing empty return ...
      return {
        hydratedReferences: [],
        isLoading: false, // Nothing to load if no pointers
        hasLegacyReferences: false
      };
    }
    
    // ... existing hydration logic ...
    
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
            isPublic: false, // Legacy references default to private
            isOwner: true, // Legacy references are always owned by current user
          } as HydratedReferenceImage;
        }
        
        // Find the resource for this pointer in ALL available resources
        const resource = allResources.find(r => r.id === pointer.resourceId);
        
        if (!resource) {
          // Only warn if we're not loading anymore
          if (!isLoading) {
            console.warn('[useHydratedReferences] Resource not found for pointer:', pointer.id, pointer.resourceId);
          }
          return null;
        }
        
        const metadata = resource.metadata as StyleReferenceMetadata;
        
        // Check ownership - compare resource user_id with current user
        const resourceOwnerId = (resource as any).userId || (resource as any).user_id;
        const isOwner = !!(currentUserId && resourceOwnerId === currentUserId);
        
        // Hydrate: Resource provides image data, pointer provides usage settings
        // Pointer settings override resource defaults (project-specific usage)
        return {
          id: pointer.id,
          resourceId: resource.id,
          // Immutable data from resource
          name: metadata.name,
          styleReferenceImage: metadata.styleReferenceImage,
          styleReferenceImageOriginal: metadata.styleReferenceImageOriginal,
          thumbnailUrl: metadata.thumbnailUrl || null,
          createdAt: resource.created_at,
          updatedAt: metadata.updatedAt,
          // Visibility and ownership settings
          isPublic: metadata.is_public ?? false,
          isOwner: isOwner,
          // Project-specific usage settings from pointer (with resource defaults as fallback)
          referenceMode: pointer.referenceMode ?? metadata.referenceMode ?? 'style',
          styleReferenceStrength: pointer.styleReferenceStrength ?? metadata.styleReferenceStrength ?? 1.1,
          subjectStrength: pointer.subjectStrength ?? metadata.subjectStrength ?? 0.0,
          subjectDescription: pointer.subjectDescription ?? metadata.subjectDescription ?? '',
          inThisScene: pointer.inThisScene ?? metadata.inThisScene ?? false,
          inThisSceneStrength: pointer.inThisSceneStrength ?? metadata.inThisSceneStrength ?? 1.0,
          styleBoostTerms: pointer.styleBoostTerms ?? metadata.styleBoostTerms ?? '',
        } as HydratedReferenceImage;
      })
      .filter((ref): ref is HydratedReferenceImage => ref !== null);
    
    return {
      hydratedReferences: hydrated,
      isLoading,
      hasLegacyReferences
    };
  }, [referencePointers, allResources, isLoading, currentUserId]);
  
  return result;
};

