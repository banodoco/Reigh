import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://wczysqzxlwdndgxitrvc.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjenlzcXp4bHdkbmRneGl0cnZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTUwMjg2OCwiZXhwIjoyMDY3MDc4ODY4fQ.fUHMa3zgfdOu95cAKTz5cd7aSruIcGE7ukVSQI-YuiU";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkDbState() {
  console.log('🔍 Sense-checking current database state vs migration...\n');
  
  // Check recent migrations applied
  try {
    const { data: migrations } = await supabase
      .from('supabase_migrations.schema_migrations')
      .select('version, name')
      .order('version', { ascending: false })
      .limit(5);
      
    if (migrations) {
      console.log('📋 Recent migrations in database:');
      migrations.forEach(m => {
        console.log(`  • ${m.version}`);
      });
      
      const myMigration = migrations.find(m => m.version === '20250127000101');
      const myCountingFix = migrations.find(m => m.version === '20250127000100');
      
      console.log('\n🎯 My migrations status:');
      console.log(`  Count fix (20250127000100): ${myCountingFix ? '✅ Applied' : '❌ Not applied'}`);
      console.log(`  Claim fix (20250127000101): ${myMigration ? '✅ Applied' : '❌ Not applied'}`);
    }
  } catch (error) {
    console.log('Could not check migrations, trying simpler approach...');
  }
  
  // Test the actual behavior
  console.log('\n⚡ Testing actual behavior:');
  
  const { data: countResult } = await supabase.rpc('count_eligible_tasks_service_role', { p_include_active: false });
  console.log(`Count function result: ${countResult}`);
  
  const { data: claimResult } = await supabase.rpc('claim_next_task_service_role', {
    p_worker_id: 'test_consistency_check',
    p_include_active: false
  });
  
  if (claimResult && claimResult.length > 0) {
    console.log(`❌ INCONSISTENCY: Claim succeeded when count was ${countResult}`);
    console.log(`  Claimed: ${claimResult[0].task_type}`);
    console.log('🚨 This confirms claim functions need the dependency fix!');
  } else {
    console.log(`✅ CONSISTENT: Both count (${countResult}) and claim (0) agree`);
    console.log('✅ Migration may not be needed - functions are already consistent');
  }
}

checkDbState().catch(console.error);
