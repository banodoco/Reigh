import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Hook to check for new users and grant welcome bonus
 */
export function useWelcomeBonus() {
  const [showModal, setShowModal] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const checkAndGrantWelcomeBonus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          // No authenticated user
          return;
        }

        // Check if we've already attempted welcome bonus for this user in this session
        const attemptedKey = `welcome_bonus_attempted_${user.id}`;
        if (sessionStorage.getItem(attemptedKey)) {
          // Welcome bonus already attempted this session
          return;
        }

        // Check if user has already received welcome credits
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('given_credits')
          .eq('id', user.id)
          .single();

        if (userError) {
          console.error('[WelcomeBonus] Error checking user welcome status:', userError);
          return;
        }

        // Welcome bonus user data available but logging removed

        // If user hasn't received welcome credits yet, grant them
        // This includes: false, null, undefined (for existing users before migration)
        if (!userData.given_credits) {
          // User eligible for welcome bonus, attempting to grant
          try {
            // Get the user's auth token
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) return;

            // Call the grant-credits function
            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/grant-credits`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                userId: user.id,
                amount: 5, // $5
                isWelcomeBonus: true,
              }),
            });

            if (response.ok) {
              const result = await response.json();
              
              // Invalidate credits queries to refresh the UI immediately
              queryClient.invalidateQueries({ queryKey: ['credits', 'balance'] });
              queryClient.invalidateQueries({ queryKey: ['credits', 'ledger'] });
              
              // Small delay to ensure the UI is ready, then show modal
              timeoutId = setTimeout(() => {
                setShowModal(true);
              }, 1000);
              
              // Welcome bonus granted successfully
            } else {
              const errorText = await response.text();
              // Response error handled
              
              // If user already has credits, that's fine - don't show error
              if (!errorText.includes('already given')) {
                console.error('[WelcomeBonus] Error granting welcome bonus:', errorText);
              }
            }
          } catch (error) {
            console.error('[WelcomeBonus] Error calling grant-credits function:', error);
          } finally {
            // Mark as attempted regardless of success/failure to avoid spam
            sessionStorage.setItem(attemptedKey, new Date().toISOString());
          }
        } else {
          // User already has welcome credits, skipping
        }
      } catch (error) {
        console.error('Error in welcome bonus check:', error);
      }
    };

    // Check for welcome bonus when the hook mounts
    checkAndGrantWelcomeBonus();

    // Cleanup timeout on unmount
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [queryClient]);

  return {
    showWelcomeModal: showModal,
    closeWelcomeModal: () => setShowModal(false),
  };
} 