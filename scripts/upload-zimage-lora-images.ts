/**
 * Downloads Z-Image LoRA sample images from HuggingFace and uploads to Supabase storage
 * Then updates the LoRA resources with the new URLs
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// All Z-Image LoRA sample images (HuggingFace URLs)
const ZIMAGE_LORA_SAMPLE_IMAGES: Record<string, string[]> = {
  "pixel_art_style_z_image_turbo": [
    "https://huggingface.co/tarn59/pixel_art_style_lora_z_image_turbo/resolve/main/images/ComfyUI_00310_%20(1).png",
    "https://huggingface.co/tarn59/pixel_art_style_lora_z_image_turbo/resolve/main/images/ComfyUI_00305_%20(1).png",
    "https://huggingface.co/tarn59/pixel_art_style_lora_z_image_turbo/resolve/main/images/ComfyUI_00285_.png"
  ],
  "classic_painting_z_image_turbo": [
    "https://huggingface.co/renderartist/Classic-Painting-Z-Image-Turbo-LoRA/resolve/main/images/Classic_Painting_Z_00076_.png",
    "https://huggingface.co/renderartist/Classic-Painting-Z-Image-Turbo-LoRA/resolve/main/images/Classic_Painting_Z_00006_.png"
  ],
  "80s_air_brush_style_z_image_turbo": [
    "https://huggingface.co/tarn59/80s_air_brush_style_z_image_turbo/resolve/main/images/ComfyUI_00707_.png",
    "https://huggingface.co/tarn59/80s_air_brush_style_z_image_turbo/resolve/main/images/ComfyUI_00703_.png"
  ],
  "coloring_book_z_image_turbo": [
    "https://huggingface.co/renderartist/Coloring-Book-Z-Image-Turbo-LoRA/resolve/main/images/CBZ_00664_.png",
    "https://huggingface.co/renderartist/Coloring-Book-Z-Image-Turbo-LoRA/resolve/main/images/CBZ_00651_.png"
  ],
  "saturday_morning_z_image_turbo": [
    "https://huggingface.co/renderartist/Saturday-Morning-Z-Image-Turbo/resolve/main/images/Saturday_Morning_Z_20.png",
    "https://huggingface.co/renderartist/Saturday-Morning-Z-Image-Turbo/resolve/main/images/Saturday_Morning_Z_05.png"
  ],
  "d_art_z_image_turbo": [
    "https://huggingface.co/AiAF/D-ART_Z-Image-Turbo_LoRA/resolve/main/images/example_va0yozu4z.png",
    "https://huggingface.co/AiAF/D-ART_Z-Image-Turbo_LoRA/resolve/main/images/example_2lam3w01o.png"
  ],
  "3d_mmorpg_style_z_image_turbo": [
    "https://huggingface.co/DK9/3D_MMORPG_style_z-image-turbo_lora/resolve/main/images/01_with_lora.png",
    "https://huggingface.co/DK9/3D_MMORPG_style_z-image-turbo_lora/resolve/main/images/02_with_lora.png"
  ],
  "vintage_comic_style_z_image": [
    "https://huggingface.co/lovis93/vintage-comic-style-zimage-lora/resolve/main/00.png",
    "https://huggingface.co/lovis93/vintage-comic-style-zimage-lora/resolve/main/01.png"
  ],
  "behind_reeded_glass_z_image_turbo": [
    "https://huggingface.co/Quorlen/Z-Image-Turbo-Behind-Reeded-Glass-Lora/resolve/main/images/ComfyUI_00391_.png",
    "https://huggingface.co/Quorlen/Z-Image-Turbo-Behind-Reeded-Glass-Lora/resolve/main/images/ComfyUI_00392_.png"
  ],
  "sunbleached_photograph_z_image_turbo": [
    "https://huggingface.co/Quorlen/z_image_turbo_Sunbleached_Protograph_Style_Lora/resolve/main/images/ComfyUI_00024_.png",
    "https://huggingface.co/Quorlen/z_image_turbo_Sunbleached_Protograph_Style_Lora/resolve/main/images/ComfyUI_00028_.png"
  ],
  "historic_color_z_image_turbo": [
    "https://huggingface.co/AlekseyCalvin/HistoricColor_Z-image-Turbo-LoRA/resolve/main/HSTZgen.webp",
    "https://huggingface.co/AlekseyCalvin/HistoricColor_Z-image-Turbo-LoRA/resolve/main/HSTZgen3.webp"
  ],
  "childrens_drawings_z_image_turbo": [
    "https://huggingface.co/ostris/z_image_turbo_childrens_drawings/resolve/main/images/1764433583842__000003000_0.jpg",
    "https://huggingface.co/ostris/z_image_turbo_childrens_drawings/resolve/main/images/1764433587842__000003000_1.jpg"
  ],
  "pencil_sketch_z_image_turbo": [
    "https://huggingface.co/Ttio2/Z-Image-Turbo-pencil-sketch/resolve/main/images/z-image_00100_.png",
    "https://huggingface.co/Ttio2/Z-Image-Turbo-pencil-sketch/resolve/main/images/z-image_00099_.png"
  ],
  "realism_z_image_turbo": [
    "https://huggingface.co/suayptalha/Z-Image-Turbo-Realism-LoRA/resolve/main/images/mpzr-wsdQmgxbZIfP8bfb.png",
    "https://huggingface.co/suayptalha/Z-Image-Turbo-Realism-LoRA/resolve/main/images/n4aSpqa-YFXYo4dtcIg4W.png"
  ],
  "reversal_film_gravure_z_image_turbo": [
    "https://huggingface.co/AIImageStudio/ReversalFilmGravure_z_Image_turbo_v2.0/resolve/main/images/2025-12-12_213257-z_image_z_image_turbo_bf16-831733836635472-euler_10_hires.png",
    "https://huggingface.co/AIImageStudio/ReversalFilmGravure_z_Image_turbo_v2.0/resolve/main/images/2025-12-12_213736-z_image_z_image_turbo_bf16-768412127747288-euler_10_hires.png"
  ],
  "marionette_modernism_z_image_turbo": [
    "https://huggingface.co/AlekseyCalvin/DadaDolls_ZiT_LoRA/resolve/main/Dadacat.webp",
    "https://huggingface.co/AlekseyCalvin/DadaDolls_ZiT_LoRA/resolve/main/scarletsailsdolls1.webp"
  ],
  "panyue_z_image_turbo": [
    "https://huggingface.co/MGRI/Z-Image-Turbo-Panyue-Lora/resolve/main/1.png"
  ],
  "elusarca_anime_style_z_image": [
    "https://cdn-uploads.huggingface.co/production/uploads/661d56bdbca423783d3184d9/FZGdE-FNzQen53NwCXXbu.png",
    "https://cdn-uploads.huggingface.co/production/uploads/661d56bdbca423783d3184d9/oSYXkrJiBd6eUwQ8LIRgo.png",
    "https://cdn-uploads.huggingface.co/production/uploads/661d56bdbca423783d3184d9/OFz4NJNZKcpyfPTgjJiPA.png"
  ],
  "z_image_arcane_v1": [
    "https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/samples/arcane.png"
  ],
  "z_image_archer_style": [
    "https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/samples/archer.png"
  ],
  "z_image_blue_eye_samurai": [
    "https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/samples/blue_eye_samurai.png"
  ],
  "ghibli_style_z_image_turbo": [
    "https://huggingface.co/Ttio2/Z-Image-Turbo-Ghibli-Style/resolve/main/images/z-image_00147_.png",
    "https://huggingface.co/Ttio2/Z-Image-Turbo-Ghibli-Style/resolve/main/images/z-image_00152_.png",
    "https://huggingface.co/Ttio2/Z-Image-Turbo-Ghibli-Style/resolve/main/images/z-image_00149_.png"
  ],
  "z_image_dan_mumford_style": [
    "https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/samples/dan-mumford-style.png"
  ],
  "logc4_color_grade_z_image_turbo": [
    "https://huggingface.co/Sumitc13/Z-image-Turbo_LogC4_lora/resolve/main/images/1764464512096__000005000_0.jpg",
    "https://huggingface.co/Sumitc13/Z-image-Turbo_LogC4_lora/resolve/main/images/1764464517272__000005000_1.jpg",
    "https://huggingface.co/Sumitc13/Z-image-Turbo_LogC4_lora/resolve/main/images/1764464522440__000005000_2.jpg"
  ],
  "technically_color_z_image_turbo": [
    "https://huggingface.co/renderartist/Technically-Color-Z-Image-Turbo/resolve/main/images/ComfyUI_00828_.png",
    "https://huggingface.co/renderartist/Technically-Color-Z-Image-Turbo/resolve/main/images/ComfyUI_00712_.png",
    "https://huggingface.co/renderartist/Technically-Color-Z-Image-Turbo/resolve/main/images/ComfyUI_00909_.png"
  ],
  "albany_bulb_artzone_z_image_turbo": [
    "https://huggingface.co/AlekseyCalvin/AlbanyBulb_ArtZone_var3_Z-image-Turbo_LoRA/resolve/main/bulb3ii.jpg",
    "https://huggingface.co/AlekseyCalvin/AlbanyBulb_ArtZone_var3_Z-image-Turbo_LoRA/resolve/main/bylb3iii.jpg",
    "https://huggingface.co/AlekseyCalvin/AlbanyBulb_ArtZone_var3_Z-image-Turbo_LoRA/resolve/main/bulb3i.jpg"
  ]
};

async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const filename = url.substring(url.lastIndexOf('/') + 1);
    console.log(`    Downloading: ${filename.substring(0, 50)}...`);
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
  const path = `lora-samples/zimage/${filename}`;

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

function getExtension(url: string): string {
  if (url.includes('.webp')) return 'webp';
  if (url.includes('.jpg') || url.includes('.jpeg')) return 'jpg';
  return 'png';
}

async function main() {
  console.log('Starting image upload for Z-Image LoRAs...\n');

  let totalUploaded = 0;
  let totalFailed = 0;

  for (const [modelId, imageUrls] of Object.entries(ZIMAGE_LORA_SAMPLE_IMAGES)) {
    console.log(`\nProcessing: ${modelId}`);

    const uploadedUrls: string[] = [];

    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i];
      const result = await downloadImage(url);

      if (!result) {
        totalFailed++;
        continue;
      }

      const ext = getExtension(url);
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
