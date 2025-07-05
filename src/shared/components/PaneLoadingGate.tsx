import React from 'react';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useUserUIState } from '@/shared/hooks/useUserUIState';

interface PaneLoadingGateProps {
  children: React.ReactNode;
}

export const PaneLoadingGate: React.FC<PaneLoadingGateProps> = ({ children }) => {
  const { isLoading } = useUserUIState('paneLocks', {
    shots: false,
    tasks: false,
    gens: false,
  });

  // Don't render children until pane state is loaded to prevent layout shifts
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return <>{children}</>;
}; 