import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GeneratedImageWithMetadata } from '@/shared/components/ImageGallery';
import { GenerationRow } from '@/types/shots';
import { supabase } from '@/integrations/supabase/client';

// Extended interface that includes task data
export interface GenerationWithTask extends GeneratedImageWithMetadata {
  taskId?: string | null;
  taskData?: any; // Full task object when fetched
  shotImageEntryId?: string; // For shot-specific operations
  position?: number | null;
}

// Hook configuration for different use cases
interface UseUnifiedGenerationsOptions {
  projectId: string | null;
  
  // Data source and scope
  mode: 'project-wide' | 'shot-specific';
  shotId?: string | null; // Required when mode = 'shot-specific'
  
  // Pagination
  page?: number;
  limit?: number;
  
  // Filtering
  filters?: {
    toolType?: string;
    mediaType?: 'all' | 'image' | 'video';
    starredOnly?: boolean;
    excludePositioned?: boolean; // Only for shot-specific mode
    searchTerm?: string;
  };
  
  // Task data inclusion
  includeTaskData?: boolean; // Whether to fetch associated task data
  preloadTaskData?: boolean; // Whether to preload task data in background
  
  // Performance options
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
}

interface UnifiedGenerationsResponse {
  items: GenerationWithTask[];
  total: number;
  hasMore: boolean;
}

// Cache key factory for consistent invalidation
export const getUnifiedGenerationsCacheKey = (options: UseUnifiedGenerationsOptions) => {
  const { mode, projectId, shotId, page, limit, filters, includeTaskData } = options;
  
  // Serialize filters to ensure stable cache keys
  const filtersKey = filters ? JSON.stringify(filters) : null;
  
  if (mode === 'shot-specific') {
    return ['unified-generations', 'shot', shotId, page, limit, filtersKey, includeTaskData];
  } else {
    return ['unified-generations', 'project', projectId, page, limit, filtersKey, includeTaskData];
  }
};

// Main fetch function that handles both modes
async function fetchUnifiedGenerations(options: UseUnifiedGenerationsOptions): Promise<UnifiedGenerationsResponse> {
  const { projectId, mode, shotId, page = 1, limit = 100, filters, includeTaskData = false } = options;
  
  if (!projectId) {
    return { items: [], total: 0, hasMore: false };
  }
  
  const offset = (page - 1) * limit;
  
  if (mode === 'shot-specific') {
    return fetchShotSpecificGenerations({ projectId, shotId: shotId!, offset, limit, filters, includeTaskData });
  } else {
    return fetchProjectWideGenerations({ projectId, offset, limit, filters, includeTaskData });
  }
}

// Shot-specific fetch (for VideoOutputsGallery)
async function fetchShotSpecificGenerations({
  projectId,
  shotId,
  offset,
  limit,
  filters,
  includeTaskData
}: {
  projectId: string;
  shotId: string;
  offset: number;
  limit: number;
  filters?: UseUnifiedGenerationsOptions['filters'];
  includeTaskData: boolean;
}): Promise<UnifiedGenerationsResponse> {
  
  console.log('[VideoGenMissing] Starting shot-specific generations fetch:', {
    projectId,
    shotId,
    offset,
    limit,
    filters,
    includeTaskData,
    visibilityState: document.visibilityState,
    timestamp: Date.now()
  });
  
  // Count query - can't filter on joined tables, so we'll count all and estimate
  let countQuery = supabase
    .from('shot_generations')
    .select('generation_id', { count: 'exact', head: true })
    .eq('shot_id', shotId);
  
  // Apply exclude positioned filter (this works because it's on shot_generations table)
  if (filters?.excludePositioned) {
    countQuery = countQuery.is('position', null);
  }
  
  // For VideoOutputsGallery, fetch ALL data when filtering by video to show everything
  const fetchLimit = filters?.mediaType === 'video' ? 1000 : limit; // Fetch ALL for video filtering
  const fetchOffset = filters?.mediaType === 'video' ? 0 : offset; // Start from beginning for videos
  
  let dataQuery = supabase
    .from('shot_generations')
    .select(`
      id,
      position,
      generation:generations(
        id,
        location,
        type,
        created_at,
        params,
        starred${includeTaskData ? ',tasks' : ''}
      )
    `)
    .eq('shot_id', shotId);
  
  // Apply other filters that work on shot_generations table
  if (filters?.excludePositioned) {
    dataQuery = dataQuery.is('position', null);
  }
  
  // Apply ordering
  dataQuery = dataQuery
    .order('position', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  
  // Execute queries
  console.log('[VideoGenMissing] Executing shot-specific queries...', {
    projectId,
    shotId,
    offset,
    limit,
    timestamp: Date.now()
  });
  
  const [{ count, error: countError }, { data, error: dataError }] = await Promise.all([
    countQuery,
    dataQuery.range(fetchOffset, fetchOffset + fetchLimit - 1)
  ]);
  
  console.log('[VideoGenMissing] Shot-specific query results:', {
    projectId,
    shotId,
    count,
    dataLength: data?.length,
    countError: countError?.message,
    dataError: dataError?.message,
    timestamp: Date.now()
  });
  
  if (countError) {
    console.error('[VideoGenMissing] Shot-specific count query failed:', {
      projectId,
      shotId,
      error: countError,
      timestamp: Date.now()
    });
    throw countError;
  }
  if (dataError) {
    console.error('[VideoGenMissing] Shot-specific data query failed:', {
      projectId,
      shotId,
      error: dataError,
      timestamp: Date.now()
    });
    throw dataError;
  }
  
  // Transform data
  let items = (data || [])
    .filter((sg: any) => sg.generation)
    .map((sg: any) => {
      const gen = sg.generation;
      const baseItem: GenerationWithTask = {
        id: gen.id,
        url: gen.location,
        thumbUrl: gen.location, // Use main location as thumbnail fallback
        isVideo: gen.type?.includes('video'),
        createdAt: gen.created_at,
        starred: gen.starred || false,
        metadata: gen.params || {},
        shotImageEntryId: sg.id,
        position: sg.position,
        taskId: includeTaskData && gen.tasks ? (Array.isArray(gen.tasks) ? gen.tasks[0] : gen.tasks) : null,
      };
      
      // Extract prompt from nested structure
      baseItem.prompt = gen.params?.originalParams?.orchestrator_details?.prompt || 
                       gen.params?.prompt || 
                       gen.metadata?.prompt || 
                       'No prompt';
      
      return baseItem;
    });
  
  console.log('[VideoGenMissing] Raw transformed items before filtering:', {
    projectId,
    shotId,
    totalItems: items.length,
    videoItems: items.filter(i => i.isVideo).length,
    imageItems: items.filter(i => !i.isVideo).length,
    itemDetails: items.slice(0, 5).map(item => ({
      id: item.id,
      type: item.isVideo ? 'video' : 'image',
      rawType: (data as any)?.find((sg: any) => sg.generation?.id === item.id)?.generation?.type,
      position: item.position,
      createdAt: item.createdAt
    })),
    timestamp: Date.now()
  });
  
  // Store original count before client-side filtering
  const originalItemsCount = items.length;
  
  // Apply client-side filters
  if (filters?.mediaType && filters.mediaType !== 'all') {
    items = items.filter(item => {
      if (filters.mediaType === 'video') return item.isVideo;
      if (filters.mediaType === 'image') return !item.isVideo;
      return true;
    });
  }
  
  if (filters?.starredOnly) {
    items = items.filter(item => item.starred);
  }
  
  if (filters?.searchTerm?.trim()) {
    const searchTerm = filters.searchTerm.toLowerCase();
    items = items.filter(item => 
      item.prompt?.toLowerCase().includes(searchTerm)
    );
  }
  
  // For video filtering, show ALL videos without pagination
  let finalItems, finalTotal, finalHasMore;
  
  if (filters?.mediaType === 'video') {
    // Show ALL videos found - no pagination for video gallery
    finalItems = items;
    finalTotal = items.length;
    finalHasMore = false; // We fetched everything
  } else {
    // For other cases, use normal pagination
    finalItems = items.slice(offset, offset + limit);
    const filteringRatio = originalItemsCount > 0 ? items.length / originalItemsCount : 1;
    finalTotal = Math.round((count || 0) * filteringRatio);
    finalHasMore = items.length > limit;
  }
  
  const result = { items: finalItems, total: finalTotal, hasMore: finalHasMore };
  
  console.log('[VideoGenMissing] Shot-specific fetch completed:', {
    projectId,
    shotId,
    offset,
    limit,
    fetchedLimit: fetchLimit,
    rawCount: count,
    originalItemsCount,
    filteredItemsCount: items.length,
    finalItemsCount: finalItems.length,
    isVideoMode: filters?.mediaType === 'video',
    showingAllVideos: filters?.mediaType === 'video',
    total: finalTotal,
    hasMore: finalHasMore,
    appliedFilters: {
      mediaType: filters?.mediaType,
      starredOnly: filters?.starredOnly,
      excludePositioned: filters?.excludePositioned,
      searchTerm: filters?.searchTerm
    },
    includeTaskData,
    timestamp: Date.now()
  });
  
  return result;
}

// Project-wide fetch (for ImageGallery) - leverage existing fetchGenerations
async function fetchProjectWideGenerations({
  projectId,
  offset,
  limit,
  filters,
  includeTaskData
}: {
  projectId: string;
  offset: number;
  limit: number;
  filters?: UseUnifiedGenerationsOptions['filters'];
  includeTaskData: boolean;
}): Promise<UnifiedGenerationsResponse> {
  
  console.log('[VideoGenMissing] Starting project-wide generations fetch:', {
    projectId,
    offset,
    limit,
    filters,
    includeTaskData,
    visibilityState: document.visibilityState,
    timestamp: Date.now()
  });
  
  // Use existing fetchGenerations but extend with task data if needed
  const { fetchGenerations } = await import('./useGenerations');
  
  console.log('[VideoGenMissing] Calling fetchGenerations...', {
    projectId,
    limit,
    offset,
    filters,
    timestamp: Date.now()
  });
  
  const response = await fetchGenerations(projectId, limit, offset, {
    toolType: filters?.toolType,
    mediaType: filters?.mediaType,
    starredOnly: filters?.starredOnly,
  });
  
  console.log('[VideoGenMissing] fetchGenerations response:', {
    projectId,
    totalItems: response.items.length,
    totalCount: response.total,
    hasMore: response.hasMore,
    timestamp: Date.now()
  });
  
  let items: GenerationWithTask[] = response.items.map(item => ({
    ...item,
    taskId: null, // Will be populated if includeTaskData is true
  }));
  
  // Optionally fetch task data for each generation
  if (includeTaskData && items.length > 0) {
    // Batch fetch task IDs for all generations
    const generationIds = items.map(item => item.id);
    
    const { data: taskMappings } = await supabase
      .from('generations')
      .select('id, tasks')
      .in('id', generationIds);
    
    // Create lookup map
    const taskMap = new Map();
    taskMappings?.forEach(mapping => {
      const taskId = Array.isArray(mapping.tasks) && mapping.tasks.length > 0 ? mapping.tasks[0] : null;
      if (taskId) {
        taskMap.set(mapping.id, taskId);
      }
    });
    
    // Update items with task IDs
    items = items.map(item => ({
      ...item,
      taskId: taskMap.get(item.id) || null,
    }));
  }
  
  const result = {
    items,
    total: response.total,
    hasMore: response.hasMore,
  };
  
  console.log('[VideoGenMissing] Project-wide fetch completed:', {
    projectId,
    offset,
    limit,
    total: response.total,
    hasMore: response.hasMore,
    itemsReturned: items.length,
    taskDataIncluded: includeTaskData,
    itemsWithTaskData: includeTaskData ? items.filter(i => i.taskId).length : 0,
    appliedFilters: filters,
    timestamp: Date.now()
  });
  
  return result;
}

// Main hook
export function useUnifiedGenerations(options: UseUnifiedGenerationsOptions) {
  const queryClient = useQueryClient();
  const hookInstanceIdRef = React.useRef<string>(Math.random().toString(36).slice(2, 8));
  const prevCacheKeyRef = React.useRef<string>("");
  const lastSuccessSigRef = React.useRef<string>("");
  const lastStateSigRef = React.useRef<string>("");
  
  const {
    enabled = true,
    staleTime = 2 * 60 * 1000, // 2 minutes
    gcTime = 5 * 60 * 1000, // 5 minutes
    preloadTaskData = false,
  } = options;
  
  const cacheKey = getUnifiedGenerationsCacheKey(options);
  
  {
    const cacheKeyStr = cacheKey.join(':');
    if (prevCacheKeyRef.current !== cacheKeyStr) {
      prevCacheKeyRef.current = cacheKeyStr;
      console.log('[VideoGenMissing] useUnifiedGenerations hook called:', {
        instanceId: hookInstanceIdRef.current,
        mode: options.mode,
        projectId: options.projectId,
        shotId: options.shotId,
        page: options.page,
        limit: options.limit,
        filters: options.filters,
        includeTaskData: options.includeTaskData,
        preloadTaskData,
        enabled: enabled && !!options.projectId,
        cacheKey: cacheKeyStr,
        visibilityState: document.visibilityState,
        timestamp: Date.now(),
      });
    }
  }
  
  const query = useQuery({
    queryKey: cacheKey,
    queryFn: () => {
      console.log('[VideoGenMissing] Executing unified generations query:', {
        instanceId: hookInstanceIdRef.current,
        mode: options.mode,
        projectId: options.projectId,
        shotId: options.shotId,
        cacheKey: cacheKey.join(':'),
        timestamp: Date.now()
      });
      return fetchUnifiedGenerations(options);
    },
    enabled: enabled && !!options.projectId,
    staleTime,
    gcTime,
    placeholderData: (previousData) => previousData,
    // Prevent background refetches for pagination data  
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  
  // Log query results
  React.useEffect(() => {
    if (query.data) {
      const cacheKeyStr = cacheKey.join(':');
      const sig = `${cacheKeyStr}:${(query.data.items as any[])?.length || 0}:${query.data.total || 0}:${query.data.hasMore ? 1 : 0}`;
      if (lastSuccessSigRef.current !== sig) {
        lastSuccessSigRef.current = sig;
        console.log('[VideoGenMissing] Unified generations query success:', {
          instanceId: hookInstanceIdRef.current,
          mode: options.mode,
          projectId: options.projectId,
          shotId: options.shotId,
          itemsCount: query.data?.items?.length || 0,
          total: query.data?.total || 0,
          hasMore: query.data?.hasMore || false,
          cacheKey: cacheKeyStr,
          timestamp: Date.now()
        });
      }
    }
  }, [query.data, options.mode, options.projectId, options.shotId, cacheKey]);
  
  // Log query state transitions (deduped)
  React.useEffect(() => {
    const cacheKeyStr = cacheKey.join(':');
    const stateSig = `${cacheKeyStr}:${query.status}:${query.fetchStatus}:${query.isFetching ? 1 : 0}:${query.isStale ? 1 : 0}`;
    if (lastStateSigRef.current !== stateSig) {
      lastStateSigRef.current = stateSig;
      console.log('[VideoGenMissing] Query state:', {
        instanceId: hookInstanceIdRef.current,
        cacheKey: cacheKeyStr,
        status: query.status,
        fetchStatus: query.fetchStatus,
        isFetching: query.isFetching,
        isStale: query.isStale,
        timestamp: Date.now(),
      });
    }
  }, [cacheKey, query.status, query.fetchStatus, query.isFetching, query.isStale]);

  React.useEffect(() => {
    if (query.error) {
      console.error('[VideoGenMissing] Unified generations query error:', {
        mode: options.mode,
        projectId: options.projectId,
        shotId: options.shotId,
        error: query.error instanceof Error ? query.error.message : String(query.error),
        cacheKey: cacheKey.join(':'),
        timestamp: Date.now()
      });
    }
  }, [query.error, options.mode, options.projectId, options.shotId, cacheKey]);
  
  // Background task preloading
  React.useEffect(() => {
    if (preloadTaskData && query.data?.items && !options.includeTaskData) {
      // Background preload task data for hover/lightbox use
      const itemsWithoutTasks = (query.data.items as GenerationWithTask[]).filter(item => item.taskId === null);
      
      if (itemsWithoutTasks.length > 0) {
        // Throttled background preloading
        const timer = setTimeout(() => {
          preloadTaskDataInBackground(itemsWithoutTasks, queryClient);
        }, 1000);
        
        return () => clearTimeout(timer);
      }
    }
  }, [query.data?.items, preloadTaskData, options.includeTaskData, queryClient]);
  
  return query;
}

// Background task preloading utility
async function preloadTaskDataInBackground(items: GenerationWithTask[], queryClient: any) {
  const BATCH_SIZE = 5;
  
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (item) => {
      try {
        // Check if already cached
        const existingData = queryClient.getQueryData(['tasks', 'taskId', item.id]);
        if (existingData) return;
        
        // Fetch task ID
        const { data } = await supabase
          .from('generations')
          .select('tasks')
          .eq('id', item.id)
          .single();
        
        const taskId = Array.isArray(data?.tasks) && data.tasks.length > 0 ? data.tasks[0] : null;
        
        if (taskId) {
          // Cache the mapping
          queryClient.setQueryData(['tasks', 'taskId', item.id], { taskId });
          
          // Optionally prefetch the full task
          queryClient.prefetchQuery({
            queryKey: ['tasks', 'single', taskId],
            queryFn: async () => {
              const { data: taskData, error } = await supabase
                .from('tasks')
                .select('*')
                .eq('id', taskId)
                .single();
              
              if (error) throw error;
              return taskData;
            },
            staleTime: 5 * 60 * 1000,
          });
        }
      } catch (error) {
        console.warn('[UnifiedGenerations] Background task preload failed for item:', item.id, error);
      }
    }));
    
    // Throttle between batches
    if (i + BATCH_SIZE < items.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}

// Hook for getting task data from unified cache
export function useTaskFromUnifiedCache(generationId: string) {
  const queryClient = useQueryClient();
  
  return useQuery({
    queryKey: ['tasks', 'taskId', generationId],
    queryFn: async () => {
      // First try to get task ID from cache
      const cachedMapping = queryClient.getQueryData(['tasks', 'taskId', generationId]) as { taskId: string } | undefined;
      
      if (cachedMapping?.taskId) {
        return cachedMapping;
      }
      
      // Fallback: fetch task ID
      const { data, error } = await supabase
        .from('generations')
        .select('tasks')
        .eq('id', generationId)
        .single();
      
      if (error) throw error;
      
      const taskId = Array.isArray(data?.tasks) && data.tasks.length > 0 ? data.tasks[0] : null;
      return { taskId };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!generationId,
  });
}

// Utility to migrate ImageGallery to unified system (optional)
export function useUnifiedGenerationsForImageGallery(options: {
  projectId: string | null;
  page?: number;
  limit?: number;
  filters?: {
    toolType?: string;
    mediaType?: 'all' | 'image' | 'video';
    starredOnly?: boolean;
    searchTerm?: string;
  };
}) {
  return useUnifiedGenerations({
    ...options,
    mode: 'project-wide',
    includeTaskData: false,
    preloadTaskData: true, // Enable background preloading for better UX
  });
}