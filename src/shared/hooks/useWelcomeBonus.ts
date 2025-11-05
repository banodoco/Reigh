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

        // Check if user is eligible for welcome bonus by querying users table directly
        // First let's see what columns are available
        const { data: userData, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();
        
        if (error) {
          return;
        }
        
        if (!userData) {
          return;
        }

        const givenCredits = (userData as any).given_credits;
        // If user hasn't received welcome credits yet, show the modal
        // Type assertion needed because given_credits isn't in generated types yet
        if (!givenCredits) {
          timeoutId = setTimeout(() => {
            setShowModal(true);
          }, 500);
        } else {
          }

      } catch (error) {
        console.error('[WelcomeBonus] Unexpected error:', error);
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