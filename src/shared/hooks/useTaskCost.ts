import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { invokeWithTimeout } from '@/shared/lib/invokeWithTimeout';

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
      const data = await invokeWithTimeout<CalculateTaskCostResponse>('calculate-task-cost', {
        body: { task_id },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        timeoutMs: 20000,
      });
      
      if ((data as any).error) {
        throw new Error((data as any).error);
      }
      
      return data;
    },
    onSuccess: (data) => {
      // Invalidate credits queries to refresh balance
      queryClient.invalidateQueries({ queryKey: ['credits', 'balance'] });
      queryClient.invalidateQueries({ queryKey: ['credits', 'ledger'] });
      
      // Task cost calculated
      const costInDollars = data.cost.toFixed(3);
      console.log(`Task cost calculated: $${costInDollars} (${data.billing_type}) for ${data.duration_seconds}s - Task: ${data.task_type}`);
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
export function formatTaskCost(costInDollars: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(costInDollars);
} 