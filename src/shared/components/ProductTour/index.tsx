import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Joyride, { CallBackProps, STATUS, EVENTS, ACTIONS, TooltipRenderProps } from 'react-joyride';
import { tourSteps, tourStepColors } from './tourSteps';
import { useProductTour } from '@/shared/hooks/useProductTour';
import { usePanes } from '@/shared/contexts/PanesContext';
import {
  ChevronRight,
  ChevronLeft,
  Lock,
  Images,
  Sparkles,
  Lightbulb,
  Layout,
  Film,
  ListTodo,
  Wrench,
  PartyPopper,
  Layers
} from 'lucide-react';

// Icons for each step (matching the step content)
const stepIcons = [
  Lock,        // Step 0: Open gallery (lock button)
  Images,      // Step 1: Your image gallery
  Sparkles,    // Step 2: Generate images
  Lightbulb,   // Step 3: How it works
  Layout,      // Step 4: First shot (click to open)
  Film,        // Step 5: Video outputs
  Layers,      // Step 6: Timeline
  Film,        // Step 7: Structure video
  ListTodo,    // Step 8: Tasks pane
  Wrench,      // Step 9: Tools pane
  PartyPopper, // Step 10: Final step
];

// Custom tooltip component matching WelcomeBonusModal aesthetic
function CustomTooltip({
  continuous,
  index,
  step,
  backProps,
  primaryProps,
  skipProps,
  tooltipProps,
  isLastStep,
  size,
}: TooltipRenderProps) {
  const colors = tourStepColors[index % tourStepColors.length];
  const Icon = stepIcons[index] || PartyPopper;
  const totalSteps = size;

  return (
    <div
      {...tooltipProps}
      className="bg-background border border-border rounded-lg shadow-lg p-4 max-w-xs z-[100011] animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
    >
      {/* Header with colored icon */}
      <div className="text-center space-y-2 mb-3">
        <div className={`mx-auto w-8 h-8 ${colors.bg} rounded-full flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${colors.icon}`} />
        </div>
        {step.title && (
          <h3 className="text-base font-semibold text-center text-foreground">
            {step.title as string}
          </h3>
        )}
      </div>

      {/* Content */}
      <div className="text-center mb-3">
        <p className="text-sm text-muted-foreground">{step.content as string}</p>
      </div>

      {/* Navigation buttons */}
      <div className="flex justify-between items-center">
        {index > 0 ? (
          <button
            {...backProps}
            className="flex items-center space-x-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-3 w-3" />
            <span>Back</span>
          </button>
        ) : (
          <button
            {...skipProps}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip
          </button>
        )}

        {continuous && (
          <button
            {...primaryProps}
            className="flex items-center space-x-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          >
            <span>{isLastStep ? "Done" : 'Next'}</span>
            {!isLastStep && <ChevronRight className="h-3 w-3" />}
          </button>
        )}
      </div>

      {/* Step indicators */}
      <div className="flex justify-center space-x-1.5 pt-3 border-t border-border mt-3">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              i === index ? 'bg-primary' : 'bg-muted'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export function ProductTour() {
  const { isRunning, startTour, completeTour, skipTour, tourState } = useProductTour();
  const {
    setIsGenerationsPaneLocked,
    setIsTasksPaneLocked,
    resetAllPaneLocks
  } = usePanes();
  const location = useLocation();
  const navigate = useNavigate();
  const hasAutoStarted = useRef(false);

  // Controlled step index for managing transitions
  const [stepIndex, setStepIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Track if we've done the initial setup for this tour run
  const hasInitializedRef = useRef(false);

  // Reset step index and close/unlock all panes when tour starts
  useEffect(() => {
    if (isRunning && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      console.log('[ProductTour] Tour starting - resetting all pane locks');
      setStepIndex(0);
      setIsPaused(false);
      // Reset all pane locks (updates both local state and database immediately)
      resetAllPaneLocks();
      console.log('[ProductTour] Pane locks reset');
    } else if (!isRunning) {
      // Reset the flag when tour stops
      hasInitializedRef.current = false;
    }
  }, [isRunning, resetAllPaneLocks]);

  // Helper to open generation modal via custom event
  const openGenerationModal = useCallback(() => {
    window.dispatchEvent(new CustomEvent('openGenerationModal'));
  }, []);

  // Helper to close generation modal via custom event
  const closeGenerationModal = useCallback(() => {
    window.dispatchEvent(new CustomEvent('closeGenerationModal'));
  }, []);

  // Add click listeners to spotlightClicks targets to advance tour
  useEffect(() => {
    if (!isRunning || isPaused) return;

    const currentStep = tourSteps[stepIndex];
    if (!currentStep?.spotlightClicks) return;

    const target = document.querySelector(currentStep.target as string);
    if (!target) return;

    const handleClick = () => {
      const nextIndex = stepIndex + 1;

      // Step 0: Lock button clicked - locks the generations pane
      if (stepIndex === 0) {
        setIsPaused(true);
        setTimeout(() => {
          setStepIndex(nextIndex);
          setIsPaused(false);
        }, 400);
      }
      // Step 2: Sparkles button clicked - opens generation modal
      else if (stepIndex === 2) {
        // Modal opens naturally from the button click
        setIsPaused(true);
        setTimeout(() => {
          setStepIndex(nextIndex);
          setIsPaused(false);
        }, 400);
      }
      // Step 4: First shot click - navigates to shot editor (needs longer delay for page to render)
      else if (stepIndex === 4) {
        setIsPaused(true);
        setTimeout(() => {
          setStepIndex(nextIndex);
          setIsPaused(false);
        }, 1500);
      }
      // Step 8: Tasks pane tab clicked - lock the tasks pane
      else if (stepIndex === 8) {
        setIsTasksPaneLocked(true);
        setIsPaused(true);
        setTimeout(() => {
          setStepIndex(nextIndex);
          setIsPaused(false);
        }, 400);
      }
      // Default: just advance
      else {
        setStepIndex(nextIndex);
      }
    };

    target.addEventListener('click', handleClick);
    return () => target.removeEventListener('click', handleClick);
  }, [isRunning, isPaused, stepIndex, setIsTasksPaneLocked]);

  // Auto-start tour when user lands on shot editor and hasn't completed/skipped tour
  useEffect(() => {
    const isOnShotEditor = location.pathname === '/tools/travel-between-images';
    const shouldShowTour = tourState && !tourState.completed && !tourState.skipped;

    console.log('[ProductTour] Check auto-start:', { isOnShotEditor, shouldShowTour, isRunning, hasAutoStarted: hasAutoStarted.current, tourState });

    if (isOnShotEditor && shouldShowTour && !isRunning && !hasAutoStarted.current) {
      // Brief delay to let the page fully render
      const timer = setTimeout(() => {
        // Double-check we haven't started yet (in case of race)
        if (!hasAutoStarted.current) {
          hasAutoStarted.current = true;
          console.log('[ProductTour] Auto-starting tour on shot editor');
          startTour();
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [location.pathname, tourState, isRunning, startTour]);

  const handleCallback = useCallback((data: CallBackProps) => {
    const { status, index, type, action } = data;

    // Handle step navigation
    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      const nextIndex = index + (action === ACTIONS.PREV ? -1 : 1);

      // Step 0: Lock button - locks generations pane
      if (index === 0 && action !== ACTIONS.PREV) {
        setIsGenerationsPaneLocked(true);
        setIsPaused(true);
        setTimeout(() => {
          setStepIndex(nextIndex);
          setIsPaused(false);
        }, 400);
      }
      // Step 1: Gallery view - just advance
      else if (index === 1 && action !== ACTIONS.PREV) {
        setStepIndex(nextIndex);
      }
      // Step 2: Sparkles button - open the modal when clicking Next
      else if (index === 2 && action !== ACTIONS.PREV) {
        openGenerationModal();
        setIsPaused(true);
        setTimeout(() => {
          setStepIndex(nextIndex);
          setIsPaused(false);
        }, 400);
      }
      // Step 3: How It Works - close modal, unlock pane, AND advance
      else if (index === 3 && action !== ACTIONS.PREV) {
        console.log('[ProductTour] Step 3: closing modal, unlocking pane, advancing to', nextIndex);
        closeGenerationModal();
        setIsGenerationsPaneLocked(false);
        // Use longer delay to ensure modal fully closes and first-shot element is visible
        setIsPaused(true);
        setTimeout(() => {
          // Wait for first-shot element to be available
          const waitForTarget = () => {
            const target = document.querySelector('[data-tour="first-shot"]');
            if (target) {
              console.log('[ProductTour] Step 3: first-shot found, advancing to', nextIndex);
              setStepIndex(nextIndex);
              setTimeout(() => setIsPaused(false), 100);
            } else {
              console.log('[ProductTour] Step 3: waiting for first-shot...');
              setTimeout(waitForTarget, 100);
            }
          };
          waitForTarget();
        }, 800);
      }
      // Step 4: First shot click - page navigation (needs longer delay for shot editor to render)
      else if (index === 4 && action !== ACTIONS.PREV) {
        // Programmatically click the first shot to navigate into it
        const firstShot = document.querySelector('[data-tour="first-shot"]') as HTMLElement;
        if (firstShot) {
          firstShot.click();
        }
        setIsPaused(true);
        setTimeout(() => {
          setStepIndex(nextIndex);
          setIsPaused(false);
        }, 1500);
      }
      // Step 8: Tasks pane - lock the pane
      else if (index === 8 && action !== ACTIONS.PREV) {
        setIsTasksPaneLocked(true);
        setIsPaused(true);
        setTimeout(() => {
          setStepIndex(nextIndex);
          setIsPaused(false);
        }, 400);
      }
      // Default: just advance
      else {
        setStepIndex(nextIndex);
      }
    }

    // Handle tour completion/skip
    if (status === STATUS.FINISHED) {
      completeTour();
      // Navigate to main tool page (out of any shot)
      navigate('/tools/travel-between-images');
    } else if (status === STATUS.SKIPPED) {
      skipTour();
    }
  }, [completeTour, skipTour, setIsGenerationsPaneLocked, setIsTasksPaneLocked, openGenerationModal, closeGenerationModal, navigate]);

  if (!isRunning) return null;

  return (
    <Joyride
      steps={tourSteps}
      run={isRunning && !isPaused}
      stepIndex={stepIndex}
      continuous
      scrollToFirstStep
      showSkipButton
      showProgress
      disableCloseOnEsc={false}
      disableOverlayClose
      callback={handleCallback}
      tooltipComponent={CustomTooltip}
      styles={{
        options: {
          zIndex: 100010,
          arrowColor: 'hsl(var(--background))',
        },
        spotlight: {
          borderRadius: 8,
          transition: 'opacity 0.3s ease, transform 0.3s ease',
        },
        overlay: {
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          transition: 'opacity 0.3s ease',
        },
      }}
      floaterProps={{
        styles: {
          floater: {
            filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15))',
            transition: 'opacity 0.3s ease, transform 0.3s ease',
          },
        },
      }}
    />
  );
}
