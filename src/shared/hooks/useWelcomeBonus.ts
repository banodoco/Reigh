import { useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to detect when a user has received the welcome bonus and show a notification
 */
export function useWelcomeBonus() {
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const checkForWelcomeBonus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Check if we've already shown the welcome message for this user
        const welcomeShownKey = `welcome_bonus_shown_${user.id}`;
        if (localStorage.getItem(welcomeShownKey)) return;

        // Check if user has a welcome bonus transaction
        const { data: welcomeBonus, error } = await supabase
          .from('credits_ledger')
          .select('*')
          .eq('user_id', user.id)
          .eq('type', 'manual')
          .eq('metadata->description', 'Welcome bonus')
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error checking welcome bonus:', error);
          return;
        }

        // If welcome bonus exists and we haven't shown the notification yet
        if (welcomeBonus) {
          // Small delay to ensure the UI is ready
          timeoutId = setTimeout(() => {
            toast.success("We've added $5 to your account!", {
              description: "Welcome to Reigh! Your credits are ready to use.",
              duration: 5000,
            });
            
            // Mark as shown so we don't show it again
            localStorage.setItem(welcomeShownKey, 'true');
          }, 1000);
        }
      } catch (error) {
        console.error('Error in welcome bonus check:', error);
      }
    };

    // Check for welcome bonus when the hook mounts
    checkForWelcomeBonus();

    // Cleanup timeout on unmount
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);
} 