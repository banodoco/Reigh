/**
 * useGenerationInvalidation.ts
 * 
 * Centralized hook for invalidating generation-related React Query caches.
 * 
 * Why this exists:
 * - 19 different places were calling invalidateQueries with different combinations
 * - Inconsistent patterns led to stale data or excessive invalidation
 * - No visibility into what triggered invalidations
 * 
 * Usage:
 *   const invalidateGenerations = useInvalidateGenerations();
 *   invalidateGenerations(shotId, { reason: 'delete-image' });
 * 
 * For variant changes (no shotId needed):
 *   invalidateVariantChange(queryClient, { generationId, reason: 'set-primary' });
 * 
 * Scopes:
 * - 'all': All generation-related queries (default)
 * - 'images': Just image data (all-shot-generations, shot-generations)
 * - 'metadata': Just metadata (shot-generations-meta)
 * - 'counts': Just counts (unpositioned-count)
 * - 'unified': Just unified-generations queries
 */

import { useQueryClient, QueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { debugConfig } from '../lib/debugConfig';

export type InvalidationScope = 
  | 'all'           // All generation-related queries for a shot
  | 'images'        // Just image data (all-shot-generations, shot-generations)
  | 'metadata'      // Just metadata (shot-generations-meta)
  | 'counts'        // Just counts (unpositioned-count)
  | 'unified';      // Just unified-generations queries

export interface InvalidationOptions {
  /** Which queries to invalidate. Default: 'all' */
  scope?: InvalidationScope;
  /** Debug reason for logging. Required for traceability. */
  reason: string;
  /** Delay invalidation by this many ms (for batching rapid changes) */
  delayMs?: number;
  /** Also invalidate the 'shots' query for the project (e.g., for thumbnail updates) */
  includeShots?: boolean;
  /** Project ID - required if includeShots is true */
  projectId?: string;
  /** Also invalidate unified-generations at project level */
  includeProjectUnified?: boolean;
}

/**
 * Options for variant-specific invalidation.
 * Use when a variant is created/updated/set-as-primary.
 */
export interface VariantInvalidationOptions {
  /** Debug reason for logging. Required for traceability. */
  reason: string;
  /** Generation ID that the variant belongs to */
  generationId: string;
  /** Optional: specific shot ID to prioritize (will refetch immediately before global invalidation) */
  shotId?: string;
  /** Optional: project ID for project-scoped unified-generations invalidation */
  projectId?: string;
  /** Delay before invalidation (e.g., 100ms for DB trigger to complete) */
  delayMs?: number;
}

/**
 * Options for generation update invalidation.
 * Use when a generation's data changes (not variant-related).
 */
export interface GenerationUpdateOptions {
  /** Debug reason for logging. Required for traceability. */
  reason: string;
  /** Generation ID that was updated */
  generationId: string;
  /** Optional: project ID for project-scoped invalidation */
  projectId?: string;
}

/**
 * Internal helper that performs the actual invalidation.
 * Extracted so it can be used with or without React hooks.
 */
function performInvalidation(
  queryClient: QueryClient,
  shotId: string,
  options: InvalidationOptions
): void {
  const { 
    scope = 'all', 
    reason, 
    includeShots = false,
    projectId,
    includeProjectUnified = false
  } = options;
  
  // Debug logging via centralized config
  if (debugConfig.isEnabled('invalidation')) {
    console.log(`[Invalidation] ${reason}`, { 
      shotId: shotId.substring(0, 8), 
      scope,
      includeShots,
      includeProjectUnified,
      timestamp: Date.now()
    });
  }
  
  // Invalidate based on scope
  if (scope === 'all' || scope === 'images') {
    queryClient.invalidateQueries({ queryKey: ['all-shot-generations', shotId] });
    queryClient.invalidateQueries({ queryKey: ['shot-generations', shotId] });
  }
  
  if (scope === 'all' || scope === 'unified') {
    queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shotId] });
  }
  
  if (scope === 'all' || scope === 'metadata') {
    queryClient.invalidateQueries({ queryKey: ['shot-generations-meta', shotId] });
  }
  
  if (scope === 'all' || scope === 'counts') {
    queryClient.invalidateQueries({ queryKey: ['unpositioned-count', shotId] });
  }
  
  // Optional: include shots query
  if (includeShots && projectId) {
    queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
  }
  
  // Optional: include project-level unified generations
  if (includeProjectUnified && projectId) {
    queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', projectId] });
  }
}

/**
 * Hook that returns a stable invalidation function.
 * Use this in React components/hooks.
 */
export function useInvalidateGenerations() {
  const queryClient = useQueryClient();
  const timeoutRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  
  return useCallback((shotId: string, options: InvalidationOptions) => {
    const { delayMs } = options;
    
    // If there's already a pending invalidation for this shotId, clear it
    const existingTimeout = timeoutRefs.current.get(shotId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      timeoutRefs.current.delete(shotId);
    }
    
    if (delayMs && delayMs > 0) {
      // Delayed invalidation (useful for batching rapid changes)
      const timeout = setTimeout(() => {
        performInvalidation(queryClient, shotId, options);
        timeoutRefs.current.delete(shotId);
      }, delayMs);
      timeoutRefs.current.set(shotId, timeout);
    } else {
      // Immediate invalidation
      performInvalidation(queryClient, shotId, options);
    }
  }, [queryClient]);
}

/**
 * Non-hook version for use outside React components (e.g., in event handlers).
 * Requires passing in the queryClient.
 */
export function invalidateGenerationsSync(
  queryClient: QueryClient,
  shotId: string,
  options: InvalidationOptions
): void {
  if (options.delayMs && options.delayMs > 0) {
    setTimeout(() => {
      performInvalidation(queryClient, shotId, options);
    }, options.delayMs);
  } else {
    performInvalidation(queryClient, shotId, options);
  }
}

/**
 * Invalidate ALL shots (dangerous - use sparingly).
 * This is for global events where we don't know which specific shot was affected.
 * Logs a warning to encourage scoped invalidation.
 */
export function invalidateAllShotGenerations(
  queryClient: QueryClient,
  reason: string
): void {
  if (debugConfig.isEnabled('invalidation')) {
    console.warn(`[Invalidation] ⚠️ GLOBAL invalidation: ${reason}`, {
      message: 'Consider scoping to specific shotIds if possible',
      timestamp: Date.now()
    });
  }
  
  // Use predicate to invalidate all shot-generations queries regardless of shotId
  queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === 'all-shot-generations'
  });
  queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === 'shot-generations'
  });
}

/**
 * Invalidate caches after a variant change (create, update, set-as-primary).
 * 
 * This handles the variant → generation → shot cascade:
 * - A variant belongs to a generation
 * - A generation can appear in multiple shots (via shot_generations)
 * - When the primary variant changes, generations.location changes
 * - This affects Timeline/Batch mode displays
 * 
 * @param queryClient - React Query client
 * @param options - Invalidation options including generationId and reason
 */
export async function invalidateVariantChange(
  queryClient: QueryClient,
  options: VariantInvalidationOptions
): Promise<void> {
  const { reason, generationId, shotId, projectId, delayMs } = options;
  
  // Apply delay if specified (e.g., for DB trigger to complete)
  if (delayMs && delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  
  if (debugConfig.isEnabled('invalidation')) {
    console.log(`[Invalidation] Variant change: ${reason}`, {
      generationId: generationId.substring(0, 8),
      shotId: shotId?.substring(0, 8) || 'unknown',
      projectId: projectId?.substring(0, 8) || 'unknown',
      timestamp: Date.now()
    });
  }
  
  // 1. Invalidate variant-specific queries
  queryClient.invalidateQueries({ queryKey: ['generation-variants', generationId] });
  queryClient.invalidateQueries({ queryKey: ['generation', generationId] });
  
  // 2. If we know the shot, refetch it immediately for faster UI update
  if (shotId) {
    await queryClient.refetchQueries({ queryKey: ['all-shot-generations', shotId] });
  }
  
  // 3. Invalidate all shot-generations (generation might be in multiple shots)
  queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === 'all-shot-generations'
  });
  queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === 'shot-generations'
  });
  
  // 4. Invalidate generation galleries - cover ALL key patterns for compatibility
  queryClient.invalidateQueries({ queryKey: ['unified-generations'] }); // Legacy
  queryClient.invalidateQueries({ queryKey: ['generations'] });
  
  // 5. If projectId provided, also invalidate project-scoped queries
  if (projectId) {
    queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', projectId] });
  }
}

/**
 * Invalidate caches after a generation is updated (non-variant changes).
 * 
 * Use this when:
 * - Generation's location/thumbnail is directly updated
 * - Generation's metadata is cleared/changed
 * - Generation is deleted
 * 
 * This is lighter-weight than invalidateVariantChange - it doesn't
 * touch shot-generations caches since the generation-shot relationship
 * isn't changing.
 * 
 * @param queryClient - React Query client
 * @param options - Invalidation options including generationId and reason
 */
export function invalidateGenerationUpdate(
  queryClient: QueryClient,
  options: GenerationUpdateOptions
): void {
  const { reason, generationId, projectId } = options;
  
  if (debugConfig.isEnabled('invalidation')) {
    console.log(`[Invalidation] Generation update: ${reason}`, {
      generationId: generationId.substring(0, 8),
      projectId: projectId?.substring(0, 8) || 'unknown',
      timestamp: Date.now()
    });
  }
  
  // 1. Invalidate the specific generation
  queryClient.invalidateQueries({ queryKey: ['generation', generationId] });
  
  // 2. Invalidate generation galleries - cover ALL key patterns
  queryClient.invalidateQueries({ queryKey: ['unified-generations'] }); // Legacy
  queryClient.invalidateQueries({ queryKey: ['generations'] });
  
  // 3. If projectId provided, also invalidate project-scoped queries
  if (projectId) {
    queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', projectId] });
  }
  
  // 4. Invalidate derived-generations (for child/variant galleries)
  queryClient.invalidateQueries({ queryKey: ['derived-generations'] });
}
