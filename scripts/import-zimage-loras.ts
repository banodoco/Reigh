/**
 * LoRA Import Script (Z-Image & Wan)
 *
 * This script imports curated aesthetic, style, and motion LoRAs from HuggingFace
 * into the Reigh database with their sample images uploaded to Supabase storage.
 *
 * Supported LoRA types:
 * - Z-Image: Style and aesthetic LoRAs for Z-Image Turbo image generation
 * - Wan 2.1/2.2: Style, aesthetic, and motion LoRAs for Wan video generation
 *   (includes multi-stage high/low noise LoRAs for Wan 2.2)
 *
 * Run this script from the browser console while logged in, or use it as a Node.js script
 * with proper authentication setup.
 *
 * Usage:
 * 1. Copy this to browser console while logged in to Reigh
 * 2. Or: npx tsx scripts/import-zimage-loras.ts
 *
 * Functions:
 * - importZImageLoras(): Import Z-Image LoRAs only
 * - importWanLoras(): Import Wan LoRAs only
 * - importAllLoras(): Import both Z-Image and Wan LoRAs
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

// Curated list of Z-Image aesthetic LoRAs (filtered - no functional/character LoRAs)
const Z_IMAGE_LORAS: Array<{
  modelId: string;
  name: string;
  author: string;
  description: string;
  downloadUrl: string;
  triggerWord?: string;
  downloads?: number;
  sampleImages: string[];
  tags: string[];
}> = [
  {
    modelId: "pixel_art_style_z_image_turbo",
    name: "Pixel Art Style",
    author: "tarn59",
    description: "Transforms images into pixel art style with retro gaming aesthetics. Great for creating nostalgic, 8-bit inspired artwork.",
    downloadUrl: "https://huggingface.co/tarn59/pixel_art_style_lora_z_image_turbo/resolve/main/pixel_art_style_z_image_turbo.safetensors",
    downloads: 338000,
    sampleImages: [
      "https://huggingface.co/tarn59/pixel_art_style_lora_z_image_turbo/resolve/main/images/ComfyUI_00310_%20(1).png",
      "https://huggingface.co/tarn59/pixel_art_style_lora_z_image_turbo/resolve/main/images/ComfyUI_00305_%20(1).png",
      "https://huggingface.co/tarn59/pixel_art_style_lora_z_image_turbo/resolve/main/images/ComfyUI_00285_.png",
    ],
    tags: ["pixel-art", "retro", "gaming", "8-bit"],
  },
  {
    modelId: "classic_painting_z_image_turbo",
    name: "Classic Painting",
    author: "renderartist",
    description: "Creates images in the style of classic oil paintings with rich textures and traditional artistic techniques.",
    downloadUrl: "https://huggingface.co/renderartist/Classic-Painting-Z-Image-Turbo-LoRA/resolve/main/Classic_Painting_Z_Image_Turbo_v1_renderartist_1750.safetensors",
    downloads: 1620,
    sampleImages: [
      "https://huggingface.co/renderartist/Classic-Painting-Z-Image-Turbo-LoRA/resolve/main/images/Classic_Painting_Z_00076_.png",
      "https://huggingface.co/renderartist/Classic-Painting-Z-Image-Turbo-LoRA/resolve/main/images/Classic_Painting_Z_00006_.png",
      "https://huggingface.co/renderartist/Classic-Painting-Z-Image-Turbo-LoRA/resolve/main/images/Classic_Painting_Z_00063_.png",
    ],
    tags: ["painting", "classical", "oil-painting", "fine-art"],
  },
  {
    modelId: "80s_air_brush_style_z_image_turbo",
    name: "80s Airbrush Style",
    author: "tarn59",
    description: "Recreates the distinctive 80s airbrush aesthetic popular in album covers and vintage posters.",
    downloadUrl: "https://huggingface.co/tarn59/80s_air_brush_style_z_image_turbo/resolve/main/80s_air_brush_style_v2_z_image_turbo.safetensors",
    triggerWord: "80s Air Brush style.",
    sampleImages: [
      "https://huggingface.co/tarn59/80s_air_brush_style_z_image_turbo/resolve/main/images/ComfyUI_00707_.png",
      "https://huggingface.co/tarn59/80s_air_brush_style_z_image_turbo/resolve/main/images/ComfyUI_00703_.png",
      "https://huggingface.co/tarn59/80s_air_brush_style_z_image_turbo/resolve/main/images/ComfyUI_00694_.png",
    ],
    tags: ["80s", "airbrush", "retro", "vintage"],
  },
  {
    modelId: "coloring_book_z_image_turbo",
    name: "Coloring Book",
    author: "renderartist",
    description: "Creates clean line art suitable for coloring books with bold outlines and simplified shapes.",
    downloadUrl: "https://huggingface.co/renderartist/Coloring-Book-Z-Image-Turbo-LoRA/resolve/main/Coloring_Book_Z_Image_Turbo_v1_renderartist_2000.safetensors",
    triggerWord: "c0l0ringb00k",
    sampleImages: [
      "https://huggingface.co/renderartist/Coloring-Book-Z-Image-Turbo-LoRA/resolve/main/images/CBZ_00664_.png",
      "https://huggingface.co/renderartist/Coloring-Book-Z-Image-Turbo-LoRA/resolve/main/images/CBZ_00651_.png",
      "https://huggingface.co/renderartist/Coloring-Book-Z-Image-Turbo-LoRA/resolve/main/images/CBZ_00669_.png",
    ],
    tags: ["coloring-book", "line-art", "kids", "illustration"],
  },
  {
    modelId: "saturday_morning_z_image_turbo",
    name: "Saturday Morning Cartoon",
    author: "renderartist",
    description: "Creates images in the style of classic Saturday morning cartoons with bold colors and expressive characters.",
    downloadUrl: "https://huggingface.co/renderartist/Saturday-Morning-Z-Image-Turbo/resolve/main/Saturday_Morning_Z_Image_Turbo_v1_renderartist_1500.safetensors",
    triggerWord: "saturd4ym0rning",
    sampleImages: [
      "https://huggingface.co/renderartist/Saturday-Morning-Z-Image-Turbo/resolve/main/images/Saturday_Morning_Z_20.png",
      "https://huggingface.co/renderartist/Saturday-Morning-Z-Image-Turbo/resolve/main/images/Saturday_Morning_Z_05.png",
      "https://huggingface.co/renderartist/Saturday-Morning-Z-Image-Turbo/resolve/main/images/Saturday_Morning_Z_14.png",
    ],
    tags: ["cartoon", "animation", "retro", "kids"],
  },
  {
    modelId: "d_art_z_image_turbo",
    name: "D-ART Fantasy",
    author: "AiAF",
    description: "Creates dramatic fantasy artwork with rich details and epic compositions. Great for game art and illustrations.",
    downloadUrl: "https://huggingface.co/AiAF/D-ART_Z-Image-Turbo_LoRA/resolve/main/D-ART_Z-Image-Turbo.safetensors",
    sampleImages: [
      "https://huggingface.co/AiAF/D-ART_Z-Image-Turbo_LoRA/resolve/main/images/example_va0yozu4z.png",
      "https://huggingface.co/AiAF/D-ART_Z-Image-Turbo_LoRA/resolve/main/images/example_2lam3w01o.png",
      "https://huggingface.co/AiAF/D-ART_Z-Image-Turbo_LoRA/resolve/main/images/example_33x9rdwow.png",
    ],
    tags: ["fantasy", "game-art", "epic", "illustration"],
  },
  {
    modelId: "3d_mmorpg_style_z_image_turbo",
    name: "3D MMORPG Style",
    author: "DK9",
    description: "Creates images in the style of 3D MMORPGs like Lost Ark with detailed fantasy characters and armor.",
    downloadUrl: "https://huggingface.co/DK9/3D_MMORPG_style_z-image-turbo_lora/resolve/main/lostark_v1.safetensors",
    sampleImages: [
      "https://huggingface.co/DK9/3D_MMORPG_style_z-image-turbo_lora/resolve/main/images/01_with_lora.png",
      "https://huggingface.co/DK9/3D_MMORPG_style_z-image-turbo_lora/resolve/main/images/02_with_lora.png",
      "https://huggingface.co/DK9/3D_MMORPG_style_z-image-turbo_lora/resolve/main/images/03_with_lora.png",
    ],
    tags: ["3d", "mmorpg", "game-art", "fantasy"],
  },
  {
    modelId: "vintage_comic_style_z_image",
    name: "Vintage Comic Style",
    author: "lovis93",
    description: "Creates images with bold black outlines, halftone textures, and vibrant retro color palettes inspired by 1960s-70s illustrations.",
    downloadUrl: "https://huggingface.co/lovis93/vintage-comic-style-zimage-lora/resolve/main/vintage_comic_style_lora.safetensors",
    downloads: 39,
    sampleImages: [
      "https://huggingface.co/lovis93/vintage-comic-style-zimage-lora/resolve/main/00.png",
      "https://huggingface.co/lovis93/vintage-comic-style-zimage-lora/resolve/main/01.png",
      "https://huggingface.co/lovis93/vintage-comic-style-zimage-lora/resolve/main/02.png",
    ],
    tags: ["comic", "vintage", "retro", "pop-art"],
  },
  {
    modelId: "behind_reeded_glass_z_image_turbo",
    name: "Behind Reeded Glass",
    author: "Quorlen",
    description: "Creates a distinctive distorted effect as if the subject is viewed through reeded/fluted glass.",
    downloadUrl: "https://huggingface.co/Quorlen/Z-Image-Turbo-Behind-Reeded-Glass-Lora/resolve/main/Z_Image_Turbo_Behind_Reeded_Glass_Lora__TAV2.safetensors",
    triggerWord: "Act1vate! {subject}, behind reeded glass",
    downloads: 249,
    sampleImages: [
      "https://huggingface.co/Quorlen/Z-Image-Turbo-Behind-Reeded-Glass-Lora/resolve/main/images/ComfyUI_00391_.png",
      "https://huggingface.co/Quorlen/Z-Image-Turbo-Behind-Reeded-Glass-Lora/resolve/main/images/ComfyUI_00392_.png",
      "https://huggingface.co/Quorlen/Z-Image-Turbo-Behind-Reeded-Glass-Lora/resolve/main/images/ComfyUI_00393_.png",
    ],
    tags: ["glass", "distortion", "artistic", "effect"],
  },
  {
    modelId: "sunbleached_photograph_z_image_turbo",
    name: "Sunbleached Photograph",
    author: "Quorlen",
    description: "Creates warm, sun-faded photograph aesthetic with peach skin tones, cyan grass, and light vignetting.",
    downloadUrl: "https://huggingface.co/Quorlen/z_image_turbo_Sunbleached_Protograph_Style_Lora/resolve/main/zimageturbo_Sunbleach_Photograph_Style_Lora_TAV2_000002500_(recommended).safetensors",
    sampleImages: [
      "https://huggingface.co/Quorlen/z_image_turbo_Sunbleached_Protograph_Style_Lora/resolve/main/images/ComfyUI_00024_.png",
      "https://huggingface.co/Quorlen/z_image_turbo_Sunbleached_Protograph_Style_Lora/resolve/main/images/ComfyUI_00028_.png",
      "https://huggingface.co/Quorlen/z_image_turbo_Sunbleached_Protograph_Style_Lora/resolve/main/images/ComfyUI_00027_.png",
    ],
    tags: ["vintage", "photograph", "warm", "nostalgic"],
  },
  {
    modelId: "historic_color_z_image_turbo",
    name: "Historic Color",
    author: "AlekseyCalvin",
    description: "Recreates the look of early color photography and autochrome images with historic, vintage aesthetics.",
    downloadUrl: "https://huggingface.co/AlekseyCalvin/HistoricColor_Z-image-Turbo-LoRA/resolve/main/ZImage1HST.safetensors",
    triggerWord: "HST photo",
    sampleImages: [
      "https://huggingface.co/AlekseyCalvin/HistoricColor_Z-image-Turbo-LoRA/resolve/main/HSTZgen.webp",
      "https://huggingface.co/AlekseyCalvin/HistoricColor_Z-image-Turbo-LoRA/resolve/main/HSTZgen3.webp",
      "https://huggingface.co/AlekseyCalvin/HistoricColor_Z-image-Turbo-LoRA/resolve/main/HSTZgen5.webp",
    ],
    tags: ["historic", "vintage", "autochrome", "photography"],
  },
  {
    modelId: "childrens_drawings_z_image_turbo",
    name: "Children's Drawings",
    author: "ostris",
    description: "Transforms prompts into charming, child-like drawings with playful, naive art style.",
    downloadUrl: "https://huggingface.co/ostris/z_image_turbo_childrens_drawings/resolve/main/z_image_turbo_childrens_drawings.safetensors",
    sampleImages: [
      "https://huggingface.co/ostris/z_image_turbo_childrens_drawings/resolve/main/images/1764433583842__000003000_0.jpg",
      "https://huggingface.co/ostris/z_image_turbo_childrens_drawings/resolve/main/images/1764433587842__000003000_1.jpg",
      "https://huggingface.co/ostris/z_image_turbo_childrens_drawings/resolve/main/images/1764433591828__000003000_2.jpg",
    ],
    tags: ["kids", "naive-art", "playful", "drawing"],
  },
  {
    modelId: "pencil_sketch_z_image_turbo",
    name: "Pencil Sketch",
    author: "Ttio2",
    description: "Creates color and grayscale pencil sketch artwork with realistic hand-drawn aesthetics.",
    downloadUrl: "https://huggingface.co/Ttio2/Z-Image-Turbo-pencil-sketch/resolve/main/Zimage_pencil_sketch.safetensors",
    sampleImages: [
      "https://huggingface.co/Ttio2/Z-Image-Turbo-pencil-sketch/resolve/main/images/z-image_00100_.png",
      "https://huggingface.co/Ttio2/Z-Image-Turbo-pencil-sketch/resolve/main/images/z-image_00099_.png",
      "https://huggingface.co/Ttio2/Z-Image-Turbo-pencil-sketch/resolve/main/images/z-image_00097_.png",
    ],
    tags: ["sketch", "pencil", "drawing", "monochrome"],
  },
  {
    modelId: "realism_z_image_turbo",
    name: "Realism",
    author: "suayptalha",
    description: "Enhances realism with ultra-realistic portraits and scenes featuring cinematic lighting and detailed textures.",
    downloadUrl: "https://huggingface.co/suayptalha/Z-Image-Turbo-Realism-LoRA/resolve/main/pytorch_lora_weights.safetensors",
    downloads: 9880,
    sampleImages: [
      "https://huggingface.co/suayptalha/Z-Image-Turbo-Realism-LoRA/resolve/main/images/mpzr-wsdQmgxbZIfP8bfb.png",
      "https://huggingface.co/suayptalha/Z-Image-Turbo-Realism-LoRA/resolve/main/images/n4aSpqa-YFXYo4dtcIg4W.png",
      "https://huggingface.co/suayptalha/Z-Image-Turbo-Realism-LoRA/resolve/main/images/potNK0JwrjpBkYcyfXeuk.png",
    ],
    tags: ["realism", "photorealistic", "cinematic", "portrait"],
  },
  {
    modelId: "reversal_film_gravure_z_image_turbo",
    name: "Reversal Film Gravure",
    author: "AIImageStudio",
    description: "Creates analog film photography aesthetic with the distinctive look of reversal film and gravure printing.",
    downloadUrl: "https://huggingface.co/AIImageStudio/ReversalFilmGravure_z_Image_turbo_v2.0/resolve/main/z_image_turbo_ReversalFilmGravure_v2.0.safetensors",
    sampleImages: [
      "https://huggingface.co/AIImageStudio/ReversalFilmGravure_z_Image_turbo_v2.0/resolve/main/images/2025-12-12_213257-z_image_z_image_turbo_bf16-831733836635472-euler_10_hires.png",
      "https://huggingface.co/AIImageStudio/ReversalFilmGravure_z_Image_turbo_v2.0/resolve/main/images/2025-12-12_213736-z_image_z_image_turbo_bf16-768412127747288-euler_10_hires.png",
      "https://huggingface.co/AIImageStudio/ReversalFilmGravure_z_Image_turbo_v2.0/resolve/main/images/2025-12-12_214350-z_image_z_image_turbo_bf16-536943120505482-euler_10_hires.png",
    ],
    tags: ["film", "analog", "gravure", "vintage"],
  },
  {
    modelId: "tarot_z_image",
    name: "Tarot Card Style",
    author: "multimodalart",
    description: "Creates images in the style of traditional tarot cards with mystical, ornate aesthetics.",
    downloadUrl: "https://huggingface.co/multimodalart/tarot-z-image-lora/resolve/main/tarot-z-image.safetensors",
    triggerWord: "trtcrd",
    downloads: 164,
    sampleImages: [], // No sample images available on HF page
    tags: ["tarot", "mystical", "ornate", "illustration"],
  },
  {
    modelId: "nyx_z_image",
    name: "Nyx Dark Aesthetic",
    author: "abrssv",
    description: "Creates dark, moody aesthetic images with dramatic lighting and atmospheric effects.",
    downloadUrl: "https://huggingface.co/abrssv/z-image-nyx-lora/resolve/main/z-image-nyx.safetensors",
    downloads: 36,
    sampleImages: [], // No sample images available on HF page
    tags: ["dark", "moody", "atmospheric", "gothic"],
  },
  {
    modelId: "panyue_z_image_turbo",
    name: "Panyue Style",
    author: "MGRI",
    description: "Creates images in the distinctive Panyue artistic style.",
    downloadUrl: "https://huggingface.co/MGRI/Z-Image-Turbo-Panyue-Lora/resolve/main/Panyue_ZIT_MGRI.safetensors",
    downloads: 90,
    sampleImages: [], // No sample images found
    tags: ["artistic", "style"],
  },
  {
    modelId: "marionette_modernism_z_image_turbo",
    name: "Marionette Modernism",
    author: "AlekseyCalvin",
    description: "Creates surreal, modernist art with marionette and doll-like aesthetics.",
    downloadUrl: "https://huggingface.co/AlekseyCalvin/Marionette_Modernism_Z-image-Turbo_LoRA/resolve/main/ZImageDadadoll_000003600.safetensors",
    downloads: 80,
    sampleImages: [], // No sample images found
    tags: ["surreal", "modernism", "art", "avant-garde"],
  },
  {
    modelId: "rebel_midjourney_z_image",
    name: "Rebel Midjourney",
    author: "realrebelai",
    description: "Creates images with a Midjourney-like aesthetic using Z-Image.",
    downloadUrl: "https://huggingface.co/realrebelai/RebelMidjourney_Z-Image_LoRA/resolve/main/RebelMidjourney%20(Z-Image).safetensors",
    sampleImages: [], // No sample images found
    tags: ["midjourney", "artistic", "creative"],
  },
  {
    modelId: "rebel_imagine_z_image",
    name: "Rebel Imagine",
    author: "realrebelai",
    description: "Creative imagination style LoRA for artistic and fantastical images.",
    downloadUrl: "https://huggingface.co/realrebelai/RebelImagine_Z-Image_LoRA/resolve/main/Rebelimagine%20(z-Image).safetensors",
    sampleImages: [], // No sample images found
    tags: ["imagination", "creative", "artistic"],
  },
  {
    modelId: "laavu_z_image",
    name: "Laavu Style",
    author: "jaahas",
    description: "Creates images in the Laavu artistic style.",
    downloadUrl: "https://huggingface.co/jaahas/laavu-z-image-lora/resolve/main/laavu.safetensors",
    downloads: 72,
    sampleImages: [], // No sample images found
    tags: ["artistic", "style"],
  },
  // === NEW Z-IMAGE LORAS (January 2026) ===
  {
    modelId: "z_image_arcane_v1",
    name: "Arcane Style (Z-Image)",
    author: "DeverStyle",
    description: "Creates images in the distinctive Arcane (Netflix/League of Legends) animation style with painterly textures and dramatic lighting.",
    downloadUrl: "https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/z_image_arcane_v1.safetensors",
    downloads: 12,
    sampleImages: [],
    tags: ["arcane", "animation", "netflix", "painterly", "league-of-legends"],
  },
  {
    modelId: "z_image_archer_style",
    name: "Archer Animation Style (Z-Image)",
    author: "DeverStyle",
    description: "Creates images in the Archer animated series style with clean lines and distinctive character designs.",
    downloadUrl: "https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/z_image_archer_style.safetensors",
    downloads: 12,
    sampleImages: [],
    tags: ["archer", "animation", "cartoon", "spy", "retro"],
  },
  {
    modelId: "z_image_blue_eye_samurai",
    name: "Blue Eye Samurai Style (Z-Image)",
    author: "DeverStyle",
    description: "Creates images in the Blue Eye Samurai animation style with Japanese-inspired aesthetics and dramatic compositions.",
    downloadUrl: "https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/z_image_blue_eye_samurai.safetensors",
    downloads: 12,
    sampleImages: [],
    tags: ["anime", "samurai", "japanese", "netflix", "dramatic"],
  },
  {
    modelId: "z_image_dan_mumford_style",
    name: "Dan Mumford Style (Z-Image)",
    author: "DeverStyle",
    description: "Creates images in Dan Mumford's iconic illustration style with intricate linework, vibrant colors, and psychedelic rock poster aesthetics.",
    downloadUrl: "https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/z_image_dan-mumford_style.safetensors",
    downloads: 12,
    sampleImages: [],
    tags: ["dan-mumford", "illustration", "psychedelic", "rock-poster", "intricate"],
  },
  {
    modelId: "elusarca_anime_style_z_image",
    name: "Elusarca Anime Style (Z-Image)",
    author: "reverentelusarca",
    description: "Creates vibrant anime-style images with expressive characters and colorful compositions.",
    downloadUrl: "https://huggingface.co/reverentelusarca/elusarca-anime-style-lora-z-image-turbo/resolve/main/elusarca-anime-style.safetensors",
    downloads: 7,
    sampleImages: [],
    tags: ["anime", "colorful", "expressive", "character"],
  },
];

// =============================================================================
// WAN LORAS - Aesthetic, Character, and Motion LoRAs for Wan video generation
// =============================================================================

// Types for Wan LoRAs (supports multi-stage high/low noise)
interface WanLoraEntry {
  modelId: string;
  name: string;
  author: string;
  description: string;
  downloadUrl: string;
  triggerWord?: string;
  downloads?: number;
  likes?: number;
  sampleImages: string[];
  sampleVideos?: string[];
  tags: string[];
  // Multi-stage LoRA support (Wan 2.2 models)
  highNoiseUrl?: string;
  lowNoiseUrl?: string;
  // Base model variant
  baseModel: 'Wan 2.1 T2V' | 'Wan 2.1 I2V' | 'Wan 2.2 T2V' | 'Wan 2.2 I2V' | 'Wan 2.1 1.3B';
  // Category for filtering
  category: 'aesthetic' | 'motion' | 'character' | 'style';
}

const WAN_LORAS: WanLoraEntry[] = [
  // === MOTION LORAS ===
  {
    modelId: "wan22_14b_i2v_orbit_shot",
    name: "Orbit Camera Shot (Wan 2.2 I2V)",
    author: "ostris",
    description: "Creates smooth orbital camera movements around subjects. Multi-stage LoRA with separate high and low noise models for Wan 2.2 I2V 14B.",
    downloadUrl: "https://huggingface.co/ostris/wan22_i2v_14b_orbit_shot_lora/resolve/main/wan22_14b_i2v_orbit_high_noise.safetensors",
    highNoiseUrl: "https://huggingface.co/ostris/wan22_i2v_14b_orbit_shot_lora/resolve/main/wan22_14b_i2v_orbit_high_noise.safetensors",
    lowNoiseUrl: "https://huggingface.co/ostris/wan22_i2v_14b_orbit_shot_lora/resolve/main/wan22_14b_i2v_orbit_low_noise.safetensors",
    triggerWord: "orbit 360",
    downloads: 2400,
    likes: 54,
    sampleImages: [],
    tags: ["motion", "camera", "orbit", "360", "circular"],
    baseModel: "Wan 2.2 I2V",
    category: "motion",
  },
  {
    modelId: "motion_camera_push_in_wan_14b",
    name: "Camera Push-In (Wan 2.1 I2V)",
    author: "lovis93",
    description: "Creates smooth camera push-in/dolly-in movements toward subjects. Great for dramatic reveal shots.",
    downloadUrl: "https://huggingface.co/lovis93/Motion-Lora-Camera-Push-In-Wan-14B-720p-I2V/resolve/main/motionpushin-v5-wan-i2v-14b-720p-400.safetensors",
    triggerWord: "Push-in camera",
    downloads: 92,
    likes: 92,
    sampleImages: [],
    tags: ["motion", "camera", "push-in", "dolly", "dramatic"],
    baseModel: "Wan 2.1 I2V",
    category: "motion",
  },

  // === AESTHETIC LORAS ===
  {
    modelId: "wan21_14b_shinkai_anime",
    name: "Makoto Shinkai Anime Style (Wan 2.1)",
    author: "Cseti",
    description: "Creates videos in the beautiful Makoto Shinkai (Your Name, Weathering With You) anime style with stunning skies, light rays, and atmospheric effects.",
    downloadUrl: "https://huggingface.co/Cseti/wan-14b-shinkai-anime-style-lora-v1/resolve/main/547095-wan-sh1nka1-e140.safetensors",
    triggerWord: "sh1nka1",
    sampleImages: [],
    tags: ["anime", "shinkai", "atmospheric", "beautiful", "sky"],
    baseModel: "Wan 2.1 T2V",
    category: "style",
  },
  {
    modelId: "wan21_1_3b_aesthetics",
    name: "Aesthetics Enhancement (Wan 2.1 1.3B)",
    author: "DiffSynth-Studio",
    description: "General aesthetic improvement LoRA that enhances visual quality, color grading, and overall appeal of generated videos.",
    downloadUrl: "https://huggingface.co/DiffSynth-Studio/Wan2.1-1.3b-lora-aesthetics-v1/resolve/main/model.safetensors",
    downloads: 175,
    sampleImages: [],
    tags: ["aesthetic", "quality", "enhancement", "color"],
    baseModel: "Wan 2.1 1.3B",
    category: "aesthetic",
  },
  {
    modelId: "wan21_14b_hps21_reward",
    name: "HPS 2.1 Aesthetic Reward (Wan 2.1 14B)",
    author: "alibaba-pai",
    description: "Human Preference Score 2.1 reward LoRA that improves aesthetic quality based on human preference training data.",
    downloadUrl: "https://huggingface.co/alibaba-pai/Wan2.1-Fun-Reward-LoRAs/resolve/main/Wan2.1-Fun-14B-InP-HPS2.1.safetensors",
    downloads: 7940,
    likes: 60,
    sampleImages: [],
    tags: ["aesthetic", "reward", "hps", "quality", "preference"],
    baseModel: "Wan 2.1 T2V",
    category: "aesthetic",
  },
  {
    modelId: "wan21_14b_mps_reward",
    name: "MPS Aesthetic Reward (Wan 2.1 14B)",
    author: "alibaba-pai",
    description: "Motion Preference Score reward LoRA that improves motion quality and temporal consistency.",
    downloadUrl: "https://huggingface.co/alibaba-pai/Wan2.1-Fun-Reward-LoRAs/resolve/main/Wan2.1-Fun-14B-InP-MPS.safetensors",
    downloads: 7940,
    likes: 60,
    sampleImages: [],
    tags: ["aesthetic", "reward", "mps", "motion", "temporal"],
    baseModel: "Wan 2.1 T2V",
    category: "aesthetic",
  },
  {
    modelId: "wan22_14b_hps21_reward",
    name: "HPS 2.1 Aesthetic Reward (Wan 2.2 14B)",
    author: "alibaba-pai",
    description: "Human Preference Score 2.1 reward LoRA for Wan 2.2. Multi-stage with high and low noise variants.",
    downloadUrl: "https://huggingface.co/alibaba-pai/Wan2.2-Fun-Reward-LoRAs/resolve/main/Wan2.2-Fun-A14B-InP-high-noise-HPS2.1.safetensors",
    highNoiseUrl: "https://huggingface.co/alibaba-pai/Wan2.2-Fun-Reward-LoRAs/resolve/main/Wan2.2-Fun-A14B-InP-high-noise-HPS2.1.safetensors",
    lowNoiseUrl: "https://huggingface.co/alibaba-pai/Wan2.2-Fun-Reward-LoRAs/resolve/main/Wan2.2-Fun-A14B-InP-low-noise-HPS2.1.safetensors",
    downloads: 27700,
    likes: 62,
    sampleImages: [],
    tags: ["aesthetic", "reward", "hps", "quality", "preference"],
    baseModel: "Wan 2.2 T2V",
    category: "aesthetic",
  },
  {
    modelId: "wan22_14b_mps_reward",
    name: "MPS Aesthetic Reward (Wan 2.2 14B)",
    author: "alibaba-pai",
    description: "Motion Preference Score reward LoRA for Wan 2.2. Multi-stage with high and low noise variants.",
    downloadUrl: "https://huggingface.co/alibaba-pai/Wan2.2-Fun-Reward-LoRAs/resolve/main/Wan2.2-Fun-A14B-InP-high-noise-MPS.safetensors",
    highNoiseUrl: "https://huggingface.co/alibaba-pai/Wan2.2-Fun-Reward-LoRAs/resolve/main/Wan2.2-Fun-A14B-InP-high-noise-MPS.safetensors",
    lowNoiseUrl: "https://huggingface.co/alibaba-pai/Wan2.2-Fun-Reward-LoRAs/resolve/main/Wan2.2-Fun-A14B-InP-low-noise-MPS.safetensors",
    downloads: 27700,
    likes: 62,
    sampleImages: [],
    tags: ["aesthetic", "reward", "mps", "motion", "temporal"],
    baseModel: "Wan 2.2 T2V",
    category: "aesthetic",
  },

  // === STYLE LORAS ===
  {
    modelId: "wan21_14b_wallace_gromit",
    name: "Wallace & Gromit Style (Wan 2.1)",
    author: "Cseti",
    description: "Creates videos in the charming Wallace & Gromit claymation animation style with exaggerated expressions and British humor aesthetics.",
    downloadUrl: "https://huggingface.co/Cseti/wan-14b-wallace_and_gromit-style-lora-v1/resolve/main/302144-wan14b-walgro-e180.safetensors",
    triggerWord: "walgro style",
    downloads: 0,
    likes: 8,
    sampleImages: [],
    tags: ["claymation", "animation", "wallace-gromit", "aardman", "british"],
    baseModel: "Wan 2.1 T2V",
    category: "style",
  },
  {
    modelId: "wan21_14b_rick_morty",
    name: "Rick and Morty Style (Wan 2.1)",
    author: "DeverStyle",
    description: "Creates videos in the Rick and Morty cartoon aesthetic with vibrant neon hues, bold outlines, exaggerated proportions, and comic book panel flair.",
    downloadUrl: "https://huggingface.co/DeverStyle/rick-and-morty-style-wan-21/resolve/main/rick-and-morty-style-wan-21.safetensors",
    triggerWord: "Rick and Morty cartoon style",
    downloads: 0,
    likes: 2,
    sampleImages: [],
    tags: ["cartoon", "animation", "rick-morty", "adult-swim", "sci-fi"],
    baseModel: "Wan 2.1 T2V",
    category: "style",
  },
  {
    modelId: "wan22_14b_gta_style",
    name: "GTA Style (Wan 2.2)",
    author: "obsxrver",
    description: "Creates videos in the Grand Theft Auto game art style. Multi-stage LoRA with high and low noise variants for Wan 2.2.",
    downloadUrl: "https://huggingface.co/obsxrver/Wan2.2_GTA-Style/resolve/main/WAN2.2-HighNoise_GTA-Style-v1_0.safetensors",
    highNoiseUrl: "https://huggingface.co/obsxrver/Wan2.2_GTA-Style/resolve/main/WAN2.2-HighNoise_GTA-Style-v1_0.safetensors",
    lowNoiseUrl: "https://huggingface.co/obsxrver/Wan2.2_GTA-Style/resolve/main/WAN2.2-LowNoise_GTA-Style-v1_0.safetensors",
    triggerWord: "gta style",
    downloads: 38,
    likes: 1,
    sampleImages: [],
    tags: ["gta", "game-art", "rockstar", "urban", "stylized"],
    baseModel: "Wan 2.2 T2V",
    category: "style",
  },
  {
    modelId: "wan22_14b_animat3d",
    name: "Animat3D Style (Wan 2.2)",
    author: "Ashmotv",
    description: "Creates videos with 3D animation aesthetics, combining cartoon and 3D rendering styles. Multi-stage LoRA with high and low noise variants.",
    downloadUrl: "https://huggingface.co/Ashmotv/animat3d_style_wan-lora/resolve/main/animat3d_style_wan_high_noise.safetensors",
    highNoiseUrl: "https://huggingface.co/Ashmotv/animat3d_style_wan-lora/resolve/main/animat3d_style_wan_high_noise.safetensors",
    lowNoiseUrl: "https://huggingface.co/Ashmotv/animat3d_style_wan-lora/resolve/main/animat3d_style_wan_low_noise.safetensors",
    triggerWord: "animat3d_style",
    downloads: 39,
    likes: 1,
    sampleImages: [],
    tags: ["3d", "animation", "cartoon", "stylized"],
    baseModel: "Wan 2.2 T2V",
    category: "style",
  },
  {
    modelId: "wan22_14b_gurren_lagann",
    name: "Gurren Lagann Anime Style (Wan 2.2)",
    author: "UnifiedHorusRA",
    description: "Creates videos in the explosive, over-the-top Gurren Lagann anime style from the iconic mecha anime, with dynamic action and bold colors.",
    downloadUrl: "https://huggingface.co/UnifiedHorusRA/Gurren_Lagann_Anime_Style_Wan_2.2_14B_Lora/resolve/main/gurrenlagannstyle_5B_e333.safetensors",
    downloads: 6,
    likes: 6,
    sampleImages: [],
    tags: ["anime", "mecha", "action", "gainax", "trigger"],
    baseModel: "Wan 2.2 T2V",
    category: "style",
  },
  {
    modelId: "wan22_i2v_realistic_comic",
    name: "Realistic Comic Book Style (Wan 2.2 I2V)",
    author: "maDcaDDie",
    description: "Creates videos with a realistic comic book aesthetic, blending photorealistic elements with comic art styles.",
    downloadUrl: "https://huggingface.co/maDcaDDie/realistic_comicbook_style_wan_2_2_i2v_480p-lora/resolve/main/realistic_comicbook_style_wan_2_2_i2v_480p.safetensors",
    downloads: 24,
    likes: 1,
    sampleImages: [],
    tags: ["comic", "realistic", "graphic-novel", "stylized"],
    baseModel: "Wan 2.2 I2V",
    category: "style",
  },

  // === NEW MOTION LORAS (January 2026) ===
  {
    modelId: "wan21_i2v_bullet_time",
    name: "Bullet Time / 360 Rotation (Wan 2.1 I2V)",
    author: "valiantcat",
    description: "Creates Matrix-style bullet time 360-degree rotation effects around subjects. Dramatic slow-motion camera orbits.",
    downloadUrl: "https://huggingface.co/valiantcat/Wan2.1-BulletTime-LoRA/resolve/main/Wan21_I2V_rotation_000003750.safetensors",
    triggerWord: "rw360xz",
    sampleImages: [],
    tags: ["motion", "bullet-time", "rotation", "360", "matrix"],
    baseModel: "Wan 2.1 I2V",
    category: "motion",
  },
  {
    modelId: "wan21_i2v_dolly_zoom",
    name: "Dolly Zoom / Vertigo Effect (Wan 2.1 I2V)",
    author: "ostris",
    description: "Creates the famous Hitchcock dolly zoom (vertigo) effect where the background appears to stretch while the subject stays the same size.",
    downloadUrl: "https://huggingface.co/ostris/wan21_i2v_dolly_zoom_lora/resolve/main/wan_21_i2v_dolly_zoom.safetensors",
    triggerWord: "dolly zoom",
    sampleImages: [],
    tags: ["motion", "dolly-zoom", "vertigo", "hitchcock", "cinematic"],
    baseModel: "Wan 2.1 I2V",
    category: "motion",
  },

  // === NEW STYLE LORAS (ApacheOne Collection - January 2026) ===
  {
    modelId: "wan21_14b_game_boy_monochrome",
    name: "Game Boy Monochrome Style (Wan 2.1)",
    author: "ApacheOne",
    description: "Creates videos in the iconic Game Boy green-tinted monochrome aesthetic. Perfect for retro gaming nostalgia.",
    downloadUrl: "https://huggingface.co/ApacheOne/WAN_loRAs/resolve/main/G/Game_Boy_Monochrome_Style/wan-gbc.safetensors",
    sampleImages: [],
    tags: ["retro", "game-boy", "monochrome", "gaming", "pixel"],
    baseModel: "Wan 2.1 T2V",
    category: "style",
  },
  {
    modelId: "wan21_14b_ghost_in_shell",
    name: "Ghost in the Shell Style (Wan 2.1)",
    author: "ApacheOne",
    description: "Creates videos in the cyberpunk aesthetic of Ghost in the Shell anime with tech-noir visuals and futuristic cityscapes.",
    downloadUrl: "https://huggingface.co/ApacheOne/WAN_loRAs/resolve/main/G/Ghost_In_The_Shell_%5BT2V_Wan%5D/gits-style-wan-e6.safetensors",
    sampleImages: [],
    tags: ["anime", "cyberpunk", "sci-fi", "ghost-in-shell", "tech-noir"],
    baseModel: "Wan 2.1 T2V",
    category: "style",
  },
  {
    modelId: "wan21_14b_sketch_style",
    name: "Sketch Style (Wan 2.1)",
    author: "ApacheOne",
    description: "Creates videos with hand-drawn sketch aesthetic, pencil strokes and artistic line work.",
    downloadUrl: "https://huggingface.co/ApacheOne/WAN_loRAs/resolve/main/S/Sketch_style/DJ_Sketch_Wan-35.safetensors",
    sampleImages: [],
    tags: ["sketch", "drawing", "pencil", "artistic", "hand-drawn"],
    baseModel: "Wan 2.1 T2V",
    category: "style",
  },
  {
    modelId: "wan21_14b_steamboat_willie",
    name: "Steamboat Willie / Golden Era Animation (Wan 2.1)",
    author: "ApacheOne",
    description: "Creates videos in the classic 1920s-1930s golden era animation style, reminiscent of early Disney's Steamboat Willie.",
    downloadUrl: "https://huggingface.co/ApacheOne/WAN_loRAs/resolve/main/S/Steamboat_Willie_-_Golden_Era_Animation/steamboat-willie-14b.bf16.safetensors",
    sampleImages: [],
    tags: ["vintage", "animation", "1920s", "disney", "black-and-white"],
    baseModel: "Wan 2.1 T2V",
    category: "style",
  },
  {
    modelId: "wan21_14b_neon_style",
    name: "Neon Style (Wan 2.1)",
    author: "ApacheOne",
    description: "Creates videos with vibrant neon lighting effects, glowing colors, and synthwave aesthetics.",
    downloadUrl: "https://huggingface.co/ApacheOne/WAN_loRAs/resolve/main/N/Neon_Style_Wan-Flux-SDXL/neonlora.safetensors",
    sampleImages: [],
    tags: ["neon", "glow", "synthwave", "cyberpunk", "vibrant"],
    baseModel: "Wan 2.1 T2V",
    category: "style",
  },
  {
    modelId: "wan21_14b_oil_paint",
    name: "Oil Paint Style (Wan 2.1)",
    author: "ApacheOne",
    description: "Creates videos with classic oil painting aesthetic, rich textures and painterly brush strokes.",
    downloadUrl: "https://huggingface.co/ApacheOne/WAN_loRAs/resolve/main/O/Oil_paint/DJ_OilPaint_Wan_2-40.safetensors",
    sampleImages: [],
    tags: ["oil-paint", "painting", "artistic", "classical", "texture"],
    baseModel: "Wan 2.1 T2V",
    category: "style",
  },
  {
    modelId: "wan21_14b_ink_wash",
    name: "Ink Wash Painting Style (Wan 2.1)",
    author: "ApacheOne",
    description: "Creates videos in traditional East Asian ink wash painting style with flowing brushwork and minimal color palette.",
    downloadUrl: "https://huggingface.co/ApacheOne/WAN_loRAs/resolve/main/I/Ink_wash_painting/DJ_ink_Wan-40.safetensors",
    sampleImages: [],
    tags: ["ink-wash", "asian", "painting", "minimalist", "brush"],
    baseModel: "Wan 2.1 T2V",
    category: "style",
  },
  {
    modelId: "wan21_14b_monogatari",
    name: "Monogatari Anime Style (Wan 2.1)",
    author: "ApacheOne",
    description: "Creates videos in the distinctive Monogatari anime series style with bold typography, abstract visuals and dynamic compositions.",
    downloadUrl: "https://huggingface.co/ApacheOne/WAN_loRAs/resolve/main/M/Monogatari_anime_style/wan_t2v_14B_monogatari_anime_style.safetensors",
    sampleImages: [],
    tags: ["anime", "monogatari", "shaft", "stylized", "typography"],
    baseModel: "Wan 2.1 T2V",
    category: "style",
  },
  {
    modelId: "wan21_14b_cyberpunk_2077",
    name: "Cyberpunk 2077 Style (Wan 2.1)",
    author: "ApacheOne",
    description: "Creates videos in the Cyberpunk 2077 game aesthetic with neon-lit cityscapes, futuristic tech, and dystopian vibes.",
    downloadUrl: "https://huggingface.co/ApacheOne/WAN_loRAs/resolve/main/C/Cyberpunk_2077_Style_(Wan_%2B_Hunyuan_Video_LoRA)/Cuberpunk_20.safetensors",
    sampleImages: [],
    tags: ["cyberpunk", "2077", "game-art", "neon", "dystopian"],
    baseModel: "Wan 2.1 T2V",
    category: "style",
  },
  {
    modelId: "wan21_14b_clean_minimalist",
    name: "Clean Minimalist Style (Wan 2.1)",
    author: "ApacheOne",
    description: "Creates videos with clean, minimalist aesthetics - simple compositions, muted colors, and elegant design.",
    downloadUrl: "https://huggingface.co/ApacheOne/WAN_loRAs/resolve/main/C/Clean_Minimalist/Clean_Minimalist_WAN.safetensors",
    sampleImages: [],
    tags: ["minimalist", "clean", "simple", "elegant", "modern"],
    baseModel: "Wan 2.1 T2V",
    category: "style",
  },
  {
    modelId: "wan21_14b_origami",
    name: "Origami Style (Wan 2.1)",
    author: "ApacheOne",
    description: "Creates videos with paper folding origami aesthetic, geometric shapes and paper textures.",
    downloadUrl: "https://huggingface.co/ApacheOne/WAN_loRAs/resolve/main/O/Origami_style/DJ_Origami_Wan-20.safetensors",
    sampleImages: [],
    tags: ["origami", "paper", "geometric", "craft", "japanese"],
    baseModel: "Wan 2.1 T2V",
    category: "style",
  },

  // === OTHER NEW STYLE LORAS (January 2026) ===
  {
    modelId: "wan21_14b_arcane_jinx",
    name: "Arcane Jinx Style (Wan 2.1)",
    author: "Cseti",
    description: "Creates videos in the Arcane Netflix series style with Jinx-inspired vibrant colors and painterly animation.",
    downloadUrl: "https://huggingface.co/Cseti/Wan-LoRA-Arcane-Jinx-v1/resolve/main/664463-csetiarcane-Nfj1nx-e15-e7-s5070-ipv.safetensors",
    triggerWord: "csetiarcane",
    sampleImages: [],
    tags: ["arcane", "jinx", "netflix", "animation", "painterly"],
    baseModel: "Wan 2.1 T2V",
    category: "style",
  },
  {
    modelId: "wan21_14b_origami_shauray",
    name: "Origami Paper Craft (Wan 2.1)",
    author: "shauray",
    description: "Creates videos with beautiful origami paper folding aesthetics and geometric paper art.",
    downloadUrl: "https://huggingface.co/shauray/Origami_WanLora/resolve/main/origami_000000500.safetensors",
    triggerWord: "[origami]",
    sampleImages: [],
    tags: ["origami", "paper", "craft", "geometric", "artistic"],
    baseModel: "Wan 2.1 T2V",
    category: "style",
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
export async function importZImageLoras(
  supabaseUrl: string,
  supabaseKey: string,
  userId: string
): Promise<void> {
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`Starting import of ${Z_IMAGE_LORAS.length} Z-Image LoRAs...`);

  for (const lora of Z_IMAGE_LORAS) {
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
      lora_type: "Z-Image",
      huggingface_url: lora.downloadUrl,
      filename: lora.modelId,
      base_model: "Z-Image Turbo",
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

// Map base model string to lora_type for LoraSelectorModal filtering
function getLoraTypeFromBaseModel(baseModel: WanLoraEntry['baseModel']): string {
  switch (baseModel) {
    case 'Wan 2.1 T2V':
      return 'Wan 2.1 T2V 14B';
    case 'Wan 2.1 I2V':
      return 'Wan 2.1 I2V 14B';
    case 'Wan 2.1 1.3B':
      return 'Wan 2.1 1.3B';
    case 'Wan 2.2 T2V':
      return 'Wan 2.2 T2V';
    case 'Wan 2.2 I2V':
      return 'Wan 2.2 I2V';
    default:
      return 'Wan 2.1 T2V 14B';
  }
}

// Import function for Wan LoRAs
export async function importWanLoras(
  supabaseUrl: string,
  supabaseKey: string,
  userId: string
): Promise<void> {
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`Starting import of ${WAN_LORAS.length} Wan LoRAs...`);

  for (const lora of WAN_LORAS) {
    console.log(`\nProcessing: ${lora.name}`);

    // Upload sample images/videos to Supabase
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

    // Handle sample videos if present
    if (lora.sampleVideos) {
      for (let i = 0; i < lora.sampleVideos.length; i++) {
        const videoUrl = lora.sampleVideos[i];
        console.log(`  Downloading sample video ${i + 1}/${lora.sampleVideos.length}...`);

        const blob = await downloadImageAsBlob(videoUrl);
        if (!blob) continue;

        const ext = videoUrl.split('.').pop()?.split('?')[0] || 'mp4';
        const filename = `lora_${lora.modelId}_video_${i + 1}_${Date.now()}.${ext}`;

        const uploadedUrl = await uploadToSupabase(supabase, blob, userId, filename);
        if (uploadedUrl) {
          uploadedImages.push({
            url: uploadedUrl,
            alt_text: `${lora.name} video ${i + 1}`,
            type: 'video',
            source: 'huggingface'
          });
          sampleGenerations.push({
            url: uploadedUrl,
            type: 'video',
            alt_text: `${lora.name} video ${i + 1}`
          });
          console.log(`  Uploaded: ${filename}`);
        }
      }
    }

    // Create the LoRA model object (Wan format with multi-stage support)
    const loraModel: LoraModel & { high_noise_url?: string; low_noise_url?: string } = {
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
      lora_type: getLoraTypeFromBaseModel(lora.baseModel),
      huggingface_url: lora.downloadUrl,
      filename: lora.modelId,
      base_model: lora.baseModel,
      sample_generations: sampleGenerations,
      main_generation: sampleGenerations[0]?.url,
      is_public: true,
      trigger_word: lora.triggerWord,
      "Last Modified": new Date().toISOString(),
      // Multi-stage LoRA support
      ...(lora.highNoiseUrl && { high_noise_url: lora.highNoiseUrl }),
      ...(lora.lowNoiseUrl && { low_noise_url: lora.lowNoiseUrl }),
    };

    // Check if already exists
    const { data: existing } = await supabase
      .from('resources')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'lora')
      .eq('metadata->Model ID', lora.modelId)
      .single();

    if (existing) {
      console.log(`  Skipping (already exists): ${lora.name}`);
      continue;
    }

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
      console.error(`  Failed to insert ${lora.name}:`, error);
    } else {
      console.log(`  Successfully imported: ${lora.name}`);
    }
  }

  console.log('\n\nWan LoRA import complete!');
}

// Import all LoRAs (both Z-Image and Wan)
export async function importAllLoras(
  supabaseUrl: string,
  supabaseKey: string,
  userId: string
): Promise<void> {
  await importZImageLoras(supabaseUrl, supabaseKey, userId);
  await importWanLoras(supabaseUrl, supabaseKey, userId);
  console.log('\n\n=== All LoRA imports complete! ===');
  console.log(`Total: ${Z_IMAGE_LORAS.length} Z-Image LoRAs + ${WAN_LORAS.length} Wan LoRAs`);
}

// Export the LoRA data for manual inspection
export { Z_IMAGE_LORAS, WAN_LORAS };

// If running directly (not imported)
if (typeof window !== 'undefined') {
  console.log('LoRA Import Script loaded.');
  console.log('');
  console.log('To import Z-Image LoRAs:');
  console.log('  importZImageLoras(SUPABASE_URL, SUPABASE_KEY, USER_ID)');
  console.log('');
  console.log('To import Wan LoRAs:');
  console.log('  importWanLoras(SUPABASE_URL, SUPABASE_KEY, USER_ID)');
  console.log('');
  console.log('To import ALL LoRAs:');
  console.log('  importAllLoras(SUPABASE_URL, SUPABASE_KEY, USER_ID)');
  console.log('');
  console.log('Or access Z_IMAGE_LORAS / WAN_LORAS to see the curated lists.');
  console.log(`Total: ${Z_IMAGE_LORAS.length} Z-Image + ${WAN_LORAS.length} Wan = ${Z_IMAGE_LORAS.length + WAN_LORAS.length} LoRAs`);
}
