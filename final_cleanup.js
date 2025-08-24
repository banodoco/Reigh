import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://wczysqzxlwdndgxitrvc.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjenlzcXp4bHdkbmRneGl0cnZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTUwMjg2OCwiZXhwIjoyMDY3MDc4ODY4fQ.fUHMa3zgfdOu95cAKTz5cd7aSruIcGE7ukVSQI-YuiU";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function finalCleanup() {
  console.log('🧹 Final cleanup of remaining test artifacts...\n');
  
  // Clean up test project
  const { error: projectError } = await supabase
    .from('projects')
    .delete()
    .eq('name', 'Test Project for Dependency Counting');
    
  if (!projectError) {
    console.log('✅ Deleted test project');
  } else {
    console.log('⚠️  Could not delete test project:', projectError.message);
  }
  
  // Clean up test user
  const testUserId = '00000000-0000-0000-0000-000000000001';
  const { error: userError } = await supabase
    .from('users')
    .delete()
    .eq('id', testUserId);
    
  if (!userError) {
    console.log('✅ Deleted test user');
  } else {
    console.log('⚠️  Could not delete test user:', userError.message);
  }
  
  console.log('\n🎉 Final cleanup complete!');
}

finalCleanup().catch(console.error);
