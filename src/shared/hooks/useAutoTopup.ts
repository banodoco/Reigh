import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invokeWithTimeout } from '@/shared/lib/invokeWithTimeout';

export interface AutoTopupPreferences {
  enabled: boolean;
  setupCompleted: boolean;
  amount: number; // in dollars
  threshold: number; // in dollars
  hasPaymentMethod: boolean;
  customerId?: string;
  paymentMethodId?: string;
  lastTriggered?: string;
}

// Fetch user's auto-top-up preferences
async function fetchAutoTopupPreferences(): Promise<AutoTopupPreferences> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    throw new Error('Authentication required');
  }

  // Try without the problematic field first, since we know it's causing 400 errors
  const { data, error } = await supabase
    .from('users')
    .select(`
      auto_topup_enabled,
      auto_topup_amount,
      auto_topup_threshold,
      auto_topup_last_triggered,
      stripe_customer_id,
      stripe_payment_method_id
    `)
    .eq('id', user.id)
    .single();
    
  if (error) {
    throw new Error(`Failed to fetch auto-top-up preferences: ${error.message}`);
  }

  return {
    enabled: data.auto_topup_enabled || false,
    // For now, consider setup completed if user has both Stripe customer and payment method
    // This handles the case where the auto_topup_setup_completed field doesn't exist yet
    setupCompleted: data.auto_topup_setup_completed !== undefined 
      ? data.auto_topup_setup_completed 
      : !!(data.stripe_customer_id && data.stripe_payment_method_id),
    amount: data.auto_topup_amount ? data.auto_topup_amount / 100 : 50, // Convert cents to dollars
    threshold: data.auto_topup_threshold ? data.auto_topup_threshold / 100 : 10, // Convert cents to dollars
    hasPaymentMethod: !!(data.stripe_customer_id && data.stripe_payment_method_id),
    customerId: data.stripe_customer_id,
    paymentMethodId: data.stripe_payment_method_id,
    lastTriggered: data.auto_topup_last_triggered,
  };
}

// Update auto-top-up preferences
interface UpdateAutoTopupParams {
  enabled: boolean;
  amount?: number; // in dollars
  threshold?: number; // in dollars
}

async function updateAutoTopupPreferences(params: UpdateAutoTopupParams): Promise<void> {
  const { data: { session }, error: authError } = await supabase.auth.getSession();
  
  if (authError || !session) {
    console.error('[AutoTopup:Hook] Auth error:', authError);
    throw new Error('Authentication required');
  }

  const requestBody = {
    autoTopupEnabled: params.enabled,
    autoTopupAmount: params.amount,
    autoTopupThreshold: params.threshold,
  };
  
  // Call the setup-auto-topup edge function
  const data = await invokeWithTimeout('setup-auto-topup', {
    body: requestBody,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    timeoutMs: 20000,
  });
  
  if ((data as any)?.error) {
    console.error('[AutoTopup:Hook] Edge function returned error:', data);
    throw new Error((data as any).message || 'Failed to update auto-top-up preferences');
  }
  
  }

// Disable auto-top-up (convenience function)
async function disableAutoTopup(): Promise<void> {
  return updateAutoTopupPreferences({ enabled: false });
}

export function useAutoTopup() {
  const queryClient = useQueryClient();

  // Fetch auto-top-up preferences
  const {
    data: preferences,
    isLoading: isLoadingPreferences,
    error: preferencesError,
  } = useQuery<AutoTopupPreferences>({
    queryKey: ['autoTopup', 'preferences'],
    queryFn: fetchAutoTopupPreferences,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });

  // Update preferences mutation
  const updatePreferencesMutation = useMutation<void, Error, UpdateAutoTopupParams>({
    mutationFn: updateAutoTopupPreferences,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['autoTopup', 'preferences'] });
      queryClient.invalidateQueries({ queryKey: ['credits'] }); // Refresh credits info
      // Removed toast notification for smoother UX
    },
    onError: (error, variables) => {
      console.error('[AutoTopup:Hook] Save failed:', error, variables);
      // Only log errors, don't show toast for save failures
    },
  });

  // Disable auto-top-up mutation
  const disableMutation = useMutation<void, Error>({
    mutationFn: disableAutoTopup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autoTopup', 'preferences'] });
      queryClient.invalidateQueries({ queryKey: ['credits'] }); // Refresh credits info
      // Removed toast notification for smoother UX
    },
    onError: (error) => {
      console.error('[AutoTopup:Hook] Disable failed:', error);
      // Only log errors, don't show toast for disable failures
    },
  });

  return {
    // Data
    preferences,
    isLoadingPreferences,
    preferencesError,
    
    // Actions
    updatePreferences: updatePreferencesMutation.mutate,
    isUpdatingPreferences: updatePreferencesMutation.isPending,
    
    disableAutoTopup: disableMutation.mutate,
    isDisabling: disableMutation.isPending,
    
    // Computed values
    isEnabled: preferences?.enabled || false,
    isSetupCompleted: preferences?.setupCompleted || false,
    hasPaymentMethod: preferences?.hasPaymentMethod || false,
    isFullyConfigured: (preferences?.enabled && preferences?.setupCompleted && preferences?.hasPaymentMethod) || false,
  };
}
