import { supabase } from '@/integrations/supabase/client';

/**
 * Debug utilities for investigating polling issues
 * Add these to window for easy debugging in browser console
 */

export const debugPolling = {
  /**
   * Test basic Supabase connection
   */
  async testConnection(projectId: string) {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('id')
        .eq('project_id', projectId)
        .limit(1);
        
      if (error) {
        console.error('[PollingDebug] Connection test failed:', {
          error,
          errorMessage: error.message,
          errorCode: error.code,
          errorDetails: error.details,
          errorHint: error.hint
        });
        return false;
      }
      
      return true;
    } catch (err) {
      console.error('[PollingDebug] Connection test exception:', err);
      return false;
    }
  },

  /**
   * Test the exact query that's failing
   */
  async testTaskStatusQuery(projectId: string) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    try {
      const processingQuery = supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .in('status', ['Queued', 'In Progress'])
        .is('params->orchestrator_task_id_ref', null);
        
      const { count, error } = await processingQuery;
      
      if (error) {
        console.error('[PollingDebug] Processing query failed:', {
          error,
          errorMessage: error.message,
          errorCode: error.code,
          errorDetails: error.details,
          errorHint: error.hint,
          sql: processingQuery.toString ? processingQuery.toString() : 'N/A'
        });
        return false;
      }
      
      return true;
    } catch (err) {
      console.error('[PollingDebug] Query test exception:', err);
      return false;
    }
  },

  /**
   * Check current page visibility state
   */
  checkPageVisibility() {
    ,
      timestamp: Date.now()
    });
  },

  /**
   * Monitor React Query cache
   */
  inspectReactQueryCache(queryClient: any, projectId: string) {
    const taskStatusQueries = queryClient.getQueriesData({
      queryKey: ['task-status-counts', projectId]
    });
    
    const paginatedTaskQueries = queryClient.getQueriesData({
      queryKey: ['tasks', 'paginated', projectId]
    });
    
    return {
      taskStatusQueries,
      paginatedTaskQueries
    };
  },

  /**
   * Full diagnostic
   */
  async runFullDiagnostic(projectId: string, queryClient?: any) {
    this.checkPageVisibility();
    
    const connectionOk = await this.testConnection(projectId);
    const queryOk = await this.testTaskStatusQuery(projectId);
    
    if (queryClient) {
      this.inspectReactQueryCache(queryClient, projectId);
    }
    
    .toISOString()
    });
    
    return {
      connectionOk,
      queryOk,
      visibilityState: document.visibilityState
    };
  }
};

// Make available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).debugPolling = debugPolling;
}
