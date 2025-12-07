import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Gift, Sparkles, Smartphone, Download, ChevronRight, ChevronLeft, Palette, Users, Monitor, Coins, Settings, Check, Loader2, MoreHorizontal, PartyPopper, Heart } from 'lucide-react';

import usePersistentState from '@/shared/hooks/usePersistentState';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { useMediumModal } from '@/shared/hooks/useModal';
import { useScrollFade } from '@/shared/hooks/useScrollFade';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

// Extend window interface for confetti flag
declare global {
  interface Window {
    confettiAlreadyTriggered?: boolean;
  }
}

interface WelcomeBonusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Color sequence for step icons
const getStepColors = (stepIndex: number) => {
  const colors = [
    { bg: 'bg-purple-100 dark:bg-purple-900/20', icon: 'text-purple-600 dark:text-purple-400' }, // Step 1
    { bg: 'bg-blue-100 dark:bg-blue-900/20', icon: 'text-blue-600 dark:text-blue-400' },       // Step 2
    { bg: 'bg-green-100 dark:bg-green-900/20', icon: 'text-green-600 dark:text-green-400' },   // Step 3
    { bg: 'bg-orange-100 dark:bg-orange-900/20', icon: 'text-orange-600 dark:text-orange-400' }, // Step 4
    { bg: 'bg-yellow-100 dark:bg-yellow-900/20', icon: 'text-yellow-600 dark:text-yellow-400' }, // Step 5
    { bg: 'bg-pink-100 dark:bg-pink-900/20', icon: 'text-pink-600 dark:text-pink-400' },       // Step 6
    { bg: 'bg-indigo-100 dark:bg-indigo-900/20', icon: 'text-indigo-600 dark:text-indigo-400' } // Step 7
  ];
  
  return colors[(stepIndex - 1) % colors.length];
};

// PWA Installation Hook
const usePWAInstall = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setCanInstall(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const installPWA = async () => {
    if (!deferredPrompt) return false;

    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setCanInstall(false);
      return outcome === 'accepted';
    } catch (error) {
      console.error('Error installing PWA:', error);
      return false;
    }
  };

  return { canInstall, installPWA };
};

// Step 1: Introduction to Reigh
const IntroductionStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const colors = getStepColors(1);
  return (
  <>
    <DialogHeader className="text-center space-y-4 mb-6">
      <div className={`mx-auto w-16 h-16 ${colors.bg} rounded-full flex items-center justify-center`}>
        <Palette className={`w-8 h-8 ${colors.icon}`} />
      </div>
      <DialogTitle className="text-2xl font-bold text-center">
        Welcome to Reigh!
      </DialogTitle>
    </DialogHeader>
    
    <div className="text-center space-y-4">
      <p className="text-muted-foreground">
        We believe that combining image anchoring with additional control mechanisms can allow artists to steer AI video with unparalleled precision and ease.
      </p>
      <p className="text-muted-foreground">
        Reigh aims to provide you with the best techniques in the open source AI art ecosystem for both generating anchor images, and travelling between them. We want to make the struggle of creating art that feels truly your own as easy as possible.
      </p>
    </div>
    
    <div className="flex justify-center pt-5 pb-2">
      <Button onClick={onNext} className="w-full sm:w-auto">
        Let's get started
        <ChevronRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  </>
);
};

// Step 2: Community
const CommunityStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const colors = getStepColors(2);
  return (
  <>
    <DialogHeader className="text-center space-y-4 mb-6">
      <div className={`mx-auto w-16 h-16 ${colors.bg} rounded-full flex items-center justify-center`}>
        <Users className={`w-8 h-8 ${colors.icon}`} />
      </div>
      <DialogTitle className="text-2xl font-bold text-center">
        Join Our Community
      </DialogTitle>
    </DialogHeader>
    
    <div className="text-center space-y-4">
      <p className="text-muted-foreground">
        If you want to get good at creating art, the hardest part is not giving up.
      </p>
      <p className="text-muted-foreground">
        Our community will grow to become a place where artists can learn from, support, and inspire each other.
      </p>
    </div>
    
    <div className="flex flex-col space-y-2 pt-5 pb-2">
      <Button 
        onClick={() => window.open('https://discord.gg/D5K2c6kfhy', '_blank')}
        className="w-full"
      >
        <Users className="w-4 h-4 mr-2" />
        Join Discord Community
      </Button>
      <Button variant="outline" onClick={onNext} className="w-full">
        Continue Setup
      </Button>
    </div>
  </>
);
};

// Step 3: PWA Installation (existing logic)
const PWAInstallStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const { canInstall, installPWA } = usePWAInstall();
  const colors = getStepColors(3);

  const handleInstall = async () => {
    const installed = await installPWA();
    if (installed) {
      onNext();
    }
  };

  // Detect platform for better messaging
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);
  const isChromeOnIOS = isIOS && /CriOS/.test(navigator.userAgent);

  return (
    <>
      <DialogHeader className="text-center space-y-4 mb-6">
        <div className={`mx-auto w-16 h-16 ${colors.bg} rounded-full flex items-center justify-center`}>
          <Smartphone className={`w-8 h-8 ${colors.icon}`} />
        </div>
        <DialogTitle className="text-2xl font-bold text-center">
          Install Reigh App
        </DialogTitle>
      </DialogHeader>
      
      <div className="text-center space-y-4">
        <p className="text-lg font-light">
          Get the best experience by installing Reigh as an app!
        </p>

        {/* Platform-specific instructions - always shown */}
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-sm">
          {isChromeOnIOS && (
            <>
              <p className="font-light mb-2">📱 On iPhone Chrome:</p>
              <p className="text-muted-foreground">
                1. <strong>Switch to Safari</strong> - copy this URL and open in Safari<br/>
                2. Tap the <strong>Share</strong> button (square with arrow) at the bottom<br/>
                3. Scroll down and select <strong>"Add to Home Screen"</strong><br/>
                4. Tap <strong>"Add"</strong> to install
              </p>
            </>
          )}
          {isIOS && !isChromeOnIOS && (
            <>
              <p className="font-light mb-2">📱 On iOS Safari:</p>
              <p className="text-muted-foreground">
                1. Tap the <strong>Share</strong> button (square with arrow) at the bottom<br/>
                2. Scroll down and select <strong>"Add to Home Screen"</strong><br/>
                3. Tap <strong>"Add"</strong> to install
              </p>
            </>
          )}
          {isAndroid && (
            <>
              <p className="font-light mb-2">🤖 On Android:</p>
              <p className="text-muted-foreground">
                1. Look for <strong>"Install"</strong> button in the address bar<br/>
                2. Or tap the three-dot menu (⋮) → <strong>"Add to Home screen"</strong><br/>
                3. Tap <strong>"Add"</strong> to confirm installation
              </p>
            </>
          )}
          {!isIOS && !isAndroid && (
            <>
              <p className="font-light mb-2">💻 On Desktop (Chrome/Edge):</p>
              <p className="text-muted-foreground">
                1. Look for install icon in your browser's address bar<br/>
                2. Or check browser menu → <strong>"Install Reigh"</strong><br/>
                3. Follow the prompts to install
              </p>
            </>
          )}
        </div>
      </div>
      
      <div className="flex flex-col space-y-2 pt-5 pb-2">
        {canInstall ? (
          <>
            <Button onClick={handleInstall} className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Install App
            </Button>
            <Button variant="outline" onClick={onNext} className="w-full">
              Continue Without Installing
            </Button>
          </>
        ) : (
          <Button onClick={onNext} className="w-full">
            Continue
          </Button>
        )}
      </div>
    </>
  );
};

// Step 4: Generation Method Selection (Lazy-loaded to improve modal performance)
const GenerationMethodStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  // Use database-backed generation preferences (same as SettingsModal)
  // Only loads when this step is actually rendered, improving initial modal performance
  const { 
    value: generationMethods, 
    update: updateGenerationMethods,
    isLoading: isLoadingGenerationMethods
  } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  
  const colors = getStepColors(4);
  
  const onComputerChecked = generationMethods.onComputer;
  const inCloudChecked = generationMethods.inCloud;

  // Show skeleton loading state while preferences are being fetched
  if (isLoadingGenerationMethods) {
    return (
      <>
        <DialogHeader className="text-center space-y-4 mb-6">
          <div className={`mx-auto w-16 h-16 ${colors.bg} rounded-full flex items-center justify-center`}>
            <Monitor className={`w-8 h-8 ${colors.icon}`} />
          </div>
          <DialogTitle className="text-2xl font-bold text-center">
            How would you like to generate?
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Skeleton for description text */}
          <div className="text-center">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mx-auto w-80"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mx-auto w-48 mt-1"></div>
          </div>

          {/* Skeleton for toggle switch - matches actual design */}
          <div className="flex justify-center px-4">
            <div className="relative inline-flex items-center bg-gray-200 rounded-full p-1 shadow-inner min-w-fit">
              <div className="flex">
                {/* In the cloud button skeleton */}
                <div className="px-4 py-2 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse">
                  <div className="h-4 w-24 bg-gray-400 dark:bg-gray-500 rounded"></div>
                </div>
                {/* On my computer button skeleton */}
                <div className="px-4 py-2 rounded-full">
                  <div className="h-4 w-28 bg-gray-300 dark:bg-gray-600 rounded animate-pulse"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Skeleton for additional info section */}
          <div className="text-center space-y-3">
            <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse">
              <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded mx-auto w-64"></div>
            </div>
          </div>
        </div>
        
        {/* Skeleton for continue button */}
        <div className="flex justify-center pt-5 pb-2">
          <div className="w-full sm:w-auto h-10 bg-gray-300 dark:bg-gray-600 rounded animate-pulse px-8"></div>
        </div>
      </>
    );
  }

  return (
    <>
      <DialogHeader className="text-center space-y-4 mb-6">
        <div className={`mx-auto w-16 h-16 ${colors.bg} rounded-full flex items-center justify-center`}>
          <Monitor className={`w-8 h-8 ${colors.icon}`} />
        </div>
        <DialogTitle className="text-2xl font-bold text-center">
          How would you like to generate?
        </DialogTitle>
      </DialogHeader>
      
      <div className="space-y-6">
        <p className="text-center text-muted-foreground">
          If you have{' '}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="sparkle-underline cursor-pointer transition-colors duration-200">
                  a sufficiently powerful computer
                </span>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="center"
                className="flex items-center gap-2 text-left p-3 max-w-xs border-2 border-transparent bg-wes-cream/95 rounded-lg shadow-md transition-all duration-300 hover:bg-gradient-to-r hover:from-wes-pink/10 hover:via-wes-coral/10 hover:to-wes-vintage-gold/10 hover:border-transparent hover:bg-origin-border hover:shadow-2xl hover:-translate-y-1 z-[11100]"
                style={{ zIndex: 11100 }}
              >
                <p className="text-xs sm:text-sm leading-relaxed text-primary">
                  Things are optimized to run on a NVIDIA 4090 - 24GB VRAM GPU - but some models can work on computers with as little as 6GB of VRAM.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          , you can run Reigh <strong>for free</strong> - thanks to the work of{' '}
          <a 
            href="https://github.com/deepbeepmeep/Wan2GP" 
            target="_blank" 
            rel="noopener noreferrer"
            className="underline hover:no-underline text-primary"
          >
            deepbeepmeep
          </a>. You can change this later in settings.
        </p>

        <div className="flex justify-center px-4">
          <div className="relative inline-flex items-center bg-gray-200 rounded-full p-1 shadow-inner min-w-fit">
            {/* Toggle track */}
            <div className="flex">
              {/* In the cloud button */}
              <button
                onClick={() => updateGenerationMethods({ inCloud: true, onComputer: false })}
                className={`px-4 py-2 font-light rounded-full transition-all duration-200 whitespace-nowrap text-sm ${
                  inCloudChecked && !onComputerChecked
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                In the cloud ☁️
              </button>
              
              {/* On my computer button */}
              <button
                onClick={() => updateGenerationMethods({ onComputer: true, inCloud: false })}
                className={`px-4 py-2 font-light rounded-full transition-all duration-200 whitespace-nowrap text-sm ${
                  onComputerChecked && !inCloudChecked
                    ? 'bg-white text-green-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                On my computer 💻
              </button>
            </div>
          </div>
        </div>

        {/* Additional info below toggle */}
        <div className="text-center space-y-3">
          {inCloudChecked && !onComputerChecked && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200 font-light">
                ☁️ Easy setup, pay-per-use, works on any device
              </p>
            </div>
          )}
          
          {onComputerChecked && !inCloudChecked && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-sm text-green-800 dark:text-green-200 font-light flex items-center justify-center gap-2">
                <span>💻 Free to use, requires setup, need a good GPU</span>
                <span className="bg-green-500 text-white text-xs font-light px-2 py-1 rounded-full">Free</span>
              </p>
            </div>
          )}
        </div>

        {!onComputerChecked && !inCloudChecked && (
          <div className="text-center">
            <img
              src="https://wczysqzxlwdndgxitrvc.supabase.co/storage/v1/object/public/image_uploads/files/ds.gif"
              alt="Choose generation method"
              className="w-[120px] h-[120px] object-contain transform scale-x-[-1] mx-auto"
            />
            <p className="text-sm text-muted-foreground mt-2">
              Select at least one option to continue
            </p>
          </div>
        )}
      </div>
      
      <div className="flex justify-center pt-5 pb-2">
        <Button 
          onClick={onNext} 
          disabled={!onComputerChecked && !inCloudChecked}
          className="w-full sm:w-auto"
        >
          Continue
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </>
  );
};

// Step 5: Welcome Gambit (Promise Step)
const WelcomeGambitStep: React.FC<{ onNext: (choice: 'music-video' | 'something-else' | 'no-thanks') => void }> = ({ onNext }) => {
  const colors = getStepColors(5);
  return (
  <>
    <DialogHeader className="text-center space-y-4 mb-6">
      <div className={`mx-auto w-16 h-16 ${colors.bg} rounded-full flex items-center justify-center`}>
        <Coins className={`w-8 h-8 ${colors.icon}`} />
      </div>
      <DialogTitle className="text-2xl font-bold text-center">
        We'll give you $5 credit if you promise to <span className="text-primary underline decoration-2 underline-offset-2">make something bad</span> with Reigh
      </DialogTitle>
    </DialogHeader>
    
    <div className="text-center space-y-4">
      <p className="text-muted-foreground">
        To understand an art tool, you must try to make art with it - but making good stuff is <strong>hard</strong>.
      </p>
      
      <p className="text-muted-foreground">
        So let's make a deal: if you promise you'll use it to <em>make something bad</em> (e.g. an experimental &lt;30 sec music video) and share it in the #bad_art channel of our Discord, we'll give you $5 credit. 
      </p>
    </div>
    
    <div className="flex flex-col space-y-2 pt-5 pb-2">
      <Button onClick={() => onNext('music-video')} className="w-full">
        I'll do it, gimme the credits 🎵
      </Button>
      <Button variant="ghost" onClick={() => onNext('no-thanks')} className="w-full text-muted-foreground bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700">
        Sorry, I only make good stuff
      </Button>
    </div>
  </>
  );
};

// Loading Step: Processing Credits
const ProcessingCreditsStep: React.FC = () => (
  <div className="flex justify-center items-center py-20 opacity-50">
    <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
  </div>
);

// Step 6: Credits Result
const CreditsResultStep: React.FC<{ choice: 'music-video' | 'something-else' | 'no-thanks', onNext: () => void, shouldShowConfetti?: boolean, onConfettiConsumed?: () => void }> = ({ choice, onNext, shouldShowConfetti = false, onConfettiConsumed }) => {
  const colors = getStepColors(6);
  // Trigger confetti when component mounts (only if first time this session)
  useEffect(() => {
    // Only run confetti if parent indicates it should run
    if (!shouldShowConfetti) {
      return;
    }
    // Prevent multiple confetti explosions
    if (window.confettiAlreadyTriggered) {
      console.log('[Confetti] Already triggered, skipping');
      return;
    }
    window.confettiAlreadyTriggered = true;

    // Create confetti elements
    const createConfetti = () => {
      // Clean up any existing confetti first
      const existingConfetti = document.querySelectorAll('[data-confetti]');
      existingConfetti.forEach(el => el.remove());
      
      const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff'];
      const confettiCount = 50;
      
      // Use a fixed overlay inside the modal for confetti containment
      const container = document.getElementById('confetti-container');
      const modal = document.querySelector('[data-radix-dialog-content]') as HTMLElement;
      const modalRect = modal?.getBoundingClientRect();
      if (!container || !modalRect) {
        console.log('[Confetti] No modal/container found; skipping confetti');
        return;
      }
      
      for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        const leftPosition = Math.random() * 100; // Percentage within container
        const fallDistance = 400; // Fixed fall distance within container
        const animationDuration = 2 + Math.random() * 3;
        
        // Create individual keyframe for this confetti piece BEFORE applying animation
        const individualStyle = document.createElement('style');
        individualStyle.textContent = `
          @keyframes confetti-fall-modal-${i} {
            0% {
              transform: translateY(0px) rotate(0deg);
              opacity: 1;
            }
            100% {
              transform: translateY(${fallDistance}px) rotate(720deg);
              opacity: 0;
            }
          }
        `;
        document.head.appendChild(individualStyle);
        
        confetti.setAttribute('data-confetti', 'true');
        confetti.style.cssText = `
          position: absolute;
          width: 10px;
          height: 10px;
          background: ${colors[Math.floor(Math.random() * colors.length)]};
          left: ${leftPosition}%;
          top: -10px;
          z-index: 99999;
          pointer-events: none;
          border-radius: ${Math.random() > 0.5 ? '50%' : '0'};
          animation: confetti-fall-modal-${i} ${animationDuration}s linear forwards;
        `;
        
        container.appendChild(confetti);
        
        // Remove confetti after its animation completes (+buffer)
        setTimeout(() => {
          if (confetti.parentNode) {
            confetti.parentNode.removeChild(confetti);
          }
          if (individualStyle.parentNode) {
            individualStyle.parentNode.removeChild(individualStyle);
          }
        }, (animationDuration * 1000) + 300);
      }
    };

    // Add CSS animation if it doesn't exist
    if (!document.querySelector('#confetti-styles')) {
      const style = document.createElement('style');
      style.id = 'confetti-styles';
      style.textContent = `
        @keyframes confetti-fall {
          0% {
            transform: translateY(-10px) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        
      `;
      document.head.appendChild(style);
    }

    createConfetti();
    // Notify parent that confetti has been consumed so it won't rerun on re-render
    onConfettiConsumed?.();
  }, [shouldShowConfetti]);

  return (
    <div className="relative">
      {/* Confetti container overlay covering entire modal content */}
      <div id="confetti-container" className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 50 }} />
      
      <DialogHeader className="text-center space-y-4 mb-6">
        <div className={`mx-auto w-16 h-16 ${colors.bg} rounded-full flex items-center justify-center`}>
          {choice === 'music-video' ? (
            <PartyPopper className={`w-8 h-8 ${colors.icon}`} />
          ) : (
            <Heart className={`w-8 h-8 ${colors.icon}`} />
          )}
      </div>
        <DialogTitle className="text-2xl font-bold text-center">
          {choice === 'music-video' ? "Great, here's $5!" : "No problem! Here's $5 anyway."}
        </DialogTitle>
      </DialogHeader>
    
    <div className="text-center space-y-4">
      {choice === 'music-video' && (
        <p className="text-muted-foreground">
          You can join our Discord below to share your creation when you're ready!
        </p>
      )}
      
      <p className="text-muted-foreground">
        Remember: what you create doesn't need to be exceptional. You're learning how to use a tool. Take this as an opportunity to have fun learning, start creating, and get over your fear of sharing!
      </p>

      <p className="text-muted-foreground">
        We'll never check if you actually made something. We trust you &lt;3
      </p>
    </div>
    
    <div className="flex flex-col space-y-2 pt-5 pb-2">
      <Button 
        onClick={() => window.open('https://discord.gg/D5K2c6kfhy', '_blank')}
        className="w-full"
      >
        <Users className="w-4 h-4 mr-2" />
        Join Discord
      </Button>
      <Button variant="outline" onClick={onNext} className="w-full">
        Continue Setup
      </Button>
    </div>
    </div>
);
};

// Step 7: Setup Complete
const SetupCompleteStep: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const colors = getStepColors(7);
  
  const handleOpenSettings = () => {
    onClose();
    // Trigger settings modal to open - we'll need to communicate this back to the parent
    setTimeout(() => {
      // This is a bit hacky, but we can trigger a custom event or use a callback
      window.dispatchEvent(new CustomEvent('openSettings', { detail: { tab: 'generate-locally' } }));
    }, 100);
  };

  return (
    <>
      <DialogHeader className="text-center space-y-4 mb-6">
        <div className={`mx-auto w-16 h-16 ${colors.bg} rounded-full flex items-center justify-center`}>
        <MoreHorizontal className={`w-8 h-8 ${colors.icon}`} />
        </div>
        <DialogTitle className="text-2xl font-bold text-center">
          One more thing
        </DialogTitle>
      </DialogHeader>
      
      <div className="text-center space-y-4">
        <p className="text-muted-foreground">
          Reigh is an early-stage tool. If there's anything that isn't working for you or could be better, please drop into our Discord and leave a message in our #support channel or DM POM.
        </p>
        <p className="text-muted-foreground">
          There's no feedback too big or too small - so please share!
        </p>
      </div>
      
      <div className="flex flex-col space-y-2 pt-5 pb-2">
        <Button onClick={handleOpenSettings} className="w-full">
          <Settings className="w-4 h-4 mr-2" />
          Open Settings to Get Set Up
        </Button>
        <Button variant="outline" onClick={onClose} className="w-full">
          Start Creating
        </Button>
      </div>
    </>
  );
};

export const WelcomeBonusModal: React.FC<WelcomeBonusModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [userChoice, setUserChoice] = useState<'music-video' | 'something-else' | 'no-thanks' | null>(null);
  const [isProcessingCredits, setIsProcessingCredits] = useState(false);
  const [shouldShowConfetti, setShouldShowConfetti] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const queryClient = useQueryClient();
  const modal = useMediumModal();
  const { showFade, scrollRef } = useScrollFade({ 
    isOpen,
    preloadFade: modal.isMobile 
  });

  // Reset to step 1 when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setUserChoice(null);
      setIsProcessingCredits(false);
    }
  }, [isOpen]);

  const handleNext = () => {
    setCurrentStep(prev => Math.min(prev + 1, 7));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleGambitChoice = async (choice: 'music-video' | 'something-else' | 'no-thanks') => {
    console.log('[GambitChoice] User made choice:', choice);
    setUserChoice(choice);
    
    try {
      // Check if user has already been given credits
      const { data: { user } } = await supabase.auth.getUser();
      console.log('[GambitChoice] Checking user credits status...');
      
      if (!user) {
        console.log('[GambitChoice] No user found');
        setCurrentStep(6);
        return;
      }

      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
      
      console.log('[GambitChoice] User data:', { userData, error });
      
      if (error || !userData) {
        console.log('[GambitChoice] Error fetching user data, skipping to result');
        setCurrentStep(6);
        return;
      }

      const givenCredits = (userData as any).given_credits;
      console.log('[GambitChoice] given_credits status:', givenCredits);
      
      if (!givenCredits) {
        console.log('[GambitChoice] First time user - showing loading and will grant credits with confetti');
        // First time user - show loading, grant credits, and show confetti
        setIsProcessingCredits(true);
        
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/grant-credits`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: user.id,
              amount: 5,
              isWelcomeBonus: true,
            }),
          });
          
          if (response.ok) {
            console.log('[GambitChoice] Credits granted successfully');
            queryClient.invalidateQueries({ queryKey: ['credits', 'balance'] });
            queryClient.invalidateQueries({ queryKey: ['credits', 'ledger'] });
            // Mark that we should show confetti exactly once after granting credits
            setShouldShowConfetti(true);
          } else {
            console.error('[GambitChoice] Failed to grant credits');
          }
        }
        
        // Show loading for 1.5 seconds before showing credits result with confetti
        setTimeout(() => {
          console.log('[GambitChoice] Timeout completed - transitioning to credits result with confetti');
          setIsProcessingCredits(false);
          setCurrentStep(6); // Go to credits result step - confetti will show if shouldShowConfetti
        }, 1500);
      } else {
        console.log('[GambitChoice] User already has credits - skipping directly to result without confetti');
        // User already has credits - skip directly to result (no loading, no confetti)
        setCurrentStep(6);
      }
    } catch (error) {
      console.error('[GambitChoice] Error in handleGambitChoice:', error);
      setCurrentStep(6);
    }
  };

  const handleClose = () => {
    // Do not reset steps here to avoid flashing step 1 during close animation
    setShouldShowConfetti(false);
    // Reset confetti guard for future sessions
    window.confettiAlreadyTriggered = false;
    onClose();
  };

  const handleShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  // Render current step component conditionally to avoid calling hooks for unused steps
  const renderCurrentStep = () => {
    // Show loading step if processing credits
    if (isProcessingCredits) {
      return <ProcessingCreditsStep />;
    }

    switch (currentStep) {
      case 1:
        return <IntroductionStep onNext={handleNext} />;
      case 2:
        return <CommunityStep onNext={handleNext} />;
      case 3:
        return <PWAInstallStep onNext={handleNext} />;
      case 4:
        return <GenerationMethodStep onNext={handleNext} />;
      case 5:
        return <WelcomeGambitStep onNext={handleGambitChoice} />;
      case 6:
        return <CreditsResultStep choice={userChoice!} onNext={handleNext} shouldShowConfetti={shouldShowConfetti} onConfettiConsumed={() => setShouldShowConfetti(false)} />;
      case 7:
        return <SetupCompleteStep onClose={handleClose} />;
      default:
        return <IntroductionStep onNext={handleNext} />;
    }
  };

  const stepTitles = ["Welcome", "Community", "Install App", "Generation", "Promise", "Credits", "Complete"];
  
  return (
    <Dialog open={isOpen} onOpenChange={handleShake}>
      <DialogContent 
        className={modal.className}
        style={modal.style}
        {...modal.props}
      >
        <style>
          {`
            @keyframes shake {
              0%, 100% { transform: translateX(0); }
              10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
              20%, 40%, 60%, 80% { transform: translateX(8px); }
            }
            .shake-wrapper {
              animation: shake 0.5s ease-in-out;
            }
          `}
        </style>
        <style>{`
          /* Hide the built-in close button from Dialog component */
          button[data-radix-dialog-close] {
            display: none !important;
          }
        `}</style>
        <div className={`flex flex-col flex-1 min-h-0 ${isShaking ? 'shake-wrapper' : ''}`}>
          <div className={modal.headerClass}></div>

        <div ref={scrollRef} className={modal.scrollClass}>
          {renderCurrentStep()}
          <div className="h-6"></div>
        </div>
        
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

          {/* Step indicator and back button container */}
          <div className="relative flex justify-center space-x-2 pt-6 pb-2 border-t relative z-20">
            {/* Back button - only show after step 1 */}
            {currentStep > 1 && (
              <button
                onClick={handleBack}
                className="absolute left-0 top-1/2 -translate-y-1/4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 flex items-center space-x-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
            )}
            
            {/* Step indicators */}
            <div className="flex space-x-2">
              {stepTitles.map((_, index) => (
                <div 
                  key={index}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    currentStep === index + 1 ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              ))}
            </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}; 