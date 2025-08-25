import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wczysqzxlwdndgxitrvc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjenlzcXp4bHdkbmRneGl0cnZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTUwMjg2OCwiZXhwIjoyMDY3MDc4ODY4fQ.fUHMa3zgfdOu95cAKTz5cd7aSruIcGE7ukVSQI-YuiU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function debugCountIssue() {
  console.log('🔍 Debugging why count_eligible_tasks_service_role returns 0...\n');

  // Direct call to the function
  const { data: count, error: countError } = await supabase
    .rpc('count_eligible_tasks_service_role', { p_include_active: false });
  
  console.log(`Direct function call result: ${count} (error: ${countError?.message || 'none'})\n`);

  // Check if there are users who meet basic criteria
  const { data: users } = await supabase
    .from('users')
    .select('id, credits, settings')
    .gt('credits', 0);
  
  console.log(`Users with credits > 0: ${users?.length || 0}`);
  
  for (const user of users || []) {
    const allowsCloud = user.settings?.ui?.generationMethods?.inCloud ?? true;
    console.log(`  - ${user.id}: ${user.credits} credits, inCloud: ${allowsCloud}`);
  }
  
  // Check queued tasks with dependencies
  console.log('\n🔗 Checking queued tasks and dependencies...');
  const { data: queuedTasks } = await supabase
    .from('tasks')
    .select('id, task_type, dependant_on, project_id')
    .eq('status', 'Queued')
    .limit(10);
    
  console.log(`Total queued tasks checked: ${queuedTasks?.length || 0}`);
  
  for (const task of queuedTasks || []) {
    if (task.dependant_on) {
      const { data: dep } = await supabase
        .from('tasks')
        .select('id, status')
        .eq('id', task.dependant_on)
        .single();
      
      console.log(`  - ${task.id} (${task.task_type}) depends on ${task.dependant_on} status: ${dep?.status || 'NOT FOUND'}`);
    } else {
      console.log(`  - ${task.id} (${task.task_type}) has no dependencies`);
    }
  }
}

debugCountIssue().catch(console.error);
