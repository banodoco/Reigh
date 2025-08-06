import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Gift, Sparkles, Smartphone, Download, ChevronRight, X, ChevronLeft, Palette, Users, Monitor, Coins, Settings, Check } from 'lucide-react';
import { Checkbox } from '@/shared/components/ui/checkbox';
import usePersistentState from '@/shared/hooks/usePersistentState';
import { useUserUIState } from '@/shared/hooks/useUserUIState';

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
    <DialogHeader className="text-center space-y-4">
      <div className="mx-auto w-16 h-16 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20 rounded-full flex items-center justify-center">
        <Palette className="w-8 h-8 text-purple-600 dark:text-purple-400" />
      </div>
      <DialogTitle className="text-2xl font-bold text-center">
        Welcome to Reigh! 🎨
      </DialogTitle>
    </DialogHeader>
    
    <div className="text-center space-y-4">
      <p className="text-lg font-medium">
        Reigh is a tool to help <em>you</em> make art with AI
      </p>
      
      <p className="text-muted-foreground">
        We want to make the struggle of creating art that feels truly your own as easy as possible. 
        Let's get you set up with everything you need to start creating.
      </p>

      <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-4">
        <p className="text-sm text-muted-foreground">
          ✨ Create image-guided videos<br/>
          🎯 Full creative control<br/>
          🚀 Generate locally or in the cloud
        </p>
      </div>
    </div>
    
    <div className="flex justify-center pt-4">
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
    <DialogHeader className="text-center space-y-4">
      <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
        <Users className="w-8 h-8 text-blue-600 dark:text-blue-400" />
      </div>
      <DialogTitle className="text-2xl font-bold text-center">
        Join Our Community
      </DialogTitle>
    </DialogHeader>
    
    <div className="text-center space-y-4">
      <p className="text-lg font-medium">
        Creating art that feels like you made it is hard
      </p>
      
      <p className="text-muted-foreground">
        Being part of a community will help you not give up. Get inspiration, share your work, 
        and learn from other artists exploring this new medium.
      </p>

      <div className="space-y-3 text-left">
        <div className="flex items-start space-x-3">
          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
          <span className="text-sm text-muted-foreground">Get help and troubleshooting support</span>
        </div>
        <div className="flex items-start space-x-3">
          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
          <span className="text-sm text-muted-foreground">Share your creations and get feedback</span>
        </div>
        <div className="flex items-start space-x-3">
          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
          <span className="text-sm text-muted-foreground">Learn new techniques and workflows</span>
        </div>
      </div>
    </div>
    
    <div className="flex flex-col space-y-2 pt-4">
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
  const [showInstructions, setShowInstructions] = useState(false);

  const handleInstall = async () => {
    const installed = await installPWA();
    if (installed) {
      onNext();
    }
  };

  const handleShowInstructions = () => {
    setShowInstructions(true);
  };

  // Detect platform for better messaging
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);

  return (
    <>
      <DialogHeader className="text-center space-y-4">
        <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
          <Smartphone className="w-8 h-8 text-green-600 dark:text-green-400" />
        </div>
        <DialogTitle className="text-2xl font-bold text-center">
          Install Reigh App
        </DialogTitle>
      </DialogHeader>
      
      <div className="text-center space-y-4">
        <p className="text-lg font-medium">
          Get the best experience by installing Reigh as an app!
        </p>
        
        <div className="space-y-3 text-left">
          <div className="flex items-start space-x-3">
            <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
            <span className="text-sm text-muted-foreground">Work offline and access your projects anytime</span>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
            <span className="text-sm text-muted-foreground">Faster performance and native app feel</span>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
            <span className="text-sm text-muted-foreground">Easy access from your home screen</span>
          </div>
        </div>

        {/* Platform-specific instructions */}
        {!canInstall && (showInstructions || isIOS || isAndroid) && (
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-sm">
            {isIOS && (
              <>
                <p className="font-medium mb-2">📱 On iOS Safari:</p>
                <p className="text-muted-foreground">
                  1. Tap the <strong>Share</strong> button (□↗) at the bottom<br/>
                  2. Scroll down and select <strong>"Add to Home Screen"</strong><br/>
                  3. Tap <strong>"Add"</strong> to install
                </p>
              </>
            )}
            {isAndroid && (
              <>
                <p className="font-medium mb-2">🤖 On Android:</p>
                <p className="text-muted-foreground">
                  1. Look for <strong>"Install"</strong> button in address bar<br/>
                  2. Or tap browser menu (⋮) → <strong>"Add to Home Screen"</strong><br/>
                  3. Follow the prompts to install
                </p>
              </>
            )}
            {!isIOS && !isAndroid && showInstructions && (
              <>
                <p className="font-medium mb-2">💻 On Desktop:</p>
                <p className="text-muted-foreground">
                  1. Press <strong>Ctrl+D</strong> (or <strong>Cmd+D</strong> on Mac) to bookmark<br/>
                  2. Or look for install icon in your browser's address bar<br/>
                  3. Check browser menu for "Install" or "Add to Home Screen"
                </p>
              </>
            )}
          </div>
        )}
      </div>
      
      <div className="flex flex-col space-y-2 pt-4">
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
          <>
            {!showInstructions ? (
              <Button onClick={handleShowInstructions} className="w-full">
                <Download className="w-4 h-4 mr-2" />
                Show Install Instructions
              </Button>
            ) : (
              <Button onClick={onNext} className="w-full">
                Continue
              </Button>
            )}
            <Button variant="outline" onClick={onNext} className="w-full text-sm">
              Skip for now
            </Button>
          </>
        )}
      </div>
    </>
  );
};

// Step 4: Generation Method Selection
const GenerationMethodStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  // Use database-backed generation preferences (same as SettingsModal)
  const { 
    value: generationMethods, 
    update: updateGenerationMethods,
    isLoading: isLoadingGenerationMethods
  } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  
  const onComputerChecked = generationMethods.onComputer;
  const inCloudChecked = generationMethods.inCloud;

  // Show loading state while preferences are being fetched
  if (isLoadingGenerationMethods) {
    return (
      <>
        <DialogHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center">
            <Monitor className="w-8 h-8 text-orange-600 dark:text-orange-400" />
          </div>
          <DialogTitle className="text-2xl font-bold text-center">
            Loading your preferences...
          </DialogTitle>
        </DialogHeader>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div>
        </div>
      </>
    );
  }

  return (
    <>
      <DialogHeader className="text-center space-y-4">
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

                 <div className="space-y-4">
           <div 
             className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
             onClick={() => updateGenerationMethods({ inCloud: !inCloudChecked })}
           >
             <div className="flex items-center space-x-3">
               <Checkbox
                 id="in-cloud"
                 checked={inCloudChecked}
                 className="pointer-events-none"
               />
               <div className="flex-1">
                 <label htmlFor="in-cloud" className="text-sm font-medium leading-none cursor-pointer">
                   In the cloud ☁️
                 </label>
                 <p className="text-xs text-muted-foreground mt-1">
                   Easy setup, pay-per-use, works on any device
                 </p>
               </div>
             </div>
           </div>
           
           <div 
             className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer relative"
             onClick={() => updateGenerationMethods({ onComputer: !onComputerChecked })}
           >
             <div className="absolute top-2 right-2">
               <span className="bg-green-500 text-white text-xs font-medium px-2 py-1 rounded-full">
                 Free
               </span>
             </div>
             <div className="flex items-center space-x-3">
               <Checkbox
                 id="on-computer"
                 checked={onComputerChecked}
                 className="pointer-events-none"
               />
               <div className="flex-1">
                 <label htmlFor="on-computer" className="text-sm font-medium leading-none cursor-pointer">
                   On my computer 💻
                 </label>
                 <p className="text-xs text-muted-foreground mt-1">
                   Free to use, requires setup, need a good GPU
                 </p>
               </div>
             </div>
           </div>
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
      
      <div className="flex justify-center pt-4">
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
    <DialogHeader className="text-center space-y-4">
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
        <span className="font-semibold">We've added $5 to your account to help test our cloud service!</span>
        <Sparkles className="w-5 h-5 text-yellow-500" />
      </div>
      
      <p className="text-muted-foreground">
        Your credits are ready to use for cloud generation. If anything isn't working for you, 
        please let us know in the Discord community!
      </p>

      <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
        <p className="text-sm text-muted-foreground">
          💡 <strong>Tip:</strong> Credits are used for AI generation tasks in the cloud. 
          You can check your balance anytime in Settings.
        </p>
      </div>
    </div>
    
    <div className="flex justify-center pt-4">
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
      <DialogHeader className="text-center space-y-4">
        <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
          <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
        </div>
        <DialogTitle className="text-2xl font-bold text-center">
          You're all set! 🎉
        </DialogTitle>
      </DialogHeader>
      
      <div className="text-center space-y-4">
        <p className="text-lg font-medium">
          Ready to start creating amazing art with Reigh
        </p>
        
        <p className="text-muted-foreground">
          You can always change your generation preferences, manage credits, 
          or set up local generation later in the settings.
        </p>

        <div className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-lg p-4">
          <p className="text-sm text-muted-foreground">
            🎨 Start by creating a new project<br/>
            🔧 Fine-tune settings as needed<br/>
            💬 Join the community for support and inspiration
          </p>
        </div>
      </div>
      
      <div className="flex flex-col space-y-2 pt-4">
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
    setCurrentStep(1); // Reset for next time
    onClose();
  };

  const steps = [
    { component: <IntroductionStep onNext={handleNext} />, title: "Welcome" },
    { component: <CommunityStep onNext={handleNext} />, title: "Community" },
    { component: <PWAInstallStep onNext={handleNext} />, title: "Install App" },
    { component: <GenerationMethodStep onNext={handleNext} />, title: "Generation" },
    { component: <CreditsStep onNext={handleNext} />, title: "Credits" },
    { component: <SetupCompleteStep onClose={handleClose} />, title: "Complete" },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>

        {steps[currentStep - 1].component}
        
        {/* Step indicator and back button container */}
        <div className="relative flex justify-center space-x-2 pt-2 pb-2">
          {/* Back button - only show after step 1 */}
          {currentStep > 1 && (
            <button
              onClick={handleBack}
              className="absolute left-0 top-1/2 -translate-y-1/2 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 flex items-center space-x-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
          )}
          
          {/* Step indicators */}
          <div className="flex space-x-2">
            {steps.map((_, index) => (
              <div 
                key={index}
                className={`w-2 h-2 rounded-full transition-colors ${
                  currentStep === index + 1 ? 'bg-primary' : 'bg-muted'
                }`} 
              />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}; 