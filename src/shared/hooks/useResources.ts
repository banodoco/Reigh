import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LoraModel } from '@/shared/components/LoraSelectorModal';

export interface Resource {
    id: string;
    userId: string;
    type: 'lora';
    metadata: LoraModel;
    createdAt: string;
}

// List resources
export const useListResources = (type: 'lora') => {
    return useQuery<Resource[], Error>({
        queryKey: ['resources', type],
        queryFn: async () => {
            const response = await fetch(`/api/resources?type=${type}`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: response.statusText }));
                throw new Error(errorData.message || `Failed to fetch resources: ${response.statusText}`);
            }
            return response.json();
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
            const response = await fetch('/api/resources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, metadata }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: response.statusText }));
                throw new Error(errorData.message || `Failed to create resource: ${response.statusText}`);
            }
            return response.json();
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
            const response = await fetch(`/api/resources/${id}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: response.statusText }));
                throw new Error(errorData.message || `Failed to delete resource: ${response.statusText}`);
            }
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