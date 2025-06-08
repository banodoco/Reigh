import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { GenerationRow } from '@/types/shots';

interface GenerationsResponse {
    items: GenerationRow[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

const fetchGenerations = async (projectId: string, page = 1, limit = 24): Promise<GenerationsResponse> => {
    const { data } = await axios.get('/api/generations', {
        params: {
            projectId,
            page,
            limit,
        }
    });
    return data;
};

export const useListGenerations = (projectId: string | null, page = 1, limit = 24) => {
    return useQuery<GenerationsResponse, Error>({
        queryKey: ['generations', projectId, page, limit],
        queryFn: () => {
            if (!projectId) {
                // Return a default empty state if projectId is null
                return Promise.resolve({
                    items: [],
                    page: 1,
                    limit,
                    total: 0,
                    totalPages: 0,
                });
            }
            return fetchGenerations(projectId, page, limit);
        },
        enabled: !!projectId, // Only run the query if projectId is not null
        placeholderData: (previousData) => previousData, // Use this instead of keepPreviousData
    });
};

// Placeholder for useDeleteGeneration, useUpscaleGeneration hooks
export const useDeleteGeneration = () => { console.log('useDeleteGeneration called'); return { mutate: () => {}, isLoading: false }; };
export const useUpscaleGeneration = () => { console.log('useUpscaleGeneration called'); return { mutate: () => {}, isLoading: false }; }; 