/**
 * Qwen Image LoRA Import Script v2
 *
 * Extended collection of curated Qwen Image aesthetic LoRAs from HuggingFace
 */

// Additional Qwen Image LoRAs to import
export const QWEN_IMAGE_LORAS_V2: Array<{
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
    modelId: "qwen_image_2512_turbo",
    name: "Turbo 4-Step (Qwen 2512)",
    author: "Wuli-art",
    description: "High-speed LoRA enabling 4 or 8-step inference (vs 40 steps). 20x+ faster generation with comparable quality. V2.0 with improved color and detail handling.",
    downloadUrl: "https://huggingface.co/Wuli-art/Qwen-Image-2512-Turbo-LoRA/resolve/main/Wuli-Qwen-Image-2512-Turbo-LoRA-4steps-V1.0-bf16.safetensors",
    downloads: 15200,
    likes: 134,
    sampleImages: [],
    tags: ["turbo", "speed", "fast", "4-step"],
    baseModel: "Qwen Image 2512",
    loraType: "Qwen Image 2512",
  },

  // ============================================================================
  // QWEN IMAGE LORAS - ANIME & ILLUSTRATION
  // ============================================================================
  {
    modelId: "qwen_image_raena_anime",
    name: "Raena Anime",
    author: "Raelina",
    description: "High-quality anime style trained on 500 hand-picked images. Produces sharper details, richer colors, and better aesthetics. Best with Lightning LoRA.",
    downloadUrl: "https://huggingface.co/Raelina/Raena-Qwen-Image/resolve/main/raena_qwen_image_lora_v0.1_diffusers_fix.safetensors",
    triggerWord: "Anime illustration of",
    downloads: 160,
    likes: 37,
    sampleImages: [
      "https://cdn-uploads.huggingface.co/production/uploads/64b24543eec33e27dc9a6eca/mFduWl-5lO2fBbrzfgNNd.png",
      "https://cdn-uploads.huggingface.co/production/uploads/64b24543eec33e27dc9a6eca/wQCZOW1-ZTaDj1SbBLCSf.png",
      "https://cdn-uploads.huggingface.co/production/uploads/64b24543eec33e27dc9a6eca/FMY9XEi2hP6a9LvVvvl54.png",
    ],
    tags: ["anime", "illustration", "high-quality"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
  {
    modelId: "qwen_image_anime_otaku",
    name: "Anime Otaku",
    author: "suayptalha",
    description: "Anime style trained on Anime Gen v2 dataset. Consistent styling for anime characters, scenes, and illustrations.",
    downloadUrl: "https://huggingface.co/suayptalha/Anime-Otaku-Qwen-Image/resolve/main/pytorch_lora_weights.safetensors",
    triggerWord: "Anime",
    downloads: 5,
    likes: 4,
    sampleImages: [],
    tags: ["anime", "otaku", "illustration"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },

  // ============================================================================
  // QWEN IMAGE LORAS - REALISM & PHOTOGRAPHY
  // ============================================================================
  {
    modelId: "qwen_image_synthetic_face",
    name: "Synthetic Face",
    author: "prithivMLmods",
    description: "Generates high-quality synthetic face images. Trained on 26 images with Network Dim 64. Best at 1472x1140 (4:3). Use 35-50 steps.",
    downloadUrl: "https://huggingface.co/prithivMLmods/Qwen-Image-Synthetic-Face/resolve/main/qwen-synthetic-face.safetensors",
    triggerWord: "Synthetic Face",
    downloads: 1,
    likes: 11,
    sampleImages: [],
    tags: ["synthetic", "face", "portrait", "realistic"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
  {
    modelId: "qwen_image_samsung_ultrareal",
    name: "Samsung UltraReal",
    author: "Danrisi",
    description: "Ultra-realistic photography style inspired by Samsung camera aesthetics.",
    downloadUrl: "https://huggingface.co/Danrisi/Qwen-image_SamsungCam_UltraReal/resolve/main/Samsung.safetensors",
    downloads: 1147,
    sampleImages: [],
    tags: ["realistic", "photography", "samsung", "camera"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },

  // ============================================================================
  // QWEN IMAGE LORAS - CHARACTER STYLES
  // ============================================================================
  {
    modelId: "qwen_image_liuyifei",
    name: "Liu Yifei Character",
    author: "starsfriday",
    description: "Portrait generation LoRA for Liu Yifei style. Creates various photos in different styles and settings. By Chongqing Valiant Cat Technology.",
    downloadUrl: "https://huggingface.co/starsfriday/Qwen-Image-Liuyifei-LoRA/resolve/main/qwen_image_liuyifei.safetensors",
    triggerWord: "yfyf",
    downloads: 49,
    likes: 8,
    sampleImages: [],
    tags: ["character", "portrait", "chinese", "celebrity"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },

  // ============================================================================
  // QWEN IMAGE LORAS - ARTISTIC EFFECTS (RalFinger Collection)
  // ============================================================================
  {
    modelId: "qwen_image_crystalz",
    name: "Crystalz Effect",
    author: "RalFinger",
    description: "Creates crystal and gem-like visual effects on images.",
    downloadUrl: "https://huggingface.co/RalFinger/ral-crystalz-qwen-image-lora/resolve/main/ral-crystalz-qwen-image_000001750.safetensors",
    triggerWord: "ral-crystalz",
    sampleImages: [],
    tags: ["crystal", "gem", "effect", "artistic"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
  {
    modelId: "qwen_image_frctlgmtry",
    name: "Fractal Geometry",
    author: "RalFinger",
    description: "Adds fractal and geometric patterns to generated images.",
    downloadUrl: "https://huggingface.co/RalFinger/ral-frctlgmtry-qwen-image-lora/resolve/main/ral-frctlgmtry-qwen-image_000001750.safetensors",
    triggerWord: "ral-frctlgmtry",
    sampleImages: [],
    tags: ["fractal", "geometry", "pattern", "abstract"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
  {
    modelId: "qwen_image_opal",
    name: "Opal Effect",
    author: "RalFinger",
    description: "Creates opalescent, iridescent visual effects.",
    downloadUrl: "https://huggingface.co/RalFinger/ral-opal-qwen-image-lora/resolve/main/ral-opal-qwen-image_000001500.safetensors",
    triggerWord: "ral-opal",
    sampleImages: [],
    tags: ["opal", "iridescent", "effect", "artistic"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
  {
    modelId: "qwen_image_fluff",
    name: "Fluffy Effect",
    author: "RalFinger",
    description: "Adds soft, fluffy textures to generated images.",
    downloadUrl: "https://huggingface.co/RalFinger/ral-fluff-qwen-image-lora/resolve/main/ral-fluff-qwen-image_000001500.safetensors",
    triggerWord: "ral-fluff",
    sampleImages: [],
    tags: ["fluffy", "soft", "texture", "cute"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
  {
    modelId: "qwen_image_zhibi",
    name: "Zhibi Style",
    author: "RalFinger",
    description: "Artistic zhibi painting style effect.",
    downloadUrl: "https://huggingface.co/RalFinger/ral-zhibi-qwen-image-lora/resolve/main/ral-zhibi-qwen-image_000001500.safetensors",
    triggerWord: "zhibi",
    sampleImages: [],
    tags: ["zhibi", "artistic", "painting", "style"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
  {
    modelId: "qwen_image_watce",
    name: "Watch/Timepiece Effect",
    author: "RalFinger",
    description: "Creates watch and timepiece-themed visual effects.",
    downloadUrl: "https://huggingface.co/RalFinger/ral-watce-qwen-image-lora/resolve/main/ral-watce-qwen-image_000001750.safetensors",
    triggerWord: "ral-watce",
    sampleImages: [],
    tags: ["watch", "timepiece", "mechanical", "effect"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
  {
    modelId: "qwen_image_3dwvz",
    name: "3D Waves Effect",
    author: "RalFinger",
    description: "Creates 3D wave and ripple visual effects.",
    downloadUrl: "https://huggingface.co/RalFinger/ral-3dwvz-qwen-image-lora/resolve/main/ral-3dwvz-qwen-image_000001500.safetensors",
    triggerWord: "ral-3dwvz",
    sampleImages: [],
    tags: ["3d", "waves", "ripple", "effect"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },

  // ============================================================================
  // QWEN IMAGE LORAS - ARTISTIC STYLES
  // ============================================================================
  {
    modelId: "qwen_image_golden_beasts",
    name: "Golden Beasts",
    author: "Quorlen",
    description: "Creates golden, mythical beast imagery with ornate details.",
    downloadUrl: "https://huggingface.co/Quorlen/Qwen_Image_Golden_Beasts-lora/resolve/main/Qwen_Image_Golden_Beasts_000001000.safetensors",
    triggerWord: "Golden beast",
    sampleImages: [],
    tags: ["golden", "beast", "mythical", "ornate"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
  {
    modelId: "qwen_image_watercolor",
    name: "Watercolor (Acuarelin)",
    author: "d14945921",
    description: "Watercolor painting style effect for artistic images.",
    downloadUrl: "https://huggingface.co/d14945921/qwen_image_acuarelin-lora/resolve/main/qwen_image_acuarelin_000000750.safetensors",
    sampleImages: [],
    tags: ["watercolor", "painting", "artistic", "soft"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
  {
    modelId: "qwen_image_mmxxii",
    name: "MMXXII Style",
    author: "jasbloom",
    description: "High-rank (256) artistic style LoRA with distinctive aesthetics.",
    downloadUrl: "https://huggingface.co/jasbloom/Qwen-Image-mmxxii-rank256-lora/resolve/main/Qwen-Image-mmxxii-rank256_000001000.safetensors",
    triggerWord: "mmxxii",
    sampleImages: [],
    tags: ["style", "artistic", "high-rank"],
    baseModel: "Qwen Image",
    loraType: "Qwen Image",
  },
];

export default QWEN_IMAGE_LORAS_V2;
