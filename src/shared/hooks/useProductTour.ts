import { useState, useCallback } from 'react';
import { useUserUIState } from './useUserUIState';

interface TourState {
  completed: boolean;
  skipped: boolean;
}

export function useProductTour() {
  const { value: tourState, update: saveTourState } = useUserUIState<TourState>(
    'productTour',
    { completed: false, skipped: false }
  );

  const [isRunning, setIsRunning] = useState(false);

  const startTour = useCallback(() => {
    if (!tourState?.completed && !tourState?.skipped) {
      setIsRunning(true);
    }
  }, [tourState]);

  const completeTour = useCallback(() => {
    setIsRunning(false);
    saveTourState({ completed: true, skipped: false });
  }, [saveTourState]);

  const skipTour = useCallback(() => {
    setIsRunning(false);
    saveTourState({ completed: false, skipped: true });
  }, [saveTourState]);

  const restartTour = useCallback(() => {
    saveTourState({ completed: false, skipped: false });
    setIsRunning(true);
  }, [saveTourState]);

  return {
    isRunning,
    startTour,
    completeTour,
    skipTour,
    restartTour,
    tourState,
  };
}
