import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../lib/api';

interface CalculateTaskCostResponse {
  success: boolean;
  cost: number;
  duration_seconds: number;
  base_cost_per_second: number;
  cost_factors?: any;
  task_type: string;
  task_id: string;
  note?: string;
}

interface CalculateTaskCostRequest {
  task_id: string;
}

export function useTaskCost() {
  const queryClient = useQueryClient();

  // Calculate task cost and add to credit ledger
  const calculateTaskCostMutation = useMutation<
    CalculateTaskCostResponse,
    Error,
    CalculateTaskCostRequest
  >({
    mutationFn: async ({ task_id }) => {
      const response = await fetchWithAuth('/functions/v1/calculate-task-cost', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ task_id }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to calculate task cost');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate credits queries to refresh balance
      queryClient.invalidateQueries({ queryKey: ['credits', 'balance'] });
      queryClient.invalidateQueries({ queryKey: ['credits', 'ledger'] });
      
      // Show success toast with cost information
      const costInDollars = (data.cost / 100).toFixed(2);
      toast.success(`Task cost calculated: $${costInDollars} for ${data.duration_seconds}s`, {
        description: `Task: ${data.task_type}`,
      });
    },
    onError: (error) => {
      console.error('Error calculating task cost:', error);
      toast.error(error.message || 'Failed to calculate task cost');
    },
  });

  return {
    calculateTaskCost: calculateTaskCostMutation.mutateAsync,
    isCalculatingCost: calculateTaskCostMutation.isPending,
    calculateTaskCostSync: calculateTaskCostMutation.mutate,
  };
}

// Utility function to format cost as currency
export function formatTaskCost(costInCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(costInCents / 100);
}

// Utility function to calculate estimated cost preview (without actually charging)
export function estimateTaskCostPreview(
  baseCostPerSecond: number,
  durationSeconds: number,
  costFactors: any = {},
  taskParams: any = {}
): number {
  let totalCost = baseCostPerSecond * durationSeconds;

  if (costFactors) {
    // Resolution-based cost multiplier
    if (costFactors.resolution && taskParams.resolution) {
      const resolutionMultiplier = costFactors.resolution[taskParams.resolution] || 1;
      totalCost *= resolutionMultiplier;
    }

    // Frame count-based additional cost
    if (costFactors.frameCount && taskParams.frame_count) {
      totalCost += costFactors.frameCount * taskParams.frame_count * durationSeconds;
    }

    // Model type-based cost multiplier
    if (costFactors.modelType && taskParams.model_type) {
      const modelMultiplier = costFactors.modelType[taskParams.model_type] || 1;
      totalCost *= modelMultiplier;
    }
  }

  return Math.ceil(totalCost);
} 