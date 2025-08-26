import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Alert } from '@/shared/components/ui/alert';
import { Button } from '@/shared/components/ui/button';
import { useCredits } from '@/shared/hooks/useCredits';
import { useApiTokens } from '@/shared/hooks/useApiTokens';
import usePersistentState from '@/shared/hooks/usePersistentState';

const WARNING_TASK_STATUSES = ['In Progress', 'Failed', 'Cancelled'];

interface ProcessingWarningsProps {
  onOpenSettings: () => void;
}

export const GlobalProcessingWarning: React.FC<ProcessingWarningsProps> = ({ onOpenSettings }) => {
  const { balance, isLoadingBalance } = useCredits();
  const { tokens, isLoading: isLoadingTokens } = useApiTokens();
  
  // TEMPORARY: Use localStorage to prevent blocking during initial app load
  // ProcessingWarnings renders early in Layout.tsx and was causing ProjectContext timeout
  // when using useUserUIState (database calls during critical loading phase)
  // TODO: Sync with database preferences after app has fully loaded
  const [inCloudChecked, setInCloudChecked] = usePersistentState<boolean>("generation-in-cloud", true);
  const [onComputerChecked] = usePersistentState<boolean>("generation-on-computer", true);
  
  const hasCredits = balance && balance.balance > 0;
  const hasValidToken = tokens.length > 0;

  // If both generation methods are disabled, show a dedicated warning.
  const generationDisabled = !inCloudChecked && !onComputerChecked;

  // DEBUG: Log warning conditions to help diagnose desktop issues
  console.log('[ProcessingWarningsDesktopDebug] Warning conditions:', {
    isLoadingBalance,
    isLoadingTokens,
    balance: balance?.balance,
    hasCredits,
    tokensCount: tokens.length,
    hasValidToken,
    inCloudChecked,
    onComputerChecked,
    generationDisabled,
    noCreditsButCloudEnabled: inCloudChecked && !hasCredits,
    shouldShowFinalWarning: !hasCredits && !hasValidToken
  });

  // Avoid showing any warning while data is loading.
  if (isLoadingBalance || isLoadingTokens) {
    console.log('[ProcessingWarningsDesktopDebug] Still loading, not showing warnings');
    return null;
  }

  // 1. Generation disabled takes top priority.
  if (generationDisabled) {
    console.log('[ProcessingWarningsDesktopDebug] Showing GENERATION DISABLED warning');
    return (
      <div className="mt-16 animate-in slide-in-from-top-2 fade-in duration-300">
        <div className="container mx-auto px-4 md:px-6 mt-4">
          <Alert className="border-orange-200 bg-orange-50 text-orange-900 flex items-center justify-between py-3 pr-4 shadow-lg border-2">
            <div className="flex items-center space-x-3">
              <span className="inline-flex items-center">
                <AlertTriangle className="h-5 w-5 text-orange-700 mr-2" />
                <span>You have disabled both cloud and local generation. Enable at least one in Settings.</span>
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenSettings}
              className="border-orange-300 hover:bg-orange-100 flex-shrink-0"
            >
              Visit Settings
            </Button>
          </Alert>
        </div>
      </div>
    );
  }

  // 2. Cloud processing enabled but the user has no credits – show a dedicated banner here.
  const noCreditsButCloudEnabled = inCloudChecked && !hasCredits;

  if (noCreditsButCloudEnabled) {
    console.log('[ProcessingWarningsDesktopDebug] Showing NO CREDITS BUT CLOUD ENABLED warning');
    return (
      <div className="mt-8 animate-in slide-in-from-top-2 fade-in duration-300">
        <div className="container mx-auto px-4 md:px-6 mt-4">
          <Alert className="border-orange-200 bg-orange-50 text-orange-900 flex items-center justify-between py-3 pr-4 shadow-lg border-2">
            <div className="flex items-center space-x-3">
              <span className="inline-flex items-center">
                <AlertTriangle className="h-5 w-5 text-orange-700 mr-2" />
                <span className="space-x-1">
                  <span>Cloud processing enabled but you have no credits.</span>
                  <span
                    className="text-orange-700 underline hover:text-orange-800 cursor-pointer"
                    onClick={() => setInCloudChecked(false)}
                  >
                    Turn off cloud processing
                  </span>
                  <span>or</span>
                  <span
                    className="text-orange-700 underline hover:text-orange-800 cursor-pointer"
                    onClick={onOpenSettings}
                  >
                    buy credits
                  </span>
                  <span>to dismiss.</span>
                </span>
              </span>
            </div>
          </Alert>
        </div>
      </div>
    );
  }

  // 3. Show the existing credits/token warning if both cloud processing is disabled AND no valid token.
  if (hasCredits || hasValidToken) {
    console.log('[ProcessingWarningsDesktopDebug] NOT showing warning because hasCredits or hasValidToken is true');
    return null;
  }
  
  console.log('[ProcessingWarningsDesktopDebug] Showing FALLBACK warning - no credits and no valid token');
  return (
    <div className="mt-4 animate-in slide-in-from-top-2 fade-in duration-300">
      <div className="container mx-auto px-4 md:px-6 mt-4">
        <Alert className="border-orange-200 bg-orange-50 text-orange-900 flex items-center justify-between py-3 pr-4">
          <div className="flex items-center space-x-3">
            <span className="inline-flex items-center">
              <AlertTriangle className="h-5 w-5 text-orange-700 mr-2" />
              <span>You don't have credits and haven't set up local processing.</span>
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenSettings}
            className="border-orange-300 hover:bg-orange-100 flex-shrink-0"
          >
            Visit Settings
          </Button>
        </Alert>
      </div>
    </div>
  );
};

interface TasksPaneProcessingWarningProps {
  onOpenSettings: () => void;
}

export const TasksPaneProcessingWarning: React.FC<ProcessingWarningsProps> = ({ onOpenSettings }) => {
  const { balance } = useCredits();
  const { tokens } = useApiTokens();
  
  // TEMPORARY: Use localStorage to prevent blocking during app initialization
  const [inCloudChecked] = usePersistentState<boolean>("generation-in-cloud", true);

  const hasCredits = balance && balance.balance > 0;
  const hasValidToken = tokens.length > 0;
  // This warning is now shown globally, so don't duplicate it in the tasks pane.
  return null;
}; 