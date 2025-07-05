import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

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

interface CreditPackage {
  id: string;
  credits: number;
  amount: number;
  pricePerCredit: number;
}

interface CreditPackagesResponse {
  packages: CreditPackage[];
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
      // Placeholder implementation - will be implemented with proper API
      return {
        currentBalance: 0,
        totalPurchased: 0,
        totalSpent: 0,
        totalRefunded: 0,
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });

  // Fetch credit packages
  const {
    data: packages,
    isLoading: isLoadingPackages,
  } = useQuery<CreditPackagesResponse>({
    queryKey: ['credits', 'packages'],
    queryFn: async () => {
      // Placeholder implementation - will be implemented with proper API
      return {
        packages: [
          { id: 'starter', credits: 100, amount: 999, pricePerCredit: 10 },
          { id: 'professional', credits: 500, amount: 3999, pricePerCredit: 8 },
          { id: 'enterprise', credits: 1500, amount: 9999, pricePerCredit: 7 },
        ],
      };
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  // Fetch credit ledger with pagination
  const useCreditLedger = (limit = 50, offset = 0) => {
    return useQuery<CreditLedgerResponse>({
      queryKey: ['credits', 'ledger', limit, offset],
      queryFn: async () => {
        // Placeholder implementation - will be implemented with proper API
        return {
          transactions: [],
          total: 0,
          limit,
          offset,
        };
      },
      staleTime: 1000 * 60 * 2, // 2 minutes
    });
  };

  // Create checkout session
  const createCheckoutMutation = useMutation<CheckoutResponse, Error, string>({
    mutationFn: async (packageId: string) => {
      // For now, return placeholder response since we need to set up fetch function
      return {
        error: 'API integration not yet configured',
        message: 'Please complete API setup first',
      };
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
      // For now, return placeholder response since we need to set up fetch function
      return {
        success: false,
        transaction: {} as CreditTransaction,
      };
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

  // Utility function to check if user has enough credits
  const hasEnoughCredits = (requiredCredits: number) => {
    return (balance?.currentBalance || 0) >= requiredCredits;
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
    packages: packages?.packages || [],
    
    // Loading states
    isLoadingBalance,
    isLoadingPackages,
    isCreatingCheckout: createCheckoutMutation.isPending,
    isGrantingCredits: grantCreditsMutation.isPending,
    
    // Errors
    balanceError,
    
    // Functions
    useCreditLedger,
    createCheckout: createCheckoutMutation.mutate,
    grantCredits: grantCreditsMutation.mutate,
    refreshBalance,
    hasEnoughCredits,
    formatCurrency,
    formatTransactionType,
  };
} 