import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import { Button } from '@/shared/components/ui/button';
import { useCredits } from '@/shared/hooks/useCredits';
import { useApiTokens } from '@/shared/hooks/useApiTokens';
import { useUserUIState } from '@/shared/hooks/useUserUIState';

interface ProcessingWarningsProps {
  onOpenSettings: () => void;
}

export const GlobalProcessingWarning: React.FC<ProcessingWarningsProps> = ({ onOpenSettings }) => {
  const { balance, isLoadingBalance } = useCredits();
  const { tokens, isLoading: isLoadingTokens } = useApiTokens();
  const { value: settingsModalState } = useUserUIState('settingsModal', {
    activeInstallTab: "need-install",
    computerType: "linux", 
    onComputerChecked: true,
    inCloudChecked: true
  });

  const inCloudChecked = settingsModalState.inCloudChecked;
  const onComputerChecked = settingsModalState.onComputerChecked;
  
  const hasCredits = balance && balance.currentBalance > 0;
  const hasValidToken = tokens.length > 0;

  // If both generation methods are disabled, show a dedicated warning.
  const generationDisabled = !inCloudChecked && !onComputerChecked;

  // Avoid showing any warning while data is loading.
  if (isLoadingBalance || isLoadingTokens) {
    return null;
  }

  // 1. Generation disabled takes top priority.
  if (generationDisabled) {
    return (
      <div className="animate-in slide-in-from-top-2 fade-in duration-300">
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

  // 2. Show the existing credits/token warning.
  if (hasCredits || hasValidToken) {
    return null;
  }
  
  return (
    <div className="animate-in slide-in-from-top-2 fade-in duration-300">
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

export const TasksPaneProcessingWarning: React.FC<ProcessingWarningsProps> = ({ onOpenSettings }) => {
  const { balance } = useCredits();
  const { tokens } = useApiTokens();
  const { value: tasksPaneSettingsState } = useUserUIState('settingsModal', {
    activeInstallTab: "need-install",
    computerType: "linux", 
    onComputerChecked: true,
    inCloudChecked: true
  });

  const inCloudChecked = tasksPaneSettingsState.inCloudChecked;
  
  const hasCredits = balance && balance.currentBalance > 0;
  const hasValidToken = tokens.length > 0;
  
  // Show warning if they have cloud processing enabled but no credits, 
  // AND they have a valid token (so GlobalProcessingWarning won't show)
  if (!inCloudChecked || hasCredits || !hasValidToken) {
    return null;
  }
  
  return (
    <div className="px-3">
      <Alert className="mb-2 border-orange-200 bg-orange-50 text-orange-900 rounded-md">
        <AlertDescription className="text-xs leading-relaxed">
          <div className="flex items-start space-x-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-orange-700 mt-0.5" />
            <div className="space-y-1">
              <div className="text-sm font-medium">Cloud processing enabled but you have no credits.</div>
              <div className="text-xs">
                Turn off cloud processing or{' '}
                <Button
                  variant="link"
                  size="sm"
                  onClick={onOpenSettings}
                  className="p-0 h-auto text-orange-700 underline hover:text-orange-800 text-xs"
                >
                  buy credits
                </Button>
                {' '}to dismiss.
              </div>
            </div>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}; 