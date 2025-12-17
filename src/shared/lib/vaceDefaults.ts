/**
 * Shared default phase configuration for VACE mode tools (Join Clips, Edit Video).
 * 
 * This is the "Basic" default preset used when no custom preset is selected.
 * Both tools regenerate existing video content, so they use VACE mode.
 */

import { PhaseConfig } from '@/tools/travel-between-images/settings';
import type { BuiltinPreset } from '@/shared/components/MotionPresetSelector';

// =============================================================================
// DEFAULT PHASE CONFIG FOR VACE MODE
// =============================================================================

/**
 * Default phase config for VACE-based tools (Join Clips, Edit Video).
 * Includes motion_scale LoRA for smoother transitions.
 */
export const DEFAULT_VACE_PHASE_CONFIG: PhaseConfig = {
  num_phases: 3,
  steps_per_phase: [2, 2, 5],
  flow_shift: 5.0,
  sample_solver: "euler",
  model_switch_phase: 2,
  mode: 'vace',
  phases: [
    {
      phase: 1,
      guidance_scale: 3.0,
      loras: [
        { url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/high_noise_model.safetensors", multiplier: "0.75" },
        { url: "https://huggingface.co/peteromallet/random_junk/resolve/main/motion_scale_000006500_high_noise.safetensors", multiplier: "1.25" }
      ]
    },
    {
      phase: 2,
      guidance_scale: 1.0,
      loras: [
        { url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/high_noise_model.safetensors", multiplier: "1.0" },
        { url: "https://huggingface.co/peteromallet/random_junk/resolve/main/motion_scale_000006500_high_noise.safetensors", multiplier: "1.25" }
      ]
    },
    {
      phase: 3,
      guidance_scale: 1.0,
      loras: [
        { url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/low_noise_model.safetensors", multiplier: "1.0" },
        { url: "https://huggingface.co/peteromallet/random_junk/resolve/main/motion_scale_000006500_high_noise.safetensors", multiplier: "1.25" }
      ]
    }
  ]
};

// =============================================================================
// BUILT-IN DEFAULT PRESET
// =============================================================================

/** Built-in preset ID for VACE tools (not a database ID) */
export const BUILTIN_VACE_DEFAULT_ID = '__builtin_vace_default__';

/** Built-in default preset for VACE mode tools */
export const BUILTIN_VACE_PRESET: BuiltinPreset = {
  id: BUILTIN_VACE_DEFAULT_ID,
  metadata: {
    name: 'Basic',
    description: 'Standard VACE generation settings',
    phaseConfig: DEFAULT_VACE_PHASE_CONFIG,
    generationTypeMode: 'vace',
  }
};

// =============================================================================
// FEATURED PRESET IDS (shared across VACE tools)
// =============================================================================

/** Featured preset IDs for VACE mode tools (from database) */
export const VACE_FEATURED_PRESET_IDS: string[] = [
  'd72377eb-6d57-4af1-80a3-9b629da28a47',
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Build phase config with user-selected LoRAs merged in.
 * User LoRAs are added to every phase at their specified strength.
 */
export function buildPhaseConfigWithLoras(
  userLoras: Array<{ path: string; strength: number }> = [],
  baseConfig: PhaseConfig = DEFAULT_VACE_PHASE_CONFIG
): PhaseConfig {
  if (userLoras.length === 0) {
    return baseConfig;
  }
  
  // Convert user LoRAs to phase config format
  const additionalLoras = userLoras
    .filter(lora => lora.path)
    .map(lora => ({
      url: lora.path,
      multiplier: lora.strength.toFixed(2)
    }));

  return {
    ...baseConfig,
    phases: baseConfig.phases.map(phase => ({
      ...phase,
      loras: [...phase.loras, ...additionalLoras]
    }))
  };
}
