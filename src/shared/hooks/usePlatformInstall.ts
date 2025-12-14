import { useState, useEffect, useMemo, useCallback } from 'react';

export type Platform = 'mac' | 'windows' | 'linux' | 'ios' | 'android' | 'unknown';
export type Browser = 'chrome' | 'safari' | 'edge' | 'firefox' | 'samsung' | 'unknown';
export type InstallMethod = 'prompt' | 'safari-dock' | 'safari-home-screen' | 'none';
export type DeviceType = 'phone' | 'tablet' | 'desktop';

export interface PlatformInstallState {
  // Platform & Browser
  platform: Platform;
  browser: Browser;
  deviceType: DeviceType; // phone, tablet, or desktop
  
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
  // Track if the install prompt was already shown and dismissed/declined
  const [promptConsumed, setPromptConsumed] = useState(false);
  
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
  
  // Detect device type (phone, tablet, desktop)
  const deviceType = useMemo<DeviceType>(() => {
    if (typeof navigator === 'undefined') return 'desktop';
    
    const ua = navigator.userAgent || '';
    const navPlatform = (navigator as any).platform || '';
    
    // iPad detection (explicit iPad in UA, or iPadOS 13+ which reports as Mac with touch)
    if (/iPad/i.test(ua)) return 'tablet';
    if (navPlatform === 'MacIntel' && (navigator as any).maxTouchPoints > 1) return 'tablet';
    
    // Android tablet detection (Android without "Mobile" usually means tablet)
    if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return 'tablet';
    
    // iPhone/iPod are phones
    if (/iPhone|iPod/i.test(ua)) return 'phone';
    
    // Android with "Mobile" is a phone
    if (/Android/i.test(ua) && /Mobile/i.test(ua)) return 'phone';
    
    // Desktop platforms
    if (platform === 'mac' || platform === 'windows' || platform === 'linux') return 'desktop';
    
    return 'desktop';
  }, [platform]);
  
  // Detect if Safari supports PWA install (Safari 17+ / macOS Sonoma+)
  const safariSupportsPWA = useMemo<boolean>(() => {
    if (typeof navigator === 'undefined') return false;
    if (browser !== 'safari') return false;
    if (platform !== 'mac') return false;
    
    // Try to detect Safari version from user agent
    // Safari UA contains "Version/X.Y" where X is the major version
    const ua = navigator.userAgent || '';
    const versionMatch = ua.match(/Version\/(\d+)/);
    if (versionMatch) {
      const majorVersion = parseInt(versionMatch[1], 10);
      // Safari 17+ supports "Add to Dock"
      return majorVersion >= 17;
    }
    
    // If we can't detect version, assume it's supported (better UX than hiding it)
    // User will see the option doesn't exist and can use Discord instead
    return true;
  }, [browser, platform]);
  
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
      // Reset states in case they were set before this event
      setPromptTimedOut(false);
      setPromptConsumed(false);
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
    if (promptConsumed) return false; // User already saw and dismissed the prompt
    return isDesktopChromium;
  }, [isStandalone, deferredPrompt, promptTimedOut, isAppInstalled, promptConsumed, isDesktopChromium]);
  
  // Determine install method
  const installMethod = useMemo<InstallMethod>(() => {
    if (isStandalone) return 'none';
    
    // If we have the prompt, use it (Chrome/Edge/Samsung/Firefox Android)
    if (deferredPrompt) return 'prompt';
    
    // Safari on macOS Sonoma+ (Safari 17+) supports "Add to Dock"
    if (platform === 'mac' && browser === 'safari' && safariSupportsPWA) return 'safari-dock';
    
    // Safari on iOS supports "Add to Home Screen"
    if (platform === 'ios' && browser === 'safari') return 'safari-home-screen';
    
    // Chrome on iOS (iPhone & iPad) can install via share menu (iOS 16.4+)
    if (platform === 'ios' && browser === 'chrome') return 'safari-home-screen';
    
    // Edge on iOS can install via share menu
    if (platform === 'ios' && browser === 'edge') return 'safari-home-screen';
    
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
  // Keep minimal since visual mockups are self-explanatory
  const installInstructions = useMemo<string[]>(() => {
    // App appears to be installed - just show how to open it
    if (isAppInstalled || (promptTimedOut && isDesktopChromium)) {
      // Mobile/tablet: tell them to find it on home screen
      if (deviceType === 'phone' || deviceType === 'tablet') {
        return [
          'Find Reigh on your home screen:'
        ];
      }
      // Desktop: tell them to look in address bar
      return [
        'Look for this in your address bar:'
      ];
    }
    
    // If waiting for prompt on Chrome/Edge desktop
    if (isWaitingForPrompt) {
      return [
        'Look for this in your address bar:'
      ];
    }
    
    switch (installMethod) {
      case 'prompt':
        // Fallback if user declines the browser prompt
        if (platform === 'android') {
          return [
            'Tap "Install" when the banner appears:'
          ];
        }
        return [
          'Look for this in your address bar:'
        ];
      case 'safari-dock':
        return [
          'In Safari, go to File → Add to Dock'
        ];
      case 'safari-home-screen':
        // iPad (tablet)
        if (deviceType === 'tablet') {
          if (browser === 'chrome') {
            // Chrome iPad: Share icon at top-right (same as iPhone)
            return [
              'Tap Share icon at top-right, then "Add to Home Screen"'
            ];
          }
          if (browser === 'edge') {
            // Edge iPad: Three-dot menu, then Share
            return [
              'Tap ⋮ menu, then Share, then "Add to Home Screen"'
            ];
          }
          // Safari iPad: Share button in top toolbar
          return [
            'Tap Share in the toolbar, then "Add to Home Screen"'
          ];
        }
        
        // iPhone - each browser has different UI
        if (browser === 'chrome') {
          // Chrome iPhone: Share icon at top-right
          return [
            'Tap Share icon at top-right, then "Add to Home Screen"'
          ];
        }
        if (browser === 'edge') {
          // Edge iPhone: Three-dot menu at bottom center
          return [
            'Tap ⋮ at bottom, then Share, then "Add to Home Screen"'
          ];
        }
        // Safari iPhone: Share button at bottom
        return [
          'Tap Share, then "Add to Home Screen"'
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
    
    // Platform-specific install text
    switch (platform) {
      case 'mac':
        return 'Install for Mac';
      case 'windows':
        return 'Install for Windows';
      case 'linux':
        return 'Install for Linux';
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
        // Mark prompt as consumed so we don't show "waiting" state after decline
        setPromptConsumed(true);
        return outcome === 'accepted';
      } catch (error) {
        console.error('Error installing PWA:', error);
        setPromptConsumed(true);
        return false;
      }
    }
    
    // For manual methods, return false (caller should show instructions)
    return false;
  }, [installMethod, deferredPrompt]);
  
  return {
    platform,
    browser,
    deviceType,
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


