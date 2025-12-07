import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import { PhaseConfig } from '@/tools/travel-between-images/settings';
import { supabase } from '@/integrations/supabase/client';
import type { VideoMetadata } from '@/shared/lib/videoUploader';

export interface PhaseConfigMetadata {
    name: string;
    description: string;
    phaseConfig: PhaseConfig;
    created_by: {
        is_you: boolean;
        username?: string;
    };
    is_public: boolean;
    tags?: string[];
    use_count?: number;
    created_at: string;
    sample_generations?: {
        url: string;
        type: 'image' | 'video';
        alt_text?: string;
    }[];
    main_generation?: string;
    // Prompt and generation settings
    basePrompt?: string;
    negativePrompt?: string;
    textBeforePrompts?: string;
    textAfterPrompts?: string;
    enhancePrompt?: boolean;
    durationFrames?: number;
    selectedLoras?: Array<{ id: string; name: string; strength: number }>;
    // Generation type mode (I2V = image-to-video, VACE = structure video guidance)
    generationTypeMode?: 'i2v' | 'vace';
}

export interface StyleReferenceMetadata {
    name: string;
    styleReferenceImage: string;
    styleReferenceImageOriginal: string;
    thumbnailUrl: string | null;
    styleReferenceStrength: number;
    subjectStrength: number;
    subjectDescription: string;
    inThisScene: boolean;
    inThisSceneStrength: number;
    referenceMode: 'style' | 'subject' | 'style-character' | 'scene' | 'custom';
    styleBoostTerms: string;
    created_by: {
        is_you: boolean;
        username?: string;
    };
    is_public: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface StructureVideoMetadata {
    name: string;
    videoUrl: string;
    thumbnailUrl: string | null;
    videoMetadata: VideoMetadata;
    created_by: {
        is_you: boolean;
        username?: string;
    };
    is_public: boolean;
    createdAt: string;
}

export type ResourceType = 'lora' | 'phase-config' | 'style-reference' | 'structure-video';
export type ResourceMetadata = LoraModel | PhaseConfigMetadata | StyleReferenceMetadata | StructureVideoMetadata;

export interface Resource {
    id: string;
    userId: string;
    type: ResourceType;
    metadata: ResourceMetadata;
    isPublic: boolean;
    createdAt: string;
}

// List public resources (available to all users)
export const useListPublicResources = (type: ResourceType) => {
    return useQuery<Resource[], Error>({
        queryKey: ['public-resources', type, 'v2'],
        queryFn: async () => {
            console.log('[PublicResources] Fetching public resources (v2 - paginated):', { type, timestamp: Date.now() });
            
            // Manual pagination to bypass 1000 limit
            let allData: any[] = [];
            let page = 0;
            const pageSize = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data, error } = await supabase
                    .from('resources')
                    .select('*')
                    .eq('type', type)
                    .eq('is_public', true)
                    .range(page * pageSize, (page + 1) * pageSize - 1);
                
                if (error) {
                    console.error('[PublicResources] Query error:', { type, error, timestamp: Date.now() });
                    throw error;
                }
                
                if (data) {
                    allData = [...allData, ...data];
                    if (data.length < pageSize) {
                        hasMore = false;
                    } else {
                        page++;
                    }
                } else {
                    hasMore = false;
                }
                
                // Safety limit to prevent infinite loops
                if (allData.length >= 20000) {
                    console.warn('[PublicResources] Reached safety limit of 20k resources');
                    hasMore = false;
                }
            }
            
            console.log('[PublicResources] Query successful:', {
                type,
                count: allData.length,
                timestamp: Date.now()
            });
            
            return allData;
        },
        staleTime: 15 * 60 * 1000, // 15 minutes
        gcTime: 30 * 60 * 1000, // keep in cache for 30 minutes
        refetchOnWindowFocus: false,
    });
};

// List resources
export const useListResources = (type: ResourceType) => {
    return useQuery<Resource[], Error>({
        queryKey: ['resources', type, 'v2'],
        queryFn: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');
            
            // Manual pagination to bypass 1000 limit
            let allData: any[] = [];
            let page = 0;
            const pageSize = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data, error } = await supabase
                    .from('resources')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('type', type)
                    .range(page * pageSize, (page + 1) * pageSize - 1);
                
                if (error) throw error;

                if (data) {
                    allData = [...allData, ...data];
                    if (data.length < pageSize) {
                        hasMore = false;
                    } else {
                        page++;
                    }
                } else {
                    hasMore = false;
                }
                
                 // Safety limit
                 if (allData.length >= 20000) break;
            }

            return allData;
        },
    });
};

// Create a new resource
interface CreateResourceArgs {
    type: ResourceType;
    metadata: ResourceMetadata;
}

export const useCreateResource = () => {
    const queryClient = useQueryClient();
    return useMutation<Resource, Error, CreateResourceArgs>({
        mutationFn: async ({ type, metadata }) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');
            
            // Extract is_public from metadata for the column
            const isPublic = 'is_public' in metadata ? Boolean((metadata as any).is_public) : false;
            
            const { data, error } = await supabase
                .from('resources')
                .insert({
                    type,
                    metadata,
                    user_id: user.id,
                    is_public: isPublic
                })
                .select()
                .single();
            
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['resources', data.type] });
            queryClient.invalidateQueries({ queryKey: ['public-resources', data.type] });
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });
};

// Update a resource
interface UpdateResourceArgs {
    id: string;
    type: ResourceType;
    metadata: ResourceMetadata;
}

export const useUpdateResource = () => {
    const queryClient = useQueryClient();
    return useMutation<Resource, Error, UpdateResourceArgs>({
        mutationFn: async ({ id, type, metadata }) => {
            console.log('[useUpdateResource] Starting update:', { id, type, metadataKeys: Object.keys(metadata) });
            
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                console.error('[useUpdateResource] User not authenticated');
                throw new Error('Not authenticated');
            }
            
            console.log('[useUpdateResource] User authenticated:', { userId: user.id });
            
            // First, let's check if the resource exists at all (without user_id filter)
            const { data: resourceCheck, error: resourceCheckError } = await supabase
                .from('resources')
                .select('id, user_id, type')
                .eq('id', id)
                .maybeSingle();
            
            console.log('[useUpdateResource] Resource check (no user filter):', { 
                found: !!resourceCheck, 
                resourceUserId: resourceCheck?.user_id,
                currentUserId: user.id,
                match: resourceCheck?.user_id === user.id,
                error: resourceCheckError 
            });
            
            // Now verify the resource exists and belongs to the user
            const { data: existingResource, error: checkError } = await supabase
                .from('resources')
                .select('id, user_id, type')
                .eq('id', id)
                .eq('user_id', user.id)
                .maybeSingle();
            
            if (checkError) {
                console.error('[useUpdateResource] Error checking resource:', checkError);
                throw new Error(`Failed to verify resource: ${checkError.message}`);
            }
            
            if (!existingResource) {
                console.error('[useUpdateResource] Resource not found or access denied:', { 
                    id, 
                    userId: user.id,
                    resourceExists: !!resourceCheck,
                    resourceOwner: resourceCheck?.user_id
                });
                
                // Provide a more specific error message
                if (resourceCheck && resourceCheck.user_id !== user.id) {
                    throw new Error('This resource belongs to another user');
                }
                throw new Error('Resource not found or you do not have permission to update it');
            }
            
            console.log('[useUpdateResource] Resource verified:', existingResource);
            
            // Extract is_public from metadata for the column
            const isPublic = 'is_public' in metadata ? Boolean((metadata as any).is_public) : false;
            
            // Now perform the update
            const { data, error } = await supabase
                .from('resources')
                .update({ metadata, is_public: isPublic })
                .eq('id', id)
                .eq('user_id', user.id)
                .select()
                .maybeSingle();
            
            if (error) {
                console.error('[useUpdateResource] Update error:', {
                    error,
                    code: error.code,
                    message: error.message,
                    details: error.details,
                    hint: error.hint
                });
                throw error;
            }
            
            if (!data) {
                console.error('[useUpdateResource] Update succeeded but no data returned');
                // If update succeeded but no data returned, fetch it separately
                const { data: fetchedData, error: fetchError } = await supabase
                    .from('resources')
                    .select('*')
                    .eq('id', id)
                    .maybeSingle();
                
                if (fetchError || !fetchedData) {
                    console.error('[useUpdateResource] Failed to fetch updated resource:', fetchError);
                    throw new Error('Update may have succeeded but failed to fetch updated resource');
                }
                
                console.log('[useUpdateResource] Successfully fetched updated resource');
                return fetchedData;
            }
            
            console.log('[useUpdateResource] Update successful:', { id, type });
            return data;
        },
        onSuccess: (data) => {
            console.log('[useUpdateResource] onSuccess - invalidating queries for type:', data.type, 'id:', data.id);
            // Invalidate both v2 query keys to ensure fresh data
            queryClient.invalidateQueries({ queryKey: ['resources', data.type, 'v2'] });
            queryClient.invalidateQueries({ queryKey: ['public-resources', data.type, 'v2'] });
            // Also invalidate without v2 for backwards compatibility
            queryClient.invalidateQueries({ queryKey: ['resources', data.type] });
            queryClient.invalidateQueries({ queryKey: ['public-resources', data.type] });
            // Invalidate specific-resources queries that include this resource ID
            // Using predicate to find any query that contains this resource ID
            queryClient.invalidateQueries({
                predicate: (query) => {
                    const key = query.queryKey;
                    if (key[0] === 'specific-resources' && typeof key[1] === 'string') {
                        return key[1].includes(data.id);
                    }
                    return false;
                }
            });
        },
        onError: (error) => {
            console.error('[useUpdateResource] onError:', error);
            toast.error(error.message);
        },
    });
};

// Delete a resource
export const useDeleteResource = () => {
    const queryClient = useQueryClient();
    return useMutation<void, Error, { id: string, type: ResourceType }>({
        mutationFn: async ({ id }) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');
            
            const { error } = await supabase
                .from('resources')
                .delete()
                .eq('id', id)
                .eq('user_id', user.id);
            
            if (error) throw error;
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['resources', variables.type] });
            queryClient.invalidateQueries({ queryKey: ['public-resources', variables.type] });
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });
}; 