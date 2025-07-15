import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface CreditBalance {
  balance: number;
  currency: string;
}

interface CreditLedgerEntry {
  id: string;
  user_id: string;
  type: 'purchase' | 'spend';
  amount: number;
  description: string;
  created_at: string;
}

interface CreditLedgerResponse {
  entries: CreditLedgerEntry[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

interface CheckoutResponse {
  checkoutUrl?: string;
  error?: boolean;
  message?: string;
}

/**
 * Get credit balance using direct Supabase call
 */
async function fetchCreditBalance(): Promise<CreditBalance> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Authentication required');
    }

    const { data, error } = await supabase
      .from('users')
      .select('credits')
      .eq('id', user.id)
      .single();

    if (error) {
      throw new Error(`Failed to fetch credit balance: ${error.message}`);
    }

    return {
      balance: data?.credits || 0,
      currency: 'USD',
    };
  } catch (error) {
    console.error('[fetchCreditBalance] Error:', error);
    throw error;
  }
}

/**
 * Get credit ledger using direct Supabase call
 */
async function fetchCreditLedger(limit: number = 50, offset: number = 0): Promise<CreditLedgerResponse> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Authentication required');
    }

    // Get total count first
    const { count, error: countError } = await supabase
      .from('credits_ledger')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (countError) {
      throw new Error(`Failed to fetch ledger count: ${countError.message}`);
    }

    // Get paginated entries
    const { data, error } = await supabase
      .from('credits_ledger')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to fetch credit ledger: ${error.message}`);
    }

    const total = count || 0;
    const hasMore = offset + limit < total;

    return {
      entries: data || [],
      pagination: {
        limit,
        offset,
        total,
        hasMore,
      },
    };
  } catch (error) {
    console.error('[fetchCreditLedger] Error:', error);
    throw error;
  }
}

export function useCredits() {
  const queryClient = useQueryClient();

  // Fetch credit balance using Supabase
  const {
    data: balance,
    isLoading: isLoadingBalance,
    error: balanceError,
  } = useQuery<CreditBalance>({
    queryKey: ['credits', 'balance'],
    queryFn: fetchCreditBalance,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });

  // Fetch credit ledger with pagination using Supabase
  const useCreditLedger = (limit = 50, offset = 0) => {
    return useQuery<CreditLedgerResponse>({
      queryKey: ['credits', 'ledger', limit, offset],
      queryFn: () => fetchCreditLedger(limit, offset),
      staleTime: 1000 * 60 * 2, // 2 minutes
    });
  };

  // Create checkout session - this still needs to use Supabase Edge Function
  const createCheckoutMutation = useMutation<CheckoutResponse, Error, number>({
    mutationFn: async (dollarAmount: number) => {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        throw new Error('Authentication required');
      }

      // Call Supabase Edge Function for Stripe checkout
      const { data, error: functionError } = await supabase.functions.invoke('stripe-checkout', {
        body: { amount: dollarAmount },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (functionError) {
        throw new Error(functionError.message || 'Failed to create checkout session');
      }

      return data;
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        // Redirect to Stripe checkout
        window.location.href = data.checkoutUrl;
      } else if (data.error) {
        toast.error(data.message || 'Failed to create checkout session');
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create checkout session');
    },
  });

  // Grant credits - for admin use via Edge Function
  const grantCreditsMutation = useMutation<any, Error, { userId: string; amount: number; description: string }>({
    mutationFn: async ({ userId, amount, description }) => {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        throw new Error('Authentication required');
      }

      // Call Supabase Edge Function for granting credits
      const { data, error: functionError } = await supabase.functions.invoke('grant-credits', {
        body: { userId, amount, description },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (functionError) {
        throw new Error(functionError.message || 'Failed to grant credits');
      }

      return data;
    },
    onSuccess: () => {
      // Invalidate balance and ledger to refresh
      queryClient.invalidateQueries({ queryKey: ['credits', 'balance'] });
      queryClient.invalidateQueries({ queryKey: ['credits', 'ledger'] });
      toast.success('Credits granted successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to grant credits');
    },
  });

  // Format currency amount
  const formatCurrency = (cents: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  return {
    balance,
    isLoadingBalance,
    balanceError,
    useCreditLedger,
    createCheckout: createCheckoutMutation.mutate,
    isCreatingCheckout: createCheckoutMutation.isPending,
    grantCredits: grantCreditsMutation.mutate,
    isGrantingCredits: grantCreditsMutation.isPending,
    formatCurrency,
  };
} 