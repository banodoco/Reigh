import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Plus, MoreVertical } from 'lucide-react';
import type { InstallMethod, Platform, Browser, DeviceType } from '@/shared/hooks/usePlatformInstall';

interface InstallInstructionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installMethod: InstallMethod;
  platform: Platform;
  browser: Browser;
  deviceType: DeviceType;
  instructions: string[];
  isAppInstalled?: boolean;
  isSignedIn?: boolean;
  onFallbackToDiscord: () => void;
}

// Visual representations of browser UI elements with helpful mockups

// Chrome install - browser mockup with install icon in address bar
const ChromeInstallIcon = () => (
  <div className="relative w-full max-w-[280px] bg-gray-100 rounded-lg border border-gray-300 shadow-sm overflow-hidden">
    <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-200 border-b border-gray-300">
      <div className="flex gap-1">
        <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
      </div>
      <div className="flex-1 flex items-center gap-2 px-2 py-1 bg-white rounded border border-gray-300 text-xs">
        <span className="text-gray-400 truncate">reigh.art</span>
        <div className="ml-auto flex items-center justify-center w-5 h-5 bg-gray-50 border border-gray-300 rounded animate-pulse ring-2 ring-wes-vintage-gold ring-offset-1">
          <svg className="w-3 h-3 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8" />
            <path d="M12 17v4" />
            <path d="M12 7v6M9 10l3 3 3-3" />
          </svg>
        </div>
      </div>
    </div>
    <div className="h-8 bg-gray-50" />
  </div>
);

// Chrome's three-dot menu mockup
const ChromeMenuIcon = () => (
  <div className="relative w-full max-w-[280px] bg-gray-100 rounded-lg border border-gray-300 shadow-sm overflow-hidden">
    <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-200 border-b border-gray-300">
      <div className="flex gap-1">
        <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
      </div>
      <div className="flex-1 flex items-center gap-2 px-2 py-1 bg-white rounded border border-gray-300 text-xs">
        <span className="text-gray-400 truncate">reigh.art</span>
      </div>
      <div className="flex items-center justify-center w-6 h-6 bg-gray-50 border border-gray-300 rounded animate-pulse ring-2 ring-wes-vintage-gold ring-offset-1">
        <MoreVertical className="w-4 h-4 text-gray-600" />
      </div>
    </div>
    <div className="h-8 bg-gray-50" />
  </div>
);

// iOS Safari share button mockup - shows bottom toolbar
const SafariShareIcon = () => (
  <div className="relative w-full max-w-[200px] bg-gray-100 rounded-2xl border border-gray-300 shadow-sm overflow-hidden">
    {/* iPhone notch area */}
    <div className="h-6 bg-gray-200 flex justify-center items-end pb-1">
      <div className="w-16 h-1 bg-gray-400 rounded-full" />
    </div>
    {/* Page content */}
    <div className="h-16 bg-gray-50 flex items-center justify-center">
      <span className="text-[10px] text-gray-400">reigh.art</span>
    </div>
    {/* Safari bottom toolbar */}
    <div className="flex items-center justify-around px-4 py-2 bg-gray-200 border-t border-gray-300">
      <div className="w-5 h-5 text-gray-400">‹</div>
      <div className="w-5 h-5 text-gray-400">›</div>
      <div className="flex items-center justify-center w-7 h-7 animate-pulse ring-2 ring-wes-vintage-gold ring-offset-1 rounded">
        <svg className="w-5 h-5 text-[#007AFF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v12M8 7l4-4 4 4" />
          <path d="M4 14v5a2 2 0 002 2h12a2 2 0 002-2v-5" />
        </svg>
      </div>
      <div className="w-5 h-5 text-gray-400">☐</div>
      <div className="w-5 h-5 text-gray-400">⊡</div>
    </div>
  </div>
);

// Chrome on iPhone - Share button at top-right (similar to Safari's share icon)
const ChromeIOSShareIcon = () => (
  <div className="relative w-full max-w-[200px] bg-gray-100 rounded-2xl border border-gray-300 shadow-sm overflow-hidden">
    {/* iPhone notch area */}
    <div className="h-6 bg-gray-800 flex justify-center items-end pb-1">
      <div className="w-16 h-1 bg-gray-600 rounded-full" />
    </div>
    {/* Chrome toolbar */}
    <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200">
      <div className="flex-1 flex items-center px-2 py-1 bg-gray-100 rounded-full text-[10px] text-gray-500 truncate">
        reigh.art
      </div>
      {/* Share button - highlighted */}
      <div className="flex items-center justify-center w-6 h-6 animate-pulse ring-2 ring-wes-vintage-gold ring-offset-1 rounded">
        <svg className="w-4 h-4 text-[#007AFF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v12M8 7l4-4 4 4" />
          <path d="M4 14v5a2 2 0 002 2h12a2 2 0 002-2v-5" />
        </svg>
      </div>
    </div>
    {/* Page content area */}
    <div className="h-16 bg-gray-50" />
  </div>
);

// Edge on iPhone - three-dot menu at BOTTOM center, then Share
const EdgeIOSShareIcon = () => (
  <div className="relative w-full max-w-[200px] bg-gray-100 rounded-2xl border border-gray-300 shadow-sm overflow-hidden">
    {/* iPhone notch area */}
    <div className="h-6 bg-gray-800 flex justify-center items-end pb-1">
      <div className="w-16 h-1 bg-gray-600 rounded-full" />
    </div>
    {/* Edge top bar with URL */}
    <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200">
      <div className="flex-1 flex items-center px-2 py-1 bg-gray-100 rounded-full text-[10px] text-gray-500 truncate">
        reigh.art
      </div>
    </div>
    {/* Page content area */}
    <div className="h-12 bg-gray-50" />
    {/* Edge bottom toolbar with menu in center */}
    <div className="flex items-center justify-around px-4 py-2 bg-white border-t border-gray-200">
      <div className="w-5 h-5 text-gray-400">‹</div>
      <div className="w-5 h-5 text-gray-400">›</div>
      {/* Three-dot menu - highlighted */}
      <div className="flex items-center justify-center w-7 h-7 animate-pulse ring-2 ring-wes-vintage-gold ring-offset-1 rounded">
        <MoreVertical className="w-5 h-5 text-gray-600" />
      </div>
      <div className="w-5 h-5 text-gray-400">☐</div>
      <div className="w-5 h-5 text-gray-400">⊡</div>
    </div>
  </div>
);

// iPad Safari - desktop-like top toolbar with share button
const IPadSafariShareIcon = () => (
  <div className="relative w-full max-w-[280px] bg-gray-100 rounded-lg border border-gray-300 shadow-sm overflow-hidden">
    {/* Safari top toolbar */}
    <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-200 border-b border-gray-300">
      {/* Window controls */}
      <div className="flex gap-1">
        <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
      </div>
      {/* Navigation */}
      <div className="flex gap-1 text-gray-400 text-sm">
        <span>‹</span>
        <span>›</span>
      </div>
      {/* Address bar */}
      <div className="flex-1 flex items-center gap-2 px-2 py-1 bg-white rounded border border-gray-300 text-xs">
        <span className="text-gray-400 truncate">reigh.art</span>
      </div>
      {/* Share button - highlighted */}
      <div className="flex items-center justify-center w-6 h-6 animate-pulse ring-2 ring-wes-vintage-gold ring-offset-1 rounded">
        <svg className="w-4 h-4 text-[#007AFF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v12M8 7l4-4 4 4" />
          <path d="M4 14v5a2 2 0 002 2h12a2 2 0 002-2v-5" />
        </svg>
      </div>
    </div>
    {/* Page content */}
    <div className="h-10 bg-gray-50" />
  </div>
);

// iPad Chrome - tablet toolbar with Share icon at top-right
const IPadChromeShareIcon = () => (
  <div className="relative w-full max-w-[280px] bg-gray-100 rounded-lg border border-gray-300 shadow-sm overflow-hidden">
    {/* Chrome top toolbar with tabs */}
    <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-200 border-b border-gray-300">
      {/* Tab area */}
      <div className="flex items-center gap-1 px-3 py-1 bg-white rounded-t border-x border-t border-gray-300 text-xs">
        <span className="text-gray-600 truncate">reigh.art</span>
        <span className="text-gray-400 text-[10px] ml-2">×</span>
      </div>
      <div className="flex-1" />
    </div>
    {/* Address bar row */}
    <div className="flex items-center gap-2 px-2 py-1.5 bg-white border-b border-gray-200">
      <div className="flex gap-1 text-gray-400 text-sm">
        <span>‹</span>
        <span>›</span>
      </div>
      <div className="flex-1 flex items-center px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-500">
        reigh.art
      </div>
      {/* Share button - highlighted */}
      <div className="flex items-center justify-center w-6 h-6 animate-pulse ring-2 ring-wes-vintage-gold ring-offset-1 rounded">
        <svg className="w-4 h-4 text-[#007AFF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v12M8 7l4-4 4 4" />
          <path d="M4 14v5a2 2 0 002 2h12a2 2 0 002-2v-5" />
        </svg>
      </div>
    </div>
    {/* Page content */}
    <div className="h-10 bg-gray-50" />
  </div>
);

// iPad Edge - tablet toolbar with three-dot menu
const IPadEdgeShareIcon = () => (
  <div className="relative w-full max-w-[280px]">
    <div className="bg-gray-100 rounded-lg border border-gray-300 shadow-sm overflow-hidden">
      {/* Edge top toolbar */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-200 border-b border-gray-300">
        <div className="flex items-center gap-1 px-3 py-1 bg-white rounded-t border-x border-t border-gray-300 text-xs">
          <span className="text-gray-600 truncate">reigh.art</span>
          <span className="text-gray-400 text-[10px] ml-2">×</span>
        </div>
        <div className="flex-1" />
        {/* Three-dot menu - highlighted */}
        <div className="flex items-center justify-center w-6 h-6 animate-pulse ring-2 ring-wes-vintage-gold ring-offset-1 rounded">
          <MoreVertical className="w-4 h-4 text-gray-600" />
        </div>
      </div>
      {/* Address bar */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-white border-b border-gray-200">
        <div className="flex gap-1 text-gray-400 text-sm">
          <span>‹</span>
          <span>›</span>
        </div>
        <div className="flex-1 flex items-center px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-500">
          reigh.art
        </div>
      </div>
      <div className="h-8 bg-gray-50" />
    </div>
    {/* Dropdown */}
    <div className="absolute top-8 right-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-[10px] w-36 z-10">
      <div className="px-3 py-1.5 text-gray-600">New Tab</div>
      <div className="px-3 py-1.5 text-gray-600">Share...</div>
      <div className="border-t border-gray-100 my-0.5" />
      <div className="px-3 py-1.5 bg-blue-500 text-white rounded mx-1 font-medium">
        Add to Home Screen
      </div>
    </div>
  </div>
);

// Safari File menu (macOS) - menu bar mockup
const SafariFileMenu = () => (
  <div className="relative w-full max-w-[280px]">
    {/* Mac menu bar */}
    <div className="flex items-center gap-4 px-3 py-1 bg-gray-200/80 backdrop-blur border border-gray-300 rounded-t-lg text-xs">
      <span className="font-bold">&#63743;</span>
      <span className="px-2 py-0.5 bg-gray-300/50 rounded animate-pulse ring-2 ring-wes-vintage-gold ring-offset-1 font-medium">File</span>
      <span className="text-gray-600">Edit</span>
      <span className="text-gray-600">View</span>
      <span className="text-gray-600">History</span>
    </div>
    {/* Dropdown preview */}
    <div className="absolute top-full left-8 mt-0.5 bg-white border border-gray-300 rounded-lg shadow-lg py-1 text-xs w-40 z-10">
      <div className="px-3 py-1 text-gray-600">New Window</div>
      <div className="px-3 py-1 text-gray-600">New Tab</div>
      <div className="border-t border-gray-200 my-1" />
      <div className="px-3 py-1 bg-blue-500 text-white rounded mx-1 font-medium">Add to Dock</div>
    </div>
    {/* Browser window hint */}
    <div className="h-12 bg-gray-100 border-x border-b border-gray-300 rounded-b-lg" />
  </div>
);

// Edge "App available" - browser mockup (desktop)
const EdgeAppAvailable = () => (
  <div className="relative w-full max-w-[280px] bg-gray-100 rounded-lg border border-gray-300 shadow-sm overflow-hidden">
    <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-200 border-b border-gray-300">
      <div className="flex gap-1">
        <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
      </div>
      <div className="flex-1 flex items-center gap-2 px-2 py-1 bg-white rounded border border-gray-300 text-xs">
        <span className="text-gray-400 truncate">reigh.art</span>
        <div className="ml-auto flex items-center gap-1 px-2 py-0.5 bg-gray-50 border border-gray-300 rounded-full text-[10px] font-medium text-gray-700 animate-pulse ring-2 ring-wes-vintage-gold ring-offset-1">
          <Plus className="w-2.5 h-2.5" />
          <span>App available</span>
        </div>
      </div>
    </div>
    <div className="h-8 bg-gray-50" />
  </div>
);

// Android install prompt - shows phone with bottom install banner
const AndroidInstallPrompt = () => (
  <div className="relative w-full max-w-[200px] bg-gray-100 rounded-2xl border border-gray-300 shadow-sm overflow-hidden">
    {/* Android status bar */}
    <div className="h-5 bg-gray-800 flex justify-between items-center px-3">
      <span className="text-[8px] text-gray-400">9:41</span>
      <div className="flex gap-1">
        <div className="w-3 h-2 border border-gray-400 rounded-sm" />
      </div>
    </div>
    {/* Chrome toolbar */}
    <div className="flex items-center gap-2 px-2 py-1.5 bg-white border-b border-gray-200">
      <div className="flex-1 flex items-center px-2 py-1 bg-gray-100 rounded-full text-[10px] text-gray-500">
        reigh.art
      </div>
      <MoreVertical className="w-4 h-4 text-gray-400" />
    </div>
    {/* Page content */}
    <div className="h-20 bg-gray-50" />
    {/* Install banner at bottom */}
    <div className="flex items-center gap-2 px-3 py-2 bg-white border-t border-gray-200 animate-pulse ring-2 ring-wes-vintage-gold ring-inset">
      <img src="/favicon-32x32.png" alt="" className="w-8 h-8 rounded-lg" />
      <div className="flex-1">
        <div className="text-xs font-medium">Reigh</div>
        <div className="text-[10px] text-gray-500">reigh.art</div>
      </div>
      <div className="px-3 py-1 bg-blue-500 text-white text-xs font-medium rounded">
        Install
      </div>
    </div>
  </div>
);

// Chrome/Edge "Open in app" button - appears in address bar when PWA is installed
const OpenInAppBadge = () => (
  <div className="relative w-full max-w-[280px] bg-gray-100 rounded-lg border border-gray-300 shadow-sm overflow-hidden">
    <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-200 border-b border-gray-300">
      <div className="flex gap-1">
        <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
      </div>
      <div className="flex-1 flex items-center gap-2 px-2 py-1 bg-white rounded border border-gray-300 text-xs">
        <span className="text-gray-400 truncate">reigh.art</span>
        <div className="ml-auto flex items-center gap-1 px-2 py-0.5 bg-gray-50 border border-gray-300 rounded-full text-[10px] font-medium text-gray-700 animate-pulse ring-2 ring-wes-vintage-gold ring-offset-1">
          <img src="/favicon-32x32.png" alt="" className="w-3 h-3 rounded-sm" />
          <span>Open in app</span>
        </div>
      </div>
    </div>
    <div className="h-8 bg-gray-50" />
  </div>
);

export const InstallInstructionsModal: React.FC<InstallInstructionsModalProps> = ({
  open,
  onOpenChange,
  installMethod,
  platform,
  browser,
  deviceType,
  instructions,
  isAppInstalled,
  isSignedIn,
  onFallbackToDiscord,
}) => {
  const getTitle = () => {
    if (isAppInstalled) {
      return 'Reigh is already installed!';
    }
    if (platform === 'ios') {
      return 'Add Reigh to home screen';
    }
    if (platform === 'mac' && browser === 'safari') {
      return 'Add Reigh to your dock';
    }
    return 'Install Reigh';
  };

  // Get the main visual mockup for this scenario
  const getMainVisual = (): React.ReactNode | null => {
    // App is installed - show "Open in app" mockup
    if (isAppInstalled) {
      return <OpenInAppBadge />;
    }
    
    // Safari on macOS - File menu mockup
    if (installMethod === 'safari-dock') {
      return <SafariFileMenu />;
    }
    
    // iOS - different mockups for iPad vs iPhone, and Safari vs Chrome vs Edge
    if (installMethod === 'safari-home-screen') {
      // iPad (tablet)
      if (deviceType === 'tablet') {
        if (browser === 'chrome') {
          // Chrome iPad: Share icon at top-right
          return <IPadChromeShareIcon />;
        }
        if (browser === 'edge') {
          // Edge iPad: Three-dot menu
          return <IPadEdgeShareIcon />;
        }
        // Safari iPad: Share button in top toolbar
        return <IPadSafariShareIcon />;
      }
      
      // iPhone - each browser has different UI
      if (browser === 'chrome') {
        // Chrome iPhone: Share button at top-right
        return <ChromeIOSShareIcon />;
      }
      if (browser === 'edge') {
        // Edge iPhone: Three-dot menu at bottom center
        return <EdgeIOSShareIcon />;
      }
      // Safari iPhone: Share button at bottom toolbar
      return <SafariShareIcon />;
    }
    
    // Android - phone mockup with install banner
    if (platform === 'android') {
      return <AndroidInstallPrompt />;
    }
    
    // Chrome desktop - install icon mockup
    if (browser === 'chrome') {
      return <ChromeInstallIcon />;
    }
    
    // Edge desktop - App available mockup
    if (browser === 'edge') {
      return <EdgeAppAvailable />;
    }
    
    return null;
  };

  const mainVisual = getMainVisual();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-wes-cream border-wes-vintage-gold/30 gap-3">
        <DialogHeader className="text-center">
          <DialogTitle className="text-xl font-theme font-theme-heading text-center">
            {getTitle()}
          </DialogTitle>
        </DialogHeader>

        {/* Instructions text BEFORE the visual */}
        {instructions.length > 0 && (
          <div className="text-center">
            {instructions.map((instruction, index) => (
              <p key={index} className="text-sm text-muted-foreground">
                {instruction}
              </p>
            ))}
          </div>
        )}

        {/* Visual mockup shows where to click */}
        {mainVisual && (
          <div className="flex justify-center">
            {mainVisual}
          </div>
        )}

        {/* Just the fallback link */}
        <div className="flex justify-center pt-1">
          <button
            onClick={() => {
              onOpenChange(false);
              onFallbackToDiscord();
            }}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            {isSignedIn ? 'or continue in browser' : isAppInstalled ? 'continue in browser instead' : 'or sign in here instead'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};


