/**
 * Generate sample images for LoRAs using fal.ai API
 * Then upload to Supabase storage and update resource metadata
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const FAL_KEY = process.env.FAL_API_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// LoRAs without images and their custom prompts
const LORA_PROMPTS: Record<string, string[]> = {
  "qwen_image_dissolve": [
    "ral-dissolve, a beautiful butterfly dissolving into particles of light, magical transformation",
    "ral-dissolve, portrait of a woman dissolving into autumn leaves, artistic surreal",
  ],
  "qwen_image_anthropomorphic": [
    "Anthropomorphic fox wearing a business suit, holding coffee, urban setting, detailed fur",
    "Anthropomorphic owl professor with glasses and tweed jacket, library background",
  ],
  "qwen_image_tilt_shift": [
    "Tilt Shift Photograph of a busy city street with miniature effect, tiny cars and people",
    "Tilt Shift Photograph of a colorful beach resort from above, toy-like appearance",
  ],
  "qwen_image_cartoon": [
    "A friendly robot chef cooking in a kitchen, cartoon style, vibrant colors",
    "A cat astronaut floating in space with Earth behind, cartoon illustration",
  ],
  "qwen_image_woven_fabric": [
    "Portrait of a woman, woven fabric texture, intricate textile patterns",
    "A majestic lion, woven tapestry style, rich fabric textures",
  ],
  "qwen_image_anime_otaku": [
    "Anime girl with long blue hair in a cherry blossom garden, detailed eyes, soft lighting",
    "Anime boy samurai with katana, dramatic pose, sunset background",
  ],
  "qwen_image_samsung_ultrareal": [
    "Samsung camera photo of a woman walking through a flower market, natural lighting, candid shot",
    "Samsung camera photo of street food vendor at night, warm lighting, shallow depth of field",
  ],
  "qwen_image_frctlgmtry": [
    "ral-frctlgmtry, abstract fractal geometry pattern, cosmic colors, infinite depth",
    "ral-frctlgmtry, geometric crystal formation, iridescent surfaces, mathematical beauty",
  ],
  "qwen_image_zhibi": [
    "zhibi, traditional Chinese ink painting of mountains and mist, delicate brushwork",
    "zhibi, elegant crane standing in bamboo forest, classical style",
  ],
  "qwen_image_golden_beasts": [
    "Golden beast, majestic dragon with ornate golden scales, intricate metalwork details",
    "Golden beast, mythical phoenix made of gold, elaborate decorative patterns",
  ],
  "qwen_image_crystalz": [
    "ral-crystalz, portrait of a woman made of crystals and gems, prismatic light",
    "ral-crystalz, crystal flower garden, sparkling gemstones, magical atmosphere",
  ],
  "qwen_image_fluff": [
    "ral-fluff, fluffy cloud cat sleeping on a pillow, soft cotton texture, cozy",
    "ral-fluff, adorable fluffy bunny in a meadow, soft fur texture, dreamy",
  ],
  "qwen_image_3dwvz": [
    "ral-3dwvz, abstract 3D waves of light, undulating surfaces, neon colors",
    "ral-3dwvz, ocean waves with 3D ripple effect, dynamic motion, blue gradient",
  ],
  "qwen_image_watercolor": [
    "A serene lake at sunset with mountains, watercolor painting style, soft washes",
    "Bouquet of wildflowers, watercolor illustration, delicate brush strokes",
  ],
  "qwen_image_opal": [
    "ral-opal, portrait with opalescent skin, iridescent rainbow reflections",
    "ral-opal, magical opal gemstone dragon, shifting colors, ethereal glow",
  ],
  "qwen_image_watce": [
    "ral-watce, intricate steampunk pocket watch with exposed gears, brass and gold",
    "ral-watce, mechanical timepiece heart, clockwork details, artistic",
  ],
  "qwen_image_mmxxii": [
    "mmxxii, surreal portrait with geometric elements, modern artistic style",
    "mmxxii, abstract landscape with bold shapes and colors, contemporary art",
  ],
};

async function generateImage(prompt: string, loraUrl: string): Promise<string | null> {
  try {
    console.log(`    Generating: "${prompt.substring(0, 50)}..."`);

    const response = await fetch('https://fal.run/fal-ai/qwen-image-2512/lora', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        loras: [{
          path: loraUrl,
          scale: 1.0
        }],
        num_images: 1,
        image_size: "square_hd",
        num_inference_steps: 28,
        guidance_scale: 4,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.log(`    API Error (${response.status}): ${error.substring(0, 100)}`);
      return null;
    }

    const result = await response.json();
    const imageUrl = result.images?.[0]?.url;

    if (!imageUrl) {
      console.log(`    No image URL in response`);
      return null;
    }

    return imageUrl;
  } catch (error) {
    console.log(`    Generation error: ${error}`);
    return null;
  }
}

async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || 'image/png';
    const arrayBuffer = await response.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), contentType };
  } catch (error) {
    console.log(`    Download error: ${error}`);
    return null;
  }
}

async function uploadToStorage(buffer: Buffer, filename: string, contentType: string): Promise<string | null> {
  const bucket = 'image_uploads';
  const path = `lora-samples/${filename}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, { contentType, upsert: true });

  if (error) {
    console.log(`    Upload failed: ${error.message}`);
    return null;
  }

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return publicUrl;
}

async function updateLoraResource(modelId: string, uploadedUrls: string[]) {
  const { data: resources, error: fetchError } = await supabase
    .from('resources')
    .select('id, metadata')
    .eq('type', 'lora')
    .eq('is_public', true);

  if (fetchError) {
    console.log(`    Failed to fetch resources: ${fetchError.message}`);
    return;
  }

  const resource = resources?.find(r => r.metadata?.['Model ID'] === modelId);
  if (!resource) {
    console.log(`    Resource not found for ${modelId}`);
    return;
  }

  const updatedMetadata = { ...resource.metadata };
  updatedMetadata.Images = uploadedUrls.map((url, i) => ({
    url,
    alt_text: `${updatedMetadata.Name} sample ${i + 1}`,
    type: 'image',
    source: 'generated'
  }));
  updatedMetadata.sample_generations = uploadedUrls.map((url, i) => ({
    url,
    type: 'image',
    alt_text: `${updatedMetadata.Name} sample ${i + 1}`
  }));
  updatedMetadata.main_generation = uploadedUrls[0];

  const { error: updateError } = await supabase
    .from('resources')
    .update({ metadata: updatedMetadata })
    .eq('id', resource.id);

  if (updateError) {
    console.log(`    Failed to update resource: ${updateError.message}`);
  } else {
    console.log(`    Updated resource with ${uploadedUrls.length} images`);
  }
}

async function main() {
  console.log('Generating sample images for Qwen Image LoRAs using fal.ai...\n');

  if (!FAL_KEY) {
    console.error('FAL_API_KEY not found in .env');
    process.exit(1);
  }

  // Get LoRAs without images
  const { data, error } = await supabase
    .from('resources')
    .select('metadata')
    .eq('type', 'lora')
    .eq('is_public', true);

  if (error) {
    console.error('Failed to fetch resources:', error.message);
    process.exit(1);
  }

  const lorasToProcess = data?.filter(r => {
    const isQwen = r.metadata?.lora_type === 'Qwen Image' || r.metadata?.lora_type === 'Qwen Image 2512';
    const noSamples = !r.metadata?.sample_generations?.length;
    return isQwen && noSamples;
  }) || [];

  console.log(`Found ${lorasToProcess.length} LoRAs without sample images\n`);

  let totalGenerated = 0;
  let totalFailed = 0;

  for (const lora of lorasToProcess) {
    const modelId = lora.metadata?.['Model ID'];
    const name = lora.metadata?.Name;
    const downloadUrl = lora.metadata?.huggingface_url;

    console.log(`\nProcessing: ${name} (${modelId})`);

    if (!downloadUrl) {
      console.log(`    Skipping: No download URL`);
      continue;
    }

    const prompts = LORA_PROMPTS[modelId];
    if (!prompts) {
      console.log(`    Skipping: No prompts defined`);
      continue;
    }

    const uploadedUrls: string[] = [];

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];

      // Generate image
      const generatedUrl = await generateImage(prompt, downloadUrl);
      if (!generatedUrl) {
        totalFailed++;
        continue;
      }

      // Download generated image
      const downloaded = await downloadImage(generatedUrl);
      if (!downloaded) {
        totalFailed++;
        continue;
      }

      // Upload to Supabase
      const filename = `${modelId}_generated_${i + 1}_${Date.now()}.png`;
      const uploadedUrl = await uploadToStorage(downloaded.buffer, filename, downloaded.contentType);

      if (uploadedUrl) {
        uploadedUrls.push(uploadedUrl);
        totalGenerated++;
        console.log(`    Generated & uploaded: ${filename}`);
      } else {
        totalFailed++;
      }

      // Delay between generations
      await new Promise(r => setTimeout(r, 1000));
    }

    if (uploadedUrls.length > 0) {
      await updateLoraResource(modelId, uploadedUrls);
    }
  }

  console.log(`\n========================================`);
  console.log(`Generation complete!`);
  console.log(`  Total generated: ${totalGenerated}`);
  console.log(`  Total failed: ${totalFailed}`);
  console.log(`========================================\n`);
}

main().catch(console.error);
