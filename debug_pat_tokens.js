// Debug PAT token authentication issue
// Run with: node debug_pat_tokens.js

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://wczysqzxlwdndgxitrvc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjenlzcXp4bHdkbmRneGl0cnZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1MDI4NjgsImV4cCI6MjA2NzA3ODg2OH0.r-4RyHZiDibUjgdgDDM2Vo6x3YpgIO5-BTwfkB2qyYA";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function debugTokens() {
  console.log('🔍 Debugging PAT Token Authentication\n');
  
  try {
    // Try to check user_api_tokens table (will fail with anon key but shows if table exists)
    console.log('📋 Step 1: Checking user_api_tokens table access...');
    
    const { data, error } = await supabase
      .from('user_api_tokens')
      .select('id, user_id, name, created_at')
      .limit(5);
    
    if (error) {
      console.log('❌ Cannot access user_api_tokens with anon key (expected)');
      console.log('   Error:', error.message);
      
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        console.log('🚨 CRITICAL: user_api_tokens table does not exist!');
        console.log('   This means PAT tokens cannot be validated.');
      } else if (error.message.includes('RLS') || error.message.includes('permission')) {
        console.log('✅ Table exists but has RLS (good)');
      }
    } else {
      console.log('✅ Can access user_api_tokens:', data?.length || 0, 'tokens found');
    }
    
    // Step 2: Check what the local worker should be sending
    console.log('\n📋 Step 2: Token format analysis...');
    
    console.log('Expected PAT token format: Random string (not JWT)');
    console.log('Service role key format: JWT with service_role claim');
    
    // Show what a service role token looks like vs PAT
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey) {
      console.log('\n🔐 Service role key analysis:');
      console.log('Length:', serviceKey.length);
      console.log('Is JWT (has dots):', serviceKey.includes('.'));
      console.log('Starts with "eyJ":', serviceKey.startsWith('eyJ'));
    }
    
    console.log('\n🔐 PAT token should be:');
    console.log('- Random string (no dots)');
    console.log('- Stored in user_api_tokens.token column');
    console.log('- Linked to a specific user_id');
    
    // Step 3: Test the authentication logic manually
    console.log('\n📋 Step 3: Testing authentication logic...');
    
    const testTokens = [
      'pat_test_123456789', // Example PAT format
      SUPABASE_ANON_KEY,    // JWT format
    ];
    
    testTokens.forEach((token, index) => {
      console.log(`\nToken ${index + 1}: ${token.substring(0, 20)}...`);
      
      // Test if it's a JWT
      const parts = token.split('.');
      if (parts.length === 3) {
        console.log('  Format: JWT (3 parts)');
        try {
          const payloadB64 = parts[1];
          const padded = payloadB64 + "=".repeat((4 - (payloadB64.length % 4)) % 4);
          const payload = JSON.parse(atob(padded));
          console.log('  Role:', payload.role || 'none');
          console.log('  Would be treated as:', payload.role === 'service_role' ? 'SERVICE ROLE' : 'USER JWT');
        } catch (e) {
          console.log('  JWT decode failed');
        }
      } else {
        console.log('  Format: Non-JWT (would be treated as PAT)');
      }
    });
    
    console.log('\n🎯 DIAGNOSIS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Based on your logs showing "Direct service-role key match",');
    console.log('the local worker is sending the SERVICE ROLE KEY instead of a PAT token.');
    console.log('');
    console.log('✅ Expected behavior:');
    console.log('   Local worker → PAT token → "Looking up token in user_api_token table..."');
    console.log('');
    console.log('❌ Actual behavior:');
    console.log('   Local worker → Service role key → "Direct service-role key match"');
    console.log('');
    console.log('🔧 SOLUTION:');
    console.log('   Check the local worker configuration to ensure it\'s using');
    console.log('   the PAT token from Settings Modal, not the service role key.');
    
  } catch (error) {
    console.error('❌ Debug error:', error.message);
  }
}

debugTokens().catch(console.error);
