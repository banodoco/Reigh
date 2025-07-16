import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface CalculateTaskCostRequest {
  task_id: string;
}

interface CalculateTaskCostResponse {
  task_id: string;
  task_type: string;
  duration_seconds: number;
  cost: number;
  cost_breakdown: Array<{ item: string; cost: number }>;
}

export function useTaskCost() {
  const queryClient = useQueryClient();

  // Calculate task cost and add to credit ledger using Supabase Edge Function
  const calculateTaskCostMutation = useMutation<
    CalculateTaskCostResponse,
    Error,
    CalculateTaskCostRequest
  >({
    mutationFn: async ({ task_id }) => {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        throw new Error('Authentication required');
      }

      // Call Supabase Edge Function for task cost calculation
      const { data, error: functionError } = await supabase.functions.invoke('calculate-task-cost', {
        body: { task_id },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      
      if (functionError) {
        throw new Error(functionError.message || 'Failed to calculate task cost');
      }

      if (data.error) {
        throw new Error(data.error);
      }
      
      return data;
    },
    onSuccess: (data) => {
      // Invalidate credits queries to refresh balance
      queryClient.invalidateQueries({ queryKey: ['credits', 'balance'] });
      queryClient.invalidateQueries({ queryKey: ['credits', 'ledger'] });
      
      // Task cost calculated
      const costInDollars = (data.cost / 100).toFixed(2);
      console.log(`Task cost calculated: $${costInDollars} for ${data.duration_seconds}s - Task: ${data.task_type}`);
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