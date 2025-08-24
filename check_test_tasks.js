import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://wczysqzxlwdndgxitrvc.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjenlzcXp4bHdkbmRneGl0cnZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTUwMjg2OCwiZXhwIjoyMDY3MDc4ODY4fQ.fUHMa3zgfdOu95cAKTz5cd7aSruIcGE7ukVSQI-YuiU";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkTestTasks() {
  console.log('🔍 Checking for any remaining test tasks...\n');
  
  // Look for test tasks by task_type patterns
  const testTaskTypes = [
    'test_no_dep',
    'test_dep_complete', 
    'test_has_complete_dep',
    'test_dep_incomplete',
    'test_has_incomplete_dep',
    'test_has_orphaned_dep'
  ];
  
  let foundTestTasks = [];
  
  for (const taskType of testTaskTypes) {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, task_type, status, created_at')
      .eq('task_type', taskType);
    
    if (tasks && tasks.length > 0) {
      foundTestTasks.push(...tasks);
    }
  }
  
  // Also check for test project
  const { data: testProject } = await supabase
    .from('projects')
    .select('id, name, created_at')
    .eq('name', 'Test Project for Dependency Counting');
    
  // Check for test user
  const testUserId = '00000000-0000-0000-0000-000000000001';
  const { data: testUser } = await supabase
    .from('users')
    .select('id, credits')
    .eq('id', testUserId);
  
  console.log('📋 Test artifacts found:');
  console.log(`  Test tasks: ${foundTestTasks.length}`);
  console.log(`  Test project: ${testProject ? 'Found' : 'Not found'}`);
  console.log(`  Test user: ${testUser ? 'Found' : 'Not found'}`);
  
  if (foundTestTasks.length > 0) {
    console.log('\n📝 Test tasks details:');
    foundTestTasks.forEach(task => {
      console.log(`  • ${task.task_type} (${task.status}) - ${task.created_at}`);
    });
    
    console.log('\n🧹 These should be cleaned up...');
    return foundTestTasks.length;
  } else {
    console.log('\n✅ No test tasks found - cleanup was successful!');
    return 0;
  }
}

checkTestTasks().catch(console.error);
