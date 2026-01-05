import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function checkBuckets() {
  const { data, error } = await supabase.storage.listBuckets();

  if (error) {
    console.error('Error listing buckets:', error.message);
    return;
  }

  console.log('Available storage buckets:');
  data?.forEach(bucket => {
    console.log(`  - ${bucket.name} (public: ${bucket.public})`);
  });
}

checkBuckets();
