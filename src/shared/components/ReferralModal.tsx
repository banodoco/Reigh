import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { useLargeModal, createMobileModalProps } from '@/shared/hooks/useMobileModalStyling';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import ProfitSplitBar from '@/shared/components/ProfitSplitBar';

interface ReferralModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ReferralStats {
  total_visits: number;
  successful_referrals: number;
}

export const ReferralModal: React.FC<ReferralModalProps> = ({ isOpen, onOpenChange }) => {
  const mobileModalStyling = useLargeModal();
  const [copied, setCopied] = useState(false);
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
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      
      // Reset username when session changes
      if (!session?.user?.id) {
        setUsername(null);
      }
    });
    
    return () => subscription.unsubscribe();
  }, []);

  // Get referral stats
  useEffect(() => {
    const getStats = async () => {
      if (!username || !isOpen) return;
      
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
  }, [username, isOpen]);

  const referralLink = username ? `https://reigh.art?from=${username}` : '';

  const copyToClipboard = async () => {
    if (!referralLink) return;
    
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy referral link:', err);
    }
  };

  if (!session) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent 
          className={mobileModalStyling.fullClassName}
          style={mobileModalStyling.dialogContentStyle}
          {...createMobileModalProps(mobileModalStyling.isMobile)}
        >
          <div className={mobileModalStyling.headerContainerClassName}>
            <DialogHeader className={`${mobileModalStyling.isMobile ? 'px-4 pt-4 pb-2' : 'px-6 pt-4 pb-2'} flex-shrink-0`}>
              <DialogTitle className="text-xl font-cocogoose text-primary">
                Refer artists to create with Reigh
              </DialogTitle>
            </DialogHeader>
          </div>
          
          <div className={`${mobileModalStyling.scrollContainerClassName} ${mobileModalStyling.isMobile ? 'px-4' : 'px-6'} overflow-x-visible [scrollbar-gutter:stable_both-edges] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:[&::-webkit-scrollbar]:block sm:[-ms-overflow-style:auto] sm:[scrollbar-width:auto] sm:pr-4`}>
            <div className="text-center pb-6">
              <p className="text-muted-foreground">
                Please sign in to access your referral link and statistics.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        className={mobileModalStyling.fullClassName}
        style={mobileModalStyling.dialogContentStyle}
        {...createMobileModalProps(mobileModalStyling.isMobile)}
      >
        <div className={mobileModalStyling.headerContainerClassName}>
          <DialogHeader className={`${mobileModalStyling.isMobile ? 'px-4 pt-4 pb-2' : 'px-6 pt-4 pb-2'} flex-shrink-0`}>
            <DialogTitle className="text-xl font-cocogoose text-primary">
              Refer artists to create with Reigh
            </DialogTitle>
          </DialogHeader>
        </div>
        
        <div className={`${mobileModalStyling.scrollContainerClassName} ${mobileModalStyling.isMobile ? 'px-4' : 'px-6'} overflow-x-visible [scrollbar-gutter:stable_both-edges] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:[&::-webkit-scrollbar]:block sm:[-ms-overflow-style:auto] sm:[scrollbar-width:auto] sm:pr-4`}>
          <div className="space-y-4 pb-6">
            {/* Main Description */}
            <div className="space-y-3 text-sm leading-relaxed">
              <p>
                Artists can run Reigh for free on their computers.
              </p>
              
              <p>
                However, for those who prefer the convenience of running on the cloud, we charge twice compute costs. Because we run on consumer GPUs, this is still significantly cheaper than other providers.
              </p>
              
              <p>
                Of this, after costs, we offer <strong>16% of our lifetime profits</strong> from referred users to those who refer them via a link:
              </p>
            </div>

            {/* Referral Link */}
            {session && username ? (
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="flex-1 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border text-sm font-mono break-all">
                    {referralLink}
                  </div>
                  <Button
                    onClick={copyToClipboard}
                    size="sm"
                    variant="outline"
                    className="flex-shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ) : session ? (
              <div className="space-y-2">
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border">
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                    <span className="text-sm text-muted-foreground">Loading your referral link...</span>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Profit Sharing Section */}
            <div className="space-y-3 text-sm leading-relaxed">
              <p>
                Additionally, we share another 50% of profits with those who contribute tech, and for initiatives for artists/engineers - our goal is to become a very positively impactful part of the open ecosystem:
              </p>

              {/* Profit split bar illustration */}
              <div className="overflow-visible">
                <ProfitSplitBar className="mt-2 mb-1" />
              </div>
              
              {/* Special Inspirational Message */}
              <div className="mt-6 mb-4">
                <p className="text-base font-medium text-primary leading-relaxed italic text-left">
                  We hope that this motivates artists to create art that in turn inspires others to create with AI.
                </p>
              </div>
            </div>

            {/* Statistics */}
            <div className="space-y-2">
              <label className="text-sm font-medium">You can see your statistics on referred users here:</label>
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b">
                  <div className="grid grid-cols-3 gap-4 text-sm font-medium">
                    <div>Visitors</div>
                    <div>Successful Sign-ups</div>
                    <div>Referral bonuses earned:</div>
                  </div>
                </div>
                <div className="px-4 py-3">
                  {isLoadingStats ? (
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div className="animate-pulse">...</div>
                      <div className="animate-pulse">...</div>
                      <div className="animate-pulse">...</div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div className="font-mono text-lg">
                        {stats?.total_visits ?? 0}
                      </div>
                      <div className="font-mono text-lg">
                        {stats?.successful_referrals ?? 0}
                      </div>
                      <div className="font-mono text-lg">$0</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Link to detailed stats - future enhancement */}
            {stats && (stats.total_visits > 0 || stats.successful_referrals > 0) && (
              <div className="pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-primary"
                  onClick={() => {
                    // Future: navigate to detailed referral analytics page
                    console.info('Detailed analytics coming soon!');
                  }}
                >
                  View detailed analytics
                  <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
