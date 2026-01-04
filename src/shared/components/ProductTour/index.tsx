import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Joyride, { CallBackProps, STATUS, EVENTS, TooltipRenderProps } from 'react-joyride';
import { tourSteps, tourStepColors } from './tourSteps';
import { useProductTour } from '@/shared/hooks/useProductTour';
import { usePanes } from '@/shared/contexts/PanesContext';
import { Button } from '@/shared/components/ui/button';
import {
  ChevronRight,
  ChevronLeft,
  Layout,
  Film,
  ListTodo,
  Wrench,
  PartyPopper,
  Images,
  Layers
} from 'lucide-react';

// Icons for each step (matching the step content)
const stepIcons = [
  Layout,      // Shot selector
  Layers,      // Timeline
  Film,        // Video gallery
  Images,      // Generations pane
  ListTodo,    // Tasks pane
  Wrench,      // Tools pane
  PartyPopper, // Final step
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

  // Check if this step requires user to click the target
  const requiresClick = step.spotlightClicks;

  return (
    <div
      {...tooltipProps}
      className="bg-background border border-border rounded-lg shadow-lg p-6 max-w-sm z-[10001]"
    >
      {/* Header with colored icon - matching WelcomeBonusModal */}
      <div className="text-center space-y-3 mb-4">
        <div className={`mx-auto w-12 h-12 ${colors.bg} rounded-full flex items-center justify-center`}>
          <Icon className={`w-6 h-6 ${colors.icon}`} />
        </div>
        {step.title && (
          <h3 className="text-xl font-bold text-center text-foreground">
            {step.title as string}
          </h3>
        )}
      </div>

      {/* Content */}
      <div className="text-center mb-5">
        <p className="text-muted-foreground">{step.content as string}</p>
        {requiresClick && (
          <p className="text-sm text-primary mt-2 font-medium">
            Click the highlighted area to continue
          </p>
        )}
      </div>

      {/* Navigation buttons - matching WelcomeBonusModal button styles */}
      <div className="flex flex-col space-y-2">
        {continuous && !requiresClick && (
          <Button
            {...primaryProps}
            variant="retro"
            size="retro-sm"
            className="w-full"
          >
            {isLastStep ? "Let's go!" : 'Next'}
            {!isLastStep && <ChevronRight className="w-4 h-4 ml-2" />}
          </Button>
        )}

        <div className="flex justify-between items-center">
          {index > 0 ? (
            <button
              {...backProps}
              className="flex items-center space-x-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          <button
            {...skipProps}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip Tour
          </button>
        </div>
      </div>

      {/* Step indicators - matching WelcomeBonusModal dots */}
      <div className="flex justify-center space-x-2 pt-4 border-t border-border mt-4">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-colors ${
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
  const { setIsGenerationsPaneOpen, setIsTasksPaneOpen } = usePanes();
  const location = useLocation();
  const hasAutoStarted = useRef(false);

  // Auto-start tour when user lands on shot editor and hasn't completed/skipped tour
  useEffect(() => {
    const isOnShotEditor = location.pathname === '/tools/travel-between-images';
    const shouldShowTour = tourState && !tourState.completed && !tourState.skipped;

    if (isOnShotEditor && shouldShowTour && !isRunning && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      // Brief delay to let the page fully render
      const timer = setTimeout(() => {
        console.log('[ProductTour] Auto-starting tour on shot editor');
        startTour();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [location.pathname, tourState, isRunning, startTour]);

  const handleCallback = (data: CallBackProps) => {
    const { status, index, type, action } = data;

    // Handle step-specific actions (open panes when user clicks)
    if (type === EVENTS.STEP_AFTER) {
      // After user clicks generations pane tab
      if (index === 3) {
        setIsGenerationsPaneOpen(true);
      }
      // After user clicks tasks pane tab
      if (index === 4) {
        setIsTasksPaneOpen(true);
      }
    }

    // Handle tour completion/skip
    if (status === STATUS.FINISHED) {
      completeTour();
    } else if (status === STATUS.SKIPPED) {
      skipTour();
    }
  };

  if (!isRunning) return null;

  return (
    <Joyride
      steps={tourSteps}
      run={isRunning}
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
