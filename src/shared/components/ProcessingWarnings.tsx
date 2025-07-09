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
    <div className="px-3">
      <Alert className="mb-2 border-orange-200 bg-orange-50 text-orange-900 rounded-md">
        <AlertDescription className="text-xs leading-relaxed flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-orange-700" />
            <span>Cloud processing enabled but no credits.</span>
          </div>
          <div className="ml-2 whitespace-nowrap">
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
        </AlertDescription>
      </Alert>
    </div>
  );
}; 