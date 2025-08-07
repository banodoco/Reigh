// Test script to check claim_next_task filtering conditions
// Run with: node test_claim_conditions.js

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://wczysqzxlwdndgxitrvc.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('Please set SUPABASE_SERVICE_ROLE_KEY environment variable');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runTest(testName, queryFn) {
  console.log(`\n=== ${testName} ===`);
  try {
    const result = await queryFn();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function main() {
  console.log('Testing claim_next_task filtering conditions...\n');

  // 1. Basic counts
  await runTest('Basic Table Counts', async () => {
    const [users, projects, tasks, tokens] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('projects').select('*', { count: 'exact', head: true }),
      supabase.from('tasks').select('*', { count: 'exact', head: true }),
      supabase.from('user_api_tokens').select('*', { count: 'exact', head: true })
    ]);
    
    return {
      users: users.count,
      projects: projects.count,
      tasks: tasks.count,
      user_api_tokens: tokens.count
    };
  });

  // 2. Task status breakdown
  await runTest('Task Status Distribution', async () => {
    const { data } = await supabase
      .from('tasks')
      .select('status')
      .then(({ data }) => {
        const statusCounts = {};
        data?.forEach(task => {
          statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
        });
        return { data: statusCounts };
      });
    return data;
  });

  // 3. User credits analysis
  await runTest('Users with Zero Credits and Queued Tasks', async () => {
    const { data } = await supabase
      .from('users')
      .select(`
        id,
        credits,
        projects(
          id,
          tasks(id, status)
        )
      `)
      .lte('credits', 0);
    
    return data?.map(user => ({
      user_id: user.id,
      credits: user.credits,
      queued_tasks: user.projects?.reduce((total, project) => 
        total + (project.tasks?.filter(task => task.status === 'Queued').length || 0), 0) || 0
    })).filter(user => user.queued_tasks > 0);
  });

  // 4. Generation preferences analysis
  await runTest('User Generation Preferences', async () => {
    const { data } = await supabase
      .from('users')
      .select('id, settings');
    
    const prefCounts = {};
    data?.forEach(user => {
      const generationMethods = user.settings?.ui?.generationMethods;
      const onComputer = generationMethods?.onComputer ?? true;
      const inCloud = generationMethods?.inCloud ?? true;
      const key = `onComputer:${onComputer},inCloud:${inCloud}`;
      prefCounts[key] = (prefCounts[key] || 0) + 1;
    });
    
    return prefCounts;
  });

  // 5. Users blocking cloud processing with queued tasks
  await runTest('Users Blocking Cloud Processing with Queued Tasks', async () => {
    const { data } = await supabase
      .from('users')
      .select(`
        id,
        settings,
        projects(
          id,
          tasks(id, status)
        )
      `);
    
    return data?.filter(user => {
      const inCloud = user.settings?.ui?.generationMethods?.inCloud ?? true;
      const queuedTasks = user.projects?.reduce((total, project) => 
        total + (project.tasks?.filter(task => task.status === 'Queued').length || 0), 0) || 0;
      return !inCloud && queuedTasks > 0;
    }).map(user => ({
      user_id: user.id,
      allows_cloud: user.settings?.ui?.generationMethods?.inCloud ?? true,
      queued_tasks: user.projects?.reduce((total, project) => 
        total + (project.tasks?.filter(task => task.status === 'Queued').length || 0), 0) || 0
    }));
  });

  // 6. Users blocking local processing with queued tasks
  await runTest('Users Blocking Local Processing with Queued Tasks', async () => {
    const { data } = await supabase
      .from('users')
      .select(`
        id,
        settings,
        projects(
          id,
          tasks(id, status)
        )
      `);
    
    return data?.filter(user => {
      const onComputer = user.settings?.ui?.generationMethods?.onComputer ?? true;
      const queuedTasks = user.projects?.reduce((total, project) => 
        total + (project.tasks?.filter(task => task.status === 'Queued').length || 0), 0) || 0;
      return !onComputer && queuedTasks > 0;
    }).map(user => ({
      user_id: user.id,
      allows_local: user.settings?.ui?.generationMethods?.onComputer ?? true,
      queued_tasks: user.projects?.reduce((total, project) => 
        total + (project.tasks?.filter(task => task.status === 'Queued').length || 0), 0) || 0
    }));
  });

  // 7. Concurrency limit analysis
  await runTest('Users at Concurrency Limit (≥5 In Progress)', async () => {
    const { data } = await supabase
      .from('users')
      .select(`
        id,
        credits,
        projects(
          id,
          tasks(id, status)
        )
      `);
    
    return data?.map(user => ({
      user_id: user.id,
      credits: user.credits,
      in_progress_count: user.projects?.reduce((total, project) => 
        total + (project.tasks?.filter(task => task.status === 'In Progress').length || 0), 0) || 0
    })).filter(user => user.in_progress_count >= 5);
  });

  // 8. Dependency analysis
  await runTest('Tasks with Unresolved Dependencies', async () => {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, dependant_on, status')
      .eq('status', 'Queued')
      .not('dependant_on', 'is', null);
    
    if (!tasks || tasks.length === 0) {
      return { message: 'No queued tasks with dependencies found' };
    }

    const dependencyIds = [...new Set(tasks.map(t => t.dependant_on))];
    const { data: dependencies } = await supabase
      .from('tasks')
      .select('id, status')
      .in('id', dependencyIds);
    
    const depStatusMap = {};
    dependencies?.forEach(dep => {
      depStatusMap[dep.id] = dep.status;
    });
    
    return tasks.map(task => ({
      task_id: task.id,
      dependency_id: task.dependant_on,
      dependency_status: depStatusMap[task.dependant_on] || 'NOT_FOUND',
      is_blocked: depStatusMap[task.dependant_on] !== 'Complete'
    }));
  });

  // 9. Simulate the actual service role filtering logic
  await runTest('Simulated Service Role Task Claiming', async () => {
    // Get all queued tasks
    const { data: queuedTasks } = await supabase
      .from('tasks')
      .select(`
        id,
        task_type,
        dependant_on,
        created_at,
        project_id,
        projects(user_id)
      `)
      .eq('status', 'Queued')
      .order('created_at', { ascending: true });

    if (!queuedTasks || queuedTasks.length === 0) {
      return { message: 'No queued tasks found' };
    }

    const eligibleTasks = [];
    const userCache = new Map();

    for (const task of queuedTasks) {
      const userId = task.projects.user_id;
      
      // Get/cache user data
      if (!userCache.has(userId)) {
        const { data: userData } = await supabase
          .from('users')
          .select('id, credits, settings')
          .eq('id', userId)
          .single();
        
        if (userData) {
          // Check in-progress count
          const { count: inProgressCount } = await supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'In Progress')
            .in('project_id', await supabase
              .from('projects')
              .select('id')
              .eq('user_id', userId)
              .then(({ data }) => data?.map(p => p.id) || [])
            );
          
          userCache.set(userId, {
            ...userData,
            inProgressCount: inProgressCount || 0
          });
        }
      }
      
      const user = userCache.get(userId);
      if (!user) continue;
      
      // Apply filters
      const allowsCloud = user.settings?.ui?.generationMethods?.inCloud ?? true;
      const hasCredits = user.credits > 0;
      const underLimit = user.inProgressCount < 5;
      
      if (!allowsCloud || !hasCredits || !underLimit) {
        continue;
      }
      
      // Check dependency
      let dependencyMet = true;
      if (task.dependant_on) {
        const { data: dep } = await supabase
          .from('tasks')
          .select('status')
          .eq('id', task.dependant_on)
          .single();
        dependencyMet = dep?.status === 'Complete';
      }
      
      if (dependencyMet) {
        eligibleTasks.push({
          task_id: task.id,
          task_type: task.task_type,
          user_id: userId,
          user_credits: user.credits,
          user_in_progress: user.inProgressCount,
          allows_cloud: allowsCloud,
          dependency_met: dependencyMet
        });
      }
    }
    
    return {
      total_queued: queuedTasks.length,
      eligible_for_claim: eligibleTasks.length,
      next_claimable: eligibleTasks[0] || null,
      reasons_for_rejection: {
        no_credits: queuedTasks.length - eligibleTasks.length, // Simplified
        explanation: 'This is a simplified count - actual filtering is more complex'
      }
    };
  });

  console.log('\n=== Test Complete ===');
}

main().catch(console.error);
