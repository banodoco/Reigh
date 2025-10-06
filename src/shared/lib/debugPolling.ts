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
    console.log('[PollingDebug] Testing Supabase connection...');
    
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
      
      console.log('[PollingDebug] Connection test passed:', { data });
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
    console.log('[PollingDebug] Testing task status query...');
    
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    try {
      const processingQuery = supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .in('status', ['Queued', 'In Progress'])
        .is('params->orchestrator_task_id_ref', null);
        
      console.log('[PollingDebug] Executing processing tasks query...');
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
      
      console.log('[PollingDebug] Processing query succeeded:', { count });
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
    console.log('[PollingDebug] Page visibility state:', {
      visibilityState: document.visibilityState,
      hidden: document.hidden,
      hasFocus: document.hasFocus(),
      timestamp: Date.now()
    });
  },

  /**
   * Monitor React Query cache
   */
  inspectReactQueryCache(queryClient: any, projectId: string) {
    console.log('[PollingDebug] React Query cache inspection:');
    
    const taskStatusQueries = queryClient.getQueriesData({
      queryKey: ['task-status-counts', projectId]
    });
    
    const paginatedTaskQueries = queryClient.getQueriesData({
      queryKey: ['tasks', 'paginated', projectId]
    });
    
    console.log('[PollingDebug] Task status queries:', taskStatusQueries);
    console.log('[PollingDebug] Paginated task queries:', paginatedTaskQueries);
    
    return {
      taskStatusQueries,
      paginatedTaskQueries
    };
  },

  /**
   * Full diagnostic
   */
  async runFullDiagnostic(projectId: string, queryClient?: any) {
    console.log('[PollingDebug] 🔍 Running full polling diagnostic...');
    
    this.checkPageVisibility();
    
    const connectionOk = await this.testConnection(projectId);
    const queryOk = await this.testTaskStatusQuery(projectId);
    
    if (queryClient) {
      this.inspectReactQueryCache(queryClient, projectId);
    }
    
    console.log('[PollingDebug] 📊 Diagnostic summary:', {
      projectId,
      connectionOk,
      queryOk,
      visibilityState: document.visibilityState,
      timestamp: new Date().toISOString()
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
