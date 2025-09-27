/**
 * Service for fetching dataset images from Supabase
 * Provides functions to browse, search, and paginate through dataset_id = 1 images
 * Uses dedicated dataset database client with separate credentials
 */

import { datasetSupabase } from '@/integrations/supabase/datasetClient';

export interface DatasetImage {
  id: number;
  dataset_id: number;
  filename: string;
  storage_url: string;
  style_reference?: string;
  prompt?: string;
  generation_prompt?: string;
  params?: string;
  width?: number;
  height?: number;
  size_category?: string;
  orientation?: string;
  character_reference?: string;
  scene_reference?: string;
  review_status: string;
  based_on?: string;
  created_at: string;
  updated_at: string;
}

export interface DatasetSearchParams {
  searchTerm?: string;
  page?: number;
  limit?: number;
  styleReference?: string;
  orientation?: string;
  characterReference?: string;
}

export interface DatasetSearchResult {
  items: DatasetImage[];
  total: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * Fetch dataset images with search and pagination
 */
export const fetchDatasetImages = async (params: DatasetSearchParams = {}): Promise<DatasetSearchResult> => {
  const {
    searchTerm = '',
    page = 1,
    limit = 16,
    styleReference,
    orientation,
    characterReference
  } = params;

  try {
    // Start with base query using dedicated dataset client
    let query = datasetSupabase
      .from('dataset_contents')
      .select('*', { count: 'exact' })
      .eq('dataset_id', 1)
      .eq('review_status', 'approved');

    // Apply search filter if provided
    if (searchTerm.trim()) {
      // Search in prompt and params fields
      query = query.or(`prompt.ilike.%${searchTerm}%,params.ilike.%${searchTerm}%,generation_prompt.ilike.%${searchTerm}%`);
    }

    // Apply additional filters
    if (styleReference) {
      query = query.eq('style_reference', styleReference);
    }
    if (orientation) {
      query = query.eq('orientation', orientation);
    }
    if (characterReference) {
      query = query.eq('character_reference', characterReference);
    }

    // Apply pagination
    const offset = (page - 1) * limit;
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching dataset images:', error);
      throw new Error(`Failed to fetch dataset images: ${error.message}`);
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    return {
      items: data || [],
      total,
      page,
      totalPages,
      hasMore: page < totalPages
    };
  } catch (error) {
    console.error('Dataset service error:', error);
    throw error;
  }
};

/**
 * Get available filter options for the dataset
 */
export const fetchDatasetFilterOptions = async () => {
  try {
    const { data, error } = await datasetSupabase
      .from('dataset_contents')
      .select('style_reference, orientation, character_reference')
      .eq('dataset_id', 1)
      .eq('review_status', 'approved');

    if (error) {
      console.error('Error fetching filter options:', error);
      throw new Error(`Failed to fetch filter options: ${error.message}`);
    }

    return {
      styleReferences: [...new Set(data?.map(item => item.style_reference).filter(value => value && value.trim() !== ''))].sort(),
      orientations: [...new Set(data?.map(item => item.orientation).filter(value => value && value.trim() !== ''))].sort(),
      characterReferences: [...new Set(data?.map(item => item.character_reference).filter(value => value && value.trim() !== ''))].sort()
    };
  } catch (error) {
    console.error('Filter options service error:', error);
    throw error;
  }
};

/**
 * Get a specific dataset image by ID
 */
export const fetchDatasetImageById = async (id: number): Promise<DatasetImage | null> => {
  try {
    const { data, error } = await datasetSupabase
      .from('dataset_contents')
      .select('*')
      .eq('id', id)
      .eq('dataset_id', 1)
      .single();

    if (error) {
      console.error('Error fetching dataset image by ID:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Dataset image by ID service error:', error);
    return null;
  }
};
