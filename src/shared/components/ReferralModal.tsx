import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { useMediumModal } from '@/shared/hooks/useMobileModalStyling';
import { mergeMobileModalClasses, createMobileModalProps } from '@/shared/hooks/useMobileModalStyling';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';

interface ReferralModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ReferralStats {
  total_visits: number;
  successful_referrals: number;
}

export const ReferralModal: React.FC<ReferralModalProps> = ({ isOpen, onOpenChange }) => {
  const modalStyling = useMediumModal();
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
        console.error('Error fetching referral stats:', err);
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
      toast.success('Referral link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy link');
    }
  };

  if (!session) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent 
          className={mergeMobileModalClasses(
            'sm:max-w-[500px] bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800 flex flex-col rounded-lg',
            modalStyling.dialogContentClassName,
            modalStyling.isMobile
          )}
          style={modalStyling.dialogContentStyle}
          {...createMobileModalProps(modalStyling.isMobile)}
        >
          <div className={modalStyling.headerContainerClassName}>
            <DialogHeader className={`${modalStyling.isMobile ? 'px-4 pt-4 pb-2' : 'px-6 pt-4 pb-2'}`}>
              <DialogTitle className="text-xl font-cocogoose text-primary">
                Refer artists to create with Reigh
              </DialogTitle>
            </DialogHeader>
          </div>
          
          <div className={modalStyling.scrollContainerClassName}>
            <div className={`${modalStyling.isMobile ? 'px-4 pb-4' : 'px-6 pb-6'} text-center`}>
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
        className={mergeMobileModalClasses(
          'sm:max-w-[500px] bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800 flex flex-col rounded-lg',
          modalStyling.dialogContentClassName,
          modalStyling.isMobile
        )}
        style={modalStyling.dialogContentStyle}
        {...createMobileModalProps(modalStyling.isMobile)}
      >
        <div className={modalStyling.headerContainerClassName}>
          <DialogHeader className={`${modalStyling.isMobile ? 'px-4 pt-4 pb-2' : 'px-6 pt-4 pb-2'}`}>
            <DialogTitle className="text-xl font-cocogoose text-primary">
              Refer artists to create with Reigh
            </DialogTitle>
          </DialogHeader>
        </div>
        
        <div className={modalStyling.scrollContainerClassName}>
          <div className={`${modalStyling.isMobile ? 'px-4 pb-4' : 'px-6 pb-6'} space-y-4`}>
            {/* Main Description */}
            <div className="space-y-3 text-sm leading-relaxed">
              <p>
                Artists can run Reigh for free on their computers.
              </p>
              
              <p>
                However, for those who prefer the convenience of running on the cloud, we charge roughly twice our compute costs. Because we run on consumer GPUs, this is still significantly cheaper than other providers.
              </p>
              
              <p>
                Of this, after costs, we offer <strong>16% of our lifetime profits</strong> from referred users to those who refer them.
              </p>
              
              <p>
                Those referred can of course run Reigh for free, but if they do pay, the referral will share in this.
              </p>
            </div>

            {/* Special Inspirational Message */}
            <div className="my-6 p-6 bg-gradient-to-r from-wes-pink/10 via-wes-lavender/10 to-wes-dusty-blue/10 border-2 border-wes-vintage-gold/30 rounded-xl shadow-wes-vintage">
              <div className="text-center">
                <p className="text-lg font-cocogoose text-primary leading-relaxed italic">
                  "We hope that this motivates artists to create art that in turn inspires others to create with AI."
                </p>
              </div>
            </div>

            {/* Referral Link */}
            {username ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Referral Link</label>
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
            ) : (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Setting up your referral link...
                </p>
              </div>
            )}

            {/* Statistics */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Statistics</label>
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b">
                  <div className="grid grid-cols-2 gap-4 text-sm font-medium">
                    <div>Visitors</div>
                    <div>Successful Sign-ups</div>
                  </div>
                </div>
                <div className="px-4 py-3">
                  {isLoadingStats ? (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="animate-pulse">...</div>
                      <div className="animate-pulse">...</div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="font-mono text-lg">
                        {stats?.total_visits ?? 0}
                      </div>
                      <div className="font-mono text-lg">
                        {stats?.successful_referrals ?? 0}
                      </div>
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
                    toast.info('Detailed analytics coming soon!');
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
