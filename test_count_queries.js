import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wczysqzxlwdndgxitrvc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjenlzcXp4bHdkbmRneGl0cnZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTUwMjg2OCwiZXhwIjoyMDY3MDc4ODY4fQ.fUHMa3zgfdOu95cAKTz5cd7aSruIcGE7ukVSQI-YuiU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testCountQueries() {
  console.log('Testing exact --count queries...\n');

  // 1. Test service-role count RPCs
  console.log('1. Service-role count RPCs:');
  try {
    const [queuedOnly, queuedPlusActive] = await Promise.all([
      supabase.rpc('count_eligible_tasks_service_role', { p_include_active: false }),
      supabase.rpc('count_eligible_tasks_service_role', { p_include_active: true })
    ]);
    
    console.log('  queued_only:', queuedOnly.data, queuedOnly.error?.message);
    console.log('  queued_plus_active:', queuedPlusActive.data, queuedPlusActive.error?.message);
    
    if (queuedOnly.data !== null && queuedPlusActive.data !== null) {
      const active_only = Math.max(0, queuedPlusActive.data - queuedOnly.data);
      console.log('  active_only (calculated):', active_only);
    }
  } catch (e) {
    console.log('  ERROR:', e.message);
  }

  // 2. Test analyze_task_availability_service_role
  console.log('\n2. Analysis RPC:');
  try {
    const { data: analysis, error } = await supabase
      .rpc('analyze_task_availability_service_role', { p_include_active: true });
    
    if (error) {
      console.log('  ERROR:', error.message);
    } else {
      console.log('  analysis exists:', !!analysis);
      console.log('  user_stats exists:', !!(analysis?.user_stats));
      console.log('  user_stats length:', analysis?.user_stats?.length || 0);
      if (analysis?.user_stats?.length > 0) {
        console.log('  first 3 users:', analysis.user_stats.slice(0, 3));
      }
    }
  } catch (e) {
    console.log('  ERROR:', e.message);
  }

  // 3. Test per_user_capacity_stats_service_role fallback
  console.log('\n3. Per-user capacity stats fallback:');
  try {
    const { data: perUser, error } = await supabase
      .rpc('per_user_capacity_stats_service_role');
    
    if (error) {
      console.log('  ERROR:', error.message);
    } else {
      console.log('  per_user exists:', !!perUser);
      console.log('  per_user length:', perUser?.length || 0);
      if (perUser?.length > 0) {
        console.log('  first 3 users:', perUser.slice(0, 3));
      }
    }
  } catch (e) {
    console.log('  ERROR:', e.message);
  }

  // 4. Test global task breakdown query
  console.log('\n4. Global task breakdown:');
  try {
    const { data: globalStats, error } = await supabase
      .from('tasks')
      .select('status, task_type, worker_id, created_at')
      .in('status', ['Queued', 'In Progress'])
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (error) {
      console.log('  ERROR:', error.message);
    } else {
      const breakdown = {
        queued_total: (globalStats || []).filter(t => t.status === 'Queued').length,
        in_progress_total: (globalStats || []).filter(t => t.status === 'In Progress').length,
        in_progress_cloud: (globalStats || []).filter(t => t.status === 'In Progress' && t.worker_id).length,
        in_progress_local: (globalStats || []).filter(t => t.status === 'In Progress' && !t.worker_id).length,
        orchestrator_tasks: (globalStats || []).filter(t => t.task_type?.toLowerCase().includes('orchestrator')).length
      };
      console.log('  breakdown:', breakdown);
      console.log('  recent tasks sample:', globalStats?.slice(0, 5).map(t => ({ status: t.status, type: t.task_type, is_cloud: !!t.worker_id })));
    }
  } catch (e) {
    console.log('  ERROR:', e.message);
  }
}

testCountQueries().catch(console.error);
