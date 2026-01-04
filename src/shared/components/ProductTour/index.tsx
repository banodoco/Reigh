import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import Joyride, { CallBackProps, STATUS, EVENTS, ACTIONS, TooltipRenderProps } from 'react-joyride';
import { tourSteps, tourStepColors } from './tourSteps';
import { useProductTour } from '@/shared/hooks/useProductTour';
import { usePanes } from '@/shared/contexts/PanesContext';
import {
  ChevronRight,
  ChevronLeft,
  Lock,
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
  Sparkles,    // Step 1: Generate images
  Lightbulb,   // Step 2: How it works
  Layout,      // Step 3: First shot (click to open)
  Film,        // Step 4: Video gallery
  Layers,      // Step 5: Timeline
  ListTodo,    // Step 6: Tasks pane
  Wrench,      // Step 7: Tools pane
  PartyPopper, // Step 8: Final step
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
      className="bg-background border border-border rounded-lg shadow-lg p-4 max-w-xs z-[10001]"
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
    setIsGenerationsPaneOpen,
    setIsGenerationsPaneLocked,
    setIsTasksPaneOpen
  } = usePanes();
  const location = useLocation();
  const hasAutoStarted = useRef(false);

  // Controlled step index for managing transitions
  const [stepIndex, setStepIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Reset step index when tour starts
  useEffect(() => {
    if (isRunning) {
      setStepIndex(0);
      setIsPaused(false);
    }
  }, [isRunning]);

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
        // Lock button click will lock the pane automatically
        // Just wait for the pane to open
        setIsPaused(true);
        setTimeout(() => {
          setStepIndex(nextIndex);
          setIsPaused(false);
        }, 400);
      }
      // Step 1: Sparkles button clicked - opens generation modal
      else if (stepIndex === 1) {
        // Modal will open naturally from the button click
        // Wait for modal to appear
        setIsPaused(true);
        setTimeout(() => {
          setStepIndex(nextIndex);
          setIsPaused(false);
        }, 400);
      }
      // Step 3: First shot click - navigates to shot editor
      else if (stepIndex === 3) {
        setIsPaused(true);
        setTimeout(() => {
          setStepIndex(nextIndex);
          setIsPaused(false);
        }, 800);
      }
      // Step 6: Tasks pane tab clicked
      else if (stepIndex === 6) {
        setIsTasksPaneOpen(true);
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
  }, [isRunning, isPaused, stepIndex, setIsTasksPaneOpen]);

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
      // Step 1: Sparkles button - opens modal (handled by click)
      else if (index === 1 && action !== ACTIONS.PREV) {
        // Modal should already be open from click
        setIsPaused(true);
        setTimeout(() => {
          setStepIndex(nextIndex);
          setIsPaused(false);
        }, 400);
      }
      // Step 2: Instructions - close modal and unlock pane when clicking Next
      else if (index === 2 && action !== ACTIONS.PREV) {
        // Dispatch custom event to close the generation modal
        window.dispatchEvent(new CustomEvent('closeGenerationModal'));
        // Unlock the generations pane
        setIsGenerationsPaneLocked(false);
        setIsPaused(true);
        setTimeout(() => {
          setStepIndex(nextIndex);
          setIsPaused(false);
        }, 400);
      }
      // Step 3: First shot click - page navigation
      else if (index === 3 && action !== ACTIONS.PREV) {
        setIsPaused(true);
        setTimeout(() => {
          setStepIndex(nextIndex);
          setIsPaused(false);
        }, 800);
      }
      // Step 6: Tasks pane
      else if (index === 6 && action !== ACTIONS.PREV) {
        setIsTasksPaneOpen(true);
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
    } else if (status === STATUS.SKIPPED) {
      skipTour();
    }
  }, [completeTour, skipTour, setIsGenerationsPaneLocked, setIsTasksPaneOpen]);

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
          zIndex: 10000,
          arrowColor: 'hsl(var(--background))',
        },
        spotlight: {
          borderRadius: 8,
        },
        overlay: {
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
        },
      }}
      floaterProps={{
        styles: {
          floater: {
            filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15))',
          },
        },
      }}
    />
  );
}
