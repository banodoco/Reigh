import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Gift, Sparkles, Smartphone, Download, ChevronRight, X, ChevronLeft, Palette, Users, Monitor, Coins, Settings, Check } from 'lucide-react';

import usePersistentState from '@/shared/hooks/usePersistentState';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { useMediumModal } from '@/shared/hooks/useModal';
import { useScrollFade } from '@/shared/hooks/useScrollFade';

interface WelcomeBonusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

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
const IntroductionStep: React.FC<{ onNext: () => void }> = ({ onNext }) => (
  <>
    <DialogHeader className="text-center space-y-4 mb-6">
      <div className="mx-auto w-16 h-16 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20 rounded-full flex items-center justify-center">
        <Palette className="w-8 h-8 text-purple-600 dark:text-purple-400" />
      </div>
      <DialogTitle className="text-2xl font-bold text-center">
        Welcome to Reigh!
      </DialogTitle>
    </DialogHeader>
    
    <div className="text-center space-y-4">

      <p className="text-muted-foreground">
        We believe that combining image anchoring with additional control mechanisms can allow artists to steer AI video with unparalleled precision.
      </p>
      <p className="text-muted-foreground">
        Reigh aims to provide you with the best techniques in the open source AI art ecosystem for both generating anchor images, and travelling between them.
      </p>
      <p className="text-muted-foreground">
        Our goal is to make the beautiful struggle of creating art that feels truly your own as easy as possible.
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

// Step 2: Community
const CommunityStep: React.FC<{ onNext: () => void }> = ({ onNext }) => (
  <>
    <DialogHeader className="text-center space-y-4 mb-6">
      <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
        <Users className="w-8 h-8 text-blue-600 dark:text-blue-400" />
      </div>
      <DialogTitle className="text-2xl font-bold text-center">
        Join Our Community
      </DialogTitle>
    </DialogHeader>
    
    <div className="text-center space-y-4">
      <p className="text-muted-foreground">
        If you want to get good at creating art—or doing anything for that matter—the hardest part is not giving up.
      </p>
      <p className="text-muted-foreground">
        Our community will grow to become a place where artists can learn from, support, and inspire each other.
      </p>
      <p className="text-muted-foreground">
        We hope it blossoms into a scene of creative but, most importantly, determined artists who ultimately create remarkable work.
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

// Step 3: PWA Installation (existing logic)
const PWAInstallStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const { canInstall, installPWA } = usePWAInstall();

  const handleInstall = async () => {
    const installed = await installPWA();
    if (installed) {
      onNext();
    }
  };

  // Detect platform for better messaging
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);

  return (
    <>
      <DialogHeader className="text-center space-y-4 mb-6">
        <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
          <Smartphone className="w-8 h-8 text-green-600 dark:text-green-400" />
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
          {isIOS && (
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
              <p className="font-light mb-2">🤖 On Android Chrome:</p>
              <p className="text-muted-foreground">
                1. Look for <strong>"Install"</strong> button in address bar<br/>
                2. Or tap menu (⋮) → <strong>"Install app"</strong><br/>
                3. Follow the prompts to install
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
  
  const onComputerChecked = generationMethods.onComputer;
  const inCloudChecked = generationMethods.inCloud;

  // Show skeleton loading state while preferences are being fetched
  if (isLoadingGenerationMethods) {
    return (
      <>
        <DialogHeader className="text-center space-y-4 mb-6">
          <div className="mx-auto w-16 h-16 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center">
            <Monitor className="w-8 h-8 text-orange-600 dark:text-orange-400" />
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
        <div className="mx-auto w-16 h-16 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center">
          <Monitor className="w-8 h-8 text-orange-600 dark:text-orange-400" />
        </div>
        <DialogTitle className="text-2xl font-bold text-center">
          How would you like to generate?
        </DialogTitle>
      </DialogHeader>
      
      <div className="space-y-6">
        <p className="text-center text-muted-foreground">
          Choose where you'd like to run AI generation. You can change this later in settings.
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
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg relative">
              <div className="absolute top-2 right-2">
                <span className="bg-green-500 text-white text-xs font-light px-2 py-1 rounded-full">
                  Free
                </span>
              </div>
              <p className="text-sm text-green-800 dark:text-green-200 font-light">
                💻 Free to use, requires setup, need a good GPU
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

// Step 5: Credits Welcome (moved from step 1)
const CreditsStep: React.FC<{ onNext: () => void }> = ({ onNext }) => (
  <>
    <DialogHeader className="text-center space-y-4 mb-6">
      <div className="mx-auto w-16 h-16 bg-yellow-100 dark:bg-yellow-900/20 rounded-full flex items-center justify-center">
        <Coins className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
      </div>
      <DialogTitle className="text-2xl font-bold text-center">
        You've got credits! 💰
      </DialogTitle>
    </DialogHeader>
    
    <div className="text-center space-y-4">
      <div className="flex items-center justify-center space-x-2 text-lg">
        <Sparkles className="w-5 h-5 text-yellow-500" />
        <span className="font-light">We've added $5 to your account to help test our cloud service!</span>
        <Sparkles className="w-5 h-5 text-yellow-500" />
      </div>
      
      <p className="text-muted-foreground">
      Credits are used for AI generation tasks in the cloud. 
      You can check your balance anytime in Settings.
      </p>


    </div>
    
    <div className="flex justify-center pt-5 pb-2">
      <Button onClick={onNext} className="w-full sm:w-auto">
        Awesome!
        <ChevronRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  </>
);

// Step 6: Setup Complete
const SetupCompleteStep: React.FC<{ onClose: () => void }> = ({ onClose }) => {
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
        <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
          <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
        </div>
        <DialogTitle className="text-2xl font-bold text-center">
          One more thing...
        </DialogTitle>
      </DialogHeader>
      
      <div className="text-center space-y-4">
  
        
        <p className="text-muted-foreground">
          If there's anything that isn't working for you or could be better, please drop into our Discord and leave a message in our #support channel or DM POM.
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
  const modal = useMediumModal();
  const { showFade, scrollRef } = useScrollFade({ isOpen });

  // Reset to step 1 when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
    }
  }, [isOpen]);

  const handleNext = () => {
    setCurrentStep(prev => Math.min(prev + 1, 6));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleClose = () => {
    setCurrentStep(1);
    onClose();
  };

  // Render current step component conditionally to avoid calling hooks for unused steps
  const renderCurrentStep = () => {
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
        return <CreditsStep onNext={handleNext} />;
      case 6:
        return <SetupCompleteStep onClose={handleClose} />;
      default:
        return <IntroductionStep onNext={handleNext} />;
    }
  };

  const stepTitles = ["Welcome", "Community", "Install App", "Generation", "Credits", "Complete"];
  
  return (
    <Dialog open={isOpen} onOpenChange={() => {
      // Prevent closing by clicking outside - users must complete the onboarding flow
    }}>
      <DialogContent 
        className={modal.className}
        style={modal.style}
        {...modal.props}
      >
        <div className={modal.headerClass}>
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div ref={scrollRef} className={modal.scrollClass}>
          {renderCurrentStep()}
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
      </DialogContent>
    </Dialog>
  );
}; 