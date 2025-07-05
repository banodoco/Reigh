import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/api';

interface CreditBalance {
  currentBalance: number;
  totalPurchased: number;
  totalSpent: number;
  totalRefunded: number;
}

interface CreditTransaction {
  id: string;
  user_id: string;
  task_id?: string;
  amount: number;
  type: 'stripe' | 'manual' | 'spend' | 'refund';
  metadata?: Record<string, any>;
  created_at: string;
}

interface CreditLedgerResponse {
  transactions: CreditTransaction[];
  total: number;
  limit: number;
  offset: number;
}

interface CheckoutResponse {
  checkoutUrl?: string;
  sessionId?: string;
  error?: string;
  message?: string;
}

export function useCredits() {
  const queryClient = useQueryClient();

  // Fetch credit balance
  const {
    data: balance,
    isLoading: isLoadingBalance,
    error: balanceError,
  } = useQuery<CreditBalance>({
    queryKey: ['credits', 'balance'],
    queryFn: async () => {
      const response = await fetchWithAuth('/api/credits/balance');
      if (!response.ok) {
        throw new Error('Failed to fetch balance');
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });

  // Fetch credit ledger with pagination
  const useCreditLedger = (limit = 50, offset = 0) => {
    return useQuery<CreditLedgerResponse>({
      queryKey: ['credits', 'ledger', limit, offset],
      queryFn: async () => {
        const response = await fetchWithAuth(`/api/credits/ledger?limit=${limit}&offset=${offset}`);
        if (!response.ok) {
          throw new Error('Failed to fetch ledger');
        }
        return response.json();
      },
      staleTime: 1000 * 60 * 2, // 2 minutes
    });
  };

  // Create checkout session
  const createCheckoutMutation = useMutation<CheckoutResponse, Error, number>({
    mutationFn: async (dollarAmount: number) => {
      const response = await fetchWithAuth('/api/credits/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: dollarAmount }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }
      
      return response.json();
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

  // Grant credits (admin only)
  const grantCreditsMutation = useMutation<
    { success: boolean; transaction: CreditTransaction },
    Error,
    { userId: string; amount: number; reason?: string }
  >({
    mutationFn: async ({ userId, amount, reason }) => {
      const response = await fetchWithAuth('/api/credits/grant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, amount, reason }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to grant credits');
      }
      
      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch balance
      queryClient.invalidateQueries({ queryKey: ['credits', 'balance'] });
      queryClient.invalidateQueries({ queryKey: ['credits', 'ledger'] });
      toast.success('Credits granted successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to grant credits');
    },
  });

  // Utility function to refresh balance
  const refreshBalance = () => {
    queryClient.invalidateQueries({ queryKey: ['credits', 'balance'] });
  };

  // Utility function to check if user has enough budget
  const hasEnoughBudget = (requiredAmount: number) => {
    return (balance?.currentBalance || 0) >= requiredAmount;
  };

  // Utility function to format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100);
  };

  // Utility function to format transaction type
  const formatTransactionType = (type: CreditTransaction['type']) => {
    switch (type) {
      case 'stripe':
        return 'Purchase';
      case 'manual':
        return 'Grant';
      case 'spend':
        return 'Spend';
      case 'refund':
        return 'Refund';
      default:
        return type;
    }
  };

  return {
    // Data
    balance,
    
    // Loading states
    isLoadingBalance,
    isCreatingCheckout: createCheckoutMutation.isPending,
    isGrantingCredits: grantCreditsMutation.isPending,
    
    // Errors
    balanceError,
    
    // Functions
    useCreditLedger,
    createCheckout: createCheckoutMutation.mutate,
    grantCredits: grantCreditsMutation.mutate,
    refreshBalance,
    hasEnoughBudget,
    formatCurrency,
    formatTransactionType,
  };
} 