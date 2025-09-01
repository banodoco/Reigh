import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

  const { data, error } = await supabase
    .from('users')
    .select(`
      auto_topup_enabled,
      auto_topup_setup_completed,
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
    setupCompleted: data.auto_topup_setup_completed || false,
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
    throw new Error('Authentication required');
  }

  // Call the setup-auto-topup edge function
  const { data, error } = await supabase.functions.invoke('setup-auto-topup', {
    body: {
      autoTopupEnabled: params.enabled,
      autoTopupAmount: params.amount,
      autoTopupThreshold: params.threshold,
    },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  
  if (error) {
    throw new Error(error.message || 'Failed to update auto-top-up preferences');
  }
  
  if (data?.error) {
    throw new Error(data.message || 'Failed to update auto-top-up preferences');
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autoTopup', 'preferences'] });
      queryClient.invalidateQueries({ queryKey: ['credits'] }); // Refresh credits info
      toast.success('Auto-top-up preferences updated');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update auto-top-up preferences');
    },
  });

  // Disable auto-top-up mutation
  const disableMutation = useMutation<void, Error>({
    mutationFn: disableAutoTopup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autoTopup', 'preferences'] });
      queryClient.invalidateQueries({ queryKey: ['credits'] }); // Refresh credits info
      toast.success('Auto-top-up disabled');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to disable auto-top-up');
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
