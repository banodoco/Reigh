/**
 * Downloads additional sample images from HuggingFace and uploads to Supabase storage
 * Then updates the LoRA resources with the new URLs
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Additional sample images we found for LoRAs that were missing them
const LORA_SAMPLE_IMAGES: Record<string, string[]> = {
  // Turbo 4-Step (Qwen 2512) - alicdn hosted images
  "qwen_image_2512_turbo": [
    "https://img.alicdn.com/imgextra/i3/O1CN01sFOgat1cECHHy9ct0_!!6000000003568-2-tps-1328-1328.png",
    "https://img.alicdn.com/imgextra/i4/O1CN01yELpI61RKe540RRCJ_!!6000000002093-2-tps-1328-1328.png",
    "https://img.alicdn.com/imgextra/i1/O1CN01Zc2dQB286vhK31qSJ_!!6000000007884-2-tps-1328-1328.png",
  ],

  // Synthetic Face
  "qwen_image_synthetic_face": [
    "https://huggingface.co/prithivMLmods/Qwen-Image-Synthetic-Face/resolve/main/images/1.png",
    "https://huggingface.co/prithivMLmods/Qwen-Image-Synthetic-Face/resolve/main/images/2.png",
    "https://huggingface.co/prithivMLmods/Qwen-Image-Synthetic-Face/resolve/main/images/3.png",
  ],

  // Boreal Photo
  "qwen_image_boreal": [
    "https://huggingface.co/kudzueye/boreal-qwen-image/resolve/main/images/g3ndTMe1w88H3XFKOIy0E.jpeg",
    "https://huggingface.co/kudzueye/boreal-qwen-image/resolve/main/images/GL2uYakze01ieq99fdRba.jpeg",
    "https://huggingface.co/kudzueye/boreal-qwen-image/resolve/main/images/ComfyUI_00944_.png",
  ],

  // Liu Yifei Character
  "qwen_image_liuyifei": [
    "https://huggingface.co/starsfriday/Qwen-Image-Liuyifei-LoRA/resolve/main/result/output.png",
    "https://huggingface.co/starsfriday/Qwen-Image-Liuyifei-LoRA/resolve/main/result/output1.png",
    "https://huggingface.co/starsfriday/Qwen-Image-Liuyifei-LoRA/resolve/main/result/output2.png",
  ],
};

async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    console.log(`    Downloading: ${url.substring(url.lastIndexOf('/') + 1)}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      console.log(`    Failed (${response.status}): ${url}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const arrayBuffer = await response.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), contentType };
  } catch (error) {
    console.log(`    Error downloading: ${error}`);
    return null;
  }
}

async function uploadToStorage(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string | null> {
  const bucket = 'image_uploads';
  const path = `lora-samples/${filename}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType,
      upsert: true
    });

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
  // Find the resource by Model ID in metadata
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

  // Update metadata with new URLs
  const updatedMetadata = { ...resource.metadata };
  updatedMetadata.Images = uploadedUrls.map((url, i) => ({
    url,
    alt_text: `${updatedMetadata.Name} sample ${i + 1}`,
    type: 'image',
    source: 'uploaded'
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
  console.log('Starting image upload for additional Qwen Image LoRAs...\n');

  let totalUploaded = 0;
  let totalFailed = 0;

  for (const [modelId, imageUrls] of Object.entries(LORA_SAMPLE_IMAGES)) {
    console.log(`\nProcessing: ${modelId}`);

    const uploadedUrls: string[] = [];

    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i];
      const result = await downloadImage(url);

      if (!result) {
        totalFailed++;
        continue;
      }

      const ext = url.includes('.jpg') || url.includes('.jpeg') ? 'jpg' : 'png';
      const filename = `${modelId}_sample_${i + 1}_${Date.now()}.${ext}`;

      const uploadedUrl = await uploadToStorage(result.buffer, filename, result.contentType);

      if (uploadedUrl) {
        uploadedUrls.push(uploadedUrl);
        totalUploaded++;
        console.log(`    Uploaded: ${filename}`);
      } else {
        totalFailed++;
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
    }

    if (uploadedUrls.length > 0) {
      await updateLoraResource(modelId, uploadedUrls);
    }
  }

  console.log(`\n========================================`);
  console.log(`Upload complete!`);
  console.log(`  Total uploaded: ${totalUploaded}`);
  console.log(`  Total failed: ${totalFailed}`);
  console.log(`========================================\n`);
}

main().catch(console.error);
