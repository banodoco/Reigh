/**
 * Runner script for importing Qwen Image LoRAs
 *
 * Usage: npx tsx scripts/run-import-qwen-loras.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// Import the LoRA data
import { QWEN_IMAGE_LORAS } from './import-qwen-image-loras';

// Types matching LoraSelectorModal.tsx
interface LoraModelImage {
  alt_text: string;
  url: string;
  type?: string;
  source?: string;
}

interface LoraModel {
  "Model ID": string;
  Name: string;
  Author: string;
  Images: LoraModelImage[];
  "Model Files": { path: string; url: string; size?: number }[];
  Description?: string;
  Tags?: string[];
  "Last Modified"?: string;
  Downloads?: number;
  Likes?: number;
  lora_type: string;
  huggingface_url?: string;
  filename?: string;
  base_model?: string;
  sample_generations?: { url: string; type: 'image' | 'video'; alt_text?: string }[];
  main_generation?: string;
  is_public: boolean;
  trigger_word?: string;
}

async function main() {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);

  // Get first user to import under
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, email')
    .limit(1);

  if (userError || !users || users.length === 0) {
    console.error('Could not find a user to import LoRAs under:', userError);
    process.exit(1);
  }

  const userId = users[0].id;
  console.log(`Using user ID: ${userId} (${users[0].email})`);
  console.log(`\nStarting import of ${QWEN_IMAGE_LORAS.length} Qwen Image LoRAs...\n`);

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (const lora of QWEN_IMAGE_LORAS) {
    console.log(`Processing: ${lora.name}`);

    // Use HuggingFace URLs directly (no upload needed)
    const images: LoraModelImage[] = lora.sampleImages.slice(0, 3).map((url, i) => ({
      url,
      alt_text: `${lora.name} sample ${i + 1}`,
      type: 'image',
      source: 'huggingface'
    }));

    const sampleGenerations = lora.sampleImages.slice(0, 3).map((url, i) => ({
      url,
      type: 'image' as const,
      alt_text: `${lora.name} sample ${i + 1}`
    }));

    // Create the LoRA model object
    const loraModel: LoraModel = {
      "Model ID": lora.modelId,
      Name: lora.name,
      Author: lora.author,
      Description: lora.description,
      Images: images,
      "Model Files": [{
        path: lora.downloadUrl.split('/').pop() || lora.modelId + '.safetensors',
        url: lora.downloadUrl,
      }],
      Tags: lora.tags,
      Downloads: lora.downloads,
      Likes: lora.likes,
      lora_type: lora.loraType,
      huggingface_url: lora.downloadUrl,
      filename: lora.modelId,
      base_model: lora.baseModel,
      sample_generations: sampleGenerations,
      main_generation: sampleGenerations[0]?.url,
      is_public: true,
      trigger_word: lora.triggerWord,
      "Last Modified": new Date().toISOString(),
    };

    // Insert into resources table
    const { error } = await supabase
      .from('resources')
      .insert({
        user_id: userId,
        type: 'lora',
        metadata: loraModel,
        is_public: true,
      });

    if (error) {
      if (error.code === '23505') {
        console.log(`  Skipped (already exists): ${lora.name}`);
        skipCount++;
      } else {
        console.error(`  Failed: ${lora.name} - ${error.message}`);
        failCount++;
      }
    } else {
      console.log(`  Success: ${lora.name}`);
      successCount++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Import complete!`);
  console.log(`  Successful: ${successCount}`);
  console.log(`  Failed: ${failCount}`);
  console.log(`  Skipped (duplicates): ${skipCount}`);
  console.log(`========================================\n`);
}

main().catch(console.error);
