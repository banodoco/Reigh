import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wczysqzxlwdndgxitrvc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjenlzcXp4bHdkbmRneGl0cnZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTUwMjg2OCwiZXhwIjoyMDY3MDc4ODY4fQ.fUHMa3zgfdOu95cAKTz5cd7aSruIcGE7ukVSQI-YuiU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testPerUserFunction() {
  console.log('Testing per_user_capacity_stats_service_role function...');
  
  try {
    const { data, error } = await supabase.rpc('per_user_capacity_stats_service_role');
    console.log('Function result:', { data, error });
    
    if (data) {
      console.log(`Returned ${data.length} rows`);
      if (data.length > 0) {
        console.log('Sample rows:', data.slice(0, 3));
      }
    }
  } catch (e) {
    console.error('Function call failed:', e);
  }
}

testPerUserFunction();
