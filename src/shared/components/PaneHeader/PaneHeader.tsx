import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { LockIcon, UnlockIcon } from 'lucide-react';

interface PaneHeaderProps {
  title: string;
  isLocked: boolean;
  toggleLock: () => void;
  children?: React.ReactNode;
}

const PaneHeader: React.FC<PaneHeaderProps> = ({ title, isLocked, toggleLock, children }) => {
  return (
    <div className="p-2 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
      <h2 className="text-lg font-semibold text-zinc-200 ml-2">{title}</h2>
      <div className="flex items-center space-x-2">
        {children}
        <Button variant="ghost" size="sm" onClick={toggleLock} className="text-zinc-400 hover:text-zinc-100 hover:bg-transparent">
          {isLocked ? <LockIcon className="h-4 w-4 mr-1" /> : <UnlockIcon className="h-4 w-4 mr-1" />}
          {isLocked ? 'Unlock' : 'Lock'}
        </Button>
      </div>
    </div>
  );
};

export default PaneHeader; 