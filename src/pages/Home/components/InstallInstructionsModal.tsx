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

// Chrome's PWA install icon - computer monitor with down arrow
const ChromeInstallIcon = () => (
  <div className="inline-flex items-center justify-center w-7 h-7 bg-white border border-gray-300 rounded shadow-sm">
    <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M12 7v6M9 10l3 3 3-3" />
    </svg>
  </div>
);

// Chrome's three-dot menu
const ChromeMenuIcon = () => (
  <div className="inline-flex items-center justify-center w-6 h-6 bg-white border border-gray-300 rounded">
    <MoreVertical className="w-4 h-4 text-gray-600" />
  </div>
);

// Safari share button (iOS style - square with up arrow)
const SafariShareIcon = () => (
  <div className="inline-flex items-center justify-center w-8 h-8 bg-white border border-[#007AFF]/40 rounded-lg">
    <svg className="w-5 h-5 text-[#007AFF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M4 14v5a2 2 0 002 2h12a2 2 0 002-2v-5" />
    </svg>
  </div>
);

// Safari File menu (macOS menu bar style)
const SafariFileMenu = () => (
  <div className="inline-flex items-center gap-1 px-3 py-1 bg-white/80 backdrop-blur border border-gray-200 rounded shadow-sm text-sm font-medium text-gray-800">
    File
  </div>
);

// Edge "App available" chip in address bar
const EdgeAppAvailable = () => (
  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-300 rounded-full text-xs font-medium text-gray-700 shadow-sm">
    <Plus className="w-3 h-3" />
    <span>App available</span>
  </div>
);

// Chrome/Edge "Open in app" button - appears in address bar when PWA is installed
// Shows a mini browser mockup with the button in the address bar area
const OpenInAppBadge = () => (
  <div className="flex flex-col items-center gap-2">
    {/* Mini browser mockup */}
    <div className="relative w-full max-w-[280px] bg-gray-100 rounded-lg border border-gray-300 shadow-sm overflow-hidden">
      {/* Browser toolbar */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-200 border-b border-gray-300">
        {/* Traffic lights */}
        <div className="flex gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
        </div>
        {/* Address bar with "Open in app" button */}
        <div className="flex-1 flex items-center gap-2 px-2 py-1 bg-white rounded border border-gray-300 text-xs">
          <span className="text-gray-400 truncate">reigh.app</span>
          <div className="ml-auto flex items-center gap-1 px-2 py-0.5 bg-gray-50 border border-gray-300 rounded-full text-[10px] font-medium text-gray-700 animate-pulse ring-2 ring-wes-vintage-gold ring-offset-1">
            <img src="/favicon-32x32.png" alt="" className="w-3 h-3 rounded-sm" />
            <span>Open in app</span>
          </div>
        </div>
      </div>
      {/* Page content placeholder */}
      <div className="h-8 bg-gray-50" />
    </div>
    {/* Arrow pointing up */}
    <div className="flex items-center gap-1 text-wes-vintage-gold">
      <svg className="w-4 h-4 animate-bounce" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
      <span className="text-xs font-medium">Click here</span>
    </div>
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
        return <OpenInAppBadge />;
      }
      return null;
    }
    
    // Safari on macOS - File menu (step 0) and Share button (step 1)
    if (installMethod === 'safari-dock') {
      if (stepIndex === 0) return <SafariFileMenu />;
      if (stepIndex === 1) return <SafariShareIcon />;
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
              {isAppInstalled ? 'continue in browser instead' : 'or sign in here instead'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};


