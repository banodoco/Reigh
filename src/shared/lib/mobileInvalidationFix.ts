import { QueryClient } from '@tanstack/react-query';

/**
 * Simple mobile-optimized invalidation fix
 * Reduces multiple simultaneous invalidations that cause race conditions
 */

export const isMobile = () => typeof window !== 'undefined' && window.innerWidth <= 768;

/**
 * Mobile-optimized project invalidation
 * Batches invalidations and uses shorter delays on mobile
 */
export const invalidateProjectQueriesMobile = async (
  queryClient: QueryClient,
  projectId: string,
  shotId?: string,
  options?: {
    skipGenerations?: boolean;
    skipShots?: boolean;
    skipUnpositioned?: boolean;
    immediate?: boolean;
  }
) => {
  const mobile = isMobile();
  const { skipGenerations, skipShots, skipUnpositioned, immediate } = options || {};
  
  console.log(`[RaceConditionFix] ${mobile ? '📱' : '🖥️'} Batched invalidation for project ${projectId}`);
  
  const invalidations: Promise<void>[] = [];
  
  // Add invalidations to batch
  if (!skipShots) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['shots', projectId] }));
  }
  
  if (!skipGenerations) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', projectId] }));
  }
  
  if (!skipUnpositioned && shotId) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['unpositioned-count', shotId] }));
  }
  
  if (invalidations.length === 0) return;
  
  // On mobile, add a small delay to prevent overwhelming the device
  if (mobile && !immediate) {
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  
  // Execute all invalidations simultaneously
  try {
    await Promise.all(invalidations);
    console.log(`[RaceConditionFix] ✅ Completed ${invalidations.length} invalidations`);
  } catch (error) {
    console.error('[RaceConditionFix] ❌ Invalidation batch failed:', error);
  }
};
