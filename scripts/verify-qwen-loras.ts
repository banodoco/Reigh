import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function verify() {
  const { data, error } = await supabase
    .from('resources')
    .select('id, metadata')
    .eq('type', 'lora')
    .eq('is_public', true);

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log(`Found ${data?.length || 0} Qwen Image LoRAs:\n`);
  data?.forEach((r: any) => {
    const m = r.metadata;
    console.log(`- ${m.Name} (${m.lora_type}) - trigger: "${m.trigger_word || 'none'}"`);
    console.log(`  ${m.sample_generations?.length || 0} sample images`);
  });
}

verify();
