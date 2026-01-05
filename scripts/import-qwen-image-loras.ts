/**
 * Qwen Image LoRA Import Script
 *
 * This script imports curated Qwen Image aesthetic LoRAs from HuggingFace
 * into the Reigh database with their sample images uploaded to Supabase storage.
 *
 * Run this script from the browser console while logged in, or use it as a Node.js script
 * with proper authentication setup.
 *
 * Usage:
 * 1. Copy this to browser console while logged in to Reigh
 * 2. Or: npx tsx scripts/import-qwen-image-loras.ts
 */

import { createClient } from '@supabase/supabase-js';

// Types matching LoraSelectorModal.tsx
interface LoraModelImage {
  alt_text: string;
  url: string;
  type?: string;
  source?: string;
}

interface LoraModelFile {
  path: string;
  url: string;
  size?: number;
}

interface LoraModel {
  "Model ID": string;
  Name: string;
  Author: string;
  Images: LoraModelImage[];
  "Model Files": LoraModelFile[];
  Description?: string;
  Tags?: string[];
  "Last Modified"?: string;
  Downloads?: number;
  Likes?: number;
  lora_type: string;
  huggingface_url?: string;
  filename?: string;
  base_model?: string;
  sample_generations?: {
    url: string;
    type: 'image' | 'video';
    alt_text?: string;
  }[];
  main_generation?: string;
  is_public: boolean;
  trigger_word?: string;
}

// Curated list of Qwen Image aesthetic LoRAs (filtered - no functional/quantized/base models)
const QWEN_IMAGE_LORAS: Array<{
  modelId: string;
  name: string;
  author: string;
  description: string;
  downloadUrl: string;
  triggerWord?: string;
  downloads?: number;
  likes?: number;
  sampleImages: string[];
  tags: string[];
  baseModel: 'Qwen Image' | 'Qwen Image 2512';
  loraType: 'Qwen Image' | 'Qwen Image 2512';
}> = [
  // ============================================================================
  // QWEN IMAGE 2512 LORAS
  // ============================================================================
  {
    modelId: "qwen_image_2512_pixel_art",
    name: "Pixel Art (Qwen 2512)",
    author: "prithivMLmods",
    description: "Transforms images into pixel art style with 8-bit and 16-bit retro gaming aesthetics. Trained on 50 images with Network Dim 64, Alpha 32. Best at 1280x832 (3:1) or 1024x1024. Use 45-50 inference steps.",
    downloadUrl: "https://huggingface.co/prithivMLmods/Qwen-Image-2512-Pixel-Art-LoRA/resolve/main/Qwen-Image-2512-Master-Pixel-Art-LoRA.safetensors",
    triggerWord: "Pixel Art",
    downloads: 165,
    likes: 5,
    sampleImages: [
      "https://huggingface.co/prithivMLmods/Qwen-Image-2512-Pixel-Art-LoRA/resolve/main/images/77.png",
      "https://huggingface.co/prithivMLmods/Qwen-Image-2512-Pixel-Art-LoRA/resolve/main/images/10.png",
      "https://huggingface.co/prithivMLmods/Qwen-Image-2512-Pixel-Art-LoRA/resolve/main/images/111.png",
      "https://huggingface.co/prithivMLmods/Qwen-Image-2512-Pixel-Art-LoRA/resolve/main/images/33.png",
    ],
    tags: ["pixel-art", "retro", "gaming", "8-bit", "16-bit"],
    baseModel: "Qwen Image 2512",
    loraType: "Qwen Image 2512",
  },

  // ============================================================================
  // QWEN IMAGE LORAS - REALISM & PHOTOGRAPHY
  // ============================================================================
  {
    modelId: "qwen_image_realism",
    name: "Realism",
    author: "flymy-ai",
    description: "Enhances realism with ultra-realistic portraits featuring enhanced facial detail, better color reproduction, improved lighting and shadows. v1.1 includes increased diversity across ethnicities.",
    downloadUrl: "https://huggingface.co/flymy-ai/qwen-image-realism-lora/resolve/main/flymy_realism.safetensors",
    triggerWord: "realism",
    downloads: 3140,
    likes: 126,
    sampleImages: [
      "https://huggingface.co/flymy-ai/qwen-image-realism-lora/resolve/main/assets/flymy_realism.png",
      "https://huggingface.co/flymy-ai/qwen-image-realism-lora/resolve/main/assets/prompt_004_comparison.png",
      "https://huggingface.co/flymy-ai/qwen-image-realism-lora/resolve/main/assets/prompt_006_comparison.png",
      "https://huggingface.co/flymy-ai/qwen-image-realism-lora/resolve/main/assets/prompt_010_comparison.png",
    ],
    tags: ["realism", "photorealistic", "portrait", "photography"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
  {
    modelId: "qwen_image_studio_realism",
    name: "Studio Realism",
    author: "prithivMLmods",
    description: "Professional studio portrait style with clean backgrounds and professional lighting. Trained on 27 high-quality images. Best at 1472x1140 (4:3). Use 35-50 steps.",
    downloadUrl: "https://huggingface.co/prithivMLmods/Qwen-Image-Studio-Realism/resolve/main/qwen-studio-realism.safetensors",
    triggerWord: "Studio Realism",
    downloads: 391,
    likes: 22,
    sampleImages: [
      "https://huggingface.co/prithivMLmods/Qwen-Image-Studio-Realism/resolve/main/images/1.png",
      "https://huggingface.co/prithivMLmods/Qwen-Image-Studio-Realism/resolve/main/images/2.png",
      "https://huggingface.co/prithivMLmods/Qwen-Image-Studio-Realism/resolve/main/images/3.png",
      "https://huggingface.co/prithivMLmods/Qwen-Image-Studio-Realism/resolve/main/images/4.png",
    ],
    tags: ["studio", "portrait", "realism", "professional"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
  {
    modelId: "qwen_image_headshotx",
    name: "HeadshotX",
    author: "prithivMLmods",
    description: "Super-realistic headshot adapter with precise portrait rendering. Trained on 55 RAW images across Asian, Hispanic, Caucasian, Latina, Middle Eastern faces. Upgraded from Studio Realism.",
    downloadUrl: "https://huggingface.co/prithivMLmods/Qwen-Image-HeadshotX/resolve/main/Qwen-Image-HeadshotX.safetensors",
    triggerWord: "face headshot",
    downloads: 40,
    likes: 30,
    sampleImages: [
      "https://huggingface.co/prithivMLmods/Qwen-Image-HeadshotX/resolve/main/images/0.png",
      "https://huggingface.co/prithivMLmods/Qwen-Image-HeadshotX/resolve/main/images/1.png",
      "https://huggingface.co/prithivMLmods/Qwen-Image-HeadshotX/resolve/main/images/2.png",
      "https://huggingface.co/prithivMLmods/Qwen-Image-HeadshotX/resolve/main/images/3.png",
    ],
    tags: ["headshot", "portrait", "professional", "diverse"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
  {
    modelId: "qwen_image_boreal",
    name: "Boreal Photo",
    author: "kudzueye",
    description: "Experimental LoRA for realistic candid photography with a natural, documentary style. Best when combined with other LoRAs. Multiple variants available (blend, discrete, portraits).",
    downloadUrl: "https://huggingface.co/kudzueye/boreal-qwen-image/resolve/main/qwen-boreal-general-discrete-low-rank.safetensors",
    triggerWord: "photo",
    downloads: 19716,
    likes: 124,
    sampleImages: [], // Model page shows examples but URLs not easily extractable
    tags: ["photography", "candid", "documentary", "natural"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
  {
    modelId: "qwen_image_tilt_shift",
    name: "Tilt Shift Photography",
    author: "Quorlen",
    description: "Creates miniature-effect tilt-shift photography style that makes scenes look like tiny models.",
    downloadUrl: "https://huggingface.co/Quorlen/Qwen_Image_Tilt_Shift_Photography-lora/resolve/main/Qwen_Image_Tilt_Shift_Photography_000001000.safetensors",
    triggerWord: "Tilt Shift Photograph",
    downloads: 12,
    sampleImages: [],
    tags: ["tilt-shift", "miniature", "photography", "effect"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },

  // ============================================================================
  // QWEN IMAGE LORAS - ANIME & ILLUSTRATION
  // ============================================================================
  {
    modelId: "qwen_image_anime",
    name: "Anime",
    author: "prithivMLmods",
    description: "Anime style LoRA trained on 44 high-quality images. Best at 1664x928 (16:9). Use 40-50 inference steps.",
    downloadUrl: "https://huggingface.co/prithivMLmods/Qwen-Image-Anime-LoRA/resolve/main/qwen-anime.safetensors",
    triggerWord: "Qwen Anime",
    downloads: 195,
    likes: 10,
    sampleImages: [
      "https://huggingface.co/prithivMLmods/Qwen-Image-Anime-LoRA/resolve/main/images/1.png",
      "https://huggingface.co/prithivMLmods/Qwen-Image-Anime-LoRA/resolve/main/images/2.png",
      "https://huggingface.co/prithivMLmods/Qwen-Image-Anime-LoRA/resolve/main/images/3.png",
    ],
    tags: ["anime", "illustration", "manga", "japanese"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
  {
    modelId: "qwen_image_modern_anime",
    name: "Modern Anime",
    author: "alfredplpl",
    description: "Japanese modern anime style with v1 and v2 variants. Creates images in contemporary anime aesthetics with clean lines and vibrant colors.",
    downloadUrl: "https://huggingface.co/alfredplpl/qwen-image-modern-anime-lora/resolve/main/lora.safetensors",
    triggerWord: "Japanese modern anime style",
    downloads: 425,
    likes: 24,
    sampleImages: [
      "https://huggingface.co/alfredplpl/qwen-image-modern-anime-lora/resolve/main/ss.jpg",
      "https://huggingface.co/alfredplpl/qwen-image-modern-anime-lora/resolve/main/sample4.jpg",
      "https://huggingface.co/alfredplpl/qwen-image-modern-anime-lora/resolve/main/sample3.jpg",
    ],
    tags: ["anime", "modern", "japanese", "illustration"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
  {
    modelId: "qwen_image_anime_irl",
    name: "Anime to Real Life",
    author: "flymy-ai",
    description: "Transforms anime-style prompts into photorealistic images. Creates real-life interpretations of anime characters and scenes.",
    downloadUrl: "https://huggingface.co/flymy-ai/qwen-image-anime-irl-lora/resolve/main/flymy_anime_irl.safetensors",
    triggerWord: "Real life Anime",
    downloads: 197,
    likes: 49,
    sampleImages: [
      "https://huggingface.co/flymy-ai/qwen-image-anime-irl-lora/resolve/main/assets/irl_lora1.jpg",
      "https://huggingface.co/flymy-ai/qwen-image-anime-irl-lora/resolve/main/assets/irl_lora2.jpg",
      "https://huggingface.co/flymy-ai/qwen-image-anime-irl-lora/resolve/main/assets/irl_lora3.jpg",
    ],
    tags: ["anime", "realistic", "transformation", "portrait"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
  {
    modelId: "qwen_image_cartoon",
    name: "Cartoon",
    author: "kudosscience",
    description: "Cartoon style LoRA for creating animated, stylized images with bold colors and simplified forms.",
    downloadUrl: "https://huggingface.co/kudosscience/qwen_image_cartoon-lora/resolve/main/qwen_image_cartoon_000001000.safetensors",
    downloads: 20,
    sampleImages: [],
    tags: ["cartoon", "animation", "stylized"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },

  // ============================================================================
  // QWEN IMAGE LORAS - TRADITIONAL & CULTURAL STYLES
  // ============================================================================
  {
    modelId: "qwen_image_gufeng",
    name: "Gufeng (Chinese Classical)",
    author: "starsfriday",
    description: "Ancient Chinese-style portrait illustrations with serene, ethereal qualities. Creates anime/digital art of characters in traditional East Asian attire. By Chongqing Valiant Cat Technology.",
    downloadUrl: "https://huggingface.co/starsfriday/Qwen-Image-Gufeng-LoRA/resolve/main/qwen_image_gufeng.safetensors",
    triggerWord: "gfwm",
    downloads: 288,
    likes: 4,
    sampleImages: [
      "https://huggingface.co/starsfriday/Qwen-Image-Gufeng-LoRA/resolve/main/result/output1.png",
      "https://huggingface.co/starsfriday/Qwen-Image-Gufeng-LoRA/resolve/main/result/output2.png",
      "https://huggingface.co/starsfriday/Qwen-Image-Gufeng-LoRA/resolve/main/result/output3.png",
    ],
    tags: ["chinese", "classical", "traditional", "portrait", "fantasy"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
  {
    modelId: "qwen_image_eva",
    name: "EVA / Asuka",
    author: "starsfriday",
    description: "Evangelion-inspired anime style, specifically trained for Asuka-style characters. Creates characters with plugsuits, mecha elements, and the distinctive NGE aesthetic.",
    downloadUrl: "https://huggingface.co/starsfriday/Qwen-Image-EVA-LoRA/resolve/main/qwen_image_eva.safetensors",
    triggerWord: "mrx",
    downloads: 947,
    likes: 3,
    sampleImages: [
      "https://huggingface.co/starsfriday/Qwen-Image-EVA-LoRA/resolve/main/result/output1.png",
      "https://huggingface.co/starsfriday/Qwen-Image-EVA-LoRA/resolve/main/result/output2.png",
      "https://huggingface.co/starsfriday/Qwen-Image-EVA-LoRA/resolve/main/result/output3.png",
    ],
    tags: ["evangelion", "anime", "mecha", "character"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },

  // ============================================================================
  // QWEN IMAGE LORAS - ARTISTIC STYLES
  // ============================================================================
  {
    modelId: "qwen_image_sketch_smudge",
    name: "Sketch Smudge",
    author: "prithivMLmods",
    description: "Creates sketch-style images with a smudged, hand-drawn aesthetic. Trained on 30 images. Best at 1472x1024 (4:3). Use 35-50 steps.",
    downloadUrl: "https://huggingface.co/prithivMLmods/Qwen-Image-Sketch-Smudge/resolve/main/qwen-sketch-smudge.safetensors",
    triggerWord: "Sketch Smudge",
    downloads: 13,
    likes: 2,
    sampleImages: [
      "https://huggingface.co/prithivMLmods/Qwen-Image-Sketch-Smudge/resolve/main/images/1.png",
      "https://huggingface.co/prithivMLmods/Qwen-Image-Sketch-Smudge/resolve/main/images/2.png",
      "https://huggingface.co/prithivMLmods/Qwen-Image-Sketch-Smudge/resolve/main/images/3.png",
    ],
    tags: ["sketch", "drawing", "artistic", "monochrome"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
  {
    modelId: "qwen_image_fragmented_portraiture",
    name: "Fragmented Portraiture",
    author: "prithivMLmods",
    description: "Creates artistic portraits with transparency, collage, or blinds overlay effects. Trained on 17 images. Best at 1472x1024 (4:3). Use 35-50 steps.",
    downloadUrl: "https://huggingface.co/prithivMLmods/Qwen-Image-Fragmented-Portraiture/resolve/main/qwen-fragmented-portraiture.safetensors",
    triggerWord: "Fragmented Portraiture",
    downloads: 1,
    likes: 20,
    sampleImages: [
      "https://huggingface.co/prithivMLmods/Qwen-Image-Fragmented-Portraiture/resolve/main/images/1.png",
      "https://huggingface.co/prithivMLmods/Qwen-Image-Fragmented-Portraiture/resolve/main/images/2.png",
      "https://huggingface.co/prithivMLmods/Qwen-Image-Fragmented-Portraiture/resolve/main/images/3.png",
    ],
    tags: ["portrait", "artistic", "abstract", "collage"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },

  // ============================================================================
  // QWEN IMAGE LORAS - EFFECTS & UTILITIES
  // ============================================================================
  {
    modelId: "qwen_image_detail_slider",
    name: "Detail Slider",
    author: "ostris",
    description: "Adjustable detail level slider. Use strength -1.0 to reduce detail, 1.0 to increase detail. Great for fine-tuning image clarity and complexity.",
    downloadUrl: "https://huggingface.co/ostris/qwen_image_detail_slider/resolve/main/qwen_image_detail_slider.safetensors",
    downloads: 173,
    likes: 17,
    sampleImages: [
      "https://huggingface.co/ostris/qwen_image_detail_slider/resolve/main/images/_mnt_Train2_out_ui_qwen_image_detail_slider_samples_1758128339512__000000450_3.jpg",
    ],
    tags: ["utility", "detail", "slider", "enhancement"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
  {
    modelId: "qwen_image_dissolve",
    name: "Dissolve Effect",
    author: "RalFinger",
    description: "Creates dissolving, particle-like effects on images. Artistic disintegration style.",
    downloadUrl: "https://huggingface.co/RalFinger/ral-dissolve-qwen-image-lora/resolve/main/ral-dissolve-qwen-image.safetensors",
    triggerWord: "ral-dissolve",
    sampleImages: [],
    tags: ["effect", "dissolve", "particles", "artistic"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
  {
    modelId: "qwen_image_anthropomorphic",
    name: "Anthropomorphic",
    author: "RalFinger",
    description: "Creates anthropomorphic characters - animals with human characteristics and traits.",
    downloadUrl: "https://huggingface.co/RalFinger/ral-anthropomorphic-qwen-image-lora/resolve/main/ral-anthropomorphic-qwen-image_000001500.safetensors",
    triggerWord: "Anthropomorphic",
    downloads: 10,
    sampleImages: [],
    tags: ["anthropomorphic", "furry", "character", "fantasy"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
  {
    modelId: "qwen_image_woven_fabric",
    name: "Woven Fabric",
    author: "wouterverweirder",
    description: "Creates images with woven fabric texture patterns and aesthetics.",
    downloadUrl: "https://huggingface.co/wouterverweirder/qwen_image_woven_fabric_01-lora/resolve/main/qwen_image_woven_fabric_01_000003500.safetensors",
    downloads: 18,
    sampleImages: [],
    tags: ["fabric", "texture", "woven", "material"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
];

// Helper function to download image from URL and convert to Blob
async function downloadImageAsBlob(url: string): Promise<Blob | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Failed to download image: ${url}`);
      return null;
    }
    return await response.blob();
  } catch (error) {
    console.warn(`Error downloading image ${url}:`, error);
    return null;
  }
}

// Helper function to upload blob to Supabase storage
async function uploadToSupabase(
  supabase: ReturnType<typeof createClient>,
  blob: Blob,
  userId: string,
  filename: string
): Promise<string | null> {
  const bucket = 'media';
  const path = `uploads/${userId}/${filename}`;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, {
      contentType: blob.type,
      upsert: true
    });

  if (error) {
    console.warn(`Failed to upload ${filename}:`, error);
    return null;
  }

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return publicUrl;
}

// Main import function
export async function importQwenImageLoras(
  supabaseUrl: string,
  supabaseKey: string,
  userId: string
): Promise<void> {
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`Starting import of ${QWEN_IMAGE_LORAS.length} Qwen Image LoRAs...`);

  for (const lora of QWEN_IMAGE_LORAS) {
    console.log(`\nProcessing: ${lora.name}`);

    // Upload sample images to Supabase
    const uploadedImages: LoraModelImage[] = [];
    const sampleGenerations: { url: string; type: 'image' | 'video'; alt_text?: string }[] = [];

    for (let i = 0; i < lora.sampleImages.length; i++) {
      const imageUrl = lora.sampleImages[i];
      console.log(`  Downloading sample image ${i + 1}/${lora.sampleImages.length}...`);

      const blob = await downloadImageAsBlob(imageUrl);
      if (!blob) continue;

      const ext = imageUrl.split('.').pop()?.split('?')[0] || 'png';
      const filename = `lora_${lora.modelId}_sample_${i + 1}_${Date.now()}.${ext}`;

      const uploadedUrl = await uploadToSupabase(supabase, blob, userId, filename);
      if (uploadedUrl) {
        uploadedImages.push({
          url: uploadedUrl,
          alt_text: `${lora.name} sample ${i + 1}`,
          type: 'image',
          source: 'huggingface'
        });
        sampleGenerations.push({
          url: uploadedUrl,
          type: 'image',
          alt_text: `${lora.name} sample ${i + 1}`
        });
        console.log(`  Uploaded: ${filename}`);
      }
    }

    // Create the LoRA model object
    const loraModel: LoraModel = {
      "Model ID": lora.modelId,
      Name: lora.name,
      Author: lora.author,
      Description: lora.description,
      Images: uploadedImages,
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
      .upsert({
        user_id: userId,
        type: 'lora',
        metadata: loraModel,
        is_public: true,
      }, {
        onConflict: 'user_id,type,metadata->>"Model ID"'
      });

    if (error) {
      console.error(`  Failed to insert ${lora.name}:`, error);
    } else {
      console.log(`  Successfully imported: ${lora.name}`);
    }
  }

  console.log('\n\nImport complete!');
}

// Export the LoRA data for manual inspection
export { QWEN_IMAGE_LORAS };

// If running directly (not imported)
if (typeof window !== 'undefined') {
  console.log('Qwen Image LoRA Import Script loaded.');
  console.log('To import LoRAs, run:');
  console.log('  importQwenImageLoras(SUPABASE_URL, SUPABASE_KEY, USER_ID)');
  console.log('\nOr access QWEN_IMAGE_LORAS to see the curated list.');
}
