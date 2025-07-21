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
  const [inCloudChecked, setInCloudChecked] = usePersistentState<boolean>("generation-in-cloud", true);
  const [onComputerChecked] = usePersistentState<boolean>("generation-on-computer", true);
  
  const hasCredits = balance && balance.balance > 0;
  const hasValidToken = tokens.length > 0;

  // If both generation methods are disabled, show a dedicated warning.
  const generationDisabled = !inCloudChecked && !onComputerChecked;

  // Debug logging to understand why warnings aren't showing
  console.log('[GlobalProcessingWarning] Debug values:', {
    balance: balance?.balance,
    hasCredits,
    tokensCount: tokens.length,
    hasValidToken,
    inCloudChecked,
    onComputerChecked,
    generationDisabled,
    isLoadingBalance,
    isLoadingTokens
  });

  // Avoid showing any warning while data is loading.
  if (isLoadingBalance || isLoadingTokens) {
    return null;
  }

  // 1. Generation disabled takes top priority.
  if (generationDisabled) {
    return (
      <div className="mt-16 animate-in slide-in-from-top-2 fade-in duration-300">
        <div className="container mx-auto px-4 md:px-6 mt-4">
          <Alert className="border-orange-200 bg-orange-50 text-orange-900 flex items-center justify-between py-3 pr-4">
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
    return (
      <div className="mt-8 animate-in slide-in-from-top-2 fade-in duration-300">
        <div className="container mx-auto px-4 md:px-6 mt-4">
          <Alert className="border-orange-200 bg-orange-50 text-orange-900 flex items-center justify-between py-3 pr-4">
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
    return null;
  }
  
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
  const [inCloudChecked] = usePersistentState<boolean>("generation-in-cloud", true);

  const hasCredits = balance && balance.balance > 0;
  const hasValidToken = tokens.length > 0;
  // This warning is now shown globally, so don't duplicate it in the tasks pane.
  return null;
}; 