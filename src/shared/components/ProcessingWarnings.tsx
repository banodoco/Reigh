import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Alert } from '@/shared/components/ui/alert';
import { Button } from '@/shared/components/ui/button';
import { useCredits } from '@/shared/hooks/useCredits';
import { useApiTokens } from '@/shared/hooks/useApiTokens';
import { useUserUIState } from '@/shared/hooks/useUserUIState';

const WARNING_TASK_STATUSES = ['In Progress', 'Failed', 'Cancelled'];

interface ProcessingWarningsProps {
  onOpenSettings: () => void;
}

export const GlobalProcessingWarning: React.FC<ProcessingWarningsProps> = ({ onOpenSettings }) => {
  const { balance, isLoadingBalance } = useCredits();
  const { tokens, isLoading: isLoadingTokens } = useApiTokens();
  
  // Access user's generation settings from database
  const {
    value: generationMethods, 
    isLoading: isLoadingGenerationMethods,
    update: updateGenerationMethods
  } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });

  // Force refresh trigger to handle immediate updates
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Listen for storage events from other tabs/components
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'generation-settings-updated') {
        // Force a re-evaluation by incrementing refresh trigger
        setRefreshTrigger(prev => prev + 1);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Also listen for custom events from the same tab
    const handleCustomEvent = () => {
      setRefreshTrigger(prev => prev + 1);
    };
    
    window.addEventListener('generation-settings-changed', handleCustomEvent);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('generation-settings-changed', handleCustomEvent);
    };
  }, []);

  const onComputerChecked = generationMethods.onComputer;
  const inCloudChecked = generationMethods.inCloud;
  
  const hasCredits = balance && balance.balance > 0;
  const hasValidToken = tokens.length > 0;

  // If both generation methods are disabled, show a dedicated warning.
  const generationDisabled = !inCloudChecked && !onComputerChecked;

  // DEBUG: Log warning conditions to help diagnose desktop issues
  // 1. Generation disabled takes absolute top priority - check this even while loading
  if (generationDisabled) {
    return (
      <div className="animate-in slide-in-from-top-2 fade-in duration-300" style={{ marginTop: '1.75rem' }}>
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

  // Avoid showing any other warnings while data is loading.
  if (isLoadingBalance || isLoadingTokens || isLoadingGenerationMethods) {
    return null;
  }

  // 2. Cloud processing enabled but the user has no credits – show a dedicated banner here.
  const noCreditsButCloudEnabled = inCloudChecked && !hasCredits;

  if (noCreditsButCloudEnabled) {
    return (
      <div className="animate-in slide-in-from-top-2 fade-in duration-300" style={{ marginTop: '1.75rem' }}>
        <div className="container mx-auto px-4 md:px-6 mt-4">
          <Alert className="border-orange-200 bg-orange-50 text-orange-900 flex items-center justify-between py-3 pr-4 shadow-lg border-2">
            <div className="flex items-center space-x-3">
              <span className="inline-flex items-center">
                <AlertTriangle className="h-5 w-5 text-orange-700 mr-2" />
                <span className="space-x-1">
                  <span>Cloud processing enabled but you have no credits.</span>
                  <span
                    className="text-orange-700 underline hover:text-orange-800 cursor-pointer"
                    onClick={() => updateGenerationMethods({ inCloud: false, onComputer: true })}
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

  // 3. Only local processing enabled but no API token - show specific warning
  const onlyLocalEnabled = onComputerChecked && !inCloudChecked && !hasValidToken;
  
  if (onlyLocalEnabled) {
    return (
      <div className="animate-in slide-in-from-top-2 fade-in duration-300" style={{ marginTop: '1.75rem' }}>
        <div className="container mx-auto px-4 md:px-6 mt-4">
          <Alert className="border-orange-200 bg-orange-50 text-orange-900 flex items-center justify-between py-3 pr-4">
            <div className="flex items-center space-x-3">
              <span className="inline-flex items-center">
                <AlertTriangle className="h-5 w-5 text-orange-700 mr-2" />
                <span>Local processing enabled but you need to set it up.</span>
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenSettings}
              className="border-orange-300 hover:bg-orange-100 flex-shrink-0"
            >
              Set it up
            </Button>
          </Alert>
        </div>
      </div>
    );
  }

  // 4. Show general warning if user can't process anything
  if (hasCredits || hasValidToken) {
    return null;
  }
  
  return (
    <div className="animate-in slide-in-from-top-2 fade-in duration-300" style={{ marginTop: '1.75rem' }}>
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
  // This warning is now shown globally, so don't duplicate it in the tasks pane.
  return null;
}; 