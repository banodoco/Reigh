import React from 'react';

/**
 * Modular debug logging for React Query results.
 * Reduces boilerplate across gallery and task components.
 */

export interface QueryDebugConfig {
  /** Tag for logging (e.g., 'useGenerations', 'usePaginatedTasks') */
  hookName: string;
  /** Additional context to include in logs */
  context?: Record<string, any>;
  /** Whether to log data signatures for change detection */
  trackDataSignature?: boolean;
  /** Function to extract signature from data */
  getDataSignature?: (data: any) => string;
  /** Function to extract items count from data */
  getItemsCount?: (data: any) => number;
  /** Function to extract total count from data */
  getTotalCount?: (data: any) => number;
}

/**
 * Hook to add consistent debug logging to React Query results.
 * Logs hook calls, query state changes, and data updates.
 */
export function useQueryDebugLogging<TData = unknown>(
  query: {
    data?: TData;
    isLoading: boolean;
    isFetching: boolean;
    isError: boolean;
    error: Error | null;
    status: string;
    fetchStatus: string;
  },
  config: QueryDebugConfig
) {
  const {
    hookName,
    context = {},
    trackDataSignature = false,
    getDataSignature,
    getItemsCount,
    getTotalCount
  } = config;

  // Log query state changes
  React.useEffect(() => {
    const logData: any = {
      ...context,
      isLoading: query.isLoading,
      isFetching: query.isFetching,
      isError: query.isError,
      hasData: !!query.data,
      errorMessage: query.error?.message,
      status: query.status,
      fetchStatus: query.fetchStatus,
      timestamp: Date.now()
    };

    // Add data metrics if extractors provided
    if (query.data && getItemsCount) {
      logData.itemsCount = getItemsCount(query.data);
    }
    if (query.data && getTotalCount) {
      logData.total = getTotalCount(query.data);
    }

    console.log(`[GalleryPollingDebug:${hookName}] Query result updated:`, logData);
  }, [query.data, query.isLoading, query.isFetching, query.isError, query.error, query.status, query.fetchStatus, hookName, context, getItemsCount, getTotalCount]);

  // Track data signature changes if enabled
  const dataSignature = React.useMemo(() => {
    if (!trackDataSignature || !query.data || !getDataSignature) return 'no-tracking';
    return getDataSignature(query.data);
  }, [query.data, trackDataSignature, getDataSignature]);
  
  React.useEffect(() => {
    if (trackDataSignature && query.data && getDataSignature) {
      const itemsCount = getItemsCount ? getItemsCount(query.data) : 'unknown';
      const totalCount = getTotalCount ? getTotalCount(query.data) : 'unknown';
      
      if (itemsCount && itemsCount > 0) {
        console.log(`🎯 [GalleryPollingDebug:${hookName}] NEW DATA RECEIVED:`, {
          ...context,
          itemsCount,
          total: totalCount,
          dataSignature: dataSignature.substring(0, 100) + '...',
          wasTriggeredByPolling: query.isFetching && !query.isLoading,
          timestamp: Date.now()
        });
      }
    }
  }, [dataSignature, hookName, context, query.data, query.isFetching, query.isLoading, trackDataSignature, getDataSignature, getItemsCount, getTotalCount]);
}

/**
 * Pre-configured logging for different data types.
 * These preserve the exact logging contexts from the original hooks.
 */
export const QueryDebugConfigs = {
  /**
   * For generation data logging - matches useGenerations hook
   */
  generations: (context: Record<string, any> = {}): QueryDebugConfig => ({
    hookName: 'useGenerations',
    context,
    trackDataSignature: true,
    getDataSignature: (data: any) => {
      if (!data?.items) return 'no-data';
      return data.items.map((item: any) => `${item.id}:${item.createdAt}`).join('|');
    },
    getItemsCount: (data: any) => data?.items?.length || 0,
    getTotalCount: (data: any) => data?.total || 0
  }),

  /**
   * For unified generation data logging - matches useUnifiedGenerations hook
   */
  unifiedGenerations: (context: Record<string, any> = {}): QueryDebugConfig => ({
    hookName: 'useUnifiedGenerations',
    context,
    trackDataSignature: true,
    getDataSignature: (data: any) => {
      if (!(data?.items as any[])) return 'no-data';
      return (data.items as any[]).map((item: any) => `${item.id}:${item.createdAt}`).join('|');
    },
    getItemsCount: (data: any) => (data?.items as any[])?.length || 0,
    getTotalCount: (data: any) => data?.total || 0
  }),

  /**
   * For task data logging - matches usePaginatedTasks hook
   */
  tasks: (context: Record<string, any> = {}): QueryDebugConfig => ({
    hookName: 'usePaginatedTasks',
    context,
    trackDataSignature: true,
    getDataSignature: (data: any) => {
      if (!data?.tasks) return 'no-data';
      return data.tasks.map((task: any) => `${task.id}:${task.status}:${task.createdAt}`).join('|');
    },
    getItemsCount: (data: any) => data?.tasks?.length || 0,
    getTotalCount: (data: any) => data?.total || 0
  })
};

/**
 * Hook to log when a component consumes hook data.
 * Useful for tracking data flow from hooks to components.
 */
export function useComponentDataLogging(
  componentName: string,
  data: any,
  context: Record<string, any> = {}
) {
  React.useEffect(() => {
    console.log(`📊 [GalleryPollingDebug:${componentName}] Hook data consumed:`, {
      ...context,
      hasData: !!data,
      timestamp: Date.now()
    });
  }, [data, componentName, context]);
}
