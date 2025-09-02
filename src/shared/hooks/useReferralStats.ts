import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';

interface ReferralStats {
  total_visits: number;
  successful_referrals: number;
}

export const useReferralStats = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Get session and username
  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      
      if (session?.user?.id) {
        // Get username from users table
        const { data: userData, error } = await supabase
          .from('users')
          .select('username')
          .eq('id', session.user.id)
          .single();
        
        if (userData?.username && !error) {
          setUsername(userData.username);
        }
      }
    };
    
    getSession();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      
      // Reset username and stats when session changes
      if (!session?.user?.id) {
        setUsername(null);
        setStats(null);
      } else {
        // Get username for new session
        const { data: userData, error } = await supabase
          .from('users')
          .select('username')
          .eq('id', session.user.id)
          .single();
        
        if (userData?.username && !error) {
          setUsername(userData.username);
        }
      }
    });
    
    return () => subscription.unsubscribe();
  }, []);

  // Get referral stats when username is available
  useEffect(() => {
    const getStats = async () => {
      if (!username) {
        setStats(null);
        return;
      }
      
      setIsLoadingStats(true);
      try {
        const { data, error } = await supabase
          .from('referral_stats')
          .select('total_visits, successful_referrals')
          .eq('username', username)
          .single();
        
        if (data && !error) {
          setStats(data);
        } else {
          // No stats yet, show zeros
          setStats({ total_visits: 0, successful_referrals: 0 });
        }
      } catch (err) {
        setStats({ total_visits: 0, successful_referrals: 0 });
      } finally {
        setIsLoadingStats(false);
      }
    };
    
    getStats();
  }, [username]);

  const referralLink = username ? `https://reigh.art?from=${username}` : '';

  return {
    session,
    username,
    stats,
    isLoadingStats,
    referralLink
  };
};
