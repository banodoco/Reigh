import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Download, Share, Plus } from 'lucide-react';
import type { InstallMethod, Platform, Browser } from '@/shared/hooks/usePlatformInstall';

interface InstallInstructionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installMethod: InstallMethod;
  platform: Platform;
  browser: Browser;
  instructions: string[];
  onFallbackToDiscord: () => void;
}

export const InstallInstructionsModal: React.FC<InstallInstructionsModalProps> = ({
  open,
  onOpenChange,
  installMethod,
  platform,
  browser,
  instructions,
  onFallbackToDiscord,
}) => {
  const getIcon = () => {
    if (platform === 'ios') {
      return <Share className="w-8 h-8 text-wes-vintage-gold" />;
    }
    if (installMethod === 'safari-dock') {
      return <Plus className="w-8 h-8 text-wes-vintage-gold" />;
    }
    return <Download className="w-8 h-8 text-wes-vintage-gold" />;
  };

  const getTitle = () => {
    if (platform === 'ios') {
      return 'Add Reigh to Home Screen';
    }
    if (platform === 'mac' && browser === 'safari') {
      return 'Add Reigh to Your Dock';
    }
    return 'Install Reigh';
  };

  const getDescription = () => {
    if (platform === 'ios') {
      return 'Get the full app experience with quick access from your home screen.';
    }
    if (platform === 'mac' && browser === 'safari') {
      return 'Install Reigh as a native app on your Mac for the best experience.';
    }
    return 'Install Reigh as an app for quick access and a better experience.';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-wes-cream border-wes-vintage-gold/30">
        <DialogHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-wes-vintage-gold/10 rounded-full flex items-center justify-center">
            {getIcon()}
          </div>
          <DialogTitle className="text-2xl font-theme font-theme-heading text-center">
            {getTitle()}
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            {getDescription()}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          {instructions.map((instruction, index) => (
            <div 
              key={index}
              className="flex items-start gap-3 p-3 bg-white/60 rounded-lg border border-wes-vintage-gold/20"
            >
              <div className="flex-shrink-0 w-6 h-6 bg-wes-vintage-gold/20 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-wes-vintage-gold">{index + 1}</span>
              </div>
              <p className="text-sm text-primary leading-relaxed">{instruction}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full border-wes-vintage-gold/30 hover:bg-wes-vintage-gold/10"
          >
            Got it!
          </Button>
          <button
            onClick={() => {
              onOpenChange(false);
              onFallbackToDiscord();
            }}
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            or sign in with Discord instead
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};


