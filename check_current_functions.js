import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://wczysqzxlwdndgxitrvc.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjenlzcXp4bHdkbmRneGl0cnZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTUwMjg2OCwiZXhwIjoyMDY3MDc4ODY4fQ.fUHMa3zgfdOu95cAKTz5cd7aSruIcGE7ukVSQI-YuiU";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkCurrentFunctions() {
  console.log('🔍 Checking current function definitions in database...\n');
  
  // Get the current function definitions
  const { data: functions, error } = await supabase
    .rpc('pg_get_functiondef', { 
      function_oid: 'claim_next_task_service_role'::regproc::oid 
    })
    .single();
    
  if (error) {
    console.log('❌ Could not fetch function definition:', error.message);
    
    // Alternative: Check what migrations have been applied
    const { data: migrations } = await supabase
      .from('supabase_migrations.schema_migrations')  
      .select('version, name')
      .order('version', { ascending: false })
      .limit(10);
      
    if (migrations) {
      console.log('📋 Recent migrations applied:');
      migrations.forEach(m => {
        console.log(`  • ${m.version}: ${m.name || 'unnamed'}`);
      });
    }
    
    return;
  }
  
  if (functions) {
    console.log('📜 Current claim_next_task_service_role function:');
    console.log(functions.substring(0, 500) + '...');
    
    // Check if it has the fixed dependency logic
    const hasFixedLogic = functions.includes('dep.id IS NOT NULL AND dep.status');
    const hasOldLogic = functions.includes('t.dependant_on IS NULL OR dep.status = \'Complete\'');
    
    console.log('\n🔍 Dependency logic analysis:');
    console.log(`  Fixed logic (dep.id IS NOT NULL): ${hasFixedLogic ? '✅' : '❌'}`);
    console.log(`  Old buggy logic: ${hasOldLogic ? '❌ PRESENT' : '✅ Not present'}`);
  }
}

checkCurrentFunctions().catch(console.error);
