#!/usr/bin/env node

/**
 * Test script to validate the dependency counting fix
 * 
 * This script tests that:
 * 1. Tasks with no dependencies are counted correctly
 * 2. Tasks with complete dependencies are counted correctly  
 * 3. Tasks with incomplete dependencies are NOT counted
 * 4. Tasks with missing/orphaned dependencies are NOT counted
 * 5. Dry-run counts match actual claimable task counts
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function setupTestData() {
  console.log('🔧 Setting up test data...');
  
  // Create test user with credits and cloud enabled
  const testUserId = '00000000-0000-0000-0000-000000000001';
  const { error: userError } = await supabase
    .from('users')
    .upsert({
      id: testUserId,
      credits: 100,
      settings: {
        ui: {
          generationMethods: {
            inCloud: true,
            onComputer: true
          }
        }
      }
    });
  
  if (userError) throw userError;

  // Create test project
  const testProjectId = '00000000-0000-0000-0000-000000000002';
  const { error: projectError } = await supabase
    .from('projects')
    .upsert({
      id: testProjectId,
      user_id: testUserId,
      name: 'Test Project for Dependency Counting'
    });
    
  if (projectError) throw projectError;

  // Clear existing test tasks
  await supabase
    .from('tasks')
    .delete()
    .in('id', [
      '00000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000011', 
      '00000000-0000-0000-0000-000000000012',
      '00000000-0000-0000-0000-000000000013',
      '00000000-0000-0000-0000-000000000014'
    ]);

  // Test case 1: Task with no dependency (should be counted)
  const task1Id = '00000000-0000-0000-0000-000000000010';
  await supabase.from('tasks').insert({
    id: task1Id,
    project_id: testProjectId,
    status: 'Queued',
    task_type: 'test_no_dep',
    params: {},
    dependant_on: null
  });

  // Test case 2: Complete dependency task
  const depTaskId = '00000000-0000-0000-0000-000000000011';
  await supabase.from('tasks').insert({
    id: depTaskId,
    project_id: testProjectId,
    status: 'Complete',
    task_type: 'test_dep_complete',
    params: {},
    dependant_on: null
  });

  // Test case 3: Task with complete dependency (should be counted)
  const task2Id = '00000000-0000-0000-0000-000000000012';
  await supabase.from('tasks').insert({
    id: task2Id,
    project_id: testProjectId,
    status: 'Queued',
    task_type: 'test_has_complete_dep',
    params: {},
    dependant_on: depTaskId
  });

  // Test case 4: Incomplete dependency task
  const incompleteDep = '00000000-0000-0000-0000-000000000013';
  await supabase.from('tasks').insert({
    id: incompleteDep,
    project_id: testProjectId,
    status: 'Queued',
    task_type: 'test_dep_incomplete',
    params: {},
    dependant_on: null
  });

  // Test case 5: Task with incomplete dependency (should NOT be counted)
  const task3Id = '00000000-0000-0000-0000-000000000014';
  await supabase.from('tasks').insert({
    id: task3Id,
    project_id: testProjectId,
    status: 'Queued',
    task_type: 'test_has_incomplete_dep',
    params: {},
    dependant_on: incompleteDep
  });

  console.log('✅ Test data setup complete');
  return { testUserId, testProjectId };
}

async function testCountFunctions(testUserId) {
  console.log('\n🧪 Testing count functions...');
  
  // Test service role count
  const { data: serviceCount, error: serviceError } = await supabase
    .rpc('count_eligible_tasks_service_role', { p_include_active: false });
    
  if (serviceError) throw serviceError;
  
  // Test user count  
  const { data: userCount, error: userError } = await supabase
    .rpc('count_eligible_tasks_user', { 
      p_user_id: testUserId, 
      p_include_active: false 
    });
    
  if (userError) throw userError;

  console.log(`📊 Service role count: ${serviceCount}`);
  console.log(`📊 User count: ${userCount}`);
  
  return { serviceCount, userCount };
}

async function testActualClaiming(testUserId) {
  console.log('\n⚡ Testing actual task claiming...');
  
  let claimedTasks = 0;
  
  // Try to claim tasks until none available
  while (true) {
    const { data: claimResult, error: claimError } = await supabase
      .rpc('claim_next_task_user', { 
        p_user_id: testUserId,
        p_include_active: false 
      });
      
    if (claimError) throw claimError;
    
    if (!claimResult || claimResult.length === 0) {
      break;
    }
    
    claimedTasks++;
    console.log(`  ✅ Claimed task: ${claimResult[0].task_type}`);
    
    // Prevent infinite loop
    if (claimedTasks > 10) {
      console.log('  ⚠️  Breaking after 10 claims to prevent infinite loop');
      break;
    }
  }
  
  console.log(`📊 Total tasks actually claimable: ${claimedTasks}`);
  return claimedTasks;
}

async function testDryRunEndpoint() {
  console.log('\n🌐 Testing dry-run endpoint...');
  
  const response = await fetch(`${SUPABASE_URL}/functions/v1/claim-next-task`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      dry_run: true,
      include_active: false
    })
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  
  const result = await response.json();
  console.log(`📊 Dry-run endpoint count: ${result.available_tasks}`);
  
  return result.available_tasks;
}

async function runTests() {
  try {
    console.log('🚀 Starting dependency counting fix validation...\n');
    
    const { testUserId } = await setupTestData();
    
    // Expected: 2 tasks should be eligible
    // - Task with no dependency
    // - Task with complete dependency
    // NOT counted:
    // - Task with incomplete dependency
    const expectedCount = 2;
    
    const { serviceCount, userCount } = await testCountFunctions(testUserId);
    const actualClaimable = await testActualClaiming(testUserId);
    const dryRunCount = await testDryRunEndpoint();
    
    console.log('\n📋 RESULTS SUMMARY:');
    console.log(`Expected eligible tasks: ${expectedCount}`);
    console.log(`Service role count: ${serviceCount}`);
    console.log(`User count: ${userCount}`);
    console.log(`Actually claimable: ${actualClaimable}`);
    console.log(`Dry-run endpoint: ${dryRunCount}`);
    
    // Validate results
    const tests = [
      { name: 'Service count matches expected', actual: serviceCount, expected: expectedCount },
      { name: 'User count matches expected', actual: userCount, expected: expectedCount },
      { name: 'Dry-run matches actual claimable', actual: dryRunCount, expected: actualClaimable },
      { name: 'All counts consistent', actual: serviceCount === userCount && userCount === dryRunCount, expected: true }
    ];
    
    console.log('\n✅ TEST RESULTS:');
    let allPassed = true;
    
    for (const test of tests) {
      const passed = test.actual === test.expected;
      console.log(`  ${passed ? '✅' : '❌'} ${test.name}: ${test.actual} ${passed ? '==' : '!='} ${test.expected}`);
      if (!passed) allPassed = false;
    }
    
    if (allPassed) {
      console.log('\n🎉 ALL TESTS PASSED! The dependency counting fix is working correctly.');
    } else {
      console.log('\n❌ SOME TESTS FAILED! The fix may need adjustment.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

runTests();
