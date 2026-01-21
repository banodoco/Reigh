/**
 * useCacheCleanup
 *
 * Cleans up distant page queries from React Query cache to prevent memory bloat.
 * This is a separate concern from preloading.
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clearCacheForImages } from '@/shared/lib/imageCacheManager';

export interface UseCacheCleanupProps {
  /** Project ID to scope cleanup to */
  projectId: string | null;
  /** Current page (0-indexed) */
  currentPage: number;
  /** Maximum pages to keep cached (default: 5) */
  maxCachedPages?: number;
  /** Whether cleanup is enabled */
  enabled?: boolean;
}

/**
 * Cleans up distant page queries to prevent memory bloat.
 * Keeps pages within ±(maxCachedPages/2) of current page.
 */
export function useCacheCleanup({
  projectId,
  currentPage,
  maxCachedPages = 5,
  enabled = true,
}: UseCacheCleanupProps): void {
  const queryClient = useQueryClient();
  const lastCleanupPageRef = useRef<number>(-1);

  useEffect(() => {
    if (!enabled || !projectId) {
      return;
    }

    // Only cleanup when page changes significantly (every 2 pages)
    // This avoids cleaning up on every single page change
    if (Math.abs(currentPage - lastCleanupPageRef.current) < 2) {
      return;
    }

    lastCleanupPageRef.current = currentPage;

    const keepRange = Math.floor(maxCachedPages / 2);

    // Find all generation queries for this project
    const allQueries = queryClient.getQueryCache().getAll();

    const queriesToRemove: Array<{ query: any; page: number }> = [];

    allQueries.forEach((query) => {
      const key = query.queryKey as any[];

      if (!Array.isArray(key)) return;

      // Match legacy format: ['generations', projectId, page]
      if (key[0] === 'generations' && key[1] === projectId) {
        const page = key[2];
        if (typeof page === 'number' && Math.abs(page - currentPage) > keepRange) {
          queriesToRemove.push({ query, page });
        }
        return;
      }

      // Match unified format: ['unified-generations', 'project', projectId, page, ...]
      if (key[0] === 'unified-generations' && key[1] === 'project' && key[2] === projectId) {
        const page = key[3];
        if (typeof page === 'number' && Math.abs(page - currentPage) > keepRange) {
          queriesToRemove.push({ query, page });
        }
      }
    });

    // Remove distant queries
    if (queriesToRemove.length > 0) {
      queriesToRemove.forEach(({ query }) => {
        // Clear image cache flags for removed pages
        const data = query.state?.data;
        if (data?.items) {
          clearCacheForImages(data.items);
        }

        // Remove the query from cache
        queryClient.removeQueries({ queryKey: query.queryKey });
      });

      console.log(`[CacheCleanup] Removed ${queriesToRemove.length} distant page(s):`, {
        removed: queriesToRemove.map((q) => q.page).sort((a, b) => a - b),
        currentPage,
        keepRange,
      });
    }
  }, [projectId, currentPage, maxCachedPages, enabled, queryClient]);
}

/**
 * Clear all generation caches for a project (useful on project switch)
 */
export function useClearProjectCache(projectId: string | null): () => void {
  const queryClient = useQueryClient();

  return () => {
    if (!projectId) return;

    queryClient.removeQueries({
      predicate: (query) => {
        const key = query.queryKey as any[];
        if (!Array.isArray(key)) return false;

        // Match any generation query for this project
        if (key[0] === 'generations' && key[1] === projectId) return true;
        if (key[0] === 'unified-generations' && key[2] === projectId) return true;

        return false;
      },
    });

    console.log(`[CacheCleanup] Cleared all caches for project: ${projectId}`);
  };
}
