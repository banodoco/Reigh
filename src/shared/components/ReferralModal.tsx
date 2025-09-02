import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { useLargeModal, createMobileModalProps } from '@/shared/hooks/useMobileModalStyling';
import { useReferralStats } from '@/shared/hooks/useReferralStats';
import ProfitSplitBar from '@/shared/components/ProfitSplitBar';

interface ReferralModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ReferralModal: React.FC<ReferralModalProps> = ({ isOpen, onOpenChange }) => {
  const mobileModalStyling = useLargeModal();
  const [copied, setCopied] = useState(false);
  const { session, username, stats, isLoadingStats, referralLink } = useReferralStats();



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
          className={`${mobileModalStyling.fullClassName} data-[state=open]:!slide-in-from-top data-[state=open]:!slide-in-from-right data-[state=closed]:!slide-out-to-top data-[state=closed]:!slide-out-to-right`}
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
          
          {/* Footer with Close Button for non-authenticated state */}
          <div className={mobileModalStyling.footerContainerClassName}>
            <div className={`${mobileModalStyling.isMobile ? 'p-3 pt-3 pb-2' : 'p-4 pt-4 pb-2'} border-t`}>
              <div className="flex justify-end">
                <Button 
                  variant="outline" 
                  onClick={() => onOpenChange(false)}
                  className="h-12 px-4 text-sm font-medium"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        className={`${mobileModalStyling.fullClassName} data-[state=open]:!slide-in-from-top data-[state=open]:!slide-in-from-right data-[state=closed]:!slide-out-to-top data-[state=closed]:!slide-out-to-right`}
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
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
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
        
        {/* Statistics Footer */}
        <div className={mobileModalStyling.footerContainerClassName}>
          <div className={`${mobileModalStyling.isMobile ? 'p-3 pt-3 pb-2' : 'p-4 pt-4 pb-2'} border-t`}>
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
