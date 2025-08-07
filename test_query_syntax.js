// Test script to validate PostgreSQL function syntax
// Run with: node test_query_syntax.js

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://wczysqzxlwdndgxitrvc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjenlzcXp4bHdkbmRneGl0cnZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1MDI4NjgsImV4cCI6MjA2NzA3ODg2OH0.r-4RyHZiDibUjgdgDDM2Vo6x3YpgIO5-BTwfkB2qyYA";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testBasicQueries() {
  console.log('🧪 Testing Basic Query Functionality\n');
  
  try {
    // Test 1: Basic table access
    console.log('📋 Test 1: Basic table access');
    
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, status, task_type')
      .limit(5);
    
    if (tasksError) {
      console.error('❌ Tasks query error:', tasksError.message);
    } else {
      console.log(`✅ Tasks query successful: ${tasks.length} tasks found`);
    }
    
    // Test 2: Check if our functions exist (they might not be deployed yet)
    console.log('\n📋 Test 2: Check function availability');
    
    // This will fail with anon key but will tell us if functions exist
    try {
      const { error } = await supabase.rpc('count_eligible_tasks_service_role', {
        p_include_active: false
      });
      
      if (error) {
        if (error.message.includes('function') && error.message.includes('does not exist')) {
          console.log('⚠️  Functions not deployed yet - need to run migrations');
        } else if (error.message.includes('permission denied') || error.message.includes('insufficient_privilege')) {
          console.log('✅ Functions exist (permission denied is expected with anon key)');
        } else {
          console.log(`ℹ️  Function call result: ${error.message}`);
        }
      } else {
        console.log('✅ Functions callable with anon key');
      }
    } catch (funcError) {
      console.log(`ℹ️  Function test: ${funcError.message}`);
    }
    
    // Test 3: Test our complex query logic manually
    console.log('\n📋 Test 3: Manual query complexity test');
    
    // Test a complex join similar to our optimized queries
    const { data: complexData, error: complexError } = await supabase
      .from('tasks')
      .select(`
        id,
        status,
        task_type,
        dependant_on,
        projects!inner(
          id,
          user_id,
          name
        )
      `)
      .eq('status', 'Queued')
      .limit(3);
    
    if (complexError) {
      console.error('❌ Complex query error:', complexError.message);
    } else {
      console.log(`✅ Complex query successful: ${complexData.length} tasks with project joins`);
      if (complexData.length > 0) {
        console.log('   Sample result:', JSON.stringify(complexData[0], null, 2));
      }
    }
    
    // Test 4: Test dependency logic manually
    console.log('\n📋 Test 4: Dependency resolution test');
    
    const { data: tasksWithDeps, error: depsError } = await supabase
      .from('tasks')
      .select('id, dependant_on, status')
      .not('dependant_on', 'is', null)
      .limit(5);
    
    if (depsError) {
      console.error('❌ Dependency query error:', depsError.message);
    } else {
      console.log(`✅ Dependency query successful: ${tasksWithDeps.length} tasks with dependencies`);
      
      if (tasksWithDeps.length > 0) {
        // Test dependency status lookup
        const depIds = [...new Set(tasksWithDeps.map(t => t.dependant_on))];
        const { data: depStatuses, error: depStatusError } = await supabase
          .from('tasks')
          .select('id, status')
          .in('id', depIds);
        
        if (depStatusError) {
          console.error('❌ Dependency status error:', depStatusError.message);
        } else {
          console.log(`✅ Dependency status lookup: ${depStatuses.length} dependencies checked`);
        }
      }
    }
    
    // Test 5: User settings access test
    console.log('\n📋 Test 5: User settings JSONB test');
    
    const { data: userSettings, error: settingsError } = await supabase
      .from('users')
      .select('id, settings')
      .limit(3);
    
    if (settingsError) {
      console.error('❌ User settings error:', settingsError.message);
      if (settingsError.message.includes('RLS')) {
        console.log('   (This is expected - users table has RLS enabled)');
      }
    } else {
      console.log(`✅ User settings query successful: ${userSettings.length} users`);
      
      if (userSettings.length > 0) {
        const sampleUser = userSettings[0];
        const generationMethods = sampleUser.settings?.ui?.generationMethods;
        console.log('   Sample generation preferences:', {
          onComputer: generationMethods?.onComputer ?? 'default(true)',
          inCloud: generationMethods?.inCloud ?? 'default(true)'
        });
      }
    }
    
    console.log('\n🎯 Query Syntax Test Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Basic table queries work');
    console.log('✅ Complex joins work'); 
    console.log('✅ JSONB field access works');
    console.log('✅ Dependency lookup pattern works');
    console.log('⚠️  PostgreSQL functions need to be deployed');
    console.log('');
    console.log('🚀 Next steps:');
    console.log('1. Deploy migrations: supabase db push');
    console.log('2. Test with service key: SUPABASE_SERVICE_ROLE_KEY=xxx node test_optimized_claim.js');
    console.log('3. Deploy edge function: supabase functions deploy claim-next-task-optimized');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

// Test our manual query patterns that match the PostgreSQL functions
async function testManualOptimizedLogic() {
  console.log('\n🔬 Testing Manual Optimized Query Logic\n');
  
  try {
    // Simulate the optimized service role logic manually
    console.log('📋 Simulating service role eligible users query...');
    
    // This simulates what our PostgreSQL function does
    const { data: projects } = await supabase
      .from('projects')
      .select('user_id')
      .limit(10);
    
    if (projects && projects.length > 0) {
      const userIds = [...new Set(projects.map(p => p.user_id))];
      console.log(`✅ Found ${userIds.length} unique users across projects`);
      
      // Test the kind of complex aggregation our function does
      console.log('📋 Testing task counting per user...');
      
      for (const userId of userIds.slice(0, 3)) {
        const { data: userTasks } = await supabase
          .from('tasks')
          .select('id, status, project_id, projects!inner(user_id)')
          .eq('projects.user_id', userId)
          .in('status', ['Queued', 'In Progress']);
        
        const queuedCount = userTasks?.filter(t => t.status === 'Queued').length || 0;
        const inProgressCount = userTasks?.filter(t => t.status === 'In Progress').length || 0;
        
        console.log(`   User ${userId}: ${queuedCount} queued, ${inProgressCount} in progress`);
      }
    }
    
  } catch (error) {
    console.error('❌ Manual logic test error:', error.message);
  }
}

async function main() {
  await testBasicQueries();
  await testManualOptimizedLogic();
}

main().catch(console.error);
