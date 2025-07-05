// Credit cost estimation for different task types
// This determines how many credits each operation costs

export interface TaskCostConfig {
  baseCredits: number;
  costFactors?: {
    resolution?: Record<string, number>;
    frameCount?: number;
    duration?: number;
    modelType?: Record<string, number>;
  };
}

// Credit costs for different task types
export const TASK_CREDIT_COSTS: Record<string, TaskCostConfig> = {
  // Single image generation
  single_image: {
    baseCredits: 1,
    costFactors: {
      resolution: {
        '512x512': 1,
        '768x768': 2,
        '1024x1024': 3,
        '1536x1536': 5,
        '2048x2048': 8,
      },
      modelType: {
        'flux-dev': 1,
        'flux-pro': 2,
        'flux-schnell': 0.5,
      },
    },
  },

  // Video generation tasks
  travel_stitch: {
    baseCredits: 5,
    costFactors: {
      frameCount: 0.2, // 0.2 credits per frame
      resolution: {
        '512x512': 1,
        '768x768': 1.5,
        '1024x1024': 2,
      },
    },
  },

  // Video travel orchestrator
  travel_orchestrator: {
    baseCredits: 3,
    costFactors: {
      frameCount: 0.1, // 0.1 credits per frame
    },
  },

  // Image upscaling
  image_upscale: {
    baseCredits: 2,
    costFactors: {
      resolution: {
        '2x': 1,
        '4x': 2,
        '8x': 4,
      },
    },
  },

  // Image editing
  image_edit: {
    baseCredits: 2,
    costFactors: {
      resolution: {
        '512x512': 1,
        '768x768': 1.5,
        '1024x1024': 2,
        '1536x1536': 3,
      },
    },
  },

  // Lora training
  lora_training: {
    baseCredits: 50,
    costFactors: {
      modelType: {
        'flux-dev': 1,
        'flux-pro': 1.5,
      },
    },
  },
};

/**
 * Estimate the credit cost for a task based on its type and parameters
 */
export function estimateTaskCost(taskType: string, params: Record<string, any>): number {
  const costConfig = TASK_CREDIT_COSTS[taskType];
  
  if (!costConfig) {
    // Default cost for unknown task types
    return 1;
  }

  let totalCost = costConfig.baseCredits;

  if (costConfig.costFactors) {
    const { resolution, frameCount, duration, modelType } = costConfig.costFactors;

    // Resolution-based cost
    if (resolution && params.resolution) {
      const resolutionMultiplier = resolution[params.resolution] || 1;
      totalCost *= resolutionMultiplier;
    }

    // Frame count-based cost
    if (frameCount && params.frame_count) {
      totalCost += frameCount * params.frame_count;
    }

    // Duration-based cost
    if (duration && params.duration) {
      totalCost += duration * params.duration;
    }

    // Model type-based cost
    if (modelType && params.model_type) {
      const modelMultiplier = modelType[params.model_type] || 1;
      totalCost *= modelMultiplier;
    }
  }

  // Round up to nearest whole credit
  return Math.ceil(totalCost);
}

/**
 * Get the display name for a task type
 */
export function getTaskTypeDisplayName(taskType: string): string {
  switch (taskType) {
    case 'single_image':
      return 'Image Generation';
    case 'travel_stitch':
      return 'Video Generation';
    case 'travel_orchestrator':
      return 'Video Travel';
    case 'image_upscale':
      return 'Image Upscaling';
    case 'image_edit':
      return 'Image Editing';
    case 'lora_training':
      return 'LoRA Training';
    default:
      return taskType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}

/**
 * Check if a user has enough credits for a task
 */
export function canAffordTask(
  userCredits: number,
  taskType: string,
  params: Record<string, any>
): boolean {
  const cost = estimateTaskCost(taskType, params);
  return userCredits >= cost;
}

/**
 * Get credit cost breakdown for display
 */
export function getCostBreakdown(
  taskType: string,
  params: Record<string, any>
): { totalCost: number; breakdown: Array<{ item: string; cost: number }> } {
  const costConfig = TASK_CREDIT_COSTS[taskType];
  
  if (!costConfig) {
    return { totalCost: 1, breakdown: [{ item: 'Base cost', cost: 1 }] };
  }

  const breakdown: Array<{ item: string; cost: number }> = [];
  let totalCost = costConfig.baseCredits;

  breakdown.push({ item: 'Base cost', cost: costConfig.baseCredits });

  if (costConfig.costFactors) {
    const { resolution, frameCount, duration, modelType } = costConfig.costFactors;

    // Resolution-based cost
    if (resolution && params.resolution) {
      const resolutionMultiplier = resolution[params.resolution] || 1;
      if (resolutionMultiplier !== 1) {
        const additionalCost = costConfig.baseCredits * (resolutionMultiplier - 1);
        breakdown.push({ item: `Resolution (${params.resolution})`, cost: additionalCost });
        totalCost *= resolutionMultiplier;
      }
    }

    // Frame count-based cost
    if (frameCount && params.frame_count) {
      const frameCost = frameCount * params.frame_count;
      breakdown.push({ item: `${params.frame_count} frames`, cost: frameCost });
      totalCost += frameCost;
    }

    // Duration-based cost
    if (duration && params.duration) {
      const durationCost = duration * params.duration;
      breakdown.push({ item: `${params.duration}s duration`, cost: durationCost });
      totalCost += durationCost;
    }

    // Model type-based cost
    if (modelType && params.model_type) {
      const modelMultiplier = modelType[params.model_type] || 1;
      if (modelMultiplier !== 1) {
        const additionalCost = (totalCost - costConfig.baseCredits) * (modelMultiplier - 1);
        breakdown.push({ item: `Model (${params.model_type})`, cost: additionalCost });
        totalCost *= modelMultiplier;
      }
    }
  }

  return { totalCost: Math.ceil(totalCost), breakdown };
} 