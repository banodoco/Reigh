import React, { useCallback } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { GeneratedImageWithMetadata } from '@/shared/components/ImageGallery';
import { GenerationRow } from '@/types/shots';
import { supabase } from '@/integrations/supabase/client';
import { useSmartPollingConfig } from './useSmartPolling';
import { useQueryDebugLogging, QueryDebugConfigs } from './useQueryDebugLogging';
import { transformForUnifiedGenerations, type RawShotGeneration, calculateDerivedCounts } from '@/shared/lib/generationTransformers';
import { mapDbTaskToTask } from './useTasks';

// Extended interface that includes task data
export interface GenerationWithTask extends GeneratedImageWithMetadata {
  taskId?: string | null;
  taskData?: any; // Full task object when fetched
  shotImageEntryId?: string; // For shot-specific operations
  position?: number | null;
  updatedAt?: string | null; // For timestamp display (prefer over createdAt)
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
// 🚀 OPTIMIZED: Query generations.shot_id directly (no JOIN) for 10x faster performance
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
  
  console.log('[VideoGenMissing] Starting OPTIMIZED shot-specific generations fetch (direct query):', {
    projectId,
    shotId,
    offset,
    limit,
    filters,
    includeTaskData,
    visibilityState: document.visibilityState,
    optimizationType: 'direct shot_data JSONB query (no join)',
    timestamp: Date.now()
  });
  
  // 🚀 Query generations table directly using shot_data JSONB column (GIN indexed)
  // This is ~10x faster than joining through shot_generations
  let dataQuery = supabase
    .from('generations')
    .select(`
      id,
      location,
      thumbnail_url,
      type,
      created_at,
      updated_at,
      params,
      starred,
      name,
      shot_data${includeTaskData ? ',tasks' : ''}
    `, { count: 'exact' })
    .eq('project_id', projectId)
    .eq('is_child', false); // Exclude child generations - only show parents

  // Apply shot filter - check if generation is in this shot
  // shot_data format: { shot_id: [frame1, frame2, ...] } (array of timeline_frames)
  // Check that the key exists (generation is in this shot)
  dataQuery = dataQuery.not(`shot_data->${shotId}`, 'is', null);
  
  // Add positioned filter if needed
  if (filters?.excludePositioned) {
    // Show only unpositioned items: value is null or -1 (sentinel for unpositioned)
    // Handle both data formats:
    // - Single-value format: { "shot_id": null } or { "shot_id": -1 }
    // - Array format: { "shot_id": [null] } or { "shot_id": [-1] }
    dataQuery = dataQuery.or(`shot_data->${shotId}.eq.null,shot_data->${shotId}.eq.-1,shot_data->${shotId}.cs.[null],shot_data->${shotId}.cs.[-1]`);
  }
  
  // Apply media type filter at database level for performance
  if (filters?.mediaType === 'video') {
    dataQuery = dataQuery.like('type', '%video%');
  } else if (filters?.mediaType === 'image') {
    dataQuery = dataQuery.not('type', 'like', '%video%');
  }

  // Apply starred filter at DB level
  if (filters?.starredOnly) {
    dataQuery = dataQuery.eq('starred', true);
  }
  
  // Apply ordering by created_at (can't order by JSONB value efficiently)
  dataQuery = dataQuery.order('created_at', { ascending: false });
  
  // Execute query with count
  console.log('[VideoGenMissing] Executing shot-specific query with exact count...', {
    projectId,
    shotId,
    offset,
    limit,
    fetchingLimit: limit + 1,
    queryOptimization: 'Using indexed generations.shot_id column',
    timestamp: Date.now()
  });
  
  const { data, count, error: dataError } = await dataQuery.range(offset, offset + limit);
  
  console.log('[VideoGenMissing] OPTIMIZED shot-specific query results:', {
    projectId,
    shotId,
    dataLength: data?.length,
    dataError: dataError?.message,
    eliminatedJoin: true,
    eliminatedCountQuery: true,
    timestamp: Date.now()
  });
  
  if (dataError) {
    console.error('[VideoGenMissing] Shot-specific data query failed:', {
      projectId,
      shotId,
      error: dataError,
      timestamp: Date.now()
    });
    throw dataError;
  }
  
  // Transform data - extract timeline_frame from shot_data JSONB
  // shot_data format: { shot_id: [frame1, frame2, ...] } (array of timeline_frames)
  let items = (data || [])
    .map((gen: any) => {
      // Transform generation data
      const isVideo = gen.type?.toLowerCase().includes('video');
      const metadata = gen.params || {};
      
      // Extract timeline_frame from shot_data JSONB for this specific shot
      // shot_data format: { shot_id: [frame1, frame2, ...] } (array of timeline_frames)
      // Get first non-null value, or null if all are null
      const shotFrames = gen.shot_data?.[shotId];
      let timelineFrame: number | null = null;
      if (Array.isArray(shotFrames)) {
        // Find first non-null frame in array
        timelineFrame = shotFrames.find((f: any) => f !== null && f !== undefined) ?? null;
      } else if (shotFrames !== null && shotFrames !== undefined) {
        // Handle legacy single-value format (backwards compat during migration)
        timelineFrame = shotFrames;
      }
      
      return {
        id: gen.id,
        url: gen.location || '',
        thumbUrl: gen.thumbnail_url || gen.location || '',
        prompt: metadata?.prompt || metadata?.originalParams?.prompt || '',
        metadata,
        createdAt: gen.created_at,
        updatedAt: gen.updated_at, // Include updated_at for timestamp display
        isVideo,
        starred: gen.starred || false,
        name: gen.name,
        position: timelineFrame,
        taskId: includeTaskData && gen.tasks ? (Array.isArray(gen.tasks) ? gen.tasks[0] : gen.tasks) : undefined,
        taskData: includeTaskData && gen.tasks ? gen.tasks : undefined,
      } as GenerationWithTask;
    });
  
  // Badge data (derivedCount, hasUnviewedVariants, unviewedVariantCount) is now loaded
  // lazily via useVariantBadges hook to avoid blocking gallery display

  console.log('[VideoGenMissing] Raw transformed items before sorting and filtering:', {
    projectId,
    shotId,
    totalItems: items.length,
    videoItems: items.filter(i => i.isVideo).length,
    imageItems: items.filter(i => !i.isVideo).length,
    itemDetails: items.slice(0, 5).map(item => ({
      id: item.id,
      type: item.isVideo ? 'video' : 'image',
      position: item.position,
      createdAt: item.createdAt
    })),
    timestamp: Date.now()
  });

  // 🎯 REVERTED: Position-based sorting removed to restore strict chronological order
  // The database query already applies .order('created_at', { ascending: false })
  // items.sort((a, b) => { ... });
  
  // Store original count before client-side filtering
  const originalItemsCount = items.length;
  
  // Apply remaining client-side filters (mediaType and starredOnly now handled at DB level)
  
  if (filters?.searchTerm?.trim()) {
    const searchTerm = filters.searchTerm.toLowerCase();
    items = items.filter(item => 
      item.prompt?.toLowerCase().includes(searchTerm)
    );
  }
  
  // Use real count if available
  const hasMore = items.length > limit;
  const finalItems = items.slice(0, limit);
  
  // Use exact count from DB if available (handles pagination correctly)
  // Otherwise fallback to estimation (limit + 1 pattern)
  const finalTotal = (count !== null && count !== undefined) 
    ? count 
    : (hasMore ? offset + finalItems.length + 1 : offset + finalItems.length);
    
  const finalHasMore = (count !== null && count !== undefined)
    ? (offset + finalItems.length < count)
    : hasMore;
  
  const result = { items: finalItems, total: finalTotal, hasMore: finalHasMore };
  
  console.log('[VideoGenMissing] Shot-specific fetch completed:', {
    projectId,
    shotId,
    offset,
    limit,
    eliminatedCountQuery: true,
    originalItemsCount,
    filteredItemsCount: items.length,
    finalItemsCount: finalItems.length,
    mediaTypeFilter: filters?.mediaType,
    dbLevelFiltering: true,
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

  // [GalleryPollingDebug] Add comprehensive logging for useUnifiedGenerations (gated to prevent spam)
  if (options.enabled && options.projectId && (options.mode !== 'shot-specific' || options.shotId)) {
    console.log('[GalleryPollingDebug:useUnifiedGenerations] Hook called with:', {
      instanceId: hookInstanceIdRef.current,
      mode: options.mode,
      projectId: options.projectId,
      shotId: options.shotId,
      page: options.page,
      limit: options.limit,
      filters: options.filters,
      enabled: options.enabled,
      timestamp: Date.now()
    });
  }
  
  const {
    enabled = true,
    staleTime = 2 * 60 * 1000, // 2 minutes
    gcTime = 5 * 60 * 1000, // 5 minutes
    preloadTaskData = false,
  } = options;
  
  const effectiveProjectId = options.projectId ?? (typeof window !== 'undefined' ? (window as any).__PROJECT_CONTEXT__?.selectedProjectId : null);
  const cacheKey = getUnifiedGenerationsCacheKey({ ...options, projectId: effectiveProjectId });
  
  {
    const cacheKeyStr = cacheKey.join(':');
    if (options.enabled && options.projectId && (options.mode !== 'shot-specific' || options.shotId) && prevCacheKeyRef.current !== cacheKeyStr) {
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

  // 🎯 SMART POLLING: Use DataFreshnessManager for intelligent polling decisions
  const smartPollingConfig = useSmartPollingConfig(['unified-generations', effectiveProjectId, options.mode]);
  
  const query = useQuery({
    queryKey: cacheKey,
    queryFn: () => {
      // Snapshot realtime state at fetch start for correlation
      // 🎯 FIX: Use channel subscription state instead of internal socket API (which changed in newer Supabase versions)
      try {
        const channels = (supabase as any)?.getChannels ? (supabase as any).getChannels() : [];
        // Check if any channel is in 'joined' state (properly subscribed)
        const hasSubscribedChannel = channels.some((c: any) => c.state === 'joined');
        console.log('[ReconnectionIssue][UnifiedGenerations] Fetch start realtime snapshot', {
          connected: hasSubscribedChannel,
          channelCount: channels?.length || 0,
          channelStates: (channels || []).slice(0, 5).map((c: any) => ({ topic: c.topic, state: c.state })),
          visibility: document.visibilityState,
          timestamp: Date.now(),
        });
      } catch {}
      if (options.enabled && options.projectId && (options.mode !== 'shot-specific' || options.shotId)) {
        console.log('[VideoGenMissing] Executing unified generations query:', {
          instanceId: hookInstanceIdRef.current,
          mode: options.mode,
          projectId: options.projectId,
          shotId: options.shotId,
          cacheKey: cacheKey.join(':'),
          timestamp: Date.now()
        });
      }
      return fetchUnifiedGenerations({ ...options, projectId: effectiveProjectId });
    },
    enabled: enabled && !!effectiveProjectId,
    gcTime,
    // 🎯 PLACEHOLDER DATA: Use keepPreviousData for smooth transitions
    // This is smart enough to only keep data when query structure is similar (pagination/filters),
    // but NOT when fundamental keys change (shotId/projectId), preventing cross-shot contamination
    placeholderData: keepPreviousData,
    // Synchronously grab initial data from cache to prevent skeletons on revisit
    initialData: () => queryClient.getQueryData(cacheKey),
    // 🎯 SMART POLLING: Intelligent polling based on realtime health
    ...smartPollingConfig,
    refetchIntervalInBackground: true, // CRITICAL: Continue polling when tab is not visible
    refetchOnWindowFocus: false, // Prevent double-fetches
    refetchOnReconnect: false, // Prevent double-fetches
    // Note: onSettled removed due to TypeScript issues - using useEffect below instead
  });

  // 🎯 MODULAR LOGGING: Standardized debug logging with data signature tracking
  useQueryDebugLogging(query, QueryDebugConfigs.unifiedGenerations({
    instanceId: hookInstanceIdRef.current,
    mode: options.mode,
    projectId: options.projectId,
    shotId: options.shotId,
    page: options.page,
    limit: options.limit,
    filters: options.filters,
    enabled: options.enabled
  }));
  
  // Log query results (original logging preserved)
  React.useEffect(() => {
    if (query.data && options.enabled && options.projectId && (options.mode !== 'shot-specific' || options.shotId)) {
      try {
        // 🎯 FIX: Use channel subscription state instead of internal socket API
        const channels = (supabase as any)?.getChannels ? (supabase as any).getChannels() : [];
        const hasSubscribedChannel = channels.some((c: any) => c.state === 'joined');
        console.log('[ReconnectionIssue][UnifiedGenerations] Success realtime snapshot', {
          connected: hasSubscribedChannel,
          channelCount: channels?.length || 0,
          channelStates: (channels || []).slice(0, 5).map((c: any) => ({ topic: c.topic, state: c.state })),
          visibility: document.visibilityState,
          timestamp: Date.now(),
        });
      } catch {}
      const cacheKeyStr = cacheKey.join(':');
      const sig = `${cacheKeyStr}:${(query.data as any)?.items?.length || 0}:${(query.data as any)?.total || 0}:${(query.data as any)?.hasMore ? 1 : 0}`;
      if (lastSuccessSigRef.current !== sig) {
        lastSuccessSigRef.current = sig;
        console.log('[VideoGenMissing] Unified generations query success:', {
          instanceId: hookInstanceIdRef.current,
          mode: options.mode,
          projectId: options.projectId,
          shotId: options.shotId,
          itemsCount: (query.data as any)?.items?.length || 0,
          total: (query.data as any)?.total || 0,
          hasMore: (query.data as any)?.hasMore || false,
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
    if (options.enabled && options.projectId && (options.mode !== 'shot-specific' || options.shotId) && lastStateSigRef.current !== stateSig) {
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
    if (query.error && options.enabled && options.projectId && (options.mode !== 'shot-specific' || options.shotId)) {
      try {
        // 🎯 FIX: Use channel subscription state instead of internal socket API
        const channels = (supabase as any)?.getChannels ? (supabase as any).getChannels() : [];
        const hasSubscribedChannel = channels.some((c: any) => c.state === 'joined');
        console.warn('[ReconnectionIssue][UnifiedGenerations] Error realtime snapshot', {
          connected: hasSubscribedChannel,
          channelCount: channels?.length || 0,
          channelStates: (channels || []).slice(0, 5).map((c: any) => ({ topic: c.topic, state: c.state })),
          visibility: document.visibilityState,
          timestamp: Date.now(),
        });
      } catch {}
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
    if (preloadTaskData && (query.data as any)?.items && !options.includeTaskData) {
      // Background preload task data for hover/lightbox use
      const itemsWithoutTasks = ((query.data as any)?.items as GenerationWithTask[] || []).filter(item => item.taskId === null);
      
      if (itemsWithoutTasks.length > 0) {
        // Throttled background preloading
        const timer = setTimeout(() => {
          preloadTaskDataInBackground(itemsWithoutTasks, queryClient);
        }, 1000);
        
        return () => clearTimeout(timer);
      }
    }
  }, [(query.data as any)?.items, preloadTaskData, options.includeTaskData, queryClient]);
  
  // Track query state changes for UI update debugging
  React.useEffect(() => {
    if (options.enabled && options.projectId && (options.mode !== 'shot-specific' || options.shotId)) {
      console.warn('[ReconnectionIssue][UI_UPDATE_TRACE] UnifiedGenerations query state change', {
        instanceId: hookInstanceIdRef.current,
        cacheKey: cacheKey.join(':'),
        status: query.status,
        fetchStatus: query.fetchStatus,
        isFetching: query.isFetching,
        isStale: query.isStale,
        hasData: !!query.data,
        itemCount: (query.data as any)?.items?.length || 0,
        timestamp: Date.now()
      });
    }
  }, [query.status, query.fetchStatus, query.isFetching, query.isStale, query.data, cacheKey, options.enabled, options.projectId, options.shotId, options.mode]);
  
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
              // Transform to match useGetTask format
              return mapDbTaskToTask(taskData);
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
// Uses immutable caching since generation→task mapping never changes once created
export function useTaskFromUnifiedCache(generationId: string) {
  const result = useQuery({
    queryKey: ['tasks', 'taskId', generationId],
    queryFn: async () => {
      // Fetch task ID from generations table
      // Note: React Query won't call this if data is cached (staleTime: Infinity)
      const { data, error } = await supabase
        .from('generations')
        .select('tasks')
        .eq('id', generationId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      // Return null taskId if generation doesn't exist or has no tasks
      if (!data) {
        return { taskId: null };
      }

      const taskId = Array.isArray(data?.tasks) && data.tasks.length > 0 ? data.tasks[0] : null;
      return { taskId };
    },
    // Generation→task mapping is immutable - cache aggressively
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !!generationId,
  });

  return result;
}

/**
 * Hook to prefetch task data for a generation on hover.
 * Returns a function that can be called onMouseEnter to prefetch
 * both the task ID mapping and the full task data.
 */
export function usePrefetchTaskData() {
  const queryClient = useQueryClient();

  const prefetch = useCallback(async (generationId: string) => {
    if (!generationId) return;

    // Check if task ID mapping is already cached (including { taskId: null } for no-task generations)
    let taskId: string | null = null;
    const cachedMapping = queryClient.getQueryData(['tasks', 'taskId', generationId]) as { taskId: string | null } | undefined;

    if (cachedMapping !== undefined) {
      // Already cached - use the cached value (could be null if no task)
      taskId = cachedMapping.taskId;
    } else {
      // Not cached - fetch the task ID mapping
      try {
        const result = await queryClient.fetchQuery({
          queryKey: ['tasks', 'taskId', generationId],
          queryFn: async () => {
            const { data, error } = await supabase
              .from('generations')
              .select('tasks')
              .eq('id', generationId)
              .maybeSingle();

            if (error) throw error;
            if (!data) return { taskId: null };

            const fetchedTaskId = Array.isArray(data?.tasks) && data.tasks.length > 0 ? data.tasks[0] : null;
            return { taskId: fetchedTaskId };
          },
          staleTime: Infinity,
        });
        taskId = result?.taskId ?? null;
      } catch {
        return;
      }
    }

    // Prefetch the full task data if we have a task ID and it's not cached
    if (taskId) {
      const cachedTask = queryClient.getQueryData(['tasks', 'single', taskId]);
      if (!cachedTask) {
        try {
          await queryClient.fetchQuery({
            queryKey: ['tasks', 'single', taskId],
            queryFn: async () => {
              const { data, error } = await supabase
                .from('tasks')
                .select('*')
                .eq('id', taskId)
                .single();

              if (error) throw error;
              // Transform to match useGetTask format
              return mapDbTaskToTask(data);
            },
            staleTime: Infinity,
          });
        } catch {
          // Silently fail - prefetch is best-effort
        }
      }
    }
  }, [queryClient]);

  return prefetch;
}

/**
 * Hook to prefetch a task directly by task ID.
 * Use this when you already have the task ID (e.g., from variant.params.source_task_id).
 */
export function usePrefetchTaskById() {
  const queryClient = useQueryClient();

  const prefetch = useCallback(async (taskId: string) => {
    if (!taskId) return;

    // Check if already cached
    const cached = queryClient.getQueryData(['tasks', 'single', taskId]);
    if (cached) {
      console.log('[TaskPrefetch] Task already cached:', taskId.substring(0, 8));
      return;
    }

    console.log('[TaskPrefetch] Prefetching task by ID:', taskId.substring(0, 8));
    try {
      await queryClient.fetchQuery({
        queryKey: ['tasks', 'single', taskId],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', taskId)
            .single();

          if (error) throw error;
          return mapDbTaskToTask(data);
        },
        staleTime: Infinity,
      });
    } catch {
      // Silently fail - prefetch is best-effort
    }
  }, [queryClient]);

  return prefetch;
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