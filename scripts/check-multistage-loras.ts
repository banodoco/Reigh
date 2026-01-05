/**
 * Check multi-stage LoRAs (high/low noise) in database
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  // Get all Wan LoRAs
  const { data: resources, error: fetchError } = await supabase
    .from('resources')
    .select('id, metadata')
    .eq('type', 'lora')
    .eq('is_public', true);

  if (fetchError) {
    console.error('Failed to fetch resources:', fetchError);
    return;
  }

  console.log('Multi-stage LoRAs (high/low noise):\n');

  for (const resource of resources || []) {
    const metadata = resource.metadata;
    const loraType = metadata?.lora_type || '';

    // Only check Wan LoRAs
    if (!loraType.toLowerCase().includes('wan')) continue;

    const modelId = metadata?.['Model ID'] || 'unknown';
    const name = metadata?.Name || 'unknown';
    const highNoiseUrl = metadata?.high_noise_url;
    const lowNoiseUrl = metadata?.low_noise_url;

    // Only show if it has multi-stage URLs (or should have them)
    const isWan22 = loraType.includes('2.2');
    const hasMultiStage = highNoiseUrl || lowNoiseUrl;

    if (isWan22 || hasMultiStage) {
      console.log(`${name}`);
      console.log(`  Model ID: ${modelId}`);
      console.log(`  lora_type: ${loraType}`);
      console.log(`  high_noise_url: ${highNoiseUrl ? 'SET' : 'NOT SET'}`);
      console.log(`  low_noise_url: ${lowNoiseUrl ? 'SET' : 'NOT SET'}`);
      if (highNoiseUrl) console.log(`    → ${highNoiseUrl.substring(0, 80)}...`);
      if (lowNoiseUrl) console.log(`    → ${lowNoiseUrl.substring(0, 80)}...`);
      console.log('');
    }
  }
}

main().catch(console.error);
