import { LoraModel } from '@/shared/components/LoraSelectorModal';

// Pre-defined LoRA options for quick selection
export const PREDEFINED_LORAS = [
  {
    name: "I2V High Noise (Seko V1)",
    displayName: "I2V High Noise (Seko V1)",
    url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1/high_noise_model.safetensors",
    category: "Lightning Official I2V"
  },
  {
    name: "I2V Low Noise (Seko V1)",
    displayName: "I2V Low Noise (Seko V1)",
    url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1/low_noise_model.safetensors",
    category: "Lightning Official I2V"
  },
  {
    name: "VACE High Noise (Seko V2.0)",
    displayName: "VACE High Noise (Seko V2.0)",
    url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-rank64-Seko-V2.0/high_noise_model.safetensors",
    category: "Lightning Official VACE"
  },
  {
    name: "VACE Low Noise (Seko V2.0)",
    displayName: "VACE Low Noise (Seko V2.0)",
    url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-rank64-Seko-V2.0/low_noise_model.safetensors",
    category: "Lightning Official VACE"
  },
  {
    name: "High Noise (Official 250928)",
    displayName: "High Noise (Official 250928)",
    url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/high_noise_model.safetensors",
    category: "Lightning Official Legacy"
  },
  {
    name: "Low Noise (Official 250928)",
    displayName: "Low Noise (Official 250928)",
    url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/low_noise_model.safetensors",
    category: "Lightning Official Legacy"
  },
  {
    name: "Fun InP - High Noise HPS2.1",
    displayName: "Fun InP - High Noise HPS2.1",
    url: "https://huggingface.co/DeepBeepMeep/Wan2.2/resolve/main/loras_accelerators/Wan2.2-Fun-A14B-InP-high-noise-HPS2.1.safetensors",
    category: "Fun InP"
  },
  {
    name: "Fun InP - High Noise MPS",
    displayName: "Fun InP - High Noise MPS",
    url: "https://huggingface.co/DeepBeepMeep/Wan2.2/resolve/main/loras_accelerators/Wan2.2-Fun-A14B-InP-high-noise-MPS.safetensors",
    category: "Fun InP"
  },
  {
    name: "Fun InP - Low Noise HPS2.1",
    displayName: "Fun InP - Low Noise HPS2.1",
    url: "https://huggingface.co/DeepBeepMeep/Wan2.2/resolve/main/loras_accelerators/Wan2.2-Fun-A14B-InP-low-noise-HPS2.1.safetensors",
    category: "Fun InP"
  },
  {
    name: "Fun InP - Low Noise MPS",
    displayName: "Fun InP - Low Noise MPS",
    url: "https://huggingface.co/DeepBeepMeep/Wan2.2/resolve/main/loras_accelerators/Wan2.2-Fun-A14B-InP-low-noise-MPS.safetensors",
    category: "Fun InP"
  },
  {
    name: "Lightning T2V HIGH (fp16)",
    displayName: "Lightning T2V HIGH (fp16)",
    url: "https://huggingface.co/DeepBeepMeep/Wan2.2/resolve/main/loras_accelerators/Wan2.2-Lightning_T2V-A14B-4steps-lora_HIGH_fp16.safetensors",
    category: "Lightning Accelerators"
  },
  {
    name: "Lightning T2V v1.1 HIGH",
    displayName: "Lightning T2V v1.1 HIGH",
    url: "https://huggingface.co/DeepBeepMeep/Wan2.2/resolve/main/loras_accelerators/Wan2.2-Lightning_T2V-v1.1-A14B-4steps-lora_HIGH_fp16.safetensors",
    category: "Lightning Accelerators"
  },
  {
    name: "Lightning T2V v1.1 LOW",
    displayName: "Lightning T2V v1.1 LOW",
    url: "https://huggingface.co/DeepBeepMeep/Wan2.2/resolve/main/loras_accelerators/Wan2.2-Lightning_T2V-v1.1-A14B-4steps-lora_LOW_fp16.safetensors",
    category: "Lightning Accelerators"
  },
  {
    name: "HIGH Lightning 250928 (rank128)",
    displayName: "HIGH Lightning 250928 (rank128)",
    url: "https://huggingface.co/DeepBeepMeep/Wan2.2/resolve/main/loras_accelerators/Wan22_A14B_T2V_HIGH_Lightning_4steps_lora_250928_rank128_fp16.safetensors",
    category: "Lightning Accelerators"
  },
  {
    name: "LOW Lightning 250928 (rank64)",
    displayName: "LOW Lightning 250928 (rank64)",
    url: "https://huggingface.co/DeepBeepMeep/Wan2.2/resolve/main/loras_accelerators/Wan22_A14B_T2V_LOW_Lightning_4steps_lora_250928_rank64_fp16.safetensors",
    category: "Lightning Accelerators"
  },
];

/**
 * Get display name from LoRA URL
 * Checks predefined LoRAs first, then availableLoras, then falls back to filename
 */
export function getDisplayNameFromUrl(url: string, availableLoras?: LoraModel[]): string {
  if (!url) return '';
  
  // Check if this is a predefined LoRA
  const predefinedLora = PREDEFINED_LORAS.find(lora => lora.url === url);
  if (predefinedLora?.displayName) {
    return predefinedLora.displayName;
  }
  
  // Check if this is a lora from the search/database
  const availableLora = availableLoras?.find(lora => lora.huggingface_url === url);
  if (availableLora?.Name && availableLora.Name !== "N/A") {
    return availableLora.Name;
  }
  
  // Otherwise, extract filename from URL
  const parts = url.split('/');
  return parts[parts.length - 1] || url;
}

