import { useState, useEffect, useMemo, useCallback } from 'react';

export type Platform = 'mac' | 'windows' | 'linux' | 'ios' | 'android' | 'unknown';
export type Browser = 'chrome' | 'safari' | 'edge' | 'firefox' | 'samsung' | 'unknown';
export type InstallMethod = 'prompt' | 'safari-dock' | 'safari-home-screen' | 'none';

export interface PlatformInstallState {
  // Platform & Browser
  platform: Platform;
  browser: Browser;
  
  // PWA state
  isStandalone: boolean;  // Running as installed PWA
  canInstall: boolean;    // Can show install prompt (Chrome/Edge beforeinstallprompt)
  isWaitingForPrompt: boolean; // Chrome/Edge desktop - waiting for beforeinstallprompt
  isAppInstalled: boolean; // PWA appears to be installed (prompt timed out or detected)
  installMethod: InstallMethod;
  
  // CTA helpers
  ctaText: string;
  ctaIcon: 'download' | 'plus' | 'discord' | 'external';
  showInstallCTA: boolean;
  
  // Install instructions for manual methods
  installInstructions: string[];
  
  // Actions
  triggerInstall: () => Promise<boolean>;
}

/**
 * Detects platform, browser, and PWA installation capabilities.
 * Provides contextual CTA text and install methods.
 * 
 * PWA Install Support Matrix:
 * - Chrome (Mac/Win/Linux/Android): beforeinstallprompt ✓
 * - Edge (Mac/Win/Linux/Android): beforeinstallprompt ✓
 * - Safari macOS Sonoma+: "Add to Dock" (manual)
 * - Safari iOS: "Add to Home Screen" (manual)
 * - Firefox Desktop: No PWA support
 * - Firefox Android: beforeinstallprompt ✓
 * - Samsung Internet: beforeinstallprompt ✓
 */
// Helper to check standalone mode synchronously
const checkIsStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const displayModeFullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
    const iosStandalone = (navigator as any).standalone === true;
    return displayModeStandalone || displayModeFullscreen || iosStandalone;
  } catch {
    return false;
  }
};

export function usePlatformInstall(): PlatformInstallState {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  // Initialize isStandalone synchronously to prevent flash of install UI in PWA
  const [isStandalone, setIsStandalone] = useState(checkIsStandalone);
  const [promptTimedOut, setPromptTimedOut] = useState(false);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  
  // Detect platform
  const platform = useMemo<Platform>(() => {
    if (typeof navigator === 'undefined') return 'unknown';
    
    const ua = navigator.userAgent || '';
    const platform = (navigator as any).platform || '';
    
    // iOS detection (iPhone, iPad, iPod)
    if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
    // iPadOS 13+ detection (reports as Mac)
    if (platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1) return 'ios';
    
    // Android
    if (/Android/i.test(ua)) return 'android';
    
    // Desktop platforms
    if (/Mac/i.test(platform) || /Macintosh/i.test(ua)) return 'mac';
    if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'windows';
    if (/Linux/i.test(platform) || /Linux/i.test(ua)) return 'linux';
    
    return 'unknown';
  }, []);
  
  // Detect browser
  const browser = useMemo<Browser>(() => {
    if (typeof navigator === 'undefined') return 'unknown';
    
    const ua = navigator.userAgent || '';
    
    // Order matters - check more specific browsers first
    
    // Samsung Internet
    if (/SamsungBrowser/i.test(ua)) return 'samsung';
    
    // Edge (Chromium-based Edge contains both "Edg" and "Chrome")
    if (/Edg/i.test(ua)) return 'edge';
    
    // Chrome (but not Edge, not Samsung)
    // Note: Chrome on iOS uses "CriOS"
    if (/Chrome|CriOS/i.test(ua) && !/Edg/i.test(ua) && !/SamsungBrowser/i.test(ua)) return 'chrome';
    
    // Firefox
    if (/Firefox|FxiOS/i.test(ua)) return 'firefox';
    
    // Safari (check after Chrome since Chrome on iOS also contains "Safari")
    if (/Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua)) return 'safari';
    
    return 'unknown';
  }, []);
  
  // Listen for standalone mode changes (e.g., app installed while page is open)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const mq = window.matchMedia('(display-mode: standalone)');
    const handler = () => setIsStandalone(checkIsStandalone());
    
    try {
      mq.addEventListener('change', handler);
    } catch {
      // Fallback for older browsers
      mq.addListener(handler);
    }
    
    return () => {
      try {
        mq.removeEventListener('change', handler);
      } catch {
        mq.removeListener(handler);
      }
    };
  }, []);
  
  // Listen for beforeinstallprompt
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    let timeoutId: ReturnType<typeof setTimeout>;
    
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      setDeferredPrompt(e);
      // Clear timeout since we got the prompt
      if (timeoutId) clearTimeout(timeoutId);
    };
    
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsAppInstalled(true);
      if (timeoutId) clearTimeout(timeoutId);
    };
    
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    
    // Set a timeout - if beforeinstallprompt doesn't fire within 3 seconds,
    // the PWA is likely already installed or not supported
    timeoutId = setTimeout(() => {
      setPromptTimedOut(true);
      
      // Try to detect if app is installed using getInstalledRelatedApps (Chrome 80+)
      // This requires the manifest to list related_applications, but worth trying
      if ('getInstalledRelatedApps' in navigator) {
        (navigator as any).getInstalledRelatedApps().then((apps: any[]) => {
          if (apps && apps.length > 0) {
            setIsAppInstalled(true);
          }
        }).catch(() => {
          // API not available or failed, that's fine
        });
      }
    }, 3000);
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);
  
  // Check if this is a browser that supports beforeinstallprompt on desktop
  const isDesktopChromium = useMemo(() => {
    return (browser === 'chrome' || browser === 'edge') && 
           (platform === 'mac' || platform === 'windows' || platform === 'linux');
  }, [browser, platform]);
  
  // Are we waiting for the beforeinstallprompt event? (Chrome/Edge desktop without prompt yet)
  const isWaitingForPrompt = useMemo(() => {
    if (isStandalone) return false;
    if (deferredPrompt) return false; // Already have it
    if (promptTimedOut) return false; // Timed out waiting
    if (isAppInstalled) return false; // Already installed
    return isDesktopChromium;
  }, [isStandalone, deferredPrompt, promptTimedOut, isAppInstalled, isDesktopChromium]);
  
  // Determine install method
  const installMethod = useMemo<InstallMethod>(() => {
    if (isStandalone) return 'none';
    
    // If we have the prompt, use it (Chrome/Edge/Samsung/Firefox Android)
    if (deferredPrompt) return 'prompt';
    
    // Safari on macOS Sonoma+ supports "Add to Dock"
    if (platform === 'mac' && browser === 'safari') return 'safari-dock';
    
    // Safari on iOS supports "Add to Home Screen"
    if (platform === 'ios' && browser === 'safari') return 'safari-home-screen';
    
    // Chrome/Edge on iOS can also install via share menu (iOS 16.4+)
    if (platform === 'ios' && (browser === 'chrome' || browser === 'edge')) return 'safari-home-screen';
    
    // Firefox desktop doesn't support PWA
    if (browser === 'firefox' && (platform === 'mac' || platform === 'windows' || platform === 'linux')) {
      return 'none';
    }
    
    // Chrome/Edge on desktop waiting for prompt - we'll show the CTA but in waiting state
    if (isDesktopChromium) {
      return 'none'; // Method is 'none' until prompt fires, but isWaitingForPrompt handles the UI
    }
    
    return 'none';
  }, [isStandalone, deferredPrompt, platform, browser, isDesktopChromium]);
  
  // Generate install instructions (used for manual methods or as fallback if user declines prompt)
  const installInstructions = useMemo<string[]>(() => {
    // App appears to be installed - show how to open it
    if (isAppInstalled || (promptTimedOut && isDesktopChromium)) {
      if (browser === 'chrome' || browser === 'edge') {
        return [
          'Reigh is already installed on your device!',
          'Look for the "Open in app" button in the address bar',
          'Or find Reigh in your Applications folder (Mac) or Start Menu (Windows)'
        ];
      }
      return [
        'Reigh appears to be installed on your device!',
        'Look for the "Open in app" button in your browser\'s address bar',
        'Or find Reigh in your Applications/Start Menu'
      ];
    }
    
    // If waiting for prompt on Chrome/Edge desktop, show waiting message
    if (isWaitingForPrompt) {
      if (browser === 'chrome') {
        return [
          'The install option is loading...',
          'Look for the install icon (⊕) in the address bar',
          'Or try refreshing the page if it doesn\'t appear'
        ];
      }
      if (browser === 'edge') {
        return [
          'The install option is loading...',
          'Look for "App available" in the address bar',
          'Or try refreshing the page if it doesn\'t appear'
        ];
      }
    }
    
    switch (installMethod) {
      case 'prompt':
        // Fallback instructions if user declines the browser prompt
        // These should match the browser they're using
        if (browser === 'chrome' || browser === 'edge') {
          return [
            'Look for the install icon (⊕) in your browser\'s address bar',
            'Or click the menu (⋮) → "Install Reigh"',
            'Click "Install" to add the app'
          ];
        }
        if (browser === 'samsung') {
          return [
            'Tap the menu button (☰)',
            'Select "Add page to" → "Home screen"',
            'Tap "Add" to install'
          ];
        }
        // Firefox Android
        return [
          'Tap the menu button (⋮)',
          'Select "Install"',
          'Tap "Add" to confirm'
        ];
      case 'safari-dock':
        return [
          'Click "File" in the menu bar',
          'Select "Add to Dock"',
          'Click "Add" to install'
        ];
      case 'safari-home-screen':
        if (browser === 'chrome' || browser === 'edge') {
          return [
            'Tap the Share button (square with arrow)',
            'Scroll down and tap "Add to Home Screen"',
            'Tap "Add" to install'
          ];
        }
        return [
          'Tap the Share button at the bottom of the screen',
          'Scroll down and tap "Add to Home Screen"',
          'Tap "Add" to install'
        ];
      default:
        return [];
    }
  }, [installMethod, browser, isWaitingForPrompt, isAppInstalled, promptTimedOut, isDesktopChromium]);
  
  // Generate CTA text
  const ctaText = useMemo<string>(() => {
    if (isStandalone) return 'Sign in with Discord';
    
    // App appears to be installed - nudge to open it
    if (isAppInstalled || (promptTimedOut && isDesktopChromium)) {
      return 'Open Reigh App';
    }
    
    // No install available (and not waiting for prompt)
    if (installMethod === 'none' && !isWaitingForPrompt) return 'Sign in with Discord';
    
    // Platform-specific download text
    switch (platform) {
      case 'mac':
        return 'Download for Mac';
      case 'windows':
        return 'Download for Windows';
      case 'linux':
        return 'Download for Linux';
      case 'ios':
        return 'Add to Home Screen';
      case 'android':
        return 'Install App';
      default:
        return 'Install App';
    }
  }, [isStandalone, installMethod, isWaitingForPrompt, isAppInstalled, promptTimedOut, isDesktopChromium, platform]);
  
  // Determine CTA icon
  const ctaIcon = useMemo<'download' | 'plus' | 'discord' | 'external'>(() => {
    if (isStandalone) return 'discord';
    
    // App appears to be installed - show external link icon
    if (isAppInstalled || (promptTimedOut && isDesktopChromium)) {
      return 'external';
    }
    
    if (installMethod === 'none' && !isWaitingForPrompt) return 'discord';
    if (platform === 'ios') return 'plus';
    return 'download';
  }, [isStandalone, installMethod, isWaitingForPrompt, isAppInstalled, promptTimedOut, isDesktopChromium, platform]);
  
  // Should we show install CTA vs Discord sign-in
  const showInstallCTA = useMemo(() => {
    if (isStandalone) return false;
    // Show CTA if we have an install method, we're waiting for the prompt, or app is installed
    return installMethod !== 'none' || isWaitingForPrompt || isAppInstalled || (promptTimedOut && isDesktopChromium);
  }, [isStandalone, installMethod, isWaitingForPrompt, isAppInstalled, promptTimedOut, isDesktopChromium]);
  
  // Trigger install action
  const triggerInstall = useCallback(async (): Promise<boolean> => {
    if (installMethod === 'prompt' && deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        setDeferredPrompt(null);
        return outcome === 'accepted';
      } catch (error) {
        console.error('Error installing PWA:', error);
        return false;
      }
    }
    
    // For manual methods, return false (caller should show instructions)
    return false;
  }, [installMethod, deferredPrompt]);
  
  return {
    platform,
    browser,
    isStandalone,
    canInstall: !!deferredPrompt,
    isWaitingForPrompt,
    isAppInstalled: isAppInstalled || (promptTimedOut && isDesktopChromium),
    installMethod,
    ctaText,
    ctaIcon,
    showInstallCTA,
    installInstructions,
    triggerInstall,
  };
}


