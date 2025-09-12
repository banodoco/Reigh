import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Hook to check for new users and grant welcome bonus
 * Uses server-side protection for security
 */
export function useWelcomeBonus() {
  const [showModal, setShowModal] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const checkAndGrantWelcomeBonus = async () => {
      // Simple state check to prevent multiple concurrent calls (UX only, not security)
      if (isChecking) {
        return;
      }
      
      setIsChecking(true);
      
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          return;
        }

        // Check if user is eligible for welcome bonus
        const { data, error } = await supabase.rpc('check_welcome_bonus_eligibility');
        
        if (error || !data || !Array.isArray(data) || data.length === 0) {
          return;
        }

        const result = data[0];
        const { eligible } = result;

        if (eligible) {
          // Call the grant-credits edge function
          const { data: { session } } = await supabase.auth.getSession();
          
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/grant-credits`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: user.id,
              amount: 5,
              isWelcomeBonus: true,
            }),
          });
          
          if (response.ok) {
            // Invalidate credits queries to refresh UI
            queryClient.invalidateQueries({ queryKey: ['credits', 'balance'] });
            queryClient.invalidateQueries({ queryKey: ['credits', 'ledger'] });
            
            // Show the modal after a brief delay
            timeoutId = setTimeout(() => {
              setShowModal(true);
            }, 500);
          }
        }

      } catch (error) {
        // Silent error handling - errors are handled server-side
      } finally {
        setIsChecking(false);
      }
    };

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