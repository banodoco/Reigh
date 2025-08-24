import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://wczysqzxlwdndgxitrvc.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjenlzcXp4bHdkbmRneGl0cnZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTUwMjg2OCwiZXhwIjoyMDY3MDc4ODY4fQ.fUHMa3zgfdOu95cAKTz5cd7aSruIcGE7ukVSQI-YuiU";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function cleanupTestTasks() {
  console.log('🧹 Finding and updating test tasks to Failed status...\n');
  
  // Find tasks that match our test patterns
  const testTaskTypes = [
    'test_no_dep',
    'test_dep_complete', 
    'test_has_complete_dep',
    'test_dep_incomplete',
    'test_has_incomplete_dep',
    'test_has_orphaned_dep'
  ];
  
  // Also find tasks by the test project name
  const { data: testProject } = await supabase
    .from('projects')
    .select('id')
    .eq('name', 'Test Project for Dependency Counting')
    .single();
    
  let tasksToUpdate = [];
  
  // Find tasks by task_type
  for (const taskType of testTaskTypes) {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, task_type, status')
      .eq('task_type', taskType);
    
    if (tasks) {
      tasksToUpdate.push(...tasks);
    }
  }
  
  // Find tasks by test project ID
  if (testProject) {
    const { data: projectTasks } = await supabase
      .from('tasks')
      .select('id, task_type, status')
      .eq('project_id', testProject.id);
      
    if (projectTasks) {
      tasksToUpdate.push(...projectTasks);
    }
  }
  
  // Remove duplicates
  const uniqueTasks = tasksToUpdate.filter((task, index, self) => 
    index === self.findIndex(t => t.id === task.id)
  );
  
  console.log(`Found ${uniqueTasks.length} test tasks to update:`);
  uniqueTasks.forEach(task => {
    console.log(`  • ${task.task_type} (${task.id.slice(0, 8)}...) - Status: ${task.status}`);
  });
  
  if (uniqueTasks.length === 0) {
    console.log('No test tasks found to update.');
    return;
  }
  
  console.log('\n🔄 Updating tasks to Failed status...');
  
  // Update tasks to Failed status
  const taskIds = uniqueTasks.map(task => task.id);
  const { data: updatedTasks, error } = await supabase
    .from('tasks')
    .update({ 
      status: 'Failed',
      updated_at: new Date().toISOString()
    })
    .in('id', taskIds)
    .select('id, task_type, status');
    
  if (error) {
    console.error('❌ Error updating tasks:', error);
    return;
  }
  
  console.log(`✅ Successfully updated ${updatedTasks.length} tasks to Failed status:`);
  updatedTasks.forEach(task => {
    console.log(`  • ${task.task_type} (${task.id.slice(0, 8)}...) - Now: ${task.status}`);
  });
  
  // Also clean up the test user and project if they exist
  console.log('\n🧹 Cleaning up test user and project...');
  
  const testUserId = '00000000-0000-0000-0000-000000000001';
  const testProjectId = '00000000-0000-0000-0000-000000000002';
  
  // Delete test project
  const { error: projectError } = await supabase
    .from('projects')
    .delete()
    .eq('id', testProjectId);
    
  if (!projectError) {
    console.log('✅ Deleted test project');
  }
  
  // Delete test user  
  const { error: userError } = await supabase
    .from('users')
    .delete()
    .eq('id', testUserId);
    
  if (!userError) {
    console.log('✅ Deleted test user');
  }
  
  console.log('\n🎉 Cleanup complete!');
}

cleanupTestTasks().catch(console.error);
