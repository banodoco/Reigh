import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wczysqzxlwdndgxitrvc.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('Need SUPABASE_SERVICE_ROLE_KEY env var');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('=== Vault Integration Check ===\n');

  // 1. Check external_api_keys table and vault_secret_id column
  const { data: rows, error: tableError } = await supabase
    .from('external_api_keys')
    .select('id, service, vault_secret_id, metadata')
    .limit(5);

  if (tableError) {
    console.log('❌ external_api_keys table:', tableError.message);
  } else {
    console.log('✅ external_api_keys table exists');
    console.log('   Rows found:', rows ? rows.length : 0);
    if (rows && rows.length > 0) {
      for (const row of rows) {
        console.log(`   - service=${row.service}, vault_secret_id=${row.vault_secret_id || 'NULL'}`);
      }
    }
  }

  // 2. Check if RPC function exists and is callable
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_external_api_key_decrypted', {
    p_user_id: '00000000-0000-0000-0000-000000000000',
    p_service: 'huggingface'
  });

  if (rpcError) {
    if (rpcError.message.includes('does not exist')) {
      console.log('❌ RPC function get_external_api_key_decrypted:', rpcError.message);
    } else {
      // Function exists but returned error (expected for fake user_id)
      console.log('✅ RPC function exists (returned:', rpcError.message, ')');
    }
  } else {
    console.log('✅ RPC function works, returned:', rpcData);
  }

  // 3. Check save RPC
  const { error: saveRpcError } = await supabase.rpc('save_external_api_key', {
    p_service: 'test',
    p_key_value: 'test',
    p_metadata: {}
  });

  if (saveRpcError) {
    if (saveRpcError.message.includes('does not exist')) {
      console.log('❌ RPC function save_external_api_key:', saveRpcError.message);
    } else {
      // Function exists (auth error expected since we're using service role without user context)
      console.log('✅ RPC function save_external_api_key exists');
    }
  }

  console.log('\n=== Done ===');
}

check().catch(console.error);
