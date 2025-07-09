import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import { Button } from '@/shared/components/ui/button';
import { useCredits } from '@/shared/hooks/useCredits';
import { useApiTokens } from '@/shared/hooks/useApiTokens';
import usePersistentState from '@/shared/hooks/usePersistentState';

interface ProcessingWarningsProps {
  onOpenSettings: () => void;
}

export const GlobalProcessingWarning: React.FC<ProcessingWarningsProps> = ({ onOpenSettings }) => {
  const { balance } = useCredits();
  const { tokens } = useApiTokens();
  const [inCloudChecked] = usePersistentState<boolean>("generation-in-cloud", true);
  
  const hasCredits = balance && balance.currentBalance > 0;
  const hasValidToken = tokens.length > 0;
  
  // Show warning if they don't have credits AND don't have a valid token
  if (hasCredits || hasValidToken) {
    return null;
  }
  
  return (
    <Alert className="mx-4 mt-4 border-orange-200 bg-orange-50 text-orange-900">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between">
        <span>
          You don't have credits and don't have local processing setup.
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenSettings}
          className="ml-4 border-orange-300 hover:bg-orange-100"
        >
          Visit Settings
        </Button>
      </AlertDescription>
    </Alert>
  );
};

export const TasksPaneProcessingWarning: React.FC<ProcessingWarningsProps> = ({ onOpenSettings }) => {
  const { balance } = useCredits();
  const [inCloudChecked] = usePersistentState<boolean>("generation-in-cloud", true);
  
  const hasCredits = balance && balance.currentBalance > 0;
  
  // Show warning if they have cloud processing enabled but no credits
  if (!inCloudChecked || hasCredits) {
    return null;
  }
  
  return (
    <Alert className="mx-2 mb-2 border-orange-200 bg-orange-50 text-orange-900">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="text-sm">
        <div className="flex items-center justify-between">
          <span>
            You have cloud processing setup but have no credits. To turn off this warning, either turn off cloud processing or buy credits{' '}
            <Button
              variant="link"
              size="sm"
              onClick={onOpenSettings}
              className="p-0 h-auto text-orange-700 underline hover:text-orange-800"
            >
              here
            </Button>
            .
          </span>
        </div>
      </AlertDescription>
    </Alert>
  );
}; 