// Cost estimation for different task types in cents (so $1.00 = 100 cents)
// This determines how much each operation costs in dollars

export interface TaskCostConfig {
  baseCents: number; // Base cost in cents
  costFactors?: {
    resolution?: Record<string, number>;
    frameCount?: number;
    duration?: number;
    modelType?: Record<string, number>;
  };
}

// Costs for different task types (in cents)
export const TASK_COSTS: Record<string, TaskCostConfig> = {
  // Single image generation
  single_image: {
    baseCents: 10, // $0.10
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
    baseCents: 50, // $0.50
    costFactors: {
      frameCount: 2, // 2 cents per frame
      resolution: {
        '512x512': 1,
        '768x768': 1.5,
        '1024x1024': 2,
      },
    },
  },

  // Video travel orchestrator
  travel_orchestrator: {
    baseCents: 30, // $0.30
    costFactors: {
      frameCount: 1, // 1 cent per frame
    },
  },

  // Image upscaling
  image_upscale: {
    baseCents: 20, // $0.20
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
    baseCents: 20, // $0.20
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
    baseCents: 500, // $5.00
    costFactors: {
      modelType: {
        'flux-dev': 1,
        'flux-pro': 1.5,
      },
    },
  },
};

/**
 * Estimate the cost for a task based on its type and parameters (in cents)
 */
export function estimateTaskCost(taskType: string, params: Record<string, any>): number {
  const costConfig = TASK_COSTS[taskType];
  
  if (!costConfig) {
    // Default cost for unknown task types
    return 10; // $0.10
  }

  let totalCost = costConfig.baseCents;

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

  // Round up to nearest cent
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
 * Check if a user has enough budget for a task
 */
export function canAffordTask(
  userBudgetCents: number,
  taskType: string,
  params: Record<string, any>
): boolean {
  const cost = estimateTaskCost(taskType, params);
  return userBudgetCents >= cost;
}

/**
 * Get cost breakdown for display
 */
export function getCostBreakdown(
  taskType: string,
  params: Record<string, any>
): { totalCost: number; breakdown: Array<{ item: string; cost: number }> } {
  const costConfig = TASK_COSTS[taskType];
  
  if (!costConfig) {
    return { totalCost: 10, breakdown: [{ item: 'Base cost', cost: 10 }] };
  }

  const breakdown: Array<{ item: string; cost: number }> = [];
  let totalCost = costConfig.baseCents;

  breakdown.push({ item: 'Base cost', cost: costConfig.baseCents });

  if (costConfig.costFactors) {
    const { resolution, frameCount, duration, modelType } = costConfig.costFactors;

    // Resolution-based cost
    if (resolution && params.resolution) {
      const resolutionMultiplier = resolution[params.resolution] || 1;
      if (resolutionMultiplier !== 1) {
        const additionalCost = costConfig.baseCents * (resolutionMultiplier - 1);
        breakdown.push({ item: `Resolution (${params.resolution})`, cost: additionalCost });
        totalCost *= resolutionMultiplier;
      }
    }

    // Frame count-based cost
    if (frameCount && params.frame_count) {
      const frameCountCost = frameCount * params.frame_count;
      breakdown.push({ item: `Frame count (${params.frame_count})`, cost: frameCountCost });
      totalCost += frameCountCost;
    }

    // Duration-based cost
    if (duration && params.duration) {
      const durationCost = duration * params.duration;
      breakdown.push({ item: `Duration (${params.duration}s)`, cost: durationCost });
      totalCost += durationCost;
    }

    // Model type-based cost
    if (modelType && params.model_type) {
      const modelMultiplier = modelType[params.model_type] || 1;
      if (modelMultiplier !== 1) {
        const additionalCost = costConfig.baseCents * (modelMultiplier - 1);
        breakdown.push({ item: `Model (${params.model_type})`, cost: additionalCost });
        totalCost *= modelMultiplier;
      }
    }
  }

  return { totalCost: Math.ceil(totalCost), breakdown };
}

/**
 * Format cost in cents as currency string
 */
export function formatCostAsCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
} 