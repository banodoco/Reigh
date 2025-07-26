import { useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to check for new users and grant welcome bonus
 */
export function useWelcomeBonus() {
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const checkAndGrantWelcomeBonus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Check if we've already attempted welcome bonus for this user in this session
        const attemptedKey = `welcome_bonus_attempted_${user.id}`;
        if (sessionStorage.getItem(attemptedKey)) return;

        // Check if user has already received welcome credits
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('given_credits')
          .eq('id', user.id)
          .single();

        if (userError) {
          console.error('Error checking user welcome status:', userError);
          return;
        }

        // If user hasn't received welcome credits yet, grant them
        if (!userData.given_credits) {
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
              
              // Small delay to ensure the UI is ready
              timeoutId = setTimeout(() => {
                toast.success("We've added $5 to your account!", {
                  description: "Welcome to Reigh! Your credits are ready to use.",
                  duration: 5000,
                });
              }, 1000);
              
              console.log('Welcome bonus granted:', result);
            } else {
              const errorText = await response.text();
              console.log('Welcome bonus response:', errorText);
              
              // If user already has credits, that's fine - don't show error
              if (!errorText.includes('already given')) {
                console.error('Error granting welcome bonus:', errorText);
              }
            }
          } catch (error) {
            console.error('Error calling grant-credits function:', error);
          } finally {
            // Mark as attempted regardless of success/failure to avoid spam
            sessionStorage.setItem(attemptedKey, 'true');
          }
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
  }, []);
} 