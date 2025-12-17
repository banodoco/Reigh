/**
 * Standardized React Query configuration presets
 * 
 * USE THESE PRESETS FOR ALL NEW QUERIES to ensure consistent behavior.
 * 
 * IMPORTANT CONCEPTS:
 * - staleTime: How long data is considered "fresh" (no background refetch)
 * - gcTime: How long to keep unused data in cache before garbage collection
 * - refetchOnMount/WindowFocus/Reconnect: Automatic refetch triggers
 * 
 * Our architecture uses realtime subscriptions + mutation invalidation for
 * most data freshness. Avoid relying on automatic refetch triggers.
 */

import { UseQueryOptions } from '@tanstack/react-query';

/**
 * For queries backed by Supabase realtime subscriptions.
 * 
 * Data freshness comes from:
 * 1. Realtime events → invalidateQueries (via SimpleRealtimeProvider)
 * 2. Mutations → invalidateQueries (via useGenerationInvalidation)
 * 
 * NOT from:
 * - Auto-refetch on mount (causes cascading fetches)
 * - Auto-refetch on window focus (double-fetches with realtime)
 * 
 * USE FOR: generations, shot_generations, tasks, shots
 * 
 * @example
 * useQuery({
 *   queryKey: ['all-shot-generations', shotId],
 *   queryFn: fetchGenerations,
 *   ...QUERY_PRESETS.realtimeBacked,
 * })
 */
export const REALTIME_BACKED_PRESET = {
  staleTime: 30_000, // 30 seconds - prevents rapid refetches
  gcTime: 5 * 60 * 1000, // 5 minutes
  refetchOnMount: false, // Realtime handles freshness
  refetchOnWindowFocus: false, // Realtime handles freshness
  refetchOnReconnect: true, // Safety net after network drops
} as const satisfies Partial<UseQueryOptions>;

/**
 * For mostly-static data that rarely changes.
 * 
 * Data freshness comes from:
 * 1. Initial fetch on mount
 * 2. Manual invalidation after relevant mutations
 * 
 * USE FOR: resources, presets, user settings, API tokens, tool settings
 * 
 * @example
 * useQuery({
 *   queryKey: ['resources', projectId],
 *   queryFn: fetchResources,
 *   ...QUERY_PRESETS.static,
 * })
 */
export const STATIC_PRESET = {
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 15 * 60 * 1000, // 15 minutes
  refetchOnWindowFocus: false, // Don't refetch just because user tabbed back
} as const satisfies Partial<UseQueryOptions>;

/**
 * For truly immutable data that never changes once created.
 * 
 * USE FOR: completed task results, archived content, historical data
 * 
 * @example
 * useQuery({
 *   queryKey: ['task-result', taskId],
 *   queryFn: fetchTaskResult,
 *   ...QUERY_PRESETS.immutable,
 * })
 */
export const IMMUTABLE_PRESET = {
  staleTime: Infinity, // Never stale
  gcTime: 30 * 60 * 1000, // 30 minutes (keep in cache longer)
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const satisfies Partial<UseQueryOptions>;

/**
 * For user-specific configuration data.
 * Similar to static but with slightly shorter cache times.
 * 
 * USE FOR: user preferences, account settings, subscription status
 * 
 * @example
 * useQuery({
 *   queryKey: ['user-settings'],
 *   queryFn: fetchUserSettings,
 *   ...QUERY_PRESETS.userConfig,
 * })
 */
export const USER_CONFIG_PRESET = {
  staleTime: 2 * 60 * 1000, // 2 minutes
  gcTime: 10 * 60 * 1000, // 10 minutes
  refetchOnWindowFocus: false,
} as const satisfies Partial<UseQueryOptions>;

/**
 * All query presets as a single object for convenient imports.
 * 
 * @example
 * import { QUERY_PRESETS } from '@/shared/lib/queryDefaults';
 * 
 * useQuery({
 *   queryKey: ['my-query'],
 *   queryFn: myQueryFn,
 *   ...QUERY_PRESETS.realtimeBacked,
 * })
 */
export const QUERY_PRESETS = {
  /**
   * For queries backed by Supabase realtime (generations, tasks, shots)
   * - 30s staleTime, no auto-refetch on mount/focus
   */
  realtimeBacked: REALTIME_BACKED_PRESET,
  
  /**
   * For mostly-static data (resources, presets, settings)
   * - 5min staleTime, no refetch on focus
   */
  static: STATIC_PRESET,
  
  /**
   * For immutable data (completed tasks, historical data)
   * - Infinite staleTime, never refetches
   */
  immutable: IMMUTABLE_PRESET,
  
  /**
   * For user configuration (preferences, account settings)
   * - 2min staleTime, no refetch on focus
   */
  userConfig: USER_CONFIG_PRESET,
} as const;

/**
 * Type helper for extracting preset keys
 */
export type QueryPresetKey = keyof typeof QUERY_PRESETS;

/**
 * Standard retry configuration for most queries.
 * Don't retry aborted/cancelled requests or client errors.
 */
export const STANDARD_RETRY = (failureCount: number, error: Error) => {
  // Don't retry aborts or cancelled requests
  if (error?.message?.includes('abort') || 
      error?.message?.includes('Request was cancelled')) {
    return false;
  }
  // Don't retry client errors (4xx)
  if ((error as any)?.code === 'PGRST116' || 
      error?.message?.includes('Invalid') ||
      (error as any)?.status >= 400 && (error as any)?.status < 500) {
    return false;
  }
  // Retry up to 2 times for other errors
  return failureCount < 2;
};

/**
 * Standard retry delay with exponential backoff (capped at 3s)
 */
export const STANDARD_RETRY_DELAY = (attemptIndex: number) => 
  Math.min(1000 * Math.pow(2, attemptIndex), 3000);
