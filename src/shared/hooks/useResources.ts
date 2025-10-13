import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import { PhaseConfig } from '@/tools/travel-between-images/settings';
import { supabase } from '@/integrations/supabase/client';

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
}

export type ResourceType = 'lora' | 'phase-config';
export type ResourceMetadata = LoraModel | PhaseConfigMetadata;

export interface Resource {
    id: string;
    userId: string;
    type: ResourceType;
    metadata: ResourceMetadata;
    createdAt: string;
}

// List public resources (available to all users)
export const useListPublicResources = (type: ResourceType) => {
    return useQuery<Resource[], Error>({
        queryKey: ['public-resources', type],
        queryFn: async () => {
            // Public resources should be readable by anyone
            const { data, error } = await supabase
                .from('resources')
                .select('*')
                .eq('type', type)
                .eq('metadata->>is_public', 'true');
            
            if (error) throw error;
            return data || [];
        },
        staleTime: 15 * 60 * 1000, // 15 minutes - increased for better performance since resources don't change often
        gcTime: 30 * 60 * 1000, // keep in cache for 30 minutes
        refetchOnWindowFocus: false,
    });
};

// List resources
export const useListResources = (type: ResourceType) => {
    return useQuery<Resource[], Error>({
        queryKey: ['resources', type],
        queryFn: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');
            
            const { data, error } = await supabase
                .from('resources')
                .select('*')
                .eq('user_id', user.id)
                .eq('type', type);
            
            if (error) throw error;
            return data || [];
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
            
            const { data, error } = await supabase
                .from('resources')
                .insert({
                    ...{ type, metadata },
                    user_id: user.id
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