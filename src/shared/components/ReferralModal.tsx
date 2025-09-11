import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { useLargeModal } from '@/shared/hooks/useModal';
import { useScrollFade } from '@/shared/hooks/useScrollFade';
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
  const modal = useLargeModal();
  const [copied, setCopied] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Simple scroll fade hook
  const { showFade, scrollRef } = useScrollFade({ 
    isOpen: isOpen
  });

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
        
        if (!error && userData?.username) {
          setUsername(userData.username);
        }
      }
    };

    if (isOpen) {
      getSession();
    }
  }, [isOpen]);

  // Fetch referral statistics
  useEffect(() => {
    const fetchStats = async () => {
      if (!session?.user?.id) return;

      setIsLoadingStats(true);
      try {
        const { data, error } = await supabase
          .from('referral_stats')
          .select('total_visits, successful_referrals')
          .eq('user_id', session.user.id)
          .single();

        if (!error && data) {
          setStats(data);
        }
      } catch (err) {
        console.error('Failed to fetch referral stats:', err);
      } finally {
        setIsLoadingStats(false);
      }
    };

    if (session?.user?.id) {
      fetchStats();
    }
  }, [session]);

  const handleCopyLink = async () => {
    if (!username) return;
    
    const referralLink = `https://reigh.art?from=${username}`;
    
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy referral link:', err);
    }
  };

  // Don't render for non-authenticated users
  if (!session) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        className={`${modal.className} data-[state=open]:!slide-in-from-top data-[state=open]:!slide-in-from-right data-[state=closed]:!slide-out-to-top data-[state=closed]:!slide-out-to-right`}
        style={modal.style}
        {...{...modal.props}}
      >
        <div className={modal.headerClass}>
          <DialogHeader className={`${modal.isMobile ? 'px-4 pt-4 pb-2' : 'px-6 pt-4 pb-2'} flex-shrink-0`}>
            <DialogTitle className="text-xl font-cocogoose text-primary">
              Refer artists to create with Reigh
            </DialogTitle>
          </DialogHeader>
        </div>
        
        <div 
          ref={scrollRef}
          className={`${modal.scrollClass} ${modal.isMobile ? 'px-4' : 'px-6'} overflow-x-visible [scrollbar-gutter:stable_both-edges] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:[&::-webkit-scrollbar]:block sm:[-ms-overflow-style:auto] sm:[scrollbar-width:auto] sm:pr-4 relative`}
        >
          <div className="space-y-4 pb-6 relative z-0">
            {/* Main Description */}
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Artists can run Reigh for free on their computers.
              </p>
              <p>
                However, for those who prefer the convenience of running on the cloud, we charge twice compute costs. Because we run on consumer GPUs, this is still significantly cheaper than other providers.
              </p>
              <p>
                Of this, after costs, we offer 16% of our lifetime profits from referred users to those who refer them via a link:
              </p>
            </div>

            {/* Referral Link Section */}
            {username ? (
              <div className="space-y-2">
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 text-sm font-mono text-muted-foreground truncate mr-3">
                      https://reigh.art?from={username}
                    </div>
                    <Button
                      onClick={handleCopyLink}
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
            <div className="text-sm leading-relaxed text-muted-foreground">
              <p className="mb-3">
                Additionally, we share another 50% of profits with those who contribute tech, and for initiatives for artists/engineers - our goal is to become a very positively impactful part of the open ecosystem:
              </p>

              {/* Profit split bar illustration */}
              <div className="overflow-visible mt-6">
                <ProfitSplitBar className="space-y-2" />
              </div>
            </div>
            
            {/* Spacer for minimal separation */}
            <div style={{ height: '1.5px' }}></div>
            
            {/* Inspirational Message */}
            <div className="space-y-1">
              <div>
                <p className="text-sm font-medium text-muted-foreground leading-relaxed italic text-left">
                  We hope that this motivates artists to create beautiful work, which in turn inspire others to create with AI.
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed text-left mt-2">
                  Additionally, artists who create with Reigh will share{' '}
                  <a 
                    href="https://banodoco.ai/pages/ownership.html" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="underline hover:text-muted-foreground/80 transition-colors"
                  >
                    ownership
                  </a>{' '}
                  in Banodoco, our parent company, proportionate to the number of people they refer.
                </p>
              </div>
            </div>

          </div>
        </div>
        
        {/* Footer */}
        <div className={`${modal.footerClass} relative`}>
          {/* Fade overlay */}
          {showFade && (
            <div 
              className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10"
              style={{ transform: 'translateY(-64px)' }}
            >
              <div className="h-full bg-gradient-to-t from-white via-white/95 to-transparent dark:from-gray-950 dark:via-gray-950/95 dark:to-transparent" />
            </div>
          )}
          
          <div className={`${modal.isMobile ? 'p-3 pt-3 pb-2' : 'p-4 pt-4 pb-2'} border-t relative z-20`}>
            <div className="flex gap-3 items-start">
              {/* Statistics Section - 3/5 width */}
              <div className="w-3/5 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Your referral statistics:</label>
                <div className="space-y-1 pr-3">
                  <div className="grid grid-cols-[1fr_auto] items-center">
                    <span className="text-xs text-muted-foreground">Visitors</span>
                    <span className="font-mono text-sm font-semibold justify-self-end">
                      {isLoadingStats ? "..." : (stats?.total_visits ?? 0)}
                    </span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] items-center">
                    <span className="text-xs text-muted-foreground">Sign-ups</span>
                    <span className="font-mono text-sm font-semibold justify-self-end">
                      {isLoadingStats ? "..." : (stats?.successful_referrals ?? 0)}
                    </span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] items-center">
                    <span className="text-xs text-muted-foreground">Bonuses</span>
                    <span className="font-mono text-sm font-semibold justify-self-end">
                      {isLoadingStats ? "..." : "$0"}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Vertical Divider */}
              <div className="w-px bg-gray-200 dark:bg-gray-700 self-stretch"></div>
              
              {/* Close Button - 2/5 width */}
              <div className="w-2/5 flex flex-col items-end">
                <p className="text-xs text-muted-foreground text-right mt-0.5">
                  Please share any questions on{' '}
                  <a 
                    href="https://discord.gg/wv6MymFEE3" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary underline hover:text-primary/80 transition-colors"
                  >
                    our discord
                  </a>
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => onOpenChange(false)}
                  className="h-12 px-4 text-sm font-medium mt-8"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};