// Test script to understand Supabase realtime handler attachment
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://wczysqzxlwdndgxitrvc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjenlzcXp4bHdkbmRneGl0cnZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1MDI4NjgsImV4cCI6MjA2NzA3ODg2OH0.r-4RyHZiDibUjgdgDDM2Vo6x3YpgIO5-BTwfkB2qyYA'
);

async function testHandlerAttachment() {
  console.log('Testing handler attachment patterns...');
  
  // Pattern 1: Attach handlers then subscribe
  const channel1 = supabase.channel('test-1')
    .on('broadcast', { event: 'test' }, (payload) => {
      console.log('Pattern 1 received:', payload);
    })
    .subscribe((status) => {
      console.log('Pattern 1 status:', status);
      console.log('Pattern 1 bindings:', channel1.bindings?.length || 0);
    });
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Pattern 2: Create channel, then attach, then subscribe
  const channel2 = supabase.channel('test-2');
  channel2.on('broadcast', { event: 'test' }, (payload) => {
    console.log('Pattern 2 received:', payload);
  });
  channel2.subscribe((status) => {
    console.log('Pattern 2 status:', status);
    console.log('Pattern 2 bindings:', channel2.bindings?.length || 0);
  });
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Check final states
  console.log('\nFinal states:');
  console.log('Channel 1 - state:', channel1.state, 'bindings:', channel1.bindings?.length || 0);
  console.log('Channel 2 - state:', channel2.state, 'bindings:', channel2.bindings?.length || 0);
  
  process.exit(0);
}

testHandlerAttachment().catch(console.error);
