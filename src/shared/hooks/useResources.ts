import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import { supabase } from '@/integrations/supabase/client';

export interface Resource {
    id: string;
    userId: string;
    type: 'lora';
    metadata: LoraModel;
    createdAt: string;
}

// List public resources (available to all users)
export const useListPublicResources = (type: 'lora') => {
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
        staleTime: 10 * 60 * 1000, // 10 minutes
        refetchOnWindowFocus: false,
    });
};

// List resources
export const useListResources = (type: 'lora') => {
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
    type: 'lora';
    metadata: LoraModel;
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
            toast.success(`LoRA "${data.metadata.Name}" added to your collection.`);
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });
};

// Delete a resource
export const useDeleteResource = () => {
    const queryClient = useQueryClient();
    return useMutation<void, Error, { id: string, type: 'lora' }>({
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
            toast.success(`LoRA removed from your collection.`);
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });
}; 