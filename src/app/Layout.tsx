import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { GlobalHeader } from '@/shared/components/GlobalHeader';
import TasksPane from '@/shared/components/TasksPane/TasksPane';
import { cn } from '@/shared/lib/utils';

const Layout: React.FC = () => {
  const [isTasksPaneLockedOpen, setIsTasksPaneLockedOpen] = useState(false);
  const [tasksPaneWidth, setTasksPaneWidth] = useState(0);

  const handleTasksPaneLockStateChange = (isLockedAndOpen: boolean, currentWidth: number) => {
    
    setIsTasksPaneLockedOpen(isLockedAndOpen);
    setTasksPaneWidth(isLockedAndOpen ? currentWidth : 0);
  };

  

  return (
    <div className="flex flex-col min-h-screen">
      <GlobalHeader contentOffsetRight={isTasksPaneLockedOpen ? tasksPaneWidth : 0} />
      <div 
        className={cn(
          "flex-grow transition-all duration-300 ease-in-out"
        )}
        style={isTasksPaneLockedOpen ? { marginRight: `${tasksPaneWidth}px` } : {}}
      >
        <main className="container mx-auto py-4 px-4 md:px-6 h-full">
          <Outlet /> 
        </main>
      </div>
      <TasksPane onLockStateChange={handleTasksPaneLockStateChange} />
      {/* You can add a GlobalFooter here if needed */}
    </div>
  );
};

export default Layout; 