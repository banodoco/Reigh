/**
 * Downloads sample images from HuggingFace and uploads to Supabase storage
 * Then updates the LoRA resources with the new URLs
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// All sample images we want to upload (HuggingFace URLs)
const LORA_SAMPLE_IMAGES: Record<string, string[]> = {
  // Qwen Image 2512
  "qwen_image_2512_pixel_art": [
    "https://huggingface.co/prithivMLmods/Qwen-Image-2512-Pixel-Art-LoRA/resolve/main/images/77.png",
    "https://huggingface.co/prithivMLmods/Qwen-Image-2512-Pixel-Art-LoRA/resolve/main/images/10.png",
    "https://huggingface.co/prithivMLmods/Qwen-Image-2512-Pixel-Art-LoRA/resolve/main/images/111.png",
  ],

  // Qwen Image - Realism
  "qwen_image_realism": [
    "https://huggingface.co/flymy-ai/qwen-image-realism-lora/resolve/main/assets/flymy_realism.png",
    "https://huggingface.co/flymy-ai/qwen-image-realism-lora/resolve/main/assets/prompt_004_comparison.png",
    "https://huggingface.co/flymy-ai/qwen-image-realism-lora/resolve/main/assets/prompt_006_comparison.png",
  ],
  "qwen_image_studio_realism": [
    "https://huggingface.co/prithivMLmods/Qwen-Image-Studio-Realism/resolve/main/images/1.png",
    "https://huggingface.co/prithivMLmods/Qwen-Image-Studio-Realism/resolve/main/images/2.png",
    "https://huggingface.co/prithivMLmods/Qwen-Image-Studio-Realism/resolve/main/images/3.png",
  ],
  "qwen_image_headshotx": [
    "https://huggingface.co/prithivMLmods/Qwen-Image-HeadshotX/resolve/main/images/0.png",
    "https://huggingface.co/prithivMLmods/Qwen-Image-HeadshotX/resolve/main/images/1.png",
    "https://huggingface.co/prithivMLmods/Qwen-Image-HeadshotX/resolve/main/images/2.png",
  ],

  // Qwen Image - Anime
  "qwen_image_anime": [
    "https://huggingface.co/prithivMLmods/Qwen-Image-Anime-LoRA/resolve/main/images/1.png",
    "https://huggingface.co/prithivMLmods/Qwen-Image-Anime-LoRA/resolve/main/images/2.png",
    "https://huggingface.co/prithivMLmods/Qwen-Image-Anime-LoRA/resolve/main/images/3.png",
  ],
  "qwen_image_modern_anime": [
    "https://huggingface.co/alfredplpl/qwen-image-modern-anime-lora/resolve/main/ss.jpg",
    "https://huggingface.co/alfredplpl/qwen-image-modern-anime-lora/resolve/main/sample4.jpg",
    "https://huggingface.co/alfredplpl/qwen-image-modern-anime-lora/resolve/main/sample3.jpg",
  ],
  "qwen_image_anime_irl": [
    "https://huggingface.co/flymy-ai/qwen-image-anime-irl-lora/resolve/main/assets/irl_lora1.jpg",
    "https://huggingface.co/flymy-ai/qwen-image-anime-irl-lora/resolve/main/assets/irl_lora2.jpg",
    "https://huggingface.co/flymy-ai/qwen-image-anime-irl-lora/resolve/main/assets/irl_lora3.jpg",
  ],
  "qwen_image_raena_anime": [
    "https://cdn-uploads.huggingface.co/production/uploads/64b24543eec33e27dc9a6eca/mFduWl-5lO2fBbrzfgNNd.png",
    "https://cdn-uploads.huggingface.co/production/uploads/64b24543eec33e27dc9a6eca/wQCZOW1-ZTaDj1SbBLCSf.png",
    "https://cdn-uploads.huggingface.co/production/uploads/64b24543eec33e27dc9a6eca/FMY9XEi2hP6a9LvVvvl54.png",
  ],

  // Qwen Image - Traditional
  "qwen_image_gufeng": [
    "https://huggingface.co/starsfriday/Qwen-Image-Gufeng-LoRA/resolve/main/result/output1.png",
    "https://huggingface.co/starsfriday/Qwen-Image-Gufeng-LoRA/resolve/main/result/output2.png",
    "https://huggingface.co/starsfriday/Qwen-Image-Gufeng-LoRA/resolve/main/result/output3.png",
  ],
  "qwen_image_eva": [
    "https://huggingface.co/starsfriday/Qwen-Image-EVA-LoRA/resolve/main/result/output1.png",
    "https://huggingface.co/starsfriday/Qwen-Image-EVA-LoRA/resolve/main/result/output2.png",
    "https://huggingface.co/starsfriday/Qwen-Image-EVA-LoRA/resolve/main/result/output3.png",
  ],

  // Qwen Image - Artistic
  "qwen_image_sketch_smudge": [
    "https://huggingface.co/prithivMLmods/Qwen-Image-Sketch-Smudge/resolve/main/images/1.png",
    "https://huggingface.co/prithivMLmods/Qwen-Image-Sketch-Smudge/resolve/main/images/2.png",
    "https://huggingface.co/prithivMLmods/Qwen-Image-Sketch-Smudge/resolve/main/images/3.png",
  ],
  "qwen_image_fragmented_portraiture": [
    "https://huggingface.co/prithivMLmods/Qwen-Image-Fragmented-Portraiture/resolve/main/images/1.png",
    "https://huggingface.co/prithivMLmods/Qwen-Image-Fragmented-Portraiture/resolve/main/images/2.png",
    "https://huggingface.co/prithivMLmods/Qwen-Image-Fragmented-Portraiture/resolve/main/images/3.png",
  ],

  // Qwen Image - Effects
  "qwen_image_detail_slider": [
    "https://huggingface.co/ostris/qwen_image_detail_slider/resolve/main/images/_mnt_Train2_out_ui_qwen_image_detail_slider_samples_1758128339512__000000450_3.jpg",
  ],

  // =============================================
  // WAN LORAS - Sample images and videos
  // =============================================

  // Motion LoRAs
  "wan22_14b_i2v_orbit_shot": [
    "https://huggingface.co/ostris/wan22_i2v_14b_orbit_shot_lora/resolve/main/images/ComfyUI_00787_.webp",
  ],
  "motion_camera_push_in_wan_14b": [
    "https://huggingface.co/lovis93/Motion-Lora-Camera-Push-In-Wan-14B-720p-I2V/resolve/main/image-video/01.png",
    "https://huggingface.co/lovis93/Motion-Lora-Camera-Push-In-Wan-14B-720p-I2V/resolve/main/image-video/02.jpg",
  ],
  "wan21_i2v_bullet_time": [
    "https://huggingface.co/valiantcat/Wan2.1-BulletTime-LoRA/resolve/main/images/input1.jpg",
  ],
  "wan21_i2v_dolly_zoom": [
    "https://huggingface.co/ostris/wan21_i2v_dolly_zoom_lora/resolve/main/images/ComfyUI_00491_.webp",
    "https://huggingface.co/ostris/wan21_i2v_dolly_zoom_lora/resolve/main/images/ComfyUI_00492_.webp",
    "https://huggingface.co/ostris/wan21_i2v_dolly_zoom_lora/resolve/main/images/ComfyUI_00493_.webp",
  ],

  // Style LoRAs
  "wan21_14b_rick_morty": [
    "https://huggingface.co/DeverStyle/rick-and-morty-style-wan-21/resolve/main/images/Screenshot%202025-10-19%20180215.png",
  ],
  "wan22_14b_gta_style": [
    "https://huggingface.co/obsxrver/Wan2.2_GTA-Style/resolve/main/examples/1.png",
  ],
  "wan21_14b_arcane_jinx": [
    "https://huggingface.co/Cseti/Wan-LoRA-Arcane-Jinx-v1/resolve/main/images/J1nx_testb_00003.png",
  ],
};

// Video samples (separate to handle different content type)
const LORA_SAMPLE_VIDEOS: Record<string, string[]> = {
  // Motion LoRAs - videos show the effect better
  "motion_camera_push_in_wan_14b": [
    "https://huggingface.co/lovis93/Motion-Lora-Camera-Push-In-Wan-14B-720p-I2V/resolve/main/image-video/01.mp4",
    "https://huggingface.co/lovis93/Motion-Lora-Camera-Push-In-Wan-14B-720p-I2V/resolve/main/image-video/02.mp4",
  ],
  "wan21_i2v_bullet_time": [
    "https://huggingface.co/valiantcat/Wan2.1-BulletTime-LoRA/resolve/main/media/output1_1.mp4",
    "https://huggingface.co/valiantcat/Wan2.1-BulletTime-LoRA/resolve/main/media/output2_1.mp4",
    "https://huggingface.co/valiantcat/Wan2.1-BulletTime-LoRA/resolve/main/media/output3_2.mp4",
  ],

  // Style LoRAs with video samples
  "wan21_14b_rick_morty": [
    "https://huggingface.co/DeverStyle/rick-and-morty-style-wan-21/resolve/main/videos/test_00093.mp4",
    "https://huggingface.co/DeverStyle/rick-and-morty-style-wan-21/resolve/main/videos/test_00094.mp4",
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

async function updateLoraResourceWithVideos(modelId: string, uploadedVideos: { url: string; type: 'video' }[]) {
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

  // Update metadata - add videos to existing sample_generations
  const updatedMetadata = { ...resource.metadata };
  const existingSamples = updatedMetadata.sample_generations || [];

  // Add videos to sample_generations
  const videoSamples = uploadedVideos.map((v, i) => ({
    url: v.url,
    type: 'video',
    alt_text: `${updatedMetadata.Name} video ${i + 1}`
  }));

  updatedMetadata.sample_generations = [...existingSamples, ...videoSamples];

  // Also add to Images array for compatibility
  const existingImages = updatedMetadata.Images || [];
  const videoImages = uploadedVideos.map((v, i) => ({
    url: v.url,
    alt_text: `${updatedMetadata.Name} video ${i + 1}`,
    type: 'video',
    source: 'uploaded'
  }));
  updatedMetadata.Images = [...existingImages, ...videoImages];

  const { error: updateError } = await supabase
    .from('resources')
    .update({ metadata: updatedMetadata })
    .eq('id', resource.id);

  if (updateError) {
    console.log(`    Failed to update resource: ${updateError.message}`);
  } else {
    console.log(`    Updated resource with ${uploadedVideos.length} videos`);
  }
}

async function main() {
  console.log('Starting image upload for LoRAs...\n');

  let totalUploaded = 0;
  let totalFailed = 0;

  for (const [modelId, imageUrls] of Object.entries(LORA_SAMPLE_IMAGES)) {
    console.log(`\nProcessing images: ${modelId}`);

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

  // Process video samples
  console.log('\n\n--- Processing Video Samples ---\n');

  for (const [modelId, videoUrls] of Object.entries(LORA_SAMPLE_VIDEOS)) {
    console.log(`\nProcessing videos: ${modelId}`);

    const uploadedVideoUrls: { url: string; type: 'video' }[] = [];

    for (let i = 0; i < videoUrls.length; i++) {
      const url = videoUrls[i];
      const result = await downloadImage(url); // Same download function works for videos

      if (!result) {
        totalFailed++;
        continue;
      }

      const filename = `${modelId}_video_${i + 1}_${Date.now()}.mp4`;

      const uploadedUrl = await uploadToStorage(result.buffer, filename, 'video/mp4');

      if (uploadedUrl) {
        uploadedVideoUrls.push({ url: uploadedUrl, type: 'video' });
        totalUploaded++;
        console.log(`    Uploaded: ${filename}`);
      } else {
        totalFailed++;
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    if (uploadedVideoUrls.length > 0) {
      await updateLoraResourceWithVideos(modelId, uploadedVideoUrls);
    }
  }

  console.log(`\n========================================`);
  console.log(`Upload complete!`);
  console.log(`  Total uploaded: ${totalUploaded}`);
  console.log(`  Total failed: ${totalFailed}`);
  console.log(`========================================\n`);
}

main().catch(console.error);
