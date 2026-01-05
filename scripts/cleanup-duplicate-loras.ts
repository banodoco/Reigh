import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function cleanup() {
  // Get all Qwen Image LoRAs
  const { data, error } = await supabase
    .from('resources')
    .select('id, metadata')
    .eq('type', 'lora')
    .eq('is_public', true);

  if (error) {
    console.error('Error fetching:', error.message);
    return;
  }

  // Find Qwen Image LoRAs with empty sample_generations (from failed first run)
  const qwenLoras = data?.filter((r: any) => {
    const loraType = r.metadata?.lora_type;
    return loraType === 'Qwen Image' || loraType === 'Qwen Image 2512';
  }) || [];

  console.log(`Found ${qwenLoras.length} Qwen Image LoRAs total`);

  // Group by Model ID
  const byModelId = new Map<string, any[]>();
  qwenLoras.forEach((r: any) => {
    const modelId = r.metadata?.['Model ID'];
    if (!byModelId.has(modelId)) {
      byModelId.set(modelId, []);
    }
    byModelId.get(modelId)!.push(r);
  });

  // Find duplicates and delete the ones with fewer/no sample images
  let deleteCount = 0;
  for (const [modelId, resources] of byModelId) {
    if (resources.length > 1) {
      console.log(`\nDuplicate found: ${modelId}`);

      // Sort by sample_generations count (descending)
      resources.sort((a: any, b: any) => {
        const aCount = a.metadata?.sample_generations?.length || 0;
        const bCount = b.metadata?.sample_generations?.length || 0;
        return bCount - aCount;
      });

      // Keep the first one (most samples), delete the rest
      const toDelete = resources.slice(1);
      for (const r of toDelete) {
        console.log(`  Deleting: ${r.id} (${r.metadata?.sample_generations?.length || 0} samples)`);
        const { error: delError } = await supabase
          .from('resources')
          .delete()
          .eq('id', r.id);

        if (delError) {
          console.error(`  Failed to delete: ${delError.message}`);
        } else {
          deleteCount++;
        }
      }
    }
  }

  console.log(`\nDeleted ${deleteCount} duplicate LoRAs`);
}

cleanup();
