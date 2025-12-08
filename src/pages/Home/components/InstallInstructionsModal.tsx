import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Download, Share, Plus, ExternalLink, CheckCircle, MoreVertical, Menu } from 'lucide-react';
import type { InstallMethod, Platform, Browser } from '@/shared/hooks/usePlatformInstall';

interface InstallInstructionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installMethod: InstallMethod;
  platform: Platform;
  browser: Browser;
  instructions: string[];
  isAppInstalled?: boolean;
  onFallbackToDiscord: () => void;
}

// Visual representations of browser UI elements
const ChromeInstallIcon = () => (
  <div className="inline-flex items-center justify-center w-6 h-6 bg-gray-100 border border-gray-300 rounded text-xs font-mono">
    <Download className="w-3.5 h-3.5 text-gray-600" />
  </div>
);

const ChromeMenuIcon = () => (
  <div className="inline-flex items-center justify-center w-6 h-6 bg-gray-100 border border-gray-300 rounded">
    <MoreVertical className="w-4 h-4 text-gray-600" />
  </div>
);

const SafariShareIcon = () => (
  <div className="inline-flex items-center justify-center w-7 h-7 bg-[#007AFF]/10 border border-[#007AFF]/30 rounded-lg">
    <svg className="w-4 h-4 text-[#007AFF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M12 5l-4 4M12 5l4 4" />
      <rect x="4" y="14" width="16" height="6" rx="1" fill="currentColor" opacity="0.2" />
    </svg>
  </div>
);

const SafariFileMenu = () => (
  <div className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs font-medium text-gray-700">
    File
  </div>
);

const EdgeAppAvailable = () => (
  <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-full text-xs text-blue-700">
    <Plus className="w-3 h-3" />
    <span>App available</span>
  </div>
);

const OpenInAppBadge = ({ browser }: { browser: Browser }) => (
  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-200 rounded-full text-xs font-medium text-green-700">
    <ExternalLink className="w-3 h-3" />
    <span>{browser === 'chrome' ? 'Open in Reigh' : 'Open in app'}</span>
  </div>
);

export const InstallInstructionsModal: React.FC<InstallInstructionsModalProps> = ({
  open,
  onOpenChange,
  installMethod,
  platform,
  browser,
  instructions,
  isAppInstalled,
  onFallbackToDiscord,
}) => {
  const getIcon = () => {
    if (isAppInstalled) {
      return <CheckCircle className="w-8 h-8 text-green-500" />;
    }
    if (platform === 'ios') {
      return <Share className="w-8 h-8 text-wes-vintage-gold" />;
    }
    if (installMethod === 'safari-dock') {
      return <Menu className="w-8 h-8 text-wes-vintage-gold" />;
    }
    return <Download className="w-8 h-8 text-wes-vintage-gold" />;
  };

  const getTitle = () => {
    if (isAppInstalled) {
      return 'Reigh is Already Installed!';
    }
    if (platform === 'ios') {
      return 'Add Reigh to Home Screen';
    }
    if (platform === 'mac' && browser === 'safari') {
      return 'Add Reigh to Your Dock';
    }
    return 'Install Reigh';
  };

  const getDescription = () => {
    if (isAppInstalled) {
      return 'You can open Reigh as a standalone app for the best experience.';
    }
    if (platform === 'ios') {
      return 'Get the full app experience with quick access from your home screen.';
    }
    if (platform === 'mac' && browser === 'safari') {
      return 'Install Reigh as a native app on your Mac for the best experience.';
    }
    return 'Install Reigh as an app for quick access and a better experience.';
  };

  // Get visual element for each instruction step
  const getVisualForStep = (stepIndex: number): React.ReactNode | null => {
    // App is installed - show "Open in app" badge
    if (isAppInstalled) {
      if (stepIndex === 1) {
        return <OpenInAppBadge browser={browser} />;
      }
      return null;
    }
    
    // Safari on macOS - File menu
    if (installMethod === 'safari-dock') {
      if (stepIndex === 0) return <SafariFileMenu />;
      return null;
    }
    
    // iOS Safari - Share button
    if (installMethod === 'safari-home-screen' && browser === 'safari') {
      if (stepIndex === 0) return <SafariShareIcon />;
      return null;
    }
    
    // iOS Chrome/Edge - Share button
    if (installMethod === 'safari-home-screen' && (browser === 'chrome' || browser === 'edge')) {
      if (stepIndex === 0) return <SafariShareIcon />;
      return null;
    }
    
    // Chrome prompt declined or manual
    if (browser === 'chrome') {
      if (stepIndex === 0) return <ChromeInstallIcon />;
      if (stepIndex === 1) return <ChromeMenuIcon />;
      return null;
    }
    
    // Edge
    if (browser === 'edge') {
      if (stepIndex === 0) return <EdgeAppAvailable />;
      if (stepIndex === 1) return <ChromeMenuIcon />;
      return null;
    }
    
    return null;
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
          {instructions.map((instruction, index) => {
            const visual = getVisualForStep(index);
            return (
              <div 
                key={index}
                className="flex items-start gap-3 p-3 bg-white/60 rounded-lg border border-wes-vintage-gold/20"
              >
                <div className="flex-shrink-0 w-6 h-6 bg-wes-vintage-gold/20 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-wes-vintage-gold">{index + 1}</span>
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-sm text-primary leading-relaxed">{instruction}</p>
                  {visual && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Look for:</span>
                      {visual}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <Button
            onClick={() => onOpenChange(false)}
            className="w-full bg-gradient-to-r from-wes-vintage-gold to-wes-coral hover:from-wes-vintage-gold/90 hover:to-wes-coral/90 text-white"
          >
            {isAppInstalled ? 'Got it!' : 'Got it!'}
          </Button>
          <div className="flex items-center justify-center">
            <button
              onClick={() => {
                onOpenChange(false);
                onFallbackToDiscord();
              }}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              {isAppInstalled ? 'continue in browser instead' : 'sign in with Discord instead'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};


