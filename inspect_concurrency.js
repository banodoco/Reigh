import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wczysqzxlwdndgxitrvc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjenlzcXp4bHdkbmRneGl0cnZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTUwMjg2OCwiZXhwIjoyMDY3MDc4ODY4fQ.fUHMa3zgfdOu95cAKTz5cd7aSruIcGE7ukVSQI-YuiU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('🔍 Inspecting per-user In Progress concurrency...');

  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('id, task_type, worker_id, project_id, status')
    .eq('status', 'In Progress');

  if (tasksError) {
    console.error('Failed to fetch tasks:', tasksError.message);
    process.exit(1);
  }

  const projectIds = [...new Set(tasks.map(t => t.project_id).filter(Boolean))];
  let projectMap = new Map();

  if (projectIds.length) {
    const { data: projects, error: projError } = await supabase
      .from('projects')
      .select('id, user_id')
      .in('id', projectIds);

    if (projError) {
      console.error('Failed to fetch projects:', projError.message);
      process.exit(1);
    }

    for (const p of projects) projectMap.set(p.id, p.user_id);
  }

  const perUser = new Map();

  for (const t of tasks) {
    const userId = projectMap.get(t.project_id) || 'unknown';
    const entry = perUser.get(userId) || { any: 0, cloud: 0, local: 0, nonOrch: 0, orch: 0, examples: [] };
    entry.any += 1;
    if (t.worker_id) entry.cloud += 1; else entry.local += 1;
    if ((t.task_type || '').toLowerCase().includes('orchestrator')) entry.orch += 1; else entry.nonOrch += 1;
    if (entry.examples.length < 5) entry.examples.push({ id: t.id, type: t.task_type, cloud: !!t.worker_id });
    perUser.set(userId, entry);
  }

  const rows = [...perUser.entries()].map(([userId, m]) => ({ userId, ...m }))
    .sort((a,b) => b.any - a.any);

  console.log('\nTop users by In Progress count:');
  for (const r of rows.slice(0, 20)) {
    console.log(`- ${r.userId}: total=${r.any} (cloud=${r.cloud}, local=${r.local}, nonOrch=${r.nonOrch}, orch=${r.orch})`);
  }

  const violators = rows.filter(r => r.any > 5);
  if (violators.length) {
    console.log('\n🚨 Users exceeding cap (>5):');
    for (const v of violators) {
      console.log(`  • ${v.userId}: total=${v.any} (cloud=${v.cloud}, local=${v.local}, nonOrch=${v.nonOrch}, orch=${v.orch})`);
      const examples = perUser.get(v.userId).examples;
      for (const ex of examples) {
        console.log(`     - ${ex.id} ${ex.type} cloud=${ex.cloud}`);
      }
    }
  } else {
    console.log('\n✅ No users currently exceed the 5 In Progress cap.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
