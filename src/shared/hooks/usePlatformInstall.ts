import { useState, useEffect, useMemo, useCallback } from 'react';

export type Platform = 'mac' | 'windows' | 'linux' | 'ios' | 'android' | 'unknown';
export type Browser = 'chrome' | 'safari' | 'edge' | 'firefox' | 'samsung' | 'unknown';
export type InstallMethod = 'prompt' | 'safari-dock' | 'safari-home-screen' | 'manual' | 'none';

export interface PlatformInstallState {
  // Platform & Browser
  platform: Platform;
  browser: Browser;
  
  // PWA state
  isStandalone: boolean;  // Running as installed PWA
  canInstall: boolean;    // Can show install prompt (Chrome/Edge beforeinstallprompt)
  installMethod: InstallMethod;
  
  // CTA helpers
  ctaText: string;
  ctaIcon: 'download' | 'plus' | 'discord';
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
export function usePlatformInstall(): PlatformInstallState {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  
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
  
  // Detect standalone mode
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const checkStandalone = () => {
      // Multiple ways to detect standalone/installed PWA
      const displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const displayModeFullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
      const iosStandalone = (navigator as any).standalone === true;
      
      setIsStandalone(displayModeStandalone || displayModeFullscreen || iosStandalone);
    };
    
    checkStandalone();
    
    // Listen for changes (e.g., app installed while page is open)
    const mq = window.matchMedia('(display-mode: standalone)');
    const handler = () => checkStandalone();
    
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
    
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      setDeferredPrompt(e);
    };
    
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    // Also listen for app installed event
    window.addEventListener('appinstalled', () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
    });
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);
  
  // Determine install method
  const installMethod = useMemo<InstallMethod>(() => {
    if (isStandalone) return 'none';
    
    // If we have the prompt, use it
    if (deferredPrompt) return 'prompt';
    
    // Safari on macOS Sonoma+ supports "Add to Dock"
    if (platform === 'mac' && browser === 'safari') return 'safari-dock';
    
    // Safari on iOS supports "Add to Home Screen"
    if (platform === 'ios' && browser === 'safari') return 'safari-home-screen';
    
    // Chrome/Edge on iOS can also install via share menu
    if (platform === 'ios' && (browser === 'chrome' || browser === 'edge')) return 'safari-home-screen';
    
    // Firefox desktop doesn't support PWA
    if (browser === 'firefox' && (platform === 'mac' || platform === 'windows' || platform === 'linux')) {
      return 'none';
    }
    
    // For Chrome/Edge on desktop without prompt yet, still show manual
    if ((browser === 'chrome' || browser === 'edge') && (platform === 'mac' || platform === 'windows' || platform === 'linux')) {
      return 'manual';
    }
    
    return 'none';
  }, [isStandalone, deferredPrompt, platform, browser]);
  
  // Generate install instructions
  const installInstructions = useMemo<string[]>(() => {
    switch (installMethod) {
      case 'safari-dock':
        return [
          'Click File in the menu bar',
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
      case 'manual':
        return [
          'Look for the install icon in your browser\'s address bar',
          'Or click the menu (⋮) → "Install Reigh"',
          'Follow the prompts to install'
        ];
      default:
        return [];
    }
  }, [installMethod, browser]);
  
  // Generate CTA text
  const ctaText = useMemo<string>(() => {
    if (isStandalone) return 'Sign in with Discord';
    
    // No install available
    if (installMethod === 'none') return 'Sign in with Discord';
    
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
  }, [isStandalone, installMethod, platform]);
  
  // Determine CTA icon
  const ctaIcon = useMemo<'download' | 'plus' | 'discord'>(() => {
    if (isStandalone || installMethod === 'none') return 'discord';
    if (platform === 'ios') return 'plus';
    return 'download';
  }, [isStandalone, installMethod, platform]);
  
  // Should we show install CTA vs Discord sign-in
  const showInstallCTA = useMemo(() => {
    return !isStandalone && installMethod !== 'none';
  }, [isStandalone, installMethod]);
  
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
    installMethod,
    ctaText,
    ctaIcon,
    showInstallCTA,
    installInstructions,
    triggerInstall,
  };
}

