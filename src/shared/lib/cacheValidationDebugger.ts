/**
 * Cache Validation Debugger
 * 
 * Run in browser console to validate cache cleanup behavior.
 * Usage: window.cacheValidator.validateCacheCleanup()
 */

import { useQueryClient } from '@tanstack/react-query';

interface CacheValidationResult {
  currentPage: number;
  totalCachedPages: number;
  cachedPages: number[];
  expectedMaxPages: number;
  strategy: string;
  isValidCache: boolean;
  issues: string[];
  recommendations: string[];
}

class CacheValidator {
  validateCacheCleanup(projectId?: string): CacheValidationResult {
    // Try to get the query client from React context
    let queryClient: any;
    try {
      // This is a hack to get the query client from the global context
      const reactInstance = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__?.reactDevtoolsAgent?.reactInstances?.[0];
      if (reactInstance) {
        queryClient = reactInstance.queryClient;
      }
    } catch (e) {
      console.warn('[CacheValidator] Could not access query client directly');
    }

    if (!queryClient) {
      return {
        currentPage: 0,
        totalCachedPages: 0,
        cachedPages: [],
        expectedMaxPages: 0,
        strategy: 'unknown',
        isValidCache: false,
        issues: ['Could not access React Query client'],
        recommendations: ['Use validateCacheManually() with query client instance']
      };
    }

    return this.validateCacheManually(queryClient, projectId);
  }

  validateCacheManually(queryClient: any, projectId?: string): CacheValidationResult {
    // Auto-detect project ID if not provided
    if (!projectId) {
      const allQueries = queryClient.getQueryCache().getAll();
      const generationQuery = allQueries.find((q: any) => q.queryKey?.[0] === 'generations');
      projectId = generationQuery?.queryKey?.[1];
    }

    if (!projectId) {
      return {
        currentPage: 0,
        totalCachedPages: 0,
        cachedPages: [],
        expectedMaxPages: 0,
        strategy: 'unknown',
        isValidCache: false,
        issues: ['No project ID found in queries'],
        recommendations: ['Navigate to a page with generations first']
      };
    }

    // Get all generation queries
    const allQueries = queryClient.getQueryCache().getAll();
    const generationQueries = allQueries.filter((query: any) => {
      const queryKey = query.queryKey;
      return queryKey?.[0] === 'generations' && 
             queryKey?.[1] === projectId && 
             typeof queryKey?.[2] === 'number'; // page number
    });

    const cachedPages = generationQueries
      .map(q => q.queryKey[2])
      .sort((a, b) => a - b);

    // Try to determine current page (most recently accessed)
    const currentPage = Math.max(...cachedPages.filter(p => p !== undefined)) || 1;

    // Determine device configuration (simplified)
    const isMobile = window.innerWidth < 768;
    const hasLowMemory = (navigator as any).deviceMemory ? (navigator as any).deviceMemory < 4 : false;
    
    let expectedMaxPages: number;
    let strategy: string;

    if (hasLowMemory || isMobile) {
      expectedMaxPages = 3; // Conservative
      strategy = 'conservative';
    } else if (isMobile) {
      expectedMaxPages = 5; // Moderate
      strategy = 'moderate';
    } else {
      expectedMaxPages = 7; // Aggressive
      strategy = 'aggressive';
    }

    // Validate cache behavior
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    // Check total pages
    if (cachedPages.length > expectedMaxPages) {
      issues.push(`Too many pages cached: ${cachedPages.length} > ${expectedMaxPages}`);
      recommendations.push('Cache cleanup may not be working correctly');
    }

    // Check adjacency (pages should be current ± range)
    const keepRange = Math.floor(expectedMaxPages / 2);
    const minExpected = currentPage - keepRange;
    const maxExpected = currentPage + keepRange;
    
    const invalidPages = cachedPages.filter(page => page < minExpected || page > maxExpected);
    if (invalidPages.length > 0) {
      issues.push(`Non-adjacent pages cached: ${invalidPages.join(', ')} (current: ${currentPage}, range: ${minExpected}-${maxExpected})`);
      recommendations.push('Distant pages should be cleaned up during navigation');
    }

    const isValidCache = issues.length === 0;

    return {
      currentPage,
      totalCachedPages: cachedPages.length,
      cachedPages,
      expectedMaxPages,
      strategy,
      isValidCache,
      issues,
      recommendations
    };
  }

  logDetailedCacheState(projectId?: string) {
    const result = this.validateCacheCleanup(projectId);
    
    console.group('🗂️ Cache Validation Report');
    console.log('📊 Current State:', {
      currentPage: result.currentPage,
      totalCached: result.totalCachedPages,
      cachedPages: result.cachedPages,
      strategy: result.strategy
    });
    
    console.log('⚙️ Configuration:', {
      expectedMaxPages: result.expectedMaxPages,
      keepRange: Math.floor(result.expectedMaxPages / 2),
      deviceType: window.innerWidth < 768 ? 'mobile' : 'desktop'
    });
    
    if (result.isValidCache) {
      console.log('✅ Cache is valid - only adjacent pages cached');
    } else {
      console.log('❌ Cache validation failed');
      result.issues.forEach(issue => console.log(`  🔴 ${issue}`));
      result.recommendations.forEach(rec => console.log(`  💡 ${rec}`));
    }
    
    console.groupEnd();
    
    return result;
  }

  // Monitor cache changes in real-time
  startCacheMonitoring(projectId?: string) {
    let lastCacheState = '';
    
    const monitor = () => {
      const result = this.validateCacheManually((window as any).queryClient, projectId);
      const currentState = JSON.stringify(result.cachedPages);
      
      if (currentState !== lastCacheState) {
        console.log(`[CacheMonitor] Cache changed:`, {
          timestamp: new Date().toISOString(),
          cachedPages: result.cachedPages,
          isValid: result.isValidCache,
          issues: result.issues
        });
        lastCacheState = currentState;
      }
    };
    
    const intervalId = setInterval(monitor, 1000);
    console.log('🔍 Cache monitoring started (every 1s). Call stopCacheMonitoring() to stop.');
    
    (window as any).stopCacheMonitoring = () => {
      clearInterval(intervalId);
      console.log('⏹️ Cache monitoring stopped');
    };
    
    return intervalId;
  }
}

// Create global instance
const cacheValidator = new CacheValidator();

// Make available globally
if (typeof window !== 'undefined') {
  (window as any).cacheValidator = cacheValidator;
}

export { cacheValidator, type CacheValidationResult };
